// 判定「整場比賽的勝隊」（issue #174）：比賽列表右欄要在賽事還在進行中、或已經打完時，
// 都能顯示「目前/最終誰贏」，這個計算獨立成純函式，讓它可以脫離 UI、脫離 store 被單獨測試。
//
// 這裡刻意只吃「每一局的比分」這種最原始的形狀（ourScore/opponentScore），不吃
// CompletedSet 或任何計分表的型別——這個函式的職責只是「排球賽制的勝負規則」，跟計分表
// 內部怎麼存資料無關，型別上刻意脫鉤，才不會讓這個 lib 檔反過來依賴 types/scoresheet.ts
// （純規則不該認識資料存放的形狀，避免之後計分表的型別一改，這裡也要跟著改）。
export interface SetScoreLike {
  ourScore: number;
  opponentScore: number;
}

// 賽制：三戰兩勝（先拿 2 局獲勝）／五戰三勝（先拿 3 局獲勝）。跟 lib/db/src/schema/matches.ts
// 的 matchFormatEnum 保持一致的字面值，讓後端 DB 值可以直接當這個型別用，不用另外轉換。
export type MatchFormat = "best_of_3" | "best_of_5";

// 賽制 → 「拿到幾局才算贏」的翻譯。獨立成這一支小函式（而不是讓 getMatchWinner 直接吃
// MatchFormat），是延續這支檔案本來的設計哲學：getMatchWinner 只認識「贏局數的門檻」這個
// 最原始的數字，不需要認識「賽制」這個 domain 概念，呼叫端（例如 matchSummary.ts）才是
// 該知道「這場比賽是什麼賽制」的地方，這裡只負責把賽制翻成門檻數字。
export function winsNeededFor(format: MatchFormat): number {
  return format === "best_of_3" ? 2 : 3;
}

// 「這一局誰贏」——把 `set.ourScore > set.opponentScore` 這個裸比較收成一個有名字的函式
// （issue #226 PR2）。它本來散在三個 UI 檔裡各寫一次（MatchInfoRail 的各局比分藥丸、
// ScoreSheetStats 的比分總覽、MatchAnalytics 的單場數據頁），每一處都自己判斷
// 「分數大的那邊贏」。
//
// 抽出來的價值不在「省了幾個字」，而在**平手這個 edge case 只需要決定一次**：下面回 null
// 而不是 false，逼呼叫端明確寫 `setWinner(s) === "us"`，而不是靠一個 boolean 把「對手贏」
// 和「平手」悄悄併成同一格。原本 UI 那幾處寫的 `weWon = ourScore > opponentScore`，
// 平手時會落進「敗」的顏色——行為上跟現在等價（改寫後仍是 `=== "us"`），但至少現在
// 「平手算誰的」是一個看得見的決定，不是一個沒人注意到的比較運算子。
//
// 型別上吃 SetScoreLike 而不是 CompletedSet，理由同這支檔案開頭：純規則不認識儲存形狀。
export function setWinner(set: SetScoreLike): "us" | "opponent" | null {
  if (set.ourScore > set.opponentScore) return "us";
  if (set.opponentScore > set.ourScore) return "opponent";
  return null;
}

// 「局比數」——排球講一場比賽的結果用的單位（「3:0」指的是局數不是分數）。
//
// 這段 for 迴圈在 #226 PR2 之前有六份逐字相同的複製：getMatchWinner（下面）、
// matchSummary.formatMatchResult、tournamentSummary.computeTournamentStats 三支手寫迴圈，
// 加上 ScoreSheet / ScoreSheetStats / MatchAnalytics 三個頁面各寫成一對 `.filter().length`。
// 六份都對，但那正是重複最危險的形態——沒有任何一處是壞的，所以沒有測試會失敗，
// 而下一次規則要改（例如未來要處理棄賽局、或平手局的認定）時，改對五份、漏掉第六份
// 也一樣不會有人發現。
//
// 回傳一個物件而不是單一數字：呼叫端幾乎都同時要兩邊的數字（要嘛顯示 "3:0"，要嘛比大小），
// 分成兩支函式就會被連呼叫兩次、把同一個陣列走兩遍。
export function countSetWins(sets: SetScoreLike[]): { ourWins: number; opponentWins: number } {
  let ourWins = 0;
  let opponentWins = 0;

  for (const set of sets) {
    const winner = setWinner(set);
    if (winner === "us") ourWins++;
    else if (winner === "opponent") opponentWins++;
    // winner 為 null（兩邊比分相同，理論上不會發生——一局排球一定要分出勝負，不會平手封存）
    // 就不算給任何一方，保守處理，不讓不合理的資料誤判出勝隊。
  }

  return { ourWins, opponentWins };
}

// 回傳目前的勝隊：
//   "us"       — 我方已經拿到足以獲勝的局數。
//   "opponent" — 對手已經拿到足以獲勝的局數。
//   null       — 兩邊都還沒拿到足以獲勝的局數（比賽還在進行中，或還沒開打）。
//
// 只看「贏了幾局」，不看「打了幾局」——這是刻意的：如果改成看 sets.length 是否達到某個
// 局數門檻，遇到三戰兩勝制（2 局就能結束）就會誤判成「還沒打完」。純粹數贏局數，才能同時
// 涵蓋各種賽制上限，不用替每種賽制各寫一套局數判斷。
//
// winsNeeded 是必填參數、沒有預設值：#215 之前這裡曾經寫死「一律當五戰三勝」
// （WINS_NEEDED_TO_CLINCH = 3），結果三戰兩勝的比賽在比賽列表被誤標成「進行中」。改成必填
// 而不是給一個看似合理的預設值（例如繼續預設 3），是刻意不留一條「呼叫端忘了想這場比賽是
// 什麼賽制、也不會被 TypeScript 攔下來、但算出來的結果就是錯的」的路——現在每個呼叫端都要
// 自己算出這個數字（用下面的 winsNeededFor(match.format)）才能編譯過，等於強迫每個呼叫點
// 都想過一次「這場比賽是什麼賽制」。
export function getMatchWinner(sets: SetScoreLike[], winsNeeded: number): "us" | "opponent" | null {
  const { ourWins, opponentWins } = countSetWins(sets);

  if (ourWins >= winsNeeded) return "us";
  if (opponentWins >= winsNeeded) return "opponent";
  return null;
}

// 「這場比賽現在是什麼狀態」——issue #238 之前這條規則有兩套互相矛盾的判準：
// matchSummary.formatMatchResult 用 completedSets.length === 0 判斷「尚未開賽」（已打完幾局），
// tournamentSummary.deriveMatchStatus 用 setsPlayed > 0（已開球幾局，來自後端
// count(*) filter (where first_server is not null)）判斷「進行中」。同一場正在打第一局的比賽，
// completedSets.length 還是 0（第一局都還沒打完），但 setsPlayed 已經是 1（已經開球了），
// 兩套判準在這個情境下算出不同答案——列表頁說「尚未開賽」、資料夾統計格說「進行中」，同一場
// 比賽在兩個畫面顯示矛盾。這支函式（原本叫 TournamentMatchStatus/deriveMatchStatus，只給
// 資料夾統計格用）現在搬來這裡、拿掉 Tournament 前綴，成為全站唯一一份「比賽狀態」判準，
// 比賽列表（MatchList.tsx）、資料夾內頁（TournamentDetail.tsx）、資料夾統計格
//（MatchInfoRail.tsx）都改呼叫同一份，不再各自寫一套。
//
// 為什麼放在 matchOutcome.ts 而不是留在 tournamentSummary.ts：這支檔案本來就是這個 repo
// 「排球規則」類純函式唯一的家（SetScoreLike/MatchFormat/winsNeededFor/setWinner/
// countSetWins/getMatchWinner 都在這裡），「這場比賽算贏／算輸／算進行中」跟這些函式是同一種
// 東西，理應跟它們放在一起，而不是掛在原本專門處理「資料夾彙總」的 tournamentSummary.ts——
// 那支檔案的職責應該只剩「一個資料夾底下這幾場比賽合起來戰績多少」，不該順便也是狀態判準
// 的家。
//
// lineup_only 的呈現差異是刻意的：列表頁（MatchList.tsx）用獨立黃標催辦（statusHint=
// "尚未排先發"），資料夾頁（MatchInfoRail.tsx 的 STATUS_META）合進主標籤陳述（顯示「已排
// 先發」）——這是刻意的呈現差異，不代表狀態本身有兩個答案，兩邊都是同一個 deriveMatchStatus
// 結果，只是渲染意圖不同（列表頁想催辦、資料夾頁想陳述現況）。
export type MatchStatus = "not_started" | "lineup_only" | "in_progress" | "won" | "lost";

// 依優先序判斷這場比賽該顯示成哪一種狀態。優先序很重要，不能拆成五個獨立的 if 各自回傳：
// 例如 winner 已經是 "us" 的比賽，setsPlayed 一定 > 0（贏球必然發生在打過球之後），但這裡
// 刻意先判 winner，是因為「贏/輸」是終局狀態、比「有沒有開打」更值得優先呈現給使用者，
// 而不是恰好也能用 setsPlayed 分支涵蓋就偷懶不分先後。
export function deriveMatchStatus(
  winner: "us" | "opponent" | null,
  setsPlayed: number,
  hasLineup: boolean,
): MatchStatus {
  if (winner === "us") return "won";
  if (winner === "opponent") return "lost";
  if (setsPlayed > 0) return "in_progress";
  if (hasLineup) return "lineup_only";
  return "not_started";
}
