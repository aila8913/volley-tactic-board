import { Router, type IRouter } from "express";
import { sql, eq, desc } from "drizzle-orm";
import { db, ralliesTable, setsTable, matchesTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { matchBelongsToUser } from "../lib/ownership";
import { GetMatchRotationStatsParams } from "@workspace/api-zod";

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
router.get("/analysis/matches/:matchId/rotations", async (req, res) => {
  const { matchId } = GetMatchRotationStatsParams.parse(req.params);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

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
});

// GET /analysis/matches — 「跨場彙總」（#65 M2 視圖②）：這個使用者名下每一場比賽各一列摘要
// （對手、日期、局數、得失分），一支請求就拿到全部，不用前端逐場再各發一輪 sets/rallies
// 請求去現算——首頁 MatchList.tsx 目前卡片上的「3:0 勝」就是為了閃避這種 fan-out，改成只讀
// 本機 zustand store，代價是沒被開啟過的比賽顯示不出真實比分。這支 endpoint 就是要在 DB 層
// 一次把「每場的摘要」算好，讓分析頁能一覽多場而不必逐場 fan-out（本輪先只加這支
// endpoint＋新分析頁，MatchList 卡片本身的顯示邏輯留給之後再動，那塊是設計夥伴擁有的卡片）。
router.get("/analysis/matches", async (req, res) => {
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

  // 為什麼這裡刻意拆成三支小查詢、在 JS 裡合併，而不是像上面 /rotations 那樣寫成一支
  // 多重 join 的聚合：/rotations 只 join 了 rallies → sets，兩張表對這場比賽而言是
  // 「同一個 grain」（一個 rally 剛好屬於一個 set），join 完 count 不會被撐大。但這支要同時
  // 算「rally 筆數」（得失分）跟「set 筆數」（局數），這兩者是不同 grain：一場比賽如果打了
  // 3 局、每局 20 分，若把 rallies 跟 sets 一起 join 進同一支查詢再 groupBy(matchId)，
  // 每一筆 set 都會先被 rallies 那邊的多筆列「乘」出去（3 局 × 各局 rally 數的笛卡兒積），
  // count(*) 出來的局數就不是 3 而是被相乘膨脹過的假數字。標準解法是三支各自單一 grain
  // 的查詢，在應用層（JS）用 matchId 當 key 合併，而不是硬湊一支 SQL 掩蓋不同 grain
  // 硬 join 的問題——這是報表查詢很常見的取捨：正確性優先於「只發一支 SQL 比較潮」。
  const rallyRows = await db
    .select({
      matchId: setsTable.matchId,
      ourPoints: sql<number>`count(*) filter (where ${ralliesTable.winner} = 'home')`.mapWith(
        Number,
      ),
      opponentPoints: sql<number>`count(*) filter (where ${ralliesTable.winner} = 'away')`.mapWith(
        Number,
      ),
    })
    .from(ralliesTable)
    .innerJoin(setsTable, eq(ralliesTable.setId, setsTable.id))
    .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
    .where(eq(matchesTable.userId, req.userId))
    .groupBy(setsTable.matchId);

  // 局數＝真正開過球的局（firstServer 不是 null）——按「下一局」當下就會先建一筆空 set
  // （firstServer 還是 null），使用者還沒選先發方，這種空局不該被算進「打了幾局」，跟
  // lib/db/src/schema/sets.ts 裡 firstServer 允許 null 的那段註解、以及 #63 是同一個道理。
  const setRows = await db
    .select({
      matchId: setsTable.matchId,
      setsPlayed: sql<number>`count(*) filter (where ${setsTable.firstServer} is not null)`.mapWith(
        Number,
      ),
    })
    .from(setsTable)
    .innerJoin(matchesTable, eq(setsTable.matchId, matchesTable.id))
    .where(eq(matchesTable.userId, req.userId))
    .groupBy(setsTable.matchId);

  // 用 Map 把 rallyRows / setRows keyed 起來，等下對 matches 的每一場逐一查表合併，
  // 查表是 O(1)，整體合併是 O(場數)，不會因為場數變多而變慢。
  const rallyByMatch = new Map(rallyRows.map((r) => [r.matchId, r]));
  const setsByMatch = new Map(setRows.map((r) => [r.matchId, r]));

  const summaries = matches.map((m) => {
    const rally = rallyByMatch.get(m.matchId);
    const sets = setsByMatch.get(m.matchId);
    return {
      matchId: m.matchId,
      opponent: m.opponent,
      date: m.date,
      teamId: m.teamId,
      // 缺聚合結果代表這場比賽還沒有任何 rally/set 資料（剛建立、還沒開始記錄），
      // 預設補 0——這樣「建了但還沒記過任何東西」的比賽也會出現在列表裡，摘要是 0:0、
      // 局數 0，而不是整場從結果裡消失（消失反而更讓人困惑：使用者明明建過這場比賽）。
      setsPlayed: sets?.setsPlayed ?? 0,
      ourPoints: rally?.ourPoints ?? 0,
      opponentPoints: rally?.opponentPoints ?? 0,
    };
  });

  res.json(summaries);
});

export default router;
