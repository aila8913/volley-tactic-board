import { Router, type IRouter } from "express";
import { sql, eq, desc, and, inArray, or } from "drizzle-orm";
import {
  db,
  ralliesTable,
  setsTable,
  matchesTable,
  lineupsTable,
  playersTable,
  peopleTable,
  eventsTable,
} from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { matchBelongsToUser, personBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import { GetMatchRotationStatsParams, GetPersonAnalysisParams } from "@workspace/api-zod";

// 分析頁（M2，#65）用的「報表型」路由：跟 matches/players/sets/rallies/events 那些
// 「一資源一 CRUD」的路由不一樣，這裡的每一支都是跨資源、唯讀的聚合查詢（例如這支要把
// 一整場比賽底下所有 rally 依輪次分組算得失分），不對應單一資料表，所以刻意獨立成一個
// analysis.ts，不硬塞進 rallies.ts——塞進去的話 rallies.ts 會同時混雜「單筆 CRUD」跟
// 「跨局聚合報表」兩種完全不同的職責，之後不好維護。
const router: IRouter = Router();
router.use(mockAuth);

// GET /analysis/matches/:matchId/rotations — 這場比賽「我方各輪次」的得失分。
//
// 為什麼只用 rallies、不碰 events：events.outcome（這一球的攻防結果）目前恆為 null——
// 即時記錄的路徑（lib/scoreSheetMapping.ts 的 pointRecordToEvent）根本沒有寫這個欄位，
// 所以沒辦法從 events 算出「哪一種攻擊得分/失分」這種更細的統計。rallies 就不同：
// homeRotation（這分開始前我方的輪次快照）跟 winner（這分誰贏）兩欄本來就是每筆 rally
// 必填、隨計分即時寫入的，資料完整可靠，用它們算「第 N 輪得幾分/失幾分」很穩。
//
// 為什麼不做 side-out% / 破發率：那需要知道「這一分開始時是誰在發球」，但 rallies 沒有
// 直接存這欄——發球方要從發球序（誰先發、每次 side-out 才輪轉）反推，邏輯複雜到不適合
// 用一支 SQL 聚合算，先留給之後的 issue。
router.get(
  "/analysis/matches/:matchId/rotations",
  handler(
    {
      params: GetMatchRotationStatsParams,
      owns: ({ params, userId }) => matchBelongsToUser(params.matchId, userId),
    },
    async ({ res, params }) => {
      const { matchId } = params;

      // rallies 自己沒存 matchId（只有 setId），所以要 join sets 才能用 matchId 過濾——
      // 跟 events.ts 的 /matches/:matchId/events 是同一個道理。
      //
      // groupBy(ralliesTable.homeRotation) 是 SQL 的「依這個欄位的值分組」：值相同的 rally
      // 會被歸成同一組，後面的 count(*) 就是「在算這一組裡有幾筆」，而不是全部 rally 的總數。
      //
      // count(*) filter (where 條件) 是 Postgres 的「條件式聚合」寫法：同一次 groupBy 掃描裡，
      // 用 filter 分別數出「winner = 'home' 的筆數」跟「winner = 'away' 的筆數」，效果等同
      // SQL 標準寫法 count(case when 條件 then 1 end)，但 Postgres 的 filter 語法更直白、
      // 效能也通常更好，所以這裡選用它。這是這個 repo 第一次寫 drizzle 的 sql`` 聚合查詢——
      // drizzle 的型別安全 query builder（.select({...})）沒有內建「條件式 count」這種語法，
      // 所以要用 sql`` 逃生艙口直接寫一小段 SQL 片段，接回 drizzle 的查詢鏈。
      //
      // .mapWith(Number) 是因為 Postgres 的 count(...) 回傳型別是 bigint，node-postgres
      // 為了不讓超大數字精度悄悄失真，預設會把它當成字串傳回來（"12" 而不是 12）。這裡的分數
      // 不可能大到超過 JS number 安全整數的範圍，所以直接轉回 number 比較好用，不用在前端
      // 到處補 Number(...)。
      const rows = await db
        .select({
          rotation: ralliesTable.homeRotation,
          pointsWon: sql<number>`count(*) filter (where ${ralliesTable.winner} = 'home')`.mapWith(
            Number,
          ),
          pointsLost: sql<number>`count(*) filter (where ${ralliesTable.winner} = 'away')`.mapWith(
            Number,
          ),
        })
        .from(ralliesTable)
        .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
        .where(eq(setsTable.matchId, matchId))
        .groupBy(ralliesTable.homeRotation)
        .orderBy(ralliesTable.homeRotation);

      // 只回傳「有 rally 資料」的輪次——沒發生過的輪次（例如這場比賽從來沒輪到過第 5 輪）
      // 不會出現在結果裡，前端就依實際回傳筆數畫幾列，不用自己補「這輪是 0:0」的空列。
      res.json(rows);
    },
  ),
);

// GET /analysis/matches — 「跨場彙總」（#65 M2 視圖②）：這個使用者名下每一場比賽各一列摘要
// （對手、日期、局數、得失分），一支請求就拿到全部，不用前端逐場再各發一輪 sets/rallies
// 請求去現算——首頁 MatchList.tsx 目前卡片上的「3:0 勝」就是為了閃避這種 fan-out，改成只讀
// 本機 zustand store，代價是沒被開啟過的比賽顯示不出真實比分。這支 endpoint 就是要在 DB 層
// 一次把「每場的摘要」算好，讓分析頁能一覽多場而不必逐場 fan-out（本輪先只加這支
// endpoint＋新分析頁，MatchList 卡片本身的顯示邏輯留給之後再動，那塊是設計夥伴擁有的卡片）。
// owns: "public" ——這支路由沒有單一路徑參數（不是「查某一筆資源」），而是「查這個
// userId 名下的所有比賽」，擁有權篩選發生在下面每一支查詢的 where 條件
// （eq(matchesTable.userId, ...) / eq(matchTable.userId, ...)），不是靠單一資源的
// owns 檢查擋。owns 是必填欄位（見 handler.ts 的說明），所以用 "public" 明講，
// 跟 matches.ts 的 GET /matches 是同一個道理。
router.get(
  "/analysis/matches",
  handler({ owns: "public" }, async ({ req, res }) => {
    // matches 是頂層資源、自己就存了 userId（見 lib/db/src/schema/matches.ts），不像
    // players/sets/rallies 那些巢狀資源要往上 join 到 match 才能驗擁有權——這裡直接
    // where userId 過濾就好，不需要用 matchBelongsToUser 之類的擁有權檢查函式。
    const matches = await db
      .select({
        matchId: matchesTable.id,
        opponent: matchesTable.opponent,
        date: matchesTable.date,
        teamId: matchesTable.teamId,
      })
      .from(matchesTable)
      .where(eq(matchesTable.userId, req.userId))
      .orderBy(desc(matchesTable.date));

    // 為什麼這裡刻意拆成多支小查詢、在 JS 裡合併，而不是像上面 /rotations 那樣寫成一支
    // 多重 join 的聚合：/rotations 只 join 了 rallies → sets，兩張表對這場比賽而言是
    // 「同一個 grain」（一個 rally 剛好屬於一個 set），join 完 count 不會被撐大。但這支要同時
    // 算「rally 筆數」（得失分）跟「set 筆數」（局數），這兩者是不同 grain：一場比賽如果打了
    // 3 局、每局 20 分，若把 rallies 跟 sets 一起 join 進同一支查詢再 groupBy(matchId)，
    // 每一筆 set 都會先被 rallies 那邊的多筆列「乘」出去（3 局 × 各局 rally 數的笛卡兒積），
    // count(*) 出來的局數就不是 3 而是被相乘膨脹過的假數字。標準解法是各自單一 grain
    // 的查詢，在應用層（JS）用 matchId 當 key 合併，而不是硬湊一支 SQL 掩蓋不同 grain
    // 硬 join 的問題——這是報表查詢很常見的取捨：正確性優先於「只發一支 SQL 比較潮」。

    // 逐「局」的我方/對方得分（grain = set）。首頁列表卡片要顯示「局比數」(例如 3:0)，
    // 需要每一局各自的比分，不能只有整場加總的 ourPoints/opponentPoints。
    //
    // 用 leftJoin 而非 innerJoin：剛按「下一局」但還沒開球的空局（firstServer=null、還沒有
    // 任何 rally）也要留一列 0:0，這樣下面「最後一局＝進行中」的判斷才看得到它、能正確把它
    // 當成進行中那局排除掉。leftJoin 讓沒有 rally 的 set 仍出現一列（rally 欄位為 NULL），
    // 而 count(*) filter (where winner=...) 對 NULL 那列的 winner 判斷為 false、不會誤加，
    // 所以空局算出來剛好是 0:0，正是我們要的。
    const setScoreRows = await db
      .select({
        matchId: setsTable.matchId,
        setNumber: setsTable.setNumber,
        ourScore: sql<number>`count(*) filter (where ${ralliesTable.winner} = 'home')`.mapWith(
          Number,
        ),
        opponentScore: sql<number>`count(*) filter (where ${ralliesTable.winner} = 'away')`.mapWith(
          Number,
        ),
      })
      .from(setsTable)
      .leftJoin(ralliesTable, eq(ralliesTable.setId, setsTable.id))
      .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
      .where(eq(matchesTable.userId, req.userId))
      .groupBy(setsTable.matchId, setsTable.id, setsTable.setNumber)
      .orderBy(setsTable.matchId, setsTable.setNumber);

    // 這個使用者名下「有凍結過先發陣容」的比賽集合。lineups 一局一 row（見
    // lib/db/src/schema/lineups.ts），只要這場任一局有先發 row，就代表教練排過先發、
    // 卡片不用再亮「尚未排先發」黃標。join lineups → sets 才拿得到 matchId（lineups 只存 setId）。
    const lineupMatchRows = await db
      .select({ matchId: setsTable.matchId })
      .from(lineupsTable)
      .innerJoin(setsTable, eq(lineupsTable.setId, setsTable.id))
      .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
      .where(eq(matchesTable.userId, req.userId))
      .groupBy(setsTable.matchId);
    const matchesWithLineup = new Set(lineupMatchRows.map((r) => r.matchId));

    // 局數＝真正開過球的局（firstServer 不是 null）——按「下一局」當下就會先建一筆空 set
    // （firstServer 還是 null），使用者還沒選先發方，這種空局不該被算進「打了幾局」，跟
    // lib/db/src/schema/sets.ts 裡 firstServer 允許 null 的那段註解、以及 #63 是同一個道理。
    const setRows = await db
      .select({
        matchId: setsTable.matchId,
        setsPlayed:
          sql<number>`count(*) filter (where ${setsTable.firstServer} is not null)`.mapWith(Number),
      })
      .from(setsTable)
      .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
      .where(eq(matchesTable.userId, req.userId))
      .groupBy(setsTable.matchId);

    // 把逐局比分依 matchId 分組（setScoreRows 已照 matchId, setNumber 排好，所以每組內部
    // 天然就是第 1 局、第 2 局…的順序）。等下對 matches 的每一場查表 O(1) 合併。
    const setScoresByMatch = new Map<number, { ourScore: number; opponentScore: number }[]>();
    for (const row of setScoreRows) {
      const list = setScoresByMatch.get(row.matchId);
      const entry = { ourScore: row.ourScore, opponentScore: row.opponentScore };
      if (list) list.push(entry);
      else setScoresByMatch.set(row.matchId, [entry]);
    }
    const setsByMatch = new Map(setRows.map((r) => [r.matchId, r]));

    const summaries = matches.map((m) => {
      const sets = setsByMatch.get(m.matchId);
      // 這場所有局的比分（含進行中的最後一局），已依局序排好。
      const allSetScores = setScoresByMatch.get(m.matchId) ?? [];
      // setResults 只給「已結束局」：排除最後一局（進行中那局），鏡射前端 reconstructRecording
      // 的「最後一局＝進行中、其餘＝已結束」慣例（見 lib/scoreSheetMapping.ts）。這樣卡片用
      // setResults 算出來的局比數，會跟使用者點進計分頁後看到的完全一致。slice(0, -1) 對空
      // 陣列或單一元素都安全（回空陣列），不用特判。
      const setResults = allSetScores.slice(0, -1);
      // 整場總得失分＝把每一局的得分加起來（含進行中那局，跟舊 rallyRows 的整場 count 等價）。
      const ourPoints = allSetScores.reduce((sum, s) => sum + s.ourScore, 0);
      const opponentPoints = allSetScores.reduce((sum, s) => sum + s.opponentScore, 0);
      return {
        matchId: m.matchId,
        opponent: m.opponent,
        date: m.date,
        teamId: m.teamId,
        // 缺資料代表這場還沒有任何 set/rally（剛建立、還沒開始記錄），預設補 0/空——這樣
        // 「建了但還沒記過任何東西」的比賽也會出現在列表裡，摘要是 0:0、局數 0，而不是整場
        // 從結果裡消失（消失反而更讓人困惑：使用者明明建過這場比賽）。
        setsPlayed: sets?.setsPlayed ?? 0,
        ourPoints,
        opponentPoints,
        setResults,
        hasLineup: matchesWithLineup.has(m.matchId),
      };
    });

    res.json(summaries);
  }),
);

// GET /analysis/people/:personId — 「視圖③：球員跨場/跨隊分析」(#213)。一個人跨越多場、
// 可能跨隊的出賽紀錄、各場背號/位置、觸球動作分布、先發局數，一支請求彙整成一份。
//
// 這裡「資料真的支援的才做」：events.outcome（得分/失分）目前恆為 null（見上面 /rotations
// 的長註解，#51 待補），所以不提供「這個人得幾分/失幾分」——那需要近似值假裝，寧可不做。
router.get(
  "/analysis/people/:personId",
  handler(
    {
      params: GetPersonAnalysisParams,
      // person 是頂層資源、自己存了 userId，用既有的 personBelongsToUser 檢查——跟
      // players/PATCH 收到 body.personId 時的擁有權檢查是同一支函式，維持「不洩漏這個 id
      // 是否存在」的既有慣例（失敗一律回 404，不區分「不存在」跟「不是你的」）。
      owns: ({ params, userId }) => personBelongsToUser(params.personId, userId),
    },
    async ({ req, res, params }) => {
      const { personId } = params;

      // 姓名要另外查一次：personBelongsToUser 只回傳「擁有與否」的布林值，不帶欄位。
      // 上面那支已經驗過擁有權，這裡直接用 id 撈就好，不用再重複 join userId。
      const [person] = await db
        .select({ id: peopleTable.id, name: peopleTable.name })
        .from(peopleTable)
        .where(eq(peopleTable.id, personId));

      // 這個人在（這個使用者名下）所有比賽裡的名單列，join matches 拿到比賽資訊，同時也
      // 用 matchesTable.userId 再次確保只看得到自己的資料（雙重保險：即使日後 personId 檢查
      // 有漏洞，這裡的 join 條件仍會把別人比賽的名單列濾掉）。
      //
      // 這是後面所有查詢的「起點」：grain = player row（等同 match，一場正常只會有一筆），
      // 之後 setsStarted / actionCounts 要用到的 playerIds 也是從這裡收集。
      const appearanceRows = await db
        .select({
          matchId: matchesTable.id,
          opponent: matchesTable.opponent,
          date: matchesTable.date,
          teamId: matchesTable.teamId,
          playerId: playersTable.id,
          number: playersTable.number,
          role: playersTable.role,
        })
        .from(playersTable)
        .innerJoin(matchesTable, eq(playersTable.matchId, matchesTable.id))
        .where(and(eq(playersTable.personId, personId), eq(matchesTable.userId, req.userId)))
        .orderBy(desc(matchesTable.date));

      const playerIds = appearanceRows.map((row) => row.playerId);

      // 這個人跨了幾場比賽（去重，因為理論上一場比賽也可能不小心留下這個人兩筆名單列——
      // 例如打錯字建了兩筆又都對到同一個 person，appearances 仍會照原樣兩筆都列出，但
      // 「出賽場數」不該被這種邊角情況灌水）。
      const matchesPlayed = new Set(appearanceRows.map((row) => row.matchId)).size;

      // 按球隊分組算出賽場數（grain = match，但要先去重成「不重複的 matchId+teamId」再數，
      // 理由跟上面 matchesPlayed 一樣：避免同場多筆名單列把場次算重複）。
      const matchTeamPairs = new Map(appearanceRows.map((row) => [row.matchId, row.teamId]));
      const teamMatchCounts = new Map<number | null, number>();
      for (const teamId of matchTeamPairs.values()) {
        teamMatchCounts.set(teamId, (teamMatchCounts.get(teamId) ?? 0) + 1);
      }
      const teamBreakdown = [...teamMatchCounts.entries()].map(([teamId, count]) => ({
        teamId,
        matchesPlayed: count,
      }));

      // 沒有任何名單列對到這個人（人員剛建立、還沒被關聯到任何比賽的名單）——
      // 直接回全零/空陣列，不用再發下面那兩支查詢（inArray 對空陣列意義不明確，
      // 提前擋掉比較乾淨，也剛好對應前端「這個人還沒出賽過」的空狀態）。
      if (playerIds.length === 0) {
        res.json({
          personId,
          name: person?.name ?? "",
          matchesPlayed: 0,
          setsStarted: 0,
          teamBreakdown: [],
          actionCounts: [],
          appearances: [],
        });
        return;
      }

      // 觸球動作次數分布（grain = event）。events.playerId 只會指向「我方」動作的球員
      // （見 lib/db/src/schema/events.ts 的 side/playerId 註解），且 playerIds 已經是
      // 篩過「這個使用者名下」的名單列，所以這裡不需要再 join matches/rallies/sets
      // 驗一次擁有權——跟 /analysis/matches 拆分不同 grain 查詢是同一個道理：這是獨立的
      // 單一 grain（event）查詢，不跟上面的 match grain 查詢湊成一支 join，否則一個人
      // 打了 3 場、每場上百顆球，count 會被場次數相乘出去、變成假數字。
      const actionRows = await db
        .select({
          action: eventsTable.action,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(eventsTable)
        .where(inArray(eventsTable.playerId, playerIds))
        .groupBy(eventsTable.action);

      // 先發局數（grain = set/lineup）：lineups 一局一 row，六個號位（zone1~6）分別存
      // 一個 playerId，只要任一號位命中這個人「任一場」的 playerId，這一局就算他先發過。
      // 用 or(...) 把六個 inArray 條件併起來，而不是寫六次「= 某個 playerId」——因為
      // playerIds 是一個清單（同一個人跨場有多個不同的 player row id），每個號位都要跟
      // 整個清單比對，inArray 比逐一 eq 再 or 更直白。這也是獨立的單一 grain 查詢，
      // 理由跟上面 actionRows 一樣：跟 appearanceRows（match grain）湊在一起 join 會被
      // 撐大成笛卡兒積。
      const [setsStartedRow] = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(lineupsTable)
        .where(
          or(
            inArray(lineupsTable.zone1PlayerId, playerIds),
            inArray(lineupsTable.zone2PlayerId, playerIds),
            inArray(lineupsTable.zone3PlayerId, playerIds),
            inArray(lineupsTable.zone4PlayerId, playerIds),
            inArray(lineupsTable.zone5PlayerId, playerIds),
            inArray(lineupsTable.zone6PlayerId, playerIds),
          ),
        );

      res.json({
        personId,
        name: person?.name ?? "",
        matchesPlayed,
        setsStarted: setsStartedRow?.count ?? 0,
        teamBreakdown,
        actionCounts: actionRows,
        appearances: appearanceRows,
      });
    },
  ),
);

export default router;
