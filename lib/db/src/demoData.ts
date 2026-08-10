// #336：把「灌一整份示範資料」的邏輯從 seed-testdata.ts 抽出來，變成一支可以對
// 任意 userId 種一份的函式。
//
// 為什麼要抽出來：這份資料以前只有一個消費者——本機的「試驗沙盒」腳本
// （seed-testdata.ts，透過 `pnpm run db:reset` 跑），它永遠只灌給寫死的
// mock-user-001。但之後（#336 PR2）正式環境要加一顆「載入示範資料」按鈕：使用者登入後
// 按下去，要把同一份球隊/比賽/局分/戰術資料灌到**他自己**的帳號底下，這樣才有東西可以
// 立刻上手體驗，而不是空白畫面。同一份「建構示範資料」的邏輯因此有兩個消費者：本機沙盒
// 腳本、正式環境的 HTTP endpoint。與其複製貼上兩份、以後改一次要記得改兩處，把它抽成
// 一支純函式，兩邊都呼叫同一份實作。
//
// 為什麼 userId 是參數，不是寫死的常數：seed-testdata.ts 原本把 USER_ID 寫死成
// "mock-user-001"（mock auth 階段的固定使用者）。但「載入示範資料」這個功能是要種進
// 「按按鈕的那個人」的帳號，每個使用者的 userId 都不一樣，沒辦法再寫死，只能當參數傳進來。
//
// 為什麼收 exec（DbOrTx）而不是直接 import 用 module 層的 db：#336 PR2 的 HTTP handler
// 需要把整份示範資料包在同一個 transaction 裡執行——「灌到一半失敗，使用者帳號底下只有
// 半份殘缺資料」是很糟的狀態（球隊建好了但比賽沒建完、局分建好了但 events 沒進去…），
// transaction 可以確保要嘛整份資料都進去，要嘛整個 rollback、乾乾淨淨什麼都沒發生。要做到
// 這件事，所有 insert 就不能各自直接呼叫 module 層 export 的 `db`（那樣每個 insert 都是
// 獨立的一次連線操作，脫離 transaction 邊界），而是要接收呼叫端傳進來的「執行者」——可能是
// `db` 本身（沒有 transaction 需求時），也可能是 `db.transaction(async (tx) => {...})`
// 裡的 tx（有 transaction 需求時）。這支檔案裡所有函式因此都吃一個 exec 參數，統一用它
// 而不是直接 import db 來 insert。
//
// 為什麼「固定種子的 PRNG」對示範資料比對測試資料更重要：測試資料只有開發者自己會看到，
// 內容長怎樣通常不太要緊；但示範資料是每一個新使用者第一次打開這個產品看到的畫面——如果
// 每次載入的內容都不一樣，寫使用手冊、拍教學截圖、跟夥伴討論時就會兜不起來。固定種子確保
// 「不管誰、什麼時候按下載入示範資料，內容都完全一樣」，示範資料才真的能拿來當共同語言。
//
// ⚠️ 這支檔案裡不准出現 console.log：#336 PR2 會在處理 HTTP request 的過程中呼叫
// seedDemoData，往伺服器的 stdout 噴中文進度訊息（「建立球隊…」之類）在那個情境下是錯的
// ——那些訊息是寫給「盯著終端機看種子腳本跑」的人看的旁白，不是給正式環境的 log 看的。
// 進度訊息全部留在呼叫端（seed-testdata.ts）自己印；這支檔案改成用回傳值
// （DemoDataSummary）把「灌了什麼」表達出來，讓呼叫端自己決定要不要印、要怎麼印。

// ⚠️ 這兩行 import 的來源刻意分開，而且 db 刻意用 `import type`——這裡有一個循環相依：
// index.ts 末尾有 `export * from "./demoData"`（讓 api-server 跨套件 import 得到
// seedDemoData），而這支檔案又需要 index.ts 的東西，兩邊互指。
//
// ESM 的 import/export 宣告會被提升（跟 #343 那個 dotenv 太晚跑的 bug 同一個機制），
// 所以 index.ts 一開始執行就會先把這支檔案整個載入完，那時 index.ts 的
// `export const db = drizzle(...)` 那一行**還沒跑到**，db 處於 TDZ（暫時死區）。只要這支
// 檔案在「模組頂層」用到 db，就會炸 "Cannot access 'db' before initialization"——而且錯誤
// 訊息完全看不出跟循環 import 有關，很難查。
//
// 解法是讓這個循環在**執行期根本不存在**：
//   1. 資料表（teamsTable 等）改從 ./schema 直接拿，不繞經 index.ts。
//   2. db 只有 DbOrTx 這個型別會用到（`typeof db`），所以用 `import type` 匯入——
//      TypeScript 編譯後這行會整個消失，執行期沒有這個 import，循環自然斷開。
// 換句話說：不要把這裡改成一般的 `import { db }`，那樣它就會變回一個真的循環，
// 而且只要有人日後在頂層寫一行用到 db 的程式碼就會壞掉。
import type { db } from "./index";
import {
  teamsTable,
  peopleTable,
  matchesTable,
  playersTable,
  setsTable,
  ralliesTable,
  eventsTable,
  lineupsTable,
  tacticsTable,
  substitutionsTable,
  timeoutsTable,
  type InsertRally,
  type InsertEvent,
} from "./schema";

// drizzle 的 transaction callback 參數（tx）型別沒有直接匯出，這裡用 TypeScript 的
// `Parameters` 工具型別，從 `db.transaction` 這支函式本身的型別簽章反推回去：
// `db.transaction(callback)` 的第一個參數是 callback，callback 的第一個參數就是 tx，
// 兩層 Parameters<...>[0] 疊起來就等於「tx 的型別」。這樣可以在不知道 drizzle 內部
// 怎麼命名/匯出那個型別的情況下，仍然拿到正確的型別（而且 drizzle 版本升級改了內部型別
// 名稱也不會壞，因為這裡完全是從 db.transaction 的簽章反推，不是手動抄一份型別定義）。
export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── 種子隨機數（seeded PRNG）──
// 為什麼要「隨機但可重現」：這是給開發/展示用的測試資料，之後可能會被清掉重灌很多次
// （改 schema、清 DB 重跑這支腳本）。如果比分過程真的用 Math.random()，每次重灌出來的
// 比分走勢、球員數字都不一樣，沒辦法拿來穩定截圖/寫文件/對答案。但如果完全不隨機，
// 比分會整齊到一眼看穿是假資料。「種子隨機數」就是兩者都要：用同一個固定種子重新啟動
// 產生器，每次呼叫 rng() 吐出的數字序列會一模一樣（因為它其實是一個確定性的數學公式，
// 不是真的隨機），但那串數字本身看起來雜亂無章。
//
// #347 之後，這顆 rng 不再負責「這一分是誰贏的」——那件事現在改成 PO 指定的寫死序列
// （見下方 SET1_GROUPS 等常數的說明）。rng 仍然留著，因為「比分走勢」跟「這一分是哪個
// 球員做的決定球」是兩件獨立的事：PO 只在意比分曲線長怎樣（開局連拿幾分、幾比幾換人），
// 不會去指定「第 7 分是誰扣殺得分」這種細節——那件事還是要隨機分派給名單裡的球員，
// 才不用逐分手刻 36 名球員 122 顆球的歸屬。rng 只是換了工作內容（決定球歸屬），
// 「可重現」這個理由完全沒變：同一顆種子重灌，決定球歸屬也要每次都一樣。
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
export const BASE_SEED = 88888;

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
// name：tactics 的 SnapshotPlayer（見 seedLineupsAndTactics）是反正規化快照、必須把姓名
// 一起凍進去，所以名單型別也要跟著帶上，不能只挑 id/number/role 三個欄位。
type RosterPlayerWithId = { id: string; name: string; number: number; role: Role };
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

// ── #347：比分過程從「隨機生成」改成「PO 寫死的序列」──
// 在這之前，每局比分是用一套「平衡配額＋連續得分動能」的機率模型隨機亂數生出來的（見
// git 歷史的 buildRallies 函式）。#347 把示範資料收斂成「一場球完整看下去」的單一比賽，
// PO 因此對比分曲線有具體要求：第 1 局要在 2 分打到 6 分之間連拿 5 分（讓「暫停」這個
// 事件有自然的發生時機）、第 1 局 20:18 要有一次換人、每局要有幾個平手點撐出拉鋸感。
// 這些都是「這一分是誰贏的」這個層級的要求，隨機模型天生做不到「我要在這裡放一個平手」
// ——機率模型只能調整「平手發生的機率」，沒辦法精準點名「第幾分」。與其在機率模型上
// 疊一層又一層的特例判斷（那樣程式碼會變得比直接寫死更難懂、更難驗證是否符合 PO 的要求），
// 不如直接把 PO 給的序列打成字面量常數：這樣「這份資料長什麼樣子」跟「PO 的原始需求」
// 之間可以逐行對照，日後 PO 要改比分曲線，也是直接改這幾個常數，不用理解機率模型的內部
// 參數（MOMENTUM、配額平衡……）才能改出想要的結果。
//
// 序列格式：每個字母代表一分的贏家，H = 我方（home）、A = 對手（away）。分組（每行一組）
// 只是方便跟 PO 給的原始資料逐行核對，不影響程式邏輯——parseWinners 會把所有分組接起來、
// 拆成一串扁平的 winner 陣列。
function parseWinners(groups: string[]): ("home" | "away")[] {
  return groups
    .join(" ")
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => {
      if (token === "H") return "home";
      if (token === "A") return "away";
      throw new Error(`[demoData] winner 序列出現不合法字元「${token}」，只能是 H 或 A`);
    });
}

// 手寫序列很容易漏抄或多抄一個字母，而且錯一個字母不會讓程式炸掉（陣列長度、字元都合法），
// 只會讓最終比分悄悄跟預期不一樣，肉眼很難從 47 個字母裡挑出這種錯誤。這支函式在插入資料庫
// 之前先把「序列裡 H 的個數」「A 的個數」跟 PO 給的最終比分核對一次，兜不起來就直接丟錯、
// 讓 `pnpm run db:reset` 當場失敗，而不是默默灌一份分數對不上的示範資料進資料庫。
function assertSequenceMatchesScore(
  label: string,
  winners: ("home" | "away")[],
  expectedHome: number,
  expectedAway: number,
): void {
  const home = winners.filter((w) => w === "home").length;
  const away = winners.length - home;
  if (home !== expectedHome || away !== expectedAway) {
    throw new Error(
      `[demoData] ${label} 的比分序列核對失敗：算出 ${home}:${away}，` +
        `但預期是 ${expectedHome}:${expectedAway}（序列共 ${winners.length} 分）。` +
        `請檢查 H/A 字母有沒有漏抄或多抄。`,
    );
  }
}

// 第 1 局（25:22 勝，47 球）。開局連拿 5 分（2:1 打到 6:1，第 1 局 6:1 時對手叫暫停）；
// 20:18 是換人點；沿路有多次平手（見行末註解），讓比分曲線看起來有拉鋸感而不是一路平推。
const SET1_GROUPS = [
  "H A", // 1:1
  "H H H H H", // 6:1 ← 開局連拿 5 分（PO 指定），對手在這裡叫暫停
  "A A A", // 6:4
  "H", // 7:4
  "A A", // 7:6
  "H H", // 9:6
  "A A A", // 9:9 ← 平手
  "H", // 10:9
  "A", // 10:10 ← 平手
  "H H", // 12:10
  "A A", // 12:12 ← 平手
  "H", // 13:12
  "A", // 13:13 ← 平手
  "H H", // 15:13
  "A A", // 15:15 ← 平手
  "H H H", // 18:15
  "A A", // 18:17
  "H H", // 20:17
  "A", // 20:18 ← 換人點
  "H", // 21:18
  "A A", // 21:20
  "H H", // 23:20
  "A A", // 23:22
  "H H", // 25:22
];

// 第 2 局（23:25 敗，48 球）。
const SET2_GROUPS = [
  "H A H A", // 2:2 ← 平手
  "H H", // 4:2
  "A A A", // 4:5
  "H H", // 6:5
  "A", // 6:6 ← 平手
  "H H H", // 9:6
  "A A A A", // 9:10
  "H H", // 11:10
  "A A", // 11:12
  "H H H", // 14:12
  "A A A", // 14:15
  "H H", // 16:15
  "A A", // 16:17
  "H H H", // 19:17
  "A A A", // 19:20
  "H H", // 21:20
  "A A", // 21:22
  "H H", // 23:22
  "A A A", // 23:25
];

// 第 3 局（15:12 勝，27 球，決勝局）。
const SET3_GROUPS = [
  "H A", // 1:1 ← 平手
  "H A", // 2:2 ← 平手
  "H H A A", // 4:4 ← 平手
  "A", // 4:5
  "H H", // 6:5
  "A", // 6:6 ← 平手
  "H H H", // 9:6
  "A A", // 9:8
  "H H", // 11:8
  "A A", // 11:10
  "H H", // 13:10
  "A A", // 13:12
  "H H", // 15:12
];

const SET1_WINNERS = parseWinners(SET1_GROUPS);
const SET2_WINNERS = parseWinners(SET2_GROUPS);
const SET3_WINNERS = parseWinners(SET3_GROUPS);
// 在模組載入的當下（還沒連資料庫）就先核對，寫錯字母會讓 `import` 這支模組的任何程式
// （seed-testdata.ts、#336 PR2 的 HTTP handler）立刻炸掉，比等到插入到一半才發現快很多。
assertSequenceMatchesScore("第 1 局", SET1_WINNERS, 25, 22);
assertSequenceMatchesScore("第 2 局", SET2_WINNERS, 23, 25);
assertSequenceMatchesScore("第 3 局", SET3_WINNERS, 15, 12);

// ── #347 修正：輪轉要照真正的排球規則（side-out）算，不能「每一分固定 +1」──
// 上一版這裡寫的是 `rot = (n - 1) % 6`：不管誰贏球，輪次每一分都往前推一格。這是
// **錯的排球規則**，不是可以接受的簡化——排球輪轉的規則是「只有接發球方贏得這一分，
// 才輪轉一格」（side-out：奪回發球權的同時輪轉）；發球方自己連續得分不輪轉。兩隊的輪次
// 也是分開各自累計的，不是「對方 = 我方 + 3」這種固定偏移（上一版的 `awayRotation:
// (rot + 3) % 6` 也是錯的，同一批修掉）。
//
// 為什麼這件事非修不可：artifacts/api-server/src/routes/analysis.ts 的
// GET /analysis/matches/:matchId/rotations 是拿 rallies.homeRotation 做 groupBy，算「我方
// 各輪次的得失分」。如果輪次是每一分固定 +1 產生的，六個輪次會被雨露均霑地各分到差不多
// 筆數的 rally——那張表照樣會畫得出來、格式完全正常，數字卻毫無意義（不是「這個輪次比較
// 會得分」，只是「這個輪次剛好被算到比較多顆球」）。這是「不會壞、只會錯」的資料，比明顯
// 噴錯誤的 bug 更危險——而這份示範資料的用途正是要展示產品給真人看，畫面好看但數字是假的
// 反而更容易誤導人。
function buildRalliesFromSequence(
  rng: () => number,
  // setId 是「還沒有真正 id」的佔位值（呼叫端傳空字串），insertSetWithRallies 插入 set
  // 拿到 DB 配的 uuid 之後會整批覆蓋回去，見那支函式裡的 `{ ...s.rally, setId: set.id }`。
  setId: string,
  winners: ("home" | "away")[],
  firstServer: "home" | "away",
  // 「這一分開始前，場上有哪些我方球員」——決定球只能歸屬給**此刻真的在場上的人**，
  // 所以這裡收的是一支依比分回答的函式，而不是一份固定名單。為什麼不能直接傳整份名單：
  // 這場登錄 12 人、實際只有 7 人上場（六位先發＋自由球員），從整份名單抽的話，
  // 從頭到尾沒上場的替補也會拿到攻擊、攔網等決定球——曾經真的發生過（替補的縁下力
  // 攻擊 8 次、是全隊最高，但他一球都沒打），球員統計整個是假的。
  // 舊版看不出來是因為那時名單只有 6~7 人、等於全部都在場上，這個 bug 一直被藏著。
  onCourtFor: (homeScore: number, awayScore: number) => RosterPlayerWithId[],
): { rally: InsertRally; eventSpec: EventSpec }[] {
  const specs: { rally: InsertRally; eventSpec: EventSpec }[] = [];
  let home = 0;
  let away = 0;
  // serving：目前是哪一方在發球；homeRot/awayRot：兩隊各自的輪次快照，各自獨立累計
  // （不是彼此的固定偏移）。
  let serving: "home" | "away" = firstServer;
  let homeRot = 0;
  let awayRot = 0;
  for (let i = 0; i < winners.length; i += 1) {
    const n = i + 1;
    const winner = winners[i];
    const eventSpec = buildEventSpec(rng, winner, onCourtFor(home, away));
    specs.push({
      rally: {
        setId,
        rallyNumber: n,
        homeScore: home, // 存的是「這分開始前」的比分，所以先 push 再加分
        awayScore: away,
        // homeRotation/awayRotation 同理：存的是「這分開始前」的輪次快照，所以也是先
        // push 目前的 homeRot/awayRot，這一分打完之後才視情況更新（見下面 side-out 判斷）。
        homeRotation: homeRot,
        awayRotation: awayRot,
        winner,
      },
      eventSpec,
    });
    if (winner === "home") home += 1;
    else away += 1;
    // side-out 判斷：這一分的贏家如果不是原本在發球的那一方，代表發球權易主，贏的那一方
    // 要輪轉一格、並接手發球；如果贏家就是原本在發球的那一方，代表發球方連續得分，
    // 兩邊都不輪轉。
    if (winner !== serving) {
      if (winner === "home") homeRot = (homeRot + 1) % 6;
      else awayRot = (awayRot + 1) % 6;
      serving = winner;
    }
  }
  return specs;
}

// 插入「一局 + 它的所有 rally + 每一分的 event」。
// 回傳這一局的 set.id：呼叫端需要把它們交給 seedLineupsAndTactics（補先發）、以及換人／
// 暫停的插入邏輯（它們都要 setId 外鍵，但要等 set 真的 insert 完才拿得到 uuid）。
async function insertSetWithRallies(
  exec: DbOrTx,
  matchId: number,
  setNumber: number,
  firstServer: "home" | "away",
  specs: { rally: InsertRally; eventSpec: EventSpec }[],
): Promise<string> {
  const [set] = await exec
    .insert(setsTable)
    .values({ matchId, setNumber, firstServer })
    .returning({ id: setsTable.id });

  // specs 裡的 rally 當初是用「還沒有真正 setId」的暫時值算的，這裡補上真正的 set.id。
  const rallies = specs.map((s) => ({ ...s.rally, setId: set.id }));
  const insertedRallies = await exec
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
        // outcome（#51 第一塊）：跟 pointRecordToEvent 同一條推導式，以執行方為基準。
        // 示範資料是新使用者第一次看到這個 app 的樣子——如果只有「之後自己記的球」有
        // outcome、示範比賽卻沒有，使用者一載入示範資料，分析頁的統計看起來仍然是空的，
        // 等於示範資料在展示一個「壞掉」的產品。所以這裡也要照同一條規則補上。
        outcome: s.eventSpec.side === s.rally.winner ? ("point" as const) : ("loss" as const),
      },
    ];
  });
  if (events.length > 0) {
    await exec.insert(eventsTable).values(events);
  }
  return set.id;
}

// 幫這場（唯一的）比賽建立三局 + 各局的 rally + 每一分的 event。三局的 winner 序列是
// 上面 SET1_WINNERS/SET2_WINNERS/SET3_WINNERS 這三個寫死的常數，不再是隨機生成
// （見 buildRalliesFromSequence 上面那段大註解），這裡只負責照順序把它們插進去、
// 並把三局的 set.id 收集起來回傳給呼叫端。
async function seedSets(
  exec: DbOrTx,
  matchId: number,
  // 六位先發（依 Z1~Z6 順序）與完整名單分開收：決定球的候選池只能是「在場上的人」，
  // 而那是先發六人＋自由球員，不是登錄的 12 人（見 buildRalliesFromSequence 的 onCourtFor）。
  starters: RosterPlayerWithId[],
  ourRoster: RosterPlayerWithId[],
  rng: () => number,
): Promise<string[]> {
  const sequences: { winners: ("home" | "away")[]; firstServer: "home" | "away" }[] = [
    { winners: SET1_WINNERS, firstServer: "home" }, // 第 1、3 局我方先發球
    { winners: SET2_WINNERS, firstServer: "away" }, // 第 2 局對手先發球
    { winners: SET3_WINNERS, firstServer: "home" },
  ];

  // 場上的 7 個人：六位先發 ＋ 自由球員。自由球員雖然隨輪轉上上下下（見
  // computeLiberoSubstitutions），但他整局都在板凳與場上之間來回、隨時可能是防守/接發的
  // 決定球執行者，所以一律留在候選池裡。他不會被抽去發球或攻擊——角色白名單
  // （SERVE_ROLES/ATTACK_ROLES 都沒有列 L）已經擋住了，不需要在這裡再擋一次。
  const libero = ourRoster.find((p) => p.role === "L");
  const basePool = libero ? [...starters, libero] : [...starters];

  // 那筆一般換人（山口忠 #12 上、月島蛍 #11 下）之後的場上名單。
  const subIn = ourRoster.find((p) => p.name === REGULAR_SUBSTITUTION.playerInName);
  const subOut = ourRoster.find((p) => p.name === REGULAR_SUBSTITUTION.playerOutName);
  const afterSubPool =
    subIn && subOut ? basePool.map((p) => (p.name === subOut.name ? subIn : p)) : basePool;

  const setIds: string[] = [];
  for (let i = 0; i < sequences.length; i += 1) {
    const { winners, firstServer } = sequences[i];
    // 這一局在某個比分時，場上是誰。
    //
    // 為什麼只有換人發生的那一局要換池子：一般換人的效力**只到當局結束**，下一局雙方都
    // 回到各自的先發陣容重新開始（排球規則）。所以第 2、3 局一律用 basePool。
    //
    // 為什麼用「總分」比大小而不是分別比 home/away：一局內每一分只會有一邊 +1，所以
    // (homeScore, awayScore) 沿著一條單調遞增的路徑走，每一個「總分」值在這條路徑上
    // 只會對應到唯一一個比分點。換人記在 (20,18)＝總分 38，因此「總分 ≥ 38」剛好等於
    // 「這一分在換人之後（含當下那一分）」，不用另外處理 (21,17) 這種同樣總分但不同
    // 比分的情況——那個點根本不在這條路徑上。
    const subTotal = REGULAR_SUBSTITUTION.homeScore + REGULAR_SUBSTITUTION.awayScore;
    const onCourtFor = (homeScore: number, awayScore: number): RosterPlayerWithId[] =>
      i === REGULAR_SUBSTITUTION.setIndex && homeScore + awayScore >= subTotal
        ? afterSubPool
        : basePool;

    // setId 先塞空字串（佔位），真正的 uuid 由 insertSetWithRallies 插入 set 後回填。
    const specs = buildRalliesFromSequence(rng, "", winners, firstServer, onCourtFor);
    const setId = await insertSetWithRallies(exec, matchId, i + 1, firstServer, specs);
    setIds.push(setId);
  }
  return setIds;
}

// ── 號位輪轉小工具（給下面 computeLiberoSubstitutions 用）──
// 直接複製自 artifacts/volleyball-tactics/src/lib/rotationLogic.ts 的 shiftSequence／
// rotateZone／BACK_ROW_ZONES，不是 import 過來——lib/ 是被 artifacts/ 匯入的下層，反過來
// import 會把相依方向倒過來，跟上面 ZONE_COORDS 抄一份常數同一個理由。如果前端那份輪轉
// 公式改了，這裡要跟著手動改，否則這裡推導出來的「誰在後排」會跟前端畫面顯示的對不上。
const SHIFT_SEQUENCE = [1, 6, 5, 4, 3, 2] as const;
const BACK_ROW_ZONES = new Set([1, 5, 6]);

// 給定「起始號位」跟「輪轉了幾格」，回傳現在實際落在哪個號位。跟前端 rotateZone() 完全
// 同一條公式：先找起始號位在 shiftSequence 裡的 index，加上輪轉格數後取 mod 6。
function rotateZone(startZone: number, rotation: number): number {
  const currentIndex = SHIFT_SEQUENCE.indexOf(startZone as (typeof SHIFT_SEQUENCE)[number]);
  const newIndex = (((currentIndex + rotation) % 6) + 6) % 6;
  return SHIFT_SEQUENCE[newIndex];
}
function isBackRowZone(zone: number): boolean {
  return BACK_ROW_ZONES.has(zone);
}

// ── #347 修正：自由球員上下場改成「從輪轉推導」，不再手挑比分點 ──
// 有了正確的 side-out 輪轉模型（見 buildRalliesFromSequence），這件事就變成可以精確推導的
// 資訊，不用再靠人工挑幾個「聽起來合理」的比分點頂著。規則：自由球員只能站後排，所以他
// 換的是「輪到後排的那位副攻」——日向翔陽起始站 Z2、月島蛍起始站 Z5，這兩個號位相差
// 3 格，在排球的六人輪轉規則下永遠一前一後（見 rotateZone 的公式：任兩個相差 3 格的號位，
// 一個落在前排範圍 {2,3,4} 時，另一個必定落在後排範圍 {1,5,6}），所以任何時刻場上永遠
// 剛好有一位副攻在後排，需要自由球員頂著。
//
// 推導規則：
//   1. 開賽（0:0）：先檢查兩位副攻誰站後排，一開賽自由球員就要換上場頂那個位置。
//   2. 之後每次我方輪轉（homeRot 改變）時，比對變化前後兩位副攻的前/後排狀態：
//      - 某位副攻從「後排轉到前排」→ 他要回到場上正常輪轉，記一筆
//        playerInId = 該副攻、playerOutId = 自由球員。
//      - 某位副攻從「前排轉到後排」→ 他要下場換自由球員，記一筆
//        playerInId = 自由球員、playerOutId = 該副攻。
//      兩者可能同時發生（因為兩位副攻永遠一前一後，一個轉進後排的同時另一個一定轉出後排），
//      這種情況記兩筆、用同一組比分快照。
//   3. 整局都要記到最後一分，不能中途停下——只記前面幾筆的話，自由球員會在比賽中段憑空
//      消失，懂排球的人（PO 設定的目標使用者是系隊夥伴跟球經）一眼就看得出來不對。
function computeLiberoSubstitutions(
  winners: ("home" | "away")[],
  firstServer: "home" | "away",
): { homeScore: number; awayScore: number; direction: "in" | "out"; mbName: string }[] {
  const MB_STARTERS: { name: string; zone: number }[] = [
    { name: "日向翔陽", zone: 2 },
    { name: "月島蛍", zone: 5 },
  ];
  const events: {
    homeScore: number;
    awayScore: number;
    direction: "in" | "out";
    mbName: string;
  }[] = [];

  let serving: "home" | "away" = firstServer;
  let homeRot = 0;
  let home = 0;
  let away = 0;

  // 開賽當下（0:0，還沒打任何一分）：兩位副攻裡站後排的那位直接換自由球員上場。
  for (const mb of MB_STARTERS) {
    if (isBackRowZone(rotateZone(mb.zone, homeRot))) {
      events.push({ homeScore: 0, awayScore: 0, direction: "in", mbName: mb.name });
    }
  }

  for (let i = 0; i < winners.length; i += 1) {
    const winner = winners[i];
    const prevHomeRot = homeRot;
    if (winner === "home") home += 1;
    else away += 1;
    if (winner !== serving) {
      if (winner === "home") homeRot = (homeRot + 1) % 6;
      serving = winner;
    }
    if (homeRot === prevHomeRot) continue; // 這一分沒有讓我方輪轉，副攻站位不變，不用檢查

    // 我方剛剛輪轉了一格：比對兩位副攻在輪轉前後的前/後排狀態有沒有變化。這裡用的比分
    // 快照是「這一分打完之後」的比分（home/away 已經在上面加過了）——換人發生在這一分
    // 結束、下一分開始之前，語意跟 TIMEOUTS/REGULAR_SUBSTITUTION 的比分快照一致。
    for (const mb of MB_STARTERS) {
      const wasBack = isBackRowZone(rotateZone(mb.zone, prevHomeRot));
      const isBack = isBackRowZone(rotateZone(mb.zone, homeRot));
      if (wasBack && !isBack) {
        events.push({ homeScore: home, awayScore: away, direction: "out", mbName: mb.name });
      } else if (!wasBack && isBack) {
        events.push({ homeScore: home, awayScore: away, direction: "in", mbName: mb.name });
      }
    }
  }
  return events;
}

// 把「算出來的自由球員上下場筆數」跟已知答案核對一次——這份推導完全是決定性的（給定同一組
// winner 序列跟 firstServer，答案永遠一樣），如果哪天不小心改動了 STARTERS 的站位或這支
// 函式的邏輯，筆數兜不起來就代表推導壞了，直接在模組載入時炸出來，比事後肉眼比對 25 筆
// 換人紀錄快得多。
function assertLiberoSubstitutionCount(label: string, events: unknown[], expected: number): void {
  if (events.length !== expected) {
    throw new Error(
      `[demoData] ${label} 的自由球員上下場筆數核對失敗：算出 ${events.length} 筆，` +
        `但預期是 ${expected} 筆。請檢查輪轉推導邏輯有沒有跑錯。`,
    );
  }
}

const SET1_LIBERO_SUBSTITUTIONS = computeLiberoSubstitutions(SET1_WINNERS, "home");
const SET2_LIBERO_SUBSTITUTIONS = computeLiberoSubstitutions(SET2_WINNERS, "away");
const SET3_LIBERO_SUBSTITUTIONS = computeLiberoSubstitutions(SET3_WINNERS, "home");
assertLiberoSubstitutionCount("第 1 局", SET1_LIBERO_SUBSTITUTIONS, 9);
assertLiberoSubstitutionCount("第 2 局", SET2_LIBERO_SUBSTITUTIONS, 9);
assertLiberoSubstitutionCount("第 3 局", SET3_LIBERO_SUBSTITUTIONS, 7);

// ── #347：換人／暫停的時機為什麼存比分快照，不是存 rallyId ──
// 見 schema/substitutions.ts、schema/timeouts.ts 檔頭的完整說明（docs/event-grammar-spec.md
// 那節分析過的定案），這裡摘要一次：換人／暫停都發生在「死球期間」——上一分已經結束、
// 下一分的 rally 還沒開始，那個當下下一個 rally 的 id 根本不存在。存比分快照
// (homeScore, awayScore) 可行，是因為一局內的比分組合唯一且嚴格遞增，光靠這兩個數字
// 就能精準標定「第幾分開球前發生的事」，不需要依賴任何其他 row 先存在。

// 一場比賽（唯一的一場）裡固定會有的暫停紀錄：第 1 局比分 6:1 時，對手被連拿 5 分，
// 順理成章地叫了一次暫停（見 SET1_GROUPS 的 "6:1 ← 開局連拿 5 分" 註解）。
const TIMEOUTS: {
  setIndex: 0 | 1 | 2;
  homeScore: number;
  awayScore: number;
  side: "home" | "away";
}[] = [{ setIndex: 0, homeScore: 6, awayScore: 1, side: "away" }];

// ── 一般換人 ──
// 第 1 局比分 20:18 時，山口忠 #12 上、月島蛍 #11 下（兩人同為副攻，位置一致，山口在原作
// 就是替補發球員）。
//
// ⚠️ 一般換人**不限前後排**——「換人時要在後排」只有自由球員的替換才是規則（見
// schema/substitutions.ts 的 kind 註解），一般換人隨時都能換。所以這裡不需要像
// computeLiberoSubstitutions 那樣檢查月島當時站前排還後排（用正確的 side-out 輪轉模型
// 算過，這個時間點 homeRot=3、月島站在 Z2，剛好是前排，但這完全不影響這筆換人的合法性）。
const REGULAR_SUBSTITUTION = {
  setIndex: 0 as const,
  homeScore: 20,
  awayScore: 18,
  playerInName: "山口忠",
  playerOutName: "月島蛍",
};

// 把上面幾個常數（TIMEOUTS／REGULAR_SUBSTITUTION／SET1~3_LIBERO_SUBSTITUTIONS）灌進資料庫。
// 抽成一支獨立函式，是因為這件事要等「三局都已經插入完成、拿到真正的 set.id」之後才能做
// ——換人／暫停的 setId 外鍵指向真正的 uuid，不是像 rally 那樣可以先塞空字串佔位。
async function seedGameEvents(
  exec: DbOrTx,
  setIds: string[], // 依局數順序：[第1局, 第2局, 第3局]
  playerIdByName: Map<string, string>,
): Promise<void> {
  const playerId = (name: string): string => {
    const id = playerIdByName.get(name);
    if (id === undefined) throw new Error(`[demoData] 找不到球員「${name}」，名單可能打錯字`);
    return id;
  };

  await exec.insert(timeoutsTable).values(
    TIMEOUTS.map((t) => ({
      setId: setIds[t.setIndex],
      homeScore: t.homeScore,
      awayScore: t.awayScore,
      side: t.side,
    })),
  );

  // 自由球員上下場：schema/substitutions.ts 的規則是「L 上場時 playerIn 是 L、L 下場時
  // playerOut 是 L」，這裡把 computeLiberoSubstitutions 算出來的 direction 翻譯成對應的
  // playerInId/playerOutId。三局各自的清單（見上面的 assertLiberoSubstitutionCount 呼叫）
  // 分別對應 setIds[0]/[1]/[2]，明寫三段而不是用陣列+flatMap 迴圈，是為了讓 TypeScript
  // 能保留每個清單的具體型別，不用為了湊統一的迴圈型別而加上不安全的 cast。
  const liberoSubstitutionRows = [
    ...SET1_LIBERO_SUBSTITUTIONS.map((sub) => ({ setIndex: 0 as const, ...sub })),
    ...SET2_LIBERO_SUBSTITUTIONS.map((sub) => ({ setIndex: 1 as const, ...sub })),
    ...SET3_LIBERO_SUBSTITUTIONS.map((sub) => ({ setIndex: 2 as const, ...sub })),
  ].map((sub) => ({
    setId: setIds[sub.setIndex],
    homeScore: sub.homeScore,
    awayScore: sub.awayScore,
    playerInId: playerId(sub.direction === "in" ? "西谷夕" : sub.mbName),
    playerOutId: playerId(sub.direction === "in" ? sub.mbName : "西谷夕"),
    kind: "libero" as const,
  }));

  const substitutionRows = [
    {
      setId: setIds[REGULAR_SUBSTITUTION.setIndex],
      homeScore: REGULAR_SUBSTITUTION.homeScore,
      awayScore: REGULAR_SUBSTITUTION.awayScore,
      playerInId: playerId(REGULAR_SUBSTITUTION.playerInName),
      playerOutId: playerId(REGULAR_SUBSTITUTION.playerOutName),
      kind: "regular" as const,
    },
    ...liberoSubstitutionRows,
  ];
  await exec.insert(substitutionsTable).values(substitutionRows);
}

// 6 個球場格子的座標（0~1 normalized）。直接複製自
// artifacts/volleyball-tactics/src/lib/rotationLogic.ts 的 zoneCoords，不是 import 過來
// ——lib/ 是被 artifacts/ 匯入的下層，反過來讓 lib/ import artifacts/ 的程式碼會把相依
// 方向倒過來。如果前端那份 zoneCoords 改了球場座標系，這裡也要跟著手動改，否則 seed 出來的
// tactics 存檔在戰術板上會顯示錯位。
const ZONE_COORDS: Record<1 | 2 | 3 | 4 | 5 | 6, { x: number; y: number }> = {
  1: { x: 0.83, y: 0.85 }, // Right Back
  2: { x: 0.83, y: 0.6 }, // Right Front
  3: { x: 0.5, y: 0.6 }, // Middle Front
  4: { x: 0.17, y: 0.6 }, // Left Front
  5: { x: 0.17, y: 0.85 }, // Left Back
  6: { x: 0.5, y: 0.85 }, // Middle Back
};

// 補上 lineups（起始先發）與 tactics（已存戰術），讓輪轉表／戰術板／先發站位這幾個畫面
// 灌完種子資料後不是空的。
//
// #347 之前這裡會對名單做 Fisher-Yates 洗牌，每一局重排一次「誰站哪個號位」。這次改成
// 固定用同一組先發站位（starters 參數，已經照 Z1~Z6 的順序排好），三局都一樣、完全不洗牌
// ——因為這次的六人先發站位是刻意設計過的合法對位（Z1↔Z4 舉球對對角、Z2↔Z5 兩位副攻、
// Z3↔Z6 兩位主攻，見 seedDemoData 裡 STARTERS 常數上方的說明），洗牌會把這個對位打散、
// 湊出不合規則的輪轉（例如兩個舉球員同時在場）。真實比賽裡球隊也通常整場比賽維持同一套
// 先發輪轉順位，不會每局重新排列，固定不洗牌反而更貼近真實情況。
async function seedLineupsAndTactics(
  exec: DbOrTx,
  userId: string,
  match: { matchId: number; starters: RosterPlayerWithId[]; completedSetIds: string[] },
): Promise<void> {
  const [z1, z2, z3, z4, z5, z6] = match.starters;

  for (const setId of match.completedSetIds) {
    await exec.insert(lineupsTable).values({
      setId,
      zone1PlayerId: z1.id,
      zone2PlayerId: z2.id,
      zone3PlayerId: z3.id,
      zone4PlayerId: z4.id,
      zone5PlayerId: z5.id,
      zone6PlayerId: z6.id,
    });
  }

  // 已存戰術（tactics）：拿先發站位（六個號位對應到球場座標，見上面 ZONE_COORDS），存成一份
  // SavedTacticDataV2——前端 artifacts/volleyball-tactics/src/types/courtSnapshot.ts 定義的
  // 存檔格式，也是 artifacts/volleyball-tactics/src/hooks/useTacticsBoard.ts 的
  // loadProject／parseSavedTactic 實際會讀的形狀。反正規化：姓名/背號/位置在這裡就凍結成
  // 純值，不是存 playerId 回頭查 roster（這是 #154 戰術板重構定案的格式）。這裡沒有直接
  // import 那些前端型別/zod schema 來驗證，是因為 lib/ 不能 import artifacts/ 的程式碼
  // ——跟上面 ZONE_COORDS 抄一份常數同一個理由，這裡改成手刻字面量，形狀對齊
  // courtSnapshot.ts 的 savedTacticDataV2Schema 即可。
  const players = match.starters.map((p, idx) => {
    const zone = (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    const coords = ZONE_COORDS[zone];
    return {
      sourcePlayerId: p.id,
      name: p.name,
      number: p.number,
      role: p.role,
      x: coords.x,
      y: coords.y,
      isLibero: false, // starters 不含自由球員，這裡恆為 false
    };
  });
  const data = {
    version: 2 as const,
    scenes: [
      {
        label: "先發站位",
        snapshot: {
          source: "rotation" as const,
          // 前端 URL 上的 matchId 是字串（wouter 的 route param），courtSnapshot.ts 的
          // matchId 欄位也是 z.string().nullable()——這裡跟前端存檔慣例一致，轉成字串。
          matchId: String(match.matchId),
          rotation: 0,
          // 寫死一個固定時間，不用 `new Date()`——這份示範資料的賣點就是「每次重灌
          // 結果一模一樣」（見上面 BASE_SEED 那段），而牆上時鐘是唯一會讓輸出隨執行時刻
          // 漂移的東西。這裡挑比賽日期的隔天，語意上像「賽後整理戰術時存的檔」。
          capturedAt: "2026-07-21T10:00:00+08:00",
          players,
        },
        markers: [] as unknown[],
        defenseRanges: [] as unknown[],
      },
    ],
  };
  await exec.insert(tacticsTable).values({
    userId,
    matchId: match.matchId,
    name: "先發站位",
    data,
  });
}

// seedDemoData 完成後回傳的摘要，讓呼叫端（例如 seed-testdata.ts 收尾印訊息，或 #336 PR2
// 的 HTTP handler 回應）能取得剛剛灌了什麼，不用另外重新查一次 DB。
//
// matchIds 保留「陣列」型別（即使現在永遠只有一個元素）：#336 PR2 的 HTTP handler
// （artifacts/api-server/src/routes/demoData.ts）已經對外回應 `{ matchIds: number[] }`
// 這個形狀（openapi.yaml 的 DemoDataStatus schema），改成單一 matchId 會牽動那支路由
// 跟前端契約，超出這次「換示範資料內容」的範圍，所以刻意維持陣列形狀不變。
export type DemoDataSummary = {
  team: { id: number; name: string };
  peopleCount: number;
  matchIds: number[];
};

// 對指定的 userId 灌一份完整的示範資料：#347 之後改成「一場比賽的完整呈現」——
// 一支球隊、12 人名單、一場三局的比賽（含比分/先發/換人/暫停/自由球員上下場/決定球
// events），比較貼近使用者真正會怎麼用這個 app 記一場球，也比舊版「4 場比賽、13 位泛用
// 人名」更容易在截圖/文件裡指認「這是哪個球員」。
//
// seed 是可覆寫的種子（預設 BASE_SEED）：讓呼叫端有需要時可以指定別的種子，但兩個消費者
// 目前都用預設值，確保「同一顆種子重灌出同一份資料」。
export async function seedDemoData(
  exec: DbOrTx,
  userId: string,
  seed: number = BASE_SEED,
): Promise<DemoDataSummary> {
  // 整份示範資料共用同一顆種子 PRNG：只要下面呼叫 rng() 的順序不變，重新執行就會產生
  // 一模一樣的資料（見檔案開頭 mulberry32 的說明）。
  const rng = mulberry32(seed);

  // 唯一一支球隊。
  const [team] = await exec
    .insert(teamsTable)
    .values({ userId, name: "範例球隊", isDemo: true })
    .returning({ id: teamsTable.id, name: teamsTable.name });

  // 12 人名單，取自排球少年・烏野高校排球部。
  //
  // ── 為什麼是 12 人，不是更常見的名單大小 ──
  // 烏野在原作只登錄了 12 個背號，而且只有一位自由球員（西谷夕）——這份示範資料如實照抄
  // 這個結構，所以是 12 人、替補名單裡沒有第二位自由球員。這不是筆誤，是刻意貼著原作設定。
  //
  // ── 為什麼東峰旭被標成「對角」(OPP) ──
  // 烏野原作的先發完全沒有嚴格意義的「對角」——先發六人裡澤村大地／東峰旭／田中龍之介
  // 三個人在原作設定裡都是「主攻」(Wing Spiker)。但這個 app 的名單角色只分 S/OH/MB/OPP/L
  // 五類（見 schema/players.ts 的 playerRoleEnum），示範資料又想湊出「2 主攻＋1 對角」這種
  // 排球隊最常見、規則書會拿來當範例的標準先發組成，才能讓輪轉表／戰術板的站位對位看起來
  // 是「教科書等級」的合法排列。權衡之下，把東峰旭（隊上王牌、主要得分點，攻擊火力最貼近
  // 「對角」在戰術上的定位）對應成這個 app 定義下的對角——這是**這個專案自己的對應**，
  // 不是原作的官方設定，未來如果有讀者拿這份名單去對照原作漫畫/動畫的守備位置標註，會對
  // 不起來，是刻意的取捨，不是抄錯。
  const S = "S" as const,
    OH = "OH" as const,
    MB = "MB" as const,
    OPP = "OPP" as const,
    L = "L" as const;
  type RosterEntry = {
    name: string;
    number: number;
    role: typeof S | typeof OH | typeof MB | typeof OPP | typeof L;
  };

  // ── 先發六人，順序就是 Z1~Z6（陣列 index 直接對應號位）──
  // ⚠️ 不要調換這個陣列的順序：這六人的站位是刻意排過的合法對位——
  //   Z1(影山,S) ↔ Z4(東峰,OPP)：舉球員跟對角在排球規則裡永遠同時在場上對角線兩端
  //   （同時前排/同時後排），這是「舉球對對角」最基本的站位邏輯，兩人角色也對得起來。
  //   Z2(日向,MB) ↔ Z5(月島,MB)：兩位副攻分站對角，副攻通常需要兩位輪流守中間攔網。
  //   Z3(澤村,OH) ↔ Z6(田中,OH)：兩位主攻分站對角，同理。
  // 排球規則裡「相差 3 個號位」的兩個位置（1↔4、2↔5、3↔6）永遠同時前排或同時後排
  // （見 artifacts/volleyball-tactics/src/lib/rotationLogic.ts 的 shiftSequence 輪轉公式），
  // 隨手調換這個陣列的順序（例如把 Z2、Z5 的人對調成跟 Z3、Z6 配對）會做出不合規則的
  // 站位（例如兩個副攻同時站在會同時前排的位置，前排永遠缺一個攻擊點）。這份先發名單
  // 三局都固定不變（見 seedLineupsAndTactics 的說明），所以這個順序影響的不只是第 1 局，
  // 是整場比賽的站位正確性。
  const STARTERS: RosterEntry[] = [
    { name: "影山飛雄", number: 9, role: S }, // Z1
    { name: "日向翔陽", number: 10, role: MB }, // Z2
    { name: "澤村大地", number: 1, role: OH }, // Z3
    { name: "東峰旭", number: 3, role: OPP }, // Z4
    { name: "月島蛍", number: 11, role: MB }, // Z5
    { name: "田中龍之介", number: 5, role: OH }, // Z6
  ];
  const LIBERO: RosterEntry = { name: "西谷夕", number: 4, role: L };
  const BENCH: RosterEntry[] = [
    { name: "菅原孝支", number: 2, role: S },
    { name: "縁下力", number: 6, role: OH },
    { name: "木下久志", number: 7, role: OH },
    { name: "成田一仁", number: 8, role: MB },
    { name: "山口忠", number: 12, role: MB },
  ];
  const ROSTER: RosterEntry[] = [...STARTERS, LIBERO, ...BENCH];

  // 人（people 表）：跨比賽/跨球隊追蹤「這是同一個人」用的身分表。這次只有一場比賽，
  // 用不到「同一個人跨場」這件事，但 players.personId 這個外鍵仍然是設計上該填的——
  // 每個球員名單列本來就該指回一個 people 身分（見 schema/players.ts 的 personId 註解）。
  const people = await exec
    .insert(peopleTable)
    .values(ROSTER.map((r) => ({ userId, name: r.name, isDemo: true })))
    .returning({ id: peopleTable.id, name: peopleTable.name });
  const personId = (name: string) => people.find((p) => p.name === name)!.id;

  // 比賽：唯一一場，掛在上面那支球隊底下。
  const [match] = await exec
    .insert(matchesTable)
    .values({
      userId,
      name: null,
      opponent: "範例對手",
      date: new Date("2026-07-20T19:00:00+08:00"),
      teamId: team.id,
      format: "best_of_3",
      status: "finished",
      isDemo: true,
    })
    .returning({ id: matchesTable.id });

  // 這場比賽的名單（players 表，一列＝這場比賽裡「某人穿幾號、打什麼位置」）。
  const insertedPlayers = await exec
    .insert(playersTable)
    .values(
      ROSTER.map((r) => ({
        matchId: match.id,
        name: r.name,
        number: r.number,
        role: r.role,
        personId: personId(r.name),
      })),
    )
    .returning({
      id: playersTable.id,
      name: playersTable.name,
      number: playersTable.number,
      role: playersTable.role,
    });
  const playerIdByName = new Map(insertedPlayers.map((p) => [p.name, p.id]));
  const ourRoster: RosterPlayerWithId[] = insertedPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    number: p.number,
    role: p.role,
  }));
  // 先發六人（依 Z1~Z6 順序），從剛插入的 ourRoster 裡按名字撈回來——用 insert 完之後的
  // id（DB 配的 uuid），不是先前 STARTERS 陣列裡那份還沒有 id 的資料。
  const starters: RosterPlayerWithId[] = STARTERS.map((s) => {
    const found = ourRoster.find((p) => p.name === s.name);
    if (!found) throw new Error(`[demoData] 先發名單「${s.name}」沒有出現在插入結果裡`);
    return found;
  });

  // 三局比分/rally/決定球 events。
  const completedSetIds = await seedSets(exec, match.id, starters, ourRoster, rng);

  // 換人／暫停／自由球員上下場。
  await seedGameEvents(exec, completedSetIds, playerIdByName);

  // 起始先發（lineups）與已存戰術（tactics）。
  await seedLineupsAndTactics(exec, userId, {
    matchId: match.id,
    starters,
    completedSetIds,
  });

  return {
    team,
    peopleCount: people.length,
    matchIds: [match.id],
  };
}
