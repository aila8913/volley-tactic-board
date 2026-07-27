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
  let ourWins = 0;
  let opponentWins = 0;

  for (const set of sets) {
    if (set.ourScore > set.opponentScore) {
      ourWins++;
    } else if (set.opponentScore > set.ourScore) {
      opponentWins++;
    }
    // 兩邊比分相同（理論上不會發生——一局排球一定要分出勝負，不會平手封存）就不算給任何一方，
    // 保守處理，不讓不合理的資料誤判出勝隊。
  }

  if (ourWins >= winsNeeded) return "us";
  if (opponentWins >= winsNeeded) return "opponent";
  return null;
}
