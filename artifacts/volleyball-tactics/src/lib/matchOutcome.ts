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

// 排球賽制目前一律當「五戰三勝」處理：只要有一方先拿到 3 局就已經決出勝負，不用等到
// 五局全部打完（三戰兩勝制可能 2:0 就結束，用「已經打了幾局」來猜是猜不準的，見下方
// getMatchWinner 的判定邏輯，是直接數「贏了幾局」而不是數「打了幾局」）。
//
// 這是目前寫死的假設，先出於 YAGNI 沒有做成可調參數——這個專案目前的 match 資料
// （lib/db/src/schema/matches.ts）還沒有「這場比賽用什麼賽制」的欄位。等 match 之後真的
// 加了 format（例如三戰兩勝）欄位，這個常數要改成從那個欄位讀，不能再繼續寫死在這裡。
const WINS_NEEDED_TO_CLINCH = 3;

// 回傳目前的勝隊：
//   "us"       — 我方已經拿到足以獲勝的局數。
//   "opponent" — 對手已經拿到足以獲勝的局數。
//   null       — 兩邊都還沒拿到足以獲勝的局數（比賽還在進行中，或還沒開打）。
//
// 只看「贏了幾局」，不看「打了幾局」——這是刻意的：如果改成看 sets.length 是否達到某個
// 局數門檻，遇到之後可能支援的三戰兩勝制（2 局就能結束）就會誤判成「還沒打完」。純粹數
// 贏局數，才能同時涵蓋各種賽制上限，不用替每種賽制各寫一套局數判斷。
export function getMatchWinner(sets: SetScoreLike[]): "us" | "opponent" | null {
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

  if (ourWins >= WINS_NEEDED_TO_CLINCH) return "us";
  if (opponentWins >= WINS_NEEDED_TO_CLINCH) return "opponent";
  return null;
}
