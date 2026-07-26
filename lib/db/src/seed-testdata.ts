// 一次性測試資料種子腳本（非正式產出，用完即刪）。
// 用途：清空整個資料庫，塞入 2 支球隊、3 場比賽、一位「跨兩隊」的球員，讓分析頁視圖②
// （跨場彙總）跟球隊篩選有東西可看；每一局也灌入看起來寫實（有領先互換、連續得分）但
// 100% 可重現的比分過程，並補上 events（每一分記一顆「決定球」），讓球員統計的
// 「決定球矩陣」（artifacts/volleyball-tactics/src/lib/statsMapping.ts 的 buildPlayerMatrix）
// 也有數字可看，不再是全空表格。
//
// 執行方式（從 repo 根目錄）：
//   ./scripts/node_modules/.bin/tsx lib/db/src/seed-testdata.ts
// dotenv/config 要在最前面 import，因為 ./index.ts 一被載入就會檢查 DATABASE_URL，
// 必須在那之前先把 .env 讀進 process.env。
import "dotenv/config";
import { sql } from "drizzle-orm";
import {
  db,
  pool,
  teamsTable,
  peopleTable,
  matchesTable,
  playersTable,
  setsTable,
  ralliesTable,
  eventsTable,
  type InsertRally,
  type InsertEvent,
} from "./index";

// mock auth 階段所有資料都掛在這個固定使用者底下（見 middleware/mockAuth.ts）。
const USER_ID = "mock-user-001";

// ── 種子隨機數（seeded PRNG）──
// 為什麼要「隨機但可重現」：這是給開發/展示用的測試資料，之後可能會被清掉重灌很多次
// （改 schema、清 DB 重跑這支腳本）。如果比分過程真的用 Math.random()，每次重灌出來的
// 比分走勢、球員數字都不一樣，沒辦法拿來穩定截圖/寫文件/對答案。但如果完全不隨機
// （像原本的 n % 3 節奏），比分會整齊到一眼看穿是假資料。「種子隨機數」就是兩者都要：
// 用同一個固定種子重新啟動產生器，每次呼叫 rng() 吐出的數字序列會一模一樣（因為它其實
// 是一個確定性的數學公式，不是真的隨機），但那串數字本身看起來雜亂無章，拿來決定
// 「這分誰贏」「這球是誰做的」就能生出貌似真實的比賽節奏。
// mulberry32 是一顆常見、程式碼很短的種子 PRNG（來源：public domain，社群廣泛沿用），
// 這裡整支種子腳本只需要「看起來夠亂」，不需要密碼學等級的隨機品質，用它足夠。
function mulberry32(seed: number): () => number {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 種子隨便選一個固定數字即可，重點是「固定」——只要這個數字不變，且下面呼叫 rng() 的
// 順序不變（也就是整支腳本的流程不變），重新執行腳本一定會產生一模一樣的資料。
const BASE_SEED = 88888;

// 依權重隨機挑一個項目。items 是 [值, 權重] 的陣列，權重只是相對比例（不用加總到 1 或
// 100），例如 [["a", 3], ["b", 1]] 代表 a 出現機率是 b 的 3 倍。跟直接寫死機率相比，
// 這樣可以用「複製貼上幾次」的方式湊權重（見下面 ATTACK_ROLES 那種寫法），也可以像這樣
// 寫成明確的數字表，兩種風格都能吃。
function pickWeighted<T>(rng: () => number, items: Array<[T, number]>): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of items) {
    if (roll < weight) return value;
    roll -= weight;
  }
  return items[items.length - 1][0]; // 浮點數誤差保底，理論上跑不到這裡
}

// 名單角色（跟 schema/players.ts 的 playerRoleEnum 對齊）。
type Role = "S" | "OH" | "MB" | "OPP" | "L";
type RosterPlayerWithId = { id: string; number: number; role: Role };
// 跟 schema/events.ts 的 eventActionEnum 對齊。
type ActionName = "serve" | "receive" | "set" | "attack" | "block" | "dig";

// ── 各動作「誰比較可能做」的角色白名單 ──
// 這裡的權重寫法是「同一個角色重複列幾次」：列越多次，等一下用 flatMap 展開時這個角色的
// 球員就會在候選池裡出現越多份、被抽到的機率越高，等於是一種土炮加權，不用另外寫一張
// 數字權重表。分佈刻意對照 lib/statsMapping.ts 開頭那段「決定球統計」的敘事——
// 舉球員（S）幾乎不會是「攻擊」的決定球（他自己不太攻擊）、卻幾乎壟斷「舉球」這個分類；
// 自由球員（L）是接發/防守的常客，但幾乎不發球也不是攻擊決定球——這樣種子資料生出來的
// 分佈才會跟這份統計原本要呈現的球員定位一致，而不是每個角色雨露均霑的假資料。
const ATTACK_ROLES: Role[] = ["OH", "OH", "OPP", "OPP", "MB"];
const BLOCK_ROLES: Role[] = ["MB", "MB", "OPP"];
const SERVE_ROLES: Role[] = ["S", "OH", "MB", "OPP"]; // 六個輪轉都要發球，L 通常不上場發球
const DIG_ROLES: Role[] = ["L", "L", "OH", "MB", "OPP"];
const RECEIVE_ROLES: Role[] = ["L", "L", "OH", "OH", "MB", "OPP"];
const SET_ROLES: Role[] = ["S", "S", "S", "OH"]; // 絕大多數是舉球員，偶爾攻擊手做二次球
const ACTION_ROLE_WEIGHTS: Record<ActionName, Role[]> = {
  attack: ATTACK_ROLES,
  block: BLOCK_ROLES,
  serve: SERVE_ROLES,
  dig: DIG_ROLES,
  set: SET_ROLES,
  receive: RECEIVE_ROLES,
};

// 我方得分時，這一分是靠什麼動作終結的（決定球）——攻擊最大宗，其次攔網、發球直接得分
// （Ace），舉球/防守變成決定球比較少見（通常是連續回合裡比較前段的過程球）。
const OUR_POINT_ACTIONS: [ActionName, number][] = [
  ["attack", 55],
  ["block", 20],
  ["serve", 15],
  ["dig", 5],
  ["set", 5],
];
// 對手得分、且「真的是對方自己打下來的」時，隨便配一個粗略的分佈就好——我們沒有對方
// 名單可以歸屬球員，這幾個數字只是拿來讓 events.action 有點變化，不影響球員統計。
const OPPONENT_POINT_ACTIONS: [ActionName, number][] = [
  ["attack", 55],
  ["block", 20],
  ["serve", 25],
];
// 對手得分、但其實是我方自己出的錯：扣球被擋死/出界、發球失誤、接發沒到位，這三種是
// 排球最常見的「非受迫性失誤」來源。
const OUR_ERROR_ACTIONS: [ActionName, number][] = [
  ["attack", 50],
  ["serve", 30],
  ["receive", 20],
];

type EventSpec = { side: "home" | "away"; playerId: string | null; action: ActionName };

// 從角色白名單抽一位球員：先用 flatMap 把白名單裡列到的角色各自展開成候選名單裡的球員
// （同一角色被列越多次，越多份候選、機率越高），再從展開後的池子裡等機率抽一個。
// 找不到符合角色的球員（例如這隊沒有 MB）就回傳 undefined，呼叫端要接住、退回
// playerId: null（寧可少記一個球員歸屬，也不要塞錯球員）。
function pickPlayerForAction(
  rng: () => number,
  roster: RosterPlayerWithId[],
  roles: Role[],
): RosterPlayerWithId | undefined {
  const pool = roles.flatMap((role) => roster.filter((p) => p.role === role));
  if (pool.length === 0) return undefined;
  return pool[Math.floor(rng() * pool.length)];
}

// 幫一個 rally 決定「這一分怎麼結束的」（哪個 event）。跟 pointRecordToEvent 的語意呼應
// （見 scoreSheetMapping.ts）：side 是「哪一方執行了這個決定球」，不等於「誰贏這一分」
// ——最典型的例子就是「我方失誤讓對手得分」：這一分是 away 贏，但決定球（例如攻擊被攔死、
// 發球出界）是「我方（home）執行」的，所以 side 仍然要記 home，playerId 也要指向
// 我方那位犯錯的球員，球員統計的「失」欄才會正確記到那個人身上（見
// lib/statsMapping.ts buildPlayerMatrix：won/lost 是看 rally 的贏家，playerId 只是決定
// 記到哪個人頭上，兩者互相獨立）。
function buildEventSpec(
  rng: () => number,
  winner: "home" | "away",
  ourRoster: RosterPlayerWithId[],
): EventSpec {
  if (winner === "home") {
    const action = pickWeighted(rng, OUR_POINT_ACTIONS);
    const player = pickPlayerForAction(rng, ourRoster, ACTION_ROLE_WEIGHTS[action]);
    return { side: "home", playerId: player?.id ?? null, action };
  }

  // 對手得分：多數（65%）是對方自己打下來的——我們沒有對方名單，記不到球員，
  // 只能 playerId: null。少數（35%）是我方自己出的錯，這種才要把「失分」歸給我方
  // 某位球員，球員統計表的「失」欄才不會整欄空白（真實比賽裡失分本來就有相當比例
  // 是自己出錯，不是對方多厲害）。
  const isOurError = rng() < 0.35;
  if (!isOurError) {
    const action = pickWeighted(rng, OPPONENT_POINT_ACTIONS);
    return { side: "away", playerId: null, action };
  }
  const action = pickWeighted(rng, OUR_ERROR_ACTIONS);
  const player = pickPlayerForAction(rng, ourRoster, ACTION_ROLE_WEIGHTS[action]);
  return { side: "home", playerId: player?.id ?? null, action };
}

// 依「這一局最終比分」生出一串合法的 rally 序列，順便一起決定每一分的決定球（event）。
// 兩件事在同一個迴圈裡一起做，是因為兩者都要吃同一個 rng 序列——只要呼叫順序固定，
// 重新執行整支腳本就會抽出一模一樣的數字，資料就是可重現的（見上面 mulberry32 註解）。
//
// baseTarget＝這一局「正常情況先得幾分就贏」：一般局 25、決勝局 15。真正的最終比分
// （homeTarget/awayTarget）可能比 baseTarget 高（deuce：24:24 之後要淨勝 2 分，例如
// 26:24），所以 baseTarget 只拿來做「這局是不是早該結束了」的防呆判斷（見下方 guard）。
// 這裡直接從比分推回 baseTarget：勝方拿到 15~17 分收下的局＝決勝局（15 分制），拿到
// 25 分以上的＝一般局（25 分制），不用另外把「這是第幾局」傳進來。
//
// ── 這支函式最重要的一條規則：勝方的「賽末點」一定要落在最後一個 rally ──
// 之前的版本有個 bug：它先讓比分自由亂走，一旦某一方先達標，就把「剩下的分」全部硬塞給
// 另一方。結果畫出來的分數成長圖會出現「我方已經 25 分了，對手卻還在一直加分」這種現實中
// 不可能發生的畫面（排球一方達標且淨勝 2 分的當下，這局就結束了，不會再打）。
// 正確的模型是：勝方在「倒數第二分」之前最多只能累積到 winnerTarget−1 分（保留最後那一分），
// 敗方最多累積到 loserTarget 分；最後一個 rally 才由勝方拿下賽末點收尾。這樣還原出來的
// 比分走勢，勝方是「打到最後一球才到頂」，對手不可能在那之後還得分（根本沒有下一球了）。
function buildRallies(
  rng: () => number,
  setId: number,
  homeTarget: number,
  awayTarget: number,
  ourRoster: RosterPlayerWithId[],
): { rally: InsertRally; eventSpec: EventSpec }[] {
  const specs: { rally: InsertRally; eventSpec: EventSpec }[] = [];
  // 先把「home/away」翻譯成「勝方/敗方」，用勝敗視角推演比較好寫規則，最後再翻回 home/away。
  const winnerSide: "home" | "away" = homeTarget > awayTarget ? "home" : "away";
  const winnerTarget = Math.max(homeTarget, awayTarget);
  const loserTarget = Math.min(homeTarget, awayTarget);
  // 從勝方分數推回「這局是幾分制」：≤20 分收下＝決勝局（15 分制），否則一般局（25 分制）。
  const baseTarget = winnerTarget <= 20 ? 15 : 25;
  const total = homeTarget + awayTarget; // rally 總數＝雙方得分和（每個 rally 剛好產生 1 分）

  let home = 0;
  let away = 0;
  let winnerScore = 0;
  let loserScore = 0;
  // 追蹤「上一分是勝方還敗方拿的」，讓比分走勢帶一點「動能」（連續得分手感、發球輪優勢），
  // 而不是每一分都獨立丟硬幣——真實排球常常一方連得好幾分。
  let prevPoint: "winner" | "loser" | null = null;
  const MOMENTUM = 0.35; // 往「上一分贏家」偏移的幅度；純憑感覺調，只要走勢看起來會拉鋸即可。

  for (let n = 1; n <= total; n++) {
    const rot = (n - 1) % 6; // 輪次 0–5 循環，純粹讓分佈不集中在單一輪
    const isLast = n === total;

    let pointToWinner: boolean;
    if (isLast) {
      pointToWinner = true; // 收尾這一分＝勝方的賽末點，一定歸勝方（見函式開頭的規則說明）
    } else {
      // body（倒數第二分之前）：勝方最多再拿 winnerTarget−1 分（保留最後一分），敗方最多
      // loserTarget 分。用「各自還差幾分」當機率基準，讓兩邊大約同時把配額用完——分數會一路
      // 糾纏到終盤才分曉，不會像舊版那樣一邊早早見頂、另一邊被硬塞一長串。
      const winnerBodyRemaining = winnerTarget - 1 - winnerScore;
      const loserRemaining = loserTarget - loserScore;
      if (winnerBodyRemaining <= 0) {
        pointToWinner = false; // 勝方 body 配額用完，剩下的（除了最後一分）都給敗方
      } else if (loserRemaining <= 0) {
        pointToWinner = true; // 敗方配額用完，剩下的都給勝方
      } else {
        // 平衡基準機率：還剩越多分的一方越可能得這一分，兩邊配額因此大約同步耗盡。
        let p = winnerBodyRemaining / (winnerBodyRemaining + loserRemaining);
        // 動能：把機率往上一分的贏家那邊推 MOMENTUM，製造連續得分的手感。
        if (prevPoint === "winner") p = p * (1 - MOMENTUM) + MOMENTUM;
        else if (prevPoint === "loser") p = p * (1 - MOMENTUM);
        pointToWinner = rng() < p;
        // deuce 防呆：勝方不能在終盤前就「以淨勝 ≥2 分達到 baseTarget（例如 25）」——那個
        // 狀態代表這局其實早該結束了。若這一分會讓勝方進入這種「早該封局」的狀態，強制改由
        // 敗方得分（此分支保證 loserRemaining>0，翻給敗方不會超過它的配額）。一般局勝方 body
        // 上限本來就 <baseTarget，這條只有 deuce 局（winnerTarget>baseTarget）才會真的觸發。
        if (pointToWinner) {
          const w = winnerScore + 1;
          if (w >= baseTarget && w - loserScore >= 2) pointToWinner = false;
        }
      }
    }

    const winner: "home" | "away" = pointToWinner
      ? winnerSide
      : winnerSide === "home"
        ? "away"
        : "home";
    const eventSpec = buildEventSpec(rng, winner, ourRoster);
    specs.push({
      rally: {
        setId,
        rallyNumber: n,
        homeScore: home, // 存的是「這分開始前」的比分（後端設計），所以先 push 再加分
        awayScore: away,
        homeRotation: rot,
        awayRotation: (rot + 3) % 6,
        winner,
      },
      eventSpec,
    });
    if (winner === "home") home += 1;
    else away += 1;
    if (pointToWinner) winnerScore += 1;
    else loserScore += 1;
    prevPoint = pointToWinner ? "winner" : "loser";
  }
  return specs;
}

// 「進行中、還沒打完」那一局的 rally 序列：跟 buildRallies 不同，這裡沒有勝負可言（比分停在
// 半路，例如 18:15），所以沒有「賽末點收在最後一球」「deuce 防呆」那些規則，就是單純用同一套
// 平衡配額＋連續得分動能，把比分一路走到指定的當下比分（homeNow:awayNow）為止。給那唯一一場
// 「未完成」的 mock 比賽用（見下方 seedMatch 的 inProgress 參數）。
function buildPartialRallies(
  rng: () => number,
  setId: number,
  homeNow: number,
  awayNow: number,
  ourRoster: RosterPlayerWithId[],
): { rally: InsertRally; eventSpec: EventSpec }[] {
  const specs: { rally: InsertRally; eventSpec: EventSpec }[] = [];
  const total = homeNow + awayNow;
  let home = 0;
  let away = 0;
  let prevWinner: "home" | "away" | null = null;
  const MOMENTUM = 0.35;
  for (let n = 1; n <= total; n++) {
    const rot = (n - 1) % 6;
    const homeRemaining = homeNow - home;
    const awayRemaining = awayNow - away;
    let winner: "home" | "away";
    if (homeRemaining <= 0) {
      winner = "away";
    } else if (awayRemaining <= 0) {
      winner = "home";
    } else {
      let p = homeRemaining / (homeRemaining + awayRemaining);
      if (prevWinner === "home") p = p * (1 - MOMENTUM) + MOMENTUM;
      else if (prevWinner === "away") p = p * (1 - MOMENTUM);
      winner = rng() < p ? "home" : "away";
    }
    const eventSpec = buildEventSpec(rng, winner, ourRoster);
    specs.push({
      rally: {
        setId,
        rallyNumber: n,
        homeScore: home,
        awayScore: away,
        homeRotation: rot,
        awayRotation: (rot + 3) % 6,
        winner,
      },
      eventSpec,
    });
    if (winner === "home") home += 1;
    else away += 1;
    prevWinner = winner;
  }
  return specs;
}

// 插入「一局 + 它的所有 rally + 每一分的 event」。把這段抽成小工具，是因為
// seedSets 下面「已打完的局」跟「進行中那一局」都要做同一件事，只差 rally 序列是用
// buildRallies（完整局）還是 buildPartialRallies（半場）產生的。
async function insertSetWithRallies(
  matchId: number,
  setNumber: number,
  firstServer: "home" | "away",
  specs: { rally: InsertRally; eventSpec: EventSpec }[],
) {
  const [set] = await db
    .insert(setsTable)
    .values({ matchId, setNumber, firstServer })
    .returning({ id: setsTable.id });

  // specs 裡的 rally 當初是用「還沒有真正 setId」的暫時值算的，這裡補上真正的 set.id。
  const rallies = specs.map((s) => ({ ...s.rally, setId: set.id }));
  const insertedRallies = await db
    .insert(ralliesTable)
    .values(rallies)
    .returning({ id: ralliesTable.id, rallyNumber: ralliesTable.rallyNumber });

  // events 需要 rallyId 外鍵，得先插入 rallies 拿到 DB 配的 id 才能接著插入。多筆一次
  // insert 時 SQL 標準沒有保證 RETURNING 的列順序一定等於 VALUES 的輸入順序（雖然實務上
  // 通常照順序回來），所以這裡改用 rallyNumber（同一局內唯一）比對回去，而不是直接假設
  // 「第 i 筆回傳＝第 i 筆輸入」，比較保險，也不會因為驅動程式版本差異而偶爾兜錯。
  const rallyIdByNumber = new Map(insertedRallies.map((r) => [r.rallyNumber, r.id]));
  const events: InsertEvent[] = specs.flatMap((s) => {
    const rallyId = rallyIdByNumber.get(s.rally.rallyNumber);
    if (rallyId === undefined) return [];
    return [
      {
        rallyId,
        sequence: 1, // 簡易版一分最多記一球，固定第 1 球（跟 pointRecordToEvent 一致）
        side: s.eventSpec.side,
        playerId: s.eventSpec.playerId,
        action: s.eventSpec.action,
        source: "live" as const,
      },
    ];
  });
  if (events.length > 0) {
    await db.insert(eventsTable).values(events);
  }
}

// 幫一場比賽建立各局 + 各局的 rally + 各局每一分的 event。
//   completedScores：已經打完的各局比分 [ourScore, opponentScore][]（三戰兩勝，最多 3 局）。
//   inProgress：非 null 時代表「這場還沒打完」——會在打完的局之後，多插一局「進行中、比分停在
//     半路」的局（例如 18:15），當作分析頁的 currentSet。
//
// ── 為什麼「已打完」的比賽要在最後多補一局「空的」set（firstServer=null）──
// 分析頁重建（reconstructRecording）沿用計分表的慣例：「最後一局」永遠當成「進行中的
// currentSet」。所以如果一場已經打完的比賽，資料裡最後一局就是決勝局本身，分析頁的
// 「比賽總覽」會把那一決勝局誤標成「進行中」（藍色）。解法是在真正打完的各局之後，補一筆
// firstServer=null 的空 set：重建時這筆空 set 會變成「還沒開球的 currentSet」（不會顯示、
// 也不算進局數），真正打過的每一局就全部落進 completedSets、正確顯示成已結束。進行中的
// 比賽則相反——不補空 set，讓那局半場的 set 自然當 currentSet，總覽就會顯示成藍色進行中。
async function seedSets(
  matchId: number,
  completedScores: [number, number][],
  ourRoster: RosterPlayerWithId[],
  rng: () => number,
  inProgress: [number, number] | null,
) {
  // 兩隊輪流先發：第 1 局 home 先發、第 2 局 away、依此類推。
  const firstServerOf = (setIndex: number): "home" | "away" =>
    setIndex % 2 === 0 ? "home" : "away";

  for (let i = 0; i < completedScores.length; i += 1) {
    const [home, away] = completedScores[i];
    // setId 先塞 0（佔位），真正的 id 由 insertSetWithRallies 插入 set 後回填。
    const specs = buildRallies(rng, 0, home, away, ourRoster);
    await insertSetWithRallies(matchId, i + 1, firstServerOf(i), specs);
  }

  const nextSetNumber = completedScores.length + 1;
  if (inProgress) {
    const [home, away] = inProgress;
    const specs = buildPartialRallies(rng, 0, home, away, ourRoster);
    await insertSetWithRallies(matchId, nextSetNumber, firstServerOf(nextSetNumber - 1), specs);
  } else {
    // 已打完：補一局空 set（firstServer=null、沒有任何 rally），見上方大段說明。
    await db.insert(setsTable).values({ matchId, setNumber: nextSetNumber, firstServer: null });
  }
}

async function main() {
  // 1) 清空所有資料。RESTART IDENTITY 讓 serial id 從 1 重來，CASCADE 連同 FK 依賴的
  // 子表一起清（players/sets/rallies/events/lineups…）。TRUNCATE 一次列出所有表最省事。
  console.log("清空資料庫…");
  await db.execute(sql`
    TRUNCATE TABLE
      tournaments, matches, players, sets, rallies, events,
      lineups, substitutions, timeouts, tactics, people, teams
    RESTART IDENTITY CASCADE
  `);

  // 整支腳本共用同一顆種子 PRNG：只要下面呼叫 seedMatch/seedSets/buildRallies 的順序
  // 不變（這支腳本本來就是照固定順序寫死呼叫三場比賽），rng() 被呼叫的次數與時機就完全
  // 固定，吐出來的數字序列也就固定——這就是整份種子資料「每次重灌都一樣」的關鍵。
  const rng = mulberry32(BASE_SEED);

  // 2) 兩支球隊。
  console.log("建立球隊…");
  const [teamA, teamB] = await db
    .insert(teamsTable)
    .values([
      { userId: USER_ID, name: "資管系 A 隊" },
      { userId: USER_ID, name: "資管系 B 隊" },
    ])
    .returning({ id: teamsTable.id, name: teamsTable.name });

  // 3) 人。林小美是刻意設計的「跨兩隊」球員：等一下她同時出現在 A 隊跟 B 隊的名單裡，
  // 靠同一個 personId 串起來（這正是 people 表存在的意義，見 schema/people.ts）。
  console.log("建立人員…");
  const peopleNames = [
    "王小明",
    "陳志豪",
    "林大目",
    "黃建宏",
    "吳俊傑",
    "蔡明翰", // 以上 A 隊班底
    "周立群",
    "鄭雅文",
    "謝宗翰",
    "郭子軒",
    "何品妍",
    "曾偉倫", // 以上 B 隊班底
    "林小美", // 跨兩隊
  ];
  const people = await db
    .insert(peopleTable)
    .values(peopleNames.map((name) => ({ userId: USER_ID, name })))
    .returning({ id: peopleTable.id, name: peopleTable.name });
  const personId = (name: string) => people.find((p) => p.name === name)!.id;

  // 一份名單列 = 某場比賽裡「某個人穿幾號、打什麼位置」。number/role 可跨場不同，
  // 但 personId 綁定的是同一個人。
  type RosterEntry = { name: string; number: number; role: Role };
  const aRoster: RosterEntry[] = [
    { name: "王小明", number: 1, role: "S" },
    { name: "陳志豪", number: 7, role: "OH" },
    { name: "林大目", number: 12, role: "MB" },
    { name: "黃建宏", number: 9, role: "OPP" },
    { name: "吳俊傑", number: 5, role: "L" },
    { name: "蔡明翰", number: 3, role: "OH" },
  ];
  const bRoster: RosterEntry[] = [
    { name: "周立群", number: 2, role: "S" },
    { name: "鄭雅文", number: 8, role: "OH" },
    { name: "謝宗翰", number: 11, role: "MB" },
    { name: "郭子軒", number: 6, role: "OPP" },
    { name: "何品妍", number: 4, role: "L" },
    { name: "曾偉倫", number: 10, role: "OH" },
  ];
  // 林小美在 A 隊穿 15、在 B 隊穿 13——同一個人、不同場不同背號，但 personId 相同。
  const linInA: RosterEntry = { name: "林小美", number: 15, role: "OH" };
  const linInB: RosterEntry = { name: "林小美", number: 13, role: "OH" };

  async function seedMatch(
    teamId: number,
    opponent: string,
    dateIso: string,
    roster: RosterEntry[],
    completedScores: [number, number][],
    // null＝這場已打完（seedSets 會補一局空 set 收尾）；給比分＝這場還沒打完，最後多一局
    // 進行中、比分停在這裡的局（見 seedSets 的 inProgress 說明）。
    inProgress: [number, number] | null = null,
  ) {
    const [match] = await db
      .insert(matchesTable)
      .values({
        userId: USER_ID,
        name: null,
        opponent,
        date: new Date(dateIso),
        teamId,
      })
      .returning({ id: matchesTable.id });
    // 要 .returning id：event 需要指向這場比賽裡「哪一個球員」做了決定球，那個外鍵存的是
    // players.id（uuid，DB 插入時才真正決定，即使有 defaultRandom() 前端沒傳也一樣），
    // 沒有這份回傳資料就沒有 id 可以塞進後面的 events。
    const insertedPlayers = await db
      .insert(playersTable)
      .values(
        roster.map((r) => ({
          matchId: match.id,
          name: r.name,
          number: r.number,
          role: r.role,
          personId: personId(r.name),
        })),
      )
      .returning({ id: playersTable.id, number: playersTable.number, role: playersTable.role });
    const ourRoster: RosterPlayerWithId[] = insertedPlayers.map((p) => ({
      id: p.id,
      number: p.number,
      role: p.role,
    }));
    await seedSets(match.id, completedScores, ourRoster, rng, inProgress);
    return match.id;
  }

  console.log("建立比賽 + 名單 + 局分 + 球員決定球數據…");
  // 全部改成三戰兩勝（先拿 2 局者勝，最多 3 局；決勝第 3 局打到 15）。前三場都已打完，
  // 第 4 場刻意留成「進行中」，讓分析頁能同時看到「已結束」與「未完成」兩種狀態。
  //
  // 比賽1：A 隊 vs 台大，含林小美（跨隊那人在 A 隊這邊）。2:1 勝（決勝局 15:11）。
  await seedMatch(
    teamA.id,
    "台大",
    "2026-05-10T19:00:00+08:00",
    [...aRoster, linInA],
    [
      [25, 20],
      [23, 25],
      [15, 11],
    ],
  );
  // 比賽2：A 隊 vs 政大，純 A 隊班底。2:0 輾壓勝，跟第 3 場的糾結局作對照。
  await seedMatch(teamA.id, "政大", "2026-06-15T19:00:00+08:00", aRoster, [
    [25, 19],
    [25, 17],
  ]);
  // 比賽3：B 隊 vs 師大，含林小美（同一人這次在 B 隊）。刻意設計成「糾結」局：第 2 局打進
  // deuce（24:26）、決勝局也咬到 13:15，最後 1:2 惜敗，讓分數成長圖看得到真正拉鋸的走勢。
  await seedMatch(
    teamB.id,
    "師大",
    "2026-07-01T19:00:00+08:00",
    [...bRoster, linInB],
    [
      [25, 23],
      [24, 26],
      [13, 15],
    ],
  );
  // 比賽4：A 隊 vs 交大，進行中（第 1 局已拿下 25:22，第 2 局打到 18:15 還沒結束）。
  // 傳 inProgress → seedSets 不補空 set，最後那局半場的 set 就會被分析頁當成 currentSet。
  await seedMatch(teamA.id, "交大", "2026-07-20T19:00:00+08:00", aRoster, [[25, 22]], [18, 15]);

  console.log("\n完成！塞入內容：");
  console.log(`  球隊：${teamA.name}(id=${teamA.id})、${teamB.name}(id=${teamB.id})`);
  console.log(`  人員：${people.length} 位（林小美 personId=${personId("林小美")} 跨兩隊）`);
  console.log("  比賽：4 場、全部三戰兩勝制");
  console.log("    1) A隊 vs 台大 2:1（決勝 15:11）  2) A隊 vs 政大 2:0 輾壓");
  console.log("    3) B隊 vs 師大 1:2 糾結（含 deuce 24:26、決勝 13:15）  4) A隊 vs 交大 進行中");
  console.log(
    "  每局比分過程用種子 PRNG（mulberry32，固定種子＝每次重灌結果相同）＋平衡配額＋連續得分動能，",
  );
  console.log("  勝方賽末點一定收在最後一球（不再出現達標後對手還在加分的假象）；並補上 events，");
  console.log("  球員統計的「決定球矩陣」現在有數字可看。");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
