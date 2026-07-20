import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { captureFromRotation, captureBlank } from "../lib/courtSnapshot";
import { SECONDARY_BTN_CLASS } from "../lib/tacticsBoardStyles";

// 「新增戰術」彈窗——issue #160 C2。browse 模式按「新增戰術」開這個彈窗，選一個起點：
//   1. 擷取現在輪轉位：複製輪轉表「現在」排的站位當起點（沿用舊版 handleEnterLayout 那條邏輯）。
//   2. 空站位：完全空白的球場，球員全部從右側名單面板自己拖上去。
//
// 兩個選項最後都是「在元件層組出一張純值 CourtSnapshot，再傳給 startSession」——
// 這正是 #154 單向化重構的邊界：store（useTacticsBoard）永遠不 import useRotationTable，
// 「查輪轉表現在站位」這件事只能發生在 UI 層，查完就把結果「以值」交出去，之後 store
// 改怎麼編輯這張快照都碰不到輪轉表。這個彈窗元件就是那個 UI 邊界之一（另一個是 Court.tsx
// 的拖放 handler）。
interface NewTacticDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
}

export default function NewTacticDialog({ open, onOpenChange, matchId }: NewTacticDialogProps) {
  const startSession = useTacticsBoard((s) => s.startSession);
  // 用來即時顯示「將複製第 N 輪」——訂閱 store（而不是像 handleCaptureRotation 內部那樣
  // 用 getState() 一次性讀值），這樣輪轉表如果在彈窗開著的時候變動（理論上不會，但保險），
  // 畫面上的文字也會跟著更新，不會顯示一個過期的輪次數字。
  const currentRotation = useRotationTable((s) => s.dataByMatch[matchId]?.currentRotation ?? 0);

  const handleCaptureRotation = () => {
    // 讀「現在」站位這件事只能發生一次、發生在使用者按下按鈕的當下——用 getState() 而不是
    // hook 訂閱值，是因為這裡要的是「按下去那一刻」的快照，不需要、也不應該讓這段程式碼
    // 隨輪轉表變動重新執行（那樣就不是「擷取」了，是「即時綁定」，違背快照的定義）。
    const rt = useRotationTable.getState().dataByMatch[matchId];
    const r = rt?.currentRotation ?? 0;
    const positions = rt?.rotations[r]?.positions ?? [];
    const roster = rt?.roster ?? [];
    const snapshot = captureFromRotation(positions, roster, { matchId, rotation: r });
    startSession(snapshot);
    onOpenChange(false);
  };

  const handleBlank = () => {
    startSession(captureBlank({ matchId }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.18] bg-[#12140f] text-[#f5f5f0]">
        <DialogHeader>
          <DialogTitle className="text-[#f5f5f0]">新增戰術</DialogTitle>
          <DialogDescription className="text-[#a9b096]">
            選一個起點開始布置，之後隨時可以在白板上調整站位。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={handleCaptureRotation}
            className={`rounded-lg p-3 text-left text-xs font-bold ${SECONDARY_BTN_CLASS}`}
            data-testid="button-new-tactic-from-rotation"
          >
            擷取現在輪轉位
            <div className="mt-1 text-[10px] font-normal text-[#a9b096]">
              將複製第 {currentRotation + 1} 輪
            </div>
          </button>
          <button
            onClick={handleBlank}
            className={`rounded-lg p-3 text-left text-xs font-bold ${SECONDARY_BTN_CLASS}`}
            data-testid="button-new-tactic-blank"
          >
            空站位
            <div className="mt-1 text-[10px] font-normal text-[#a9b096]">
              從空白球場開始，球員自己從名單拖上場
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
