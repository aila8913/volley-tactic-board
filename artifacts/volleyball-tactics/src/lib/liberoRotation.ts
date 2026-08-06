import type { PlayerPosition } from "../types/rotationTable";
import { isBackRowPosition } from "./rotationLogic";

// ── 自由球員自動回位規則（issue #303）──
//
// 排球規則背景：自由球員（L）只能待在後排（1/5/6 號位）。實戰上 L 會「頂替」某個後排球員
// 上場，那個被頂替的人退到場邊；等到輪轉把「被頂替者的號位」轉到前排時，L 就必須下場、
// 原本那個人回到場上——因為 L 不能跟著輪到前排。這件事在每一輪轉發生時都要重算一次。
//
// 為什麼抽成純函式（原本整段住在 pages/ScoreSheet.tsx 的一個 useEffect 裡）：
// 它的本質是「吃一份狀態、吐一份新狀態」，輸入是「現在誰被頂替中 ＋ 上一輪的頂替目標 ＋
// 這一輪六人的站位」，輸出是「頂替狀態該變成什麼」——完全不需要 React，只是剛好住在
// React 裡。留在 useEffect 裡的代價是：要驗證它就得先能 render 元件、模擬輪轉變化，而這個
// 專案還沒有 @testing-library/react（issue #168），元件測試只做得到「一次性初始渲染的
// HTML 比對」，碰不到 effect。結果就是最容易寫錯的分支（下面那套「誰接替誰」的記憶啟發式）
// 反而是零覆蓋的。rotationLogic.ts 的 assignPlayerToZone 早就為了同一個理由抽過一次，
// 這裡只是把同一招用到這塊。

export interface LiberoState {
  // 目前「被 L 頂替下場」的那個球員 id；null 代表現在沒有人被頂替（L 不在場上）。
  // 注意這裡存的是**被頂替者**而不是 L 自己——因為要判斷的是「那個人的號位輪到前排沒」。
  current: string | null;
  // 上一輪的 current。用來實作下面那套「接替」啟發式，見 resolveLiberoOnRotation 的說明。
  previousTarget: string | null;
}

// 給定「這一輪場上六人的座標」，算出頂替狀態該變成什麼。
//
// 三條分支（也就是測試要釘死的三種情況）：
//   1. 被頂替者還在後排 → 什麼都不用做，L 可以繼續待著。
//   2. 被頂替者輪到前排了，而**上一輪的頂替目標**現在人在後排 → 換成頂替他。
//      這條是「接替」啟發式：L 通常在後排三個號位之間連續替補，前一個目標剛從前排轉回
//      後排，接著頂替他是最符合實際打法的猜測，可以省下教練每一輪手動點一次。
//   3. 其他情況（沒有前一個目標／前一個目標也在前排）→ 清空，讓 L 下場等教練自己決定。
//      不自動亂猜一個人：猜錯會讓紀錄裡出現一次不存在的替換，而這是**紀錄**不是顯示。
//
// 沒有變化時**回傳原本那個物件參照**（不是內容相等的新物件）。呼叫端在 useEffect 裡拿它
// 去寫 state/store，回傳新物件會多觸發一輪 render；這個 repo 踩過同一個坑（PR #69→#70，
// store action 在 effect 裡回傳新參照導致無限 render loop），所以這裡一律讓「沒事發生」
// 的路徑保持參照不變。
//
// 前後排用 isBackRowPosition（rotationLogic.ts）判、不用 courtGeometry 的 rowOf：
// 兩者對這裡的輸入會給出完全一樣的答案（positions 由 lineupToPositions 產生，座標必定是
// 六個號位的精確值），但語意層次不同——rowOf 是「這個圓圈該不該上前排配色」的純視覺判斷，
// isBackRowPosition 是「自由球員能不能站這裡」的領域規則（從 BACK_ROW_ZONES 導出）。
// courtGeometry.ts 的註解特別警告過不要把兩者混為一談，而這支函式整個就是領域規則。
export function resolveLiberoOnRotation(
  state: LiberoState,
  positions: PlayerPosition[],
): LiberoState {
  if (!state.current) return state;

  const targetPos = positions.find((p) => p.playerId === state.current);
  // 找不到座標＝這個人不在這一輪的六人裡（例如名單被改過），當作沒事發生、不動狀態。
  if (!targetPos || isBackRowPosition(targetPos.x, targetPos.y)) return state;

  // 到這裡代表被頂替者已經輪到前排，L 一定得下場，剩下的只是「換頂替誰」還是「誰都不頂替」。
  const prev = state.previousTarget;
  if (prev && prev !== state.current) {
    const prevPos = positions.find((p) => p.playerId === prev);
    if (prevPos && isBackRowPosition(prevPos.x, prevPos.y)) {
      return { current: prev, previousTarget: state.current };
    }
  }

  return { current: null, previousTarget: state.current };
}
