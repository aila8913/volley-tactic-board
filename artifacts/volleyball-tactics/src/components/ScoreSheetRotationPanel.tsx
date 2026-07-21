import type { MatchPlayer } from "@/types/match";
import type { PlayerPosition } from "@/types/rotationTable";
import CourtReadOnlyView from "./CourtReadOnlyView";

// 計分頁右欄最上面那一段（issue #120 第一階段）：「常駐唯讀站位視圖」。
//
// 跟 CourtReadOnlyView 一樣，這個元件也不訂閱任何 store——資料全部由呼叫端
// （pages/ScoreSheet.tsx）傳進來，這是 issue #117 的錨點決議。
//
// 為什麼這裡「只能看、不能改」：依 issue #120 的 PO 決定，計分頁唯一能改站位的入口是
// 按「下一局」時跳出的**換局換輪視窗**（照上次／上一輪／下一輪／重新排位），而且它改的
// 是計分表自己那份逐局先發快照，不是戰術板的全域輪轉表。那個視窗還沒做（本 issue 的
// 下一階段），所以現階段計分頁的站位就是純唯讀。無論如何，這個顯示元件本身都不該長出
// 編輯能力——不然 #115 才切開的耦合會從這裡漏回去。
interface ScoreSheetRotationPanelProps {
  // 我方這一輪 6 人的座標，由呼叫端從計分表自己的先發快照換算好傳進來
  // （跟 ScoreSheetCourt 用的是同一份 ourPositions，見 pages/ScoreSheet.tsx）。
  positions: PlayerPosition[];
  roster: MatchPlayer[];
  // 目前第幾輪，0-indexed（跟 currentSet.ourRotation 同一個值）。顯示時 +1 轉成
  // 1-indexed，跟 RotationSwitcher.tsx「第 {currentRotation + 1} 輪」的慣例一致，
  // 避免同一個 app 裡有的地方講「第 0 輪」有的講「第 1 輪」造成混淆。
  rotation: number;
}

export default function ScoreSheetRotationPanel({
  positions,
  roster,
  rotation,
}: ScoreSheetRotationPanelProps) {
  return (
    // shrink-0：這個 section 是右欄 flex-column 裡的固定高度區塊。不加的話，下面 flex-1
    // 的統計區搶空間時 flex 會把它壓扁，而球場是用 aspect-ratio 撐高度的，被壓扁就會變形
    // 或被 overflow-hidden 裁掉。
    //
    // opacity-90：這是「對照用的參考物、不是可以動手的編輯器」的視覺提示（issue #160
    // 對戰術頁右欄輪轉表訂的規格延伸過來）。不加任何 hover 效果、裡面也沒有任何按鈕/
    // 可點擊元素——讓使用者一眼就分辨這裡「看得到、動不了」，想換站位要去戰術板。
    <section
      className="shrink-0 border-b border-white/[0.10] px-3 py-3 opacity-90"
      data-testid="score-sheet-rotation-panel"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#F5F5F0]">場上站位</h2>
        <span className="text-xs text-[#9AA08C]">第 {rotation + 1} 輪</span>
      </div>
      <CourtReadOnlyView positions={positions} roster={roster} />
    </section>
  );
}
