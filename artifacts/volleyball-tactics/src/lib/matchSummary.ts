// 列表卡片右端那行「次要資訊」的文字產生器（issue #175 環 4）。
//
// 為什麼獨立成 lib 純函式而不是寫在卡片元件裡：這是「排球賽制怎麼講一場比賽的結果」的規則，
// 跟 matchOutcome.ts 是同一類東西（見那支檔案開頭的說明），純規則脫離 UI 才測得動，也才不會
// 之後資料夾統計、數據頁要用同一句話時各自複製一份、慢慢飄成三種寫法。
import { getMatchWinner, type SetScoreLike } from "./matchOutcome";

// 回傳例如「3:0 勝」「1:2 進行中」「尚未開賽」。
//
// 三種狀態刻意都給一句話、不回 null：列表卡片的版面固定有這一格，回 null 會讓呼叫端每個地方
// 都要自己想「那該顯示什麼」，最後就是各頁不一致。「還沒打」本身也是使用者想知道的資訊。
export function formatMatchResult(completedSets: SetScoreLike[]): string {
  if (completedSets.length === 0) return "尚未開賽";

  // 數的是「贏了幾局」而不是「打了幾局」，跟 getMatchWinner 同一套理由：局比數才是排球
  // 講結果的單位（3:0 指的是局數，不是分數）。
  let ourWins = 0;
  let opponentWins = 0;
  for (const set of completedSets) {
    if (set.ourScore > set.opponentScore) ourWins++;
    else if (set.opponentScore > set.ourScore) opponentWins++;
  }

  const score = `${ourWins}:${opponentWins}`;
  const winner = getMatchWinner(completedSets);
  // winner 為 null＝還沒有人拿到足以獲勝的局數。這時候不能寫「勝/敗」（比賽還沒定案），
  // 但局比數本身是有意義的，照樣顯示，後面補「進行中」講清楚它還沒結束。
  if (winner === null) return `${score} 進行中`;
  return winner === "us" ? `${score} 勝` : `${score} 敗`;
}

// datetime-local 字串（無時區，見 types/match.ts）轉成列表要的「07/14（二）19:00」格式。
// 從原本的 MatchCard.tsx 搬過來——#175 把那張卡片換成 ListItemCard 之後，這個格式化跟卡片
// 的排版沒有關係了，兩個頁面都要用，放在 lib 才不會為了共用一個函式去 import 一個元件。
export function formatMatchDateTime(dateTime: string): string {
  const d = new Date(dateTime);
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${weekday}）${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
