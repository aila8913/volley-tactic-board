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
// 每次載入的內容都不一樣，寫使用手冊、拍教學截圖、跟夥伴討論「你看那個 A 隊 vs 台大那場」
// 時就會兜不起來（因為別人載入的示範資料跟你截圖當下的不是同一份）。固定種子確保「不管
// 誰、什麼時候按下載入示範資料，內容都完全一樣」，示範資料才真的能拿來當共同語言。
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
// name 是 #339 加的：原本這裡不含姓名（決定球 events 只需要 playerId），但 tactics 的
// SnapshotPlayer（見 seedLineupsAndTactics）是反正規化快照、必須把姓名一起凍進去，所以
// 這裡也要跟著帶上，不能再只挑 id/number/role 三個欄位。
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
  // setId 是「還沒有真正 id」的佔位值（呼叫端傳空字串），insertSetWithRallies 插入 set
  // 拿到 DB 配的 uuid 之後會整批覆蓋回去，見那支函式裡的 `{ ...s.rally, setId: set.id }`。
  // 型別跟著 sets.id 從 number 改成 string（#64 PR1）。
  setId: string,
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
  // 同 buildRallies 的 setId 註解：佔位值，稍後會被真正的 set.id 覆蓋。
  setId: string,
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
// 回傳這一局的 set.id（#339 加的）：seedSets 需要把它們往上交給 seedMatch，才能在
// 「插完所有局之後」另外幫已打完的局補一筆 lineups（起始先發，見 main() 裡的
// seedLineupsAndTactics）——那件事必須知道每一局真正的 uuid，不能只靠 setNumber 反查。
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
      },
    ];
  });
  if (events.length > 0) {
    await exec.insert(eventsTable).values(events);
  }
  return set.id;
}

// 幫一場比賽建立各局 + 各局的 rally + 各局每一分的 event。
//   completedScores：已經打完的各局比分 [ourScore, opponentScore][]（三戰兩勝，最多 3 局）。
//   inProgress：非 null 時代表「這場還沒打完」——會在打完的局之後，多插一局「進行中、比分停在
//     半路」的局（例如 18:15），當作分析頁的 currentSet。
//
// ── #218 之後：已打完的比賽不再需要「補一局空 set」──
// 這裡以前有一段補丁：已打完的比賽要在最後多插一筆 firstServer=null 的空 set。原因是重建
// 慣例「最後一局永遠是進行中的 currentSet」——不補的話，決勝局本身會被誤標成「進行中」。
// 那個補丁其實是在用假資料遷就一條算錯的規則（#218 的病灶）。
//
// 現在 matches.status 明確記錄「這場結束了沒」，重建規則會照它切分（見前端
// lib/volleyballRules.ts 的 splitCompletedAndCurrent），所以：
//   - 已打完（inProgress = null）：seedMatch 會把 status 設成 "finished"，這裡什麼都不用補，
//     真正打過的每一局都會落進 completedSets。
//   - 進行中：status 是 "in_progress"，最後那局半場的 set 自然當 currentSet，總覽顯示藍色。
// 換句話說，seed 資料現在跟使用者真的打完一場比賽產生的資料**形狀完全一致**，不再有一筆
// 只為了騙過重建規則而存在的幽靈空局。
// 回傳「已打完那幾局」的 set.id 陣列（依局數順序，#339 加的）。刻意不含 inProgress 那局
// ——lineups 只有意義用在「已經確定打完、先發已知」的局，進行中那局的 seed 資料沒有特別
// 意義要補先發，見呼叫端 seedLineupsAndTactics 只吃 completedSetIds。
async function seedSets(
  exec: DbOrTx,
  matchId: number,
  completedScores: [number, number][],
  ourRoster: RosterPlayerWithId[],
  rng: () => number,
  inProgress: [number, number] | null,
): Promise<string[]> {
  // 兩隊輪流先發：第 1 局 home 先發、第 2 局 away、依此類推。
  const firstServerOf = (setIndex: number): "home" | "away" =>
    setIndex % 2 === 0 ? "home" : "away";

  const completedSetIds: string[] = [];
  for (let i = 0; i < completedScores.length; i += 1) {
    const [home, away] = completedScores[i];
    // setId 先塞空字串（佔位），真正的 uuid 由 insertSetWithRallies 插入 set 後回填。
    const specs = buildRallies(rng, "", home, away, ourRoster);
    const setId = await insertSetWithRallies(exec, matchId, i + 1, firstServerOf(i), specs);
    completedSetIds.push(setId);
  }

  // 已打完的比賽在這裡什麼都不做（#218，見上方大段說明）；只有「進行中」的比賽要再多插
  // 一局半場的 set 當 currentSet。
  if (inProgress) {
    const nextSetNumber = completedScores.length + 1;
    const [home, away] = inProgress;
    const specs = buildPartialRallies(rng, "", home, away, ourRoster);
    await insertSetWithRallies(
      exec,
      matchId,
      nextSetNumber,
      firstServerOf(nextSetNumber - 1),
      specs,
    );
  }
  return completedSetIds;
}

// 6 個球場格子的座標（0~1 normalized）。直接複製自
// artifacts/volleyball-tactics/src/lib/rotationLogic.ts 的 zoneCoords，不是 import 過來
// ——lib/ 是被 artifacts/ 匯入的下層，反過來讓 lib/ import artifacts/ 的程式碼會把相依
// 方向倒過來（跟 seed-testdata.ts 裡 OTHER_USER_ID 那段「刻意抄一份常數、不共用」的理由
// 一樣）。如果前端那份 zoneCoords 改了球場座標系，這裡也要跟著手動改，否則 seed 出來的
// tactics 存檔在戰術板上會顯示錯位。
const ZONE_COORDS: Record<1 | 2 | 3 | 4 | 5 | 6, { x: number; y: number }> = {
  1: { x: 0.83, y: 0.85 }, // Right Back
  2: { x: 0.83, y: 0.6 }, // Right Front
  3: { x: 0.5, y: 0.6 }, // Middle Front
  4: { x: 0.17, y: 0.6 }, // Left Front
  5: { x: 0.17, y: 0.85 }, // Left Back
  6: { x: 0.5, y: 0.85 }, // Middle Back
};

// #339：補上 lineups（起始先發）與 tactics（已存戰術），這兩張表在這支腳本改版之前
// 只會被 TRUNCATE、從沒被灌過資料——灌完種子資料後，輪轉表／戰術板／先發站位這幾個畫面
// 因此一直是空的，違背 seed 腳本原本要做到「一場比賽完整可看」的目的（見 seed-testdata.ts
// 檔案開頭說明）。
//
// 只有「湊得出 6 位非自由球員」的比賽才補：lineups 的六個號位（zone1~zone6）依照
// lib/db/src/schema/lineups.ts 的文件化規則，本來就不允許塞自由球員（L）——真實排球
// 規則裡自由球員是「換人上場」而非先發站六個號位之一。這支腳本的名單設計（一隊基本班底
// 6 人裡有 1 位自由球員）扣掉自由球員只剩 5 位非自由球員，湊不滿六個號位；只有比賽1／
// 比賽3（多了跨隊的林小美，湊到 7 人、6 位非自由球員）恰好湊滿。與其硬塞自由球員進某個
// 號位（那會違反上面文件化的業務規則，等於自己再製造一種「幽靈站位」），寧可讓另外兩場
// 保持沒有 lineups——這是 seed 資料的已知限制，不是 bug（呼叫端 seedDemoData 只對 match1／
// match3 呼叫這支函式，理由也寫在那裡）。這裡「湊不滿六個號位就跳過」的情況不印
// console.log（#336：這支檔案不准有 console.log，見檔頭說明）——那句旁白只是給種子腳本
// 看熱鬧用，不影響資料本身，直接省略即可。
//
// 這支函式故意接收「共用的 rng」而不是自己另開一顆——沿用同一顆種子 PRNG，才能維持整份
// 示範資料「同一顆種子重灌出同一份資料」的可重現性（見檔案開頭 mulberry32 的說明）。呼叫
// 時機也刻意放在呼叫端所有 seedMatch 呼叫「都跑完之後」（附加，不插在中間）——插在中間會
// 讓後面幾場比賽讀到的 rng() 序列整個往後平移，等於改寫了它們的比分/決定球內容。
async function seedLineupsAndTactics(
  exec: DbOrTx,
  userId: string,
  match: { matchId: number; ourRoster: RosterPlayerWithId[]; completedSetIds: string[] },
  rng: () => number,
): Promise<void> {
  const eligible = match.ourRoster.filter((p) => p.role !== "L");
  if (eligible.length < 6) {
    return;
  }

  // Fisher-Yates 洗牌：每一局都重新排一次「這 6 個人站哪個號位」，讓不同局的先發看起來
  // 不是每次都一模一樣的排列（更接近真實情況——教練常常每局微調站位）。
  function shuffledSix(): RosterPlayerWithId[] {
    const pool = [...eligible];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 6);
  }

  // 記下第一局的先發，等一下拿來組 tactics 的球員站位（用同一份先發站位當作「已存戰術」
  // 的內容，比憑空生一組座標更貼近真實使用情境：教練最常存的戰術之一就是「開局站位」）。
  let firstSetLineup: RosterPlayerWithId[] | null = null;
  for (const setId of match.completedSetIds) {
    const six = shuffledSix();
    if (firstSetLineup === null) firstSetLineup = six;
    await exec.insert(lineupsTable).values({
      setId,
      zone1PlayerId: six[0].id,
      zone2PlayerId: six[1].id,
      zone3PlayerId: six[2].id,
      zone4PlayerId: six[3].id,
      zone5PlayerId: six[4].id,
      zone6PlayerId: six[5].id,
    });
  }

  // 已存戰術（tactics）：拿第一局的先發站位（六個號位對應到球場座標，見上面 ZONE_COORDS），
  // 存成一份 SavedTacticDataV2——前端
  // artifacts/volleyball-tactics/src/types/courtSnapshot.ts 定義的存檔格式，也是
  // artifacts/volleyball-tactics/src/hooks/useTacticsBoard.ts 的 loadProject／parseSavedTactic
  // 實際會讀的形狀。反正規化：姓名/背號/位置在這裡就凍結成純值，不是存 playerId 回頭查
  // roster（這是 #154 戰術板重構定案的格式，見 useTacticsBoard.ts 開頭「單向化」那段說明；
  // 這裡沒有直接 import 那些前端型別/zod schema 來驗證，是因為 lib/ 不能 import artifacts/
  // 的程式碼——跟上面 ZONE_COORDS 抄一份常數同一個理由，這裡改成手刻字面量，形狀對齊
  // courtSnapshot.ts 的 savedTacticDataV2Schema 即可）。
  if (firstSetLineup) {
    const players = firstSetLineup.map((p, idx) => {
      const zone = (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6;
      const coords = ZONE_COORDS[zone];
      return {
        sourcePlayerId: p.id,
        name: p.name,
        number: p.number,
        role: p.role,
        x: coords.x,
        y: coords.y,
        isLibero: false, // eligible 已經濾掉 L，這裡恆為 false
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
            // 漂移的東西。這裡挑最後一場比賽日期的隔天，語意上像「賽後整理戰術時存的檔」。
            capturedAt: "2026-07-11T10:00:00+08:00",
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
}

// seedDemoData 完成後回傳的摘要，讓呼叫端（例如 seed-testdata.ts 收尾印訊息，或未來
// #336 PR2 的 HTTP handler 回應）能取得剛剛灌了什麼，不用另外重新查一次 DB。
export type DemoDataSummary = {
  teams: Array<{ id: number; name: string }>;
  peopleCount: number;
  crossTeamPersonId: number; // 林小美：刻意設計「跨兩隊」的球員，靠這個 id 串起 A 隊/B 隊的名單
  matchIds: number[]; // 依插入順序：[台大, 政大, 師大, 交大]
};

// 對指定的 userId 灌一份完整的示範資料：2 支球隊、13 位人員（含 1 位跨隊球員）、
// 4 場比賽（含各局比分/rally/決定球 events，2 場補 lineups/tactics）。
//
// seed 是可覆寫的種子（預設 BASE_SEED）：讓呼叫端有需要時可以指定別的種子（例如以後想
// 讓每個使用者拿到「內容架構相同但細節不同」的示範資料），但兩個消費者目前都用預設值，
// 確保「同一顆種子重灌出同一份資料」。
export async function seedDemoData(
  exec: DbOrTx,
  userId: string,
  seed: number = BASE_SEED,
): Promise<DemoDataSummary> {
  // 整份示範資料共用同一顆種子 PRNG：只要下面呼叫 seedMatch/seedSets/buildRallies 的順序
  // 不變（這支函式本來就是照固定順序寫死呼叫三場比賽），rng() 被呼叫的次數與時機就完全
  // 固定，吐出來的數字序列也就固定——這就是整份示範資料「每次重灌都一樣」的關鍵。
  const rng = mulberry32(seed);

  // 兩支球隊。
  const [teamA, teamB] = await exec
    .insert(teamsTable)
    .values([
      { userId, name: "資管系 A 隊", isDemo: true },
      { userId, name: "資管系 B 隊", isDemo: true },
    ])
    .returning({ id: teamsTable.id, name: teamsTable.name });

  // 人。林小美是刻意設計的「跨兩隊」球員：等一下她同時出現在 A 隊跟 B 隊的名單裡，
  // 靠同一個 personId 串起來（這正是 people 表存在的意義，見 schema/people.ts）。
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
  const people = await exec
    .insert(peopleTable)
    .values(peopleNames.map((name) => ({ userId, name, isDemo: true })))
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
    // null＝這場已打完（會標成 status:"finished"）；給比分＝這場還沒打完，最後多一局
    // 進行中、比分停在這裡的局（見 seedSets 的 inProgress 說明）。
    inProgress: [number, number] | null = null,
  ) {
    const [match] = await exec
      .insert(matchesTable)
      .values({
        userId,
        name: null,
        opponent,
        date: new Date(dateIso),
        teamId,
        // #215：這批 mock 資料本來就是三戰兩勝的比賽——這正是 issue #215 被發現的方式
        // （寫死五戰三勝的舊邏輯，把這些 seed 出來的三戰兩勝比賽誤標成「進行中」）。明確帶
        // format，不靠 DB default 悄悄補上，讓 seed 資料的賽制在這裡看得到、之後改起來也
        // 有跡可循。
        format: "best_of_3",
        // #218：完賽狀態明確存進資料，不再靠「補一局空 set」讓重建規則猜對（見 seedSets
        // 上方的說明）。已打完的三場標 finished，唯一那場進行中的標 in_progress。
        status: inProgress ? "in_progress" : "finished",
        // #336：標記這場比賽是示範資料，讓 /demo-data 路由的刪除邏輯能精準只挑到示範資料
        // （見 lib/db/src/schema/matches.ts 的 isDemo 欄位註解）。
        isDemo: true,
      })
      .returning({ id: matchesTable.id });
    // 要 .returning id：event 需要指向這場比賽裡「哪一個球員」做了決定球，那個外鍵存的是
    // players.id（uuid，DB 插入時才真正決定，即使有 defaultRandom() 前端沒傳也一樣），
    // 沒有這份回傳資料就沒有 id 可以塞進後面的 events。
    const insertedPlayers = await exec
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
      .returning({
        id: playersTable.id,
        name: playersTable.name,
        number: playersTable.number,
        role: playersTable.role,
      });
    const ourRoster: RosterPlayerWithId[] = insertedPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number,
      role: p.role,
    }));
    const completedSetIds = await seedSets(
      exec,
      match.id,
      completedScores,
      ourRoster,
      rng,
      inProgress,
    );
    // #339：把這場比賽的 id、名單、已打完局的 set id 一起交回去，讓呼叫端收尾時能另外
    // 補 lineups／tactics（那兩張表刻意不放進 seedSets／seedMatch 內部一起做，見下面
    // seedLineupsAndTactics 開頭的說明：要等「所有場比賽」都建完、既有的 rng 呼叫序列
    // 都跑完之後才能動手，否則會把後面幾場比賽的隨機比分序列整個打亂）。
    return { matchId: match.id, ourRoster, completedSetIds };
  }

  // 全部改成三戰兩勝（先拿 2 局者勝，最多 3 局；決勝第 3 局打到 15）。前三場都已打完，
  // 第 4 場刻意留成「進行中」，讓分析頁能同時看到「已結束」與「未完成」兩種狀態。
  //
  // 比賽1：A 隊 vs 台大，含林小美（跨隊那人在 A 隊這邊）。2:1 勝（決勝局 15:11）。
  // 這場名單是 7 人（aRoster 6 人 + 跨隊的林小美），扣掉自由球員（L）剛好剩 6 個非自由
  // 球員角色——這是後面 seedLineupsAndTactics 唯一挑得出「六個號位都不是自由球員」
  // 的兩場之一（另一場是比賽3），見那支函式開頭的說明。
  const match1 = await seedMatch(
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
  // 純 aRoster 只有 6 人（含 1 位自由球員），扣掉自由球員只剩 5 個非自由球員——湊不滿
  // 六個號位，這場不補 lineups（見 seedLineupsAndTactics 開頭的說明）。
  const match2 = await seedMatch(teamA.id, "政大", "2026-06-15T19:00:00+08:00", aRoster, [
    [25, 19],
    [25, 17],
  ]);
  // 比賽3：B 隊 vs 師大，含林小美（同一人這次在 B 隊）。刻意設計成「糾結」局：第 2 局打進
  // deuce（24:26）、決勝局也咬到 13:15，最後 1:2 惜敗，讓分數成長圖看得到真正拉鋸的走勢。
  const match3 = await seedMatch(
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
  // 名單同比賽2（純 aRoster，只有 5 個非自由球員），一樣不補 lineups。
  const match4 = await seedMatch(
    teamA.id,
    "交大",
    "2026-07-20T19:00:00+08:00",
    aRoster,
    [[25, 22]],
    [18, 15],
  );

  // 起始先發（lineups）與已存戰術（tactics）——#339 補的兩張表。刻意放在所有
  // seedMatch 呼叫都結束「之後」才做（而不是塞進 seedMatch/seedSets 內部一起做）：
  // 這份示範資料的可重現性靠的是「rng() 被呼叫的順序完全固定」（見檔案開頭 mulberry32 那段
  // 說明）。如果把新的 rng() 呼叫插進比賽 1～4 中間，會讓比賽 2、3、4 讀到的隨機數序列
  // 整個往後平移，等於改寫了所有既有比賽的比分/決定球內容。附加在最後、只用
  // match1／match3 已經插入完成的資料，就不會動到前面已經定案的序列。
  await seedLineupsAndTactics(exec, userId, match1, rng);
  await seedLineupsAndTactics(exec, userId, match3, rng);

  return {
    teams: [teamA, teamB],
    peopleCount: people.length,
    crossTeamPersonId: personId("林小美"),
    matchIds: [match1.matchId, match2.matchId, match3.matchId, match4.matchId],
  };
}
