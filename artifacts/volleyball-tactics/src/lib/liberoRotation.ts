import type { PlayerPosition } from "../types/rotationTable";
import { isBackRowPosition } from "./rotationLogic";

// ── 自由球員自動回位規則（issue #303 抽出，#326 改掉規則本身）──
//
// 排球規則背景：自由球員（L）只能待在後排（1/5/6 號位）。實戰上 L 會「頂替」某個後排球員
// 上場，那個被頂替的人退到場邊；等到輪轉把「被頂替者的號位」轉到前排時，L 就必須下場、
// 原本那個人回到場上——因為 L 不能跟著輪到前排。這件事在每一輪轉發生時都要重算一次。
//
// ⚠️ 行為變更（issue #326，PO 2026-08-07 定案）：**L 轉出去就下場、留在場外，系統不自動
// 幫他找下一個頂替對象**，直到使用者手動再把他換上場。
//
// 這裡原本有第三條分支（「接替」啟發式）：被頂替者輪到前排時，如果「上一輪的頂替目標」
// 現在剛好在後排，就自動改成頂替他，理由是「L 通常在後排三格之間連續替補，可以省下教練
// 每一輪手動點一次」。它被刪掉的原因不是猜得不準，而是**猜這件事本身就不該做**：L 上場的
// 時機本來就不固定，替教練猜一個頂替對象，會在紀錄裡產生一次**根本沒發生過的替換**——而
// 這個 app 產出的是紀錄（之後要拿去算數據），不是示意圖。猜錯的成本不是「畫面不好看」，
// 是資料錯。
//
// 諷刺的是，被刪的那條分支正好違反它自己隔壁那行寫的判準（舊分支 3 的註解就是這麼寫的）。
//
// 為什麼抽成純函式（原本整段住在 pages/ScoreSheet.tsx 的一個 useEffect 裡）：
// 它的本質是「吃一份狀態、吐一份新狀態」，完全不需要 React，只是剛好住在 React 裡。留在
// useEffect 裡的代價是：要驗證它就得先能 render 元件、模擬輪轉變化，而這個專案還沒有
// @testing-library/react（issue #168），元件測試只做得到「一次性初始渲染的 HTML 比對」，
// 碰不到 effect。rotationLogic.ts 的 assignPlayerToZone 早就為了同一個理由抽過一次。

// 給定「這一輪場上六人的座標」，算出**被 L 頂替下場的那個人**該變成誰。
//
// 參數與回傳值都是「被頂替者的 id」（不是 L 自己的 id）——因為要判斷的是「那個人的號位
// 輪到前排沒」。null 代表沒有人被頂替，也就是 L 不在場上。
//
// 刪掉接替啟發式之後只剩兩條分支：
//   1. 被頂替者還在後排（或根本不在這一輪的六人裡，例如名單被改過）→ 原樣回傳，L 繼續待著。
//   2. 被頂替者輪到前排了 → 回傳 null：L 下場、留在場外，等教練自己再派他上去。
//
// 回傳值從物件變成 string | null 也順手解掉一個舊包袱：以前「沒有變化」必須刻意回傳**原本
// 那個物件參照**，否則呼叫端在 useEffect 裡寫回 state 會多觸發一輪 render（這個 repo 踩過
// PR #69→#70 的無限 render loop）。現在回傳的是字串，`next === current` 天生就是值比較，
// 不需要靠紀律維持參照穩定。
//
// 前後排用 isBackRowPosition（rotationLogic.ts）判、不用 courtGeometry 的 rowOf：
// 兩者對這裡的輸入會給出完全一樣的答案（positions 由 lineupToPositions 產生，座標必定是
// 六個號位的精確值），但語意層次不同——rowOf 是「這個圓圈該不該上前排配色」的純視覺判斷，
// isBackRowPosition 是「自由球員能不能站這裡」的領域規則（從 BACK_ROW_ZONES 導出）。
// courtGeometry.ts 的註解特別警告過不要把兩者混為一談，而這支函式整個就是領域規則。
export function resolveLiberoOnRotation(
  replacedPlayerId: string | null,
  positions: PlayerPosition[],
): string | null {
  if (!replacedPlayerId) return null;

  const targetPos = positions.find((p) => p.playerId === replacedPlayerId);
  // 找不到座標＝這個人不在這一輪的六人裡（例如名單被改過），當作沒事發生、不動狀態。
  if (!targetPos || isBackRowPosition(targetPos.x, targetPos.y)) return replacedPlayerId;

  // 被頂替者已經輪到前排 → L 一定得下場，而且就留在場外。
  return null;
}
