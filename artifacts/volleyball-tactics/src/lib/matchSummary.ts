// 列表卡片右端那行「次要資訊」的文字產生器（issue #175 環 4）。
//
// 為什麼獨立成 lib 純函式而不是寫在卡片元件裡：這是「排球賽制怎麼講一場比賽的結果」的規則，
// 跟 matchOutcome.ts 是同一類東西（見那支檔案開頭的說明），純規則脫離 UI 才測得動，也才不會
// 之後資料夾統計、數據頁要用同一句話時各自複製一份、慢慢飄成三種寫法。
import { countSetWins, type MatchStatus, type SetScoreLike } from "./matchOutcome";

// 回傳例如「3:0 勝」「1:2 進行中」「尚未開賽」。
//
// 三種狀態刻意都給一句話、不回 null：列表卡片的版面固定有這一格，回 null 會讓呼叫端每個地方
// 都要自己想「那該顯示什麼」，最後就是各頁不一致。「還沒打」本身也是使用者想知道的資訊。
//
// issue #238：這支函式原本自己吃 winsNeeded、自己用 completedSets.length === 0 判斷「尚未
// 開賽」——這是全站第三份跟「這場比賽是什麼狀態」有關的判準（另外兩份是 tournamentSummary
// 的 deriveMatchStatus、MatchList.tsx 手寫的 matchNeedsLineup），三份各寫各的，同一場正在
// 打第一局的比賽（completedSets.length === 0 但已經開球了）在不同畫面顯示矛盾。現在改成
// 直接吃呼叫端已經用 matchOutcome.deriveMatchStatus 算好的 status——這支函式只剩「把
// status 跟局比數組成一句給人看的話」這件事，不再自己判斷「這場比賽算不算開賽」。
//
// status 分支的呈現：not_started 跟 lineup_only 都渲染成「尚未開賽」，這裡文字故意不分兩種
// 狀態（列表頁另外用獨立黃標標「尚未排先發」，見 MatchList.tsx 的 matchNeedsLineup）；
// in_progress 用局比數 +「進行中」；won/lost 維持原本的「局比數 + 勝/敗」呈現方式。
export function formatMatchResult(completedSets: SetScoreLike[], status: MatchStatus): string {
  if (status === "not_started" || status === "lineup_only") return "尚未開賽";

  // 數的是「贏了幾局」而不是「打了幾局」：局比數才是排球講結果的單位（3:0 指的是局數，
  // 不是分數）。這段原本是手寫的 for 迴圈，#226 PR2 收進 matchOutcome.countSetWins——
  // 規則的家在那支檔案，這裡只負責把數字組成一句給人看的話。
  const { ourWins, opponentWins } = countSetWins(completedSets);
  const score = `${ourWins}:${opponentWins}`;

  if (status === "in_progress") return `${score} 進行中`;
  return status === "won" ? `${score} 勝` : `${score} 敗`;
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
