import type { MatchPlayer } from "@/types/match";
import type { PlayerPosition } from "@/types/rotationTable";
import CourtReadOnlyView from "./CourtReadOnlyView";

// 計分頁右欄最上面那一段（issue #120 第一階段）：「常駐唯讀站位視圖」。
//
// 跟 CourtReadOnlyView 一樣，這個元件也不訂閱任何 store——資料全部由呼叫端
// （pages/ScoreSheet.tsx）傳進來，這是 issue #117 的錨點決議。
//
// 為什麼這裡「只能看、不能改」：改站位是另一個元件（ScoreSheetLineupEditor）的事，它會在
// 右欄的**同一個位置**整塊替換掉這個唯讀面板——唯讀↔編輯是換人，不是在唯讀面板上長出
// 編輯能力（跟 docs/layout-spec.md §1「模式 C」對右欄的處理方式是同一種思路）。這個元件
// 唯一往編輯靠的地方是 onEdit：一顆「改」按鈕，按了只是通知呼叫端切換過去而已。
//
// 開賽之後（currentSet.serving 不是 null）呼叫端就不會再傳 onEdit 進來，按鈕自然消失：
// 先發是「局中凍結」的（見 hooks/useScoreSheet.ts 的 start()），打到一半改先發會讓已經
// 記進去的球對不上站位，要動陣容得走換人。
interface ScoreSheetRotationPanelProps {
  // 我方這一輪 6 人的座標，由呼叫端從計分表自己的先發快照換算好傳進來
  // （跟 ScoreSheetCourt 用的是同一份 ourPositions，見 pages/ScoreSheet.tsx）。
  positions: PlayerPosition[];
  roster: MatchPlayer[];
  // 目前第幾輪，0-indexed（跟 currentSet.ourRotation 同一個值）。顯示時 +1 轉成
  // 1-indexed，跟 RotationSwitcher.tsx「第 {currentRotation + 1} 輪」的慣例一致，
  // 避免同一個 app 裡有的地方講「第 0 輪」有的講「第 1 輪」造成混淆。
  rotation: number;
  // 有傳才顯示「改」按鈕（見上方說明：只有還沒開賽時呼叫端才會傳）。
  onEdit?: () => void;
}

export default function ScoreSheetRotationPanel({
  positions,
  roster,
  rotation,
  onEdit,
}: ScoreSheetRotationPanelProps) {
  return (
    // shrink-0：這個 section 是右欄 flex-column 裡的固定高度區塊。不加的話，下面 flex-1
    // 的統計區搶空間時 flex 會把它壓扁，而球場是用 aspect-ratio 撐高度的，被壓扁就會變形
    // 或被 overflow-hidden 裁掉。
    //
    // opacity-90：這是「對照用的參考物、不是可以動手的編輯器」的視覺提示（issue #160
    // 對戰術頁右欄輪轉表訂的規格延伸過來）。球場本身不加任何 hover 效果、沒有可點擊
    // 元素——讓使用者一眼分辨這裡「看得到、動不了」，要改就按標題列那顆「改」。
    <section
      className="shrink-0 border-b border-white/[0.10] px-3 py-3 opacity-90"
      data-testid="score-sheet-rotation-panel"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#F5F5F0]">場上站位</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#9AA08C]">第 {rotation + 1} 輪</span>
          {onEdit && (
            <button
              onClick={onEdit}
              className="rounded border border-white/[0.16] px-1.5 py-0.5 text-[10px] font-bold text-[#9AA08C] transition hover:border-[#C6F135] hover:text-[#C6F135]"
            >
              改
            </button>
          )}
        </div>
      </div>
      <CourtReadOnlyView positions={positions} roster={roster} />
    </section>
  );
}
