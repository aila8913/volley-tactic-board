import { SECONDARY_BTN_CLASS, PRIMARY_BTN_CLASS } from "../lib/tacticsBoardStyles";

// viewing 模式（viewingScene !== null）——issue #160 C2 三模式裡最單薄的一個：正在看一張
// 已存戰術的「唯讀照片」（見 useTacticsBoard.ts 的 viewingScene / PR B 的說明），畫面上
// 只有「這是哪一張」的名稱跟「編輯」按鈕，沒有畫筆工具、也沒有球員名單——這些都要先按
// 「編輯」把這張照片升級成可改的 session 才會出現（見 TacticsEditPanel）。
interface TacticsViewingPanelProps {
  viewingTacticName: string;
  onEdit: () => void;
  onBackToBrowse: () => void;
}

export default function TacticsViewingPanel({
  viewingTacticName,
  onEdit,
  onBackToBrowse,
}: TacticsViewingPanelProps) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-bold">唯讀檢視</h2>
        <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-bold text-[#a9b096]">
          唯讀
        </span>
      </div>
      <p
        className="mb-3 truncate rounded-lg border border-white/[0.18] bg-white/[0.11] px-2 py-1.5
          text-xs shadow-sm shadow-black/20 backdrop-blur-lg"
        title={viewingTacticName || undefined}
      >
        {viewingTacticName || "（未命名戰術）"}
      </p>
      <button
        onClick={onEdit}
        className={`w-full py-1.5 text-xs font-bold ${PRIMARY_BTN_CLASS}`}
        data-testid="button-edit-current"
      >
        編輯
      </button>
      <button
        onClick={onBackToBrowse}
        className={`mt-1.5 w-full py-1.5 text-xs font-bold ${SECONDARY_BTN_CLASS}`}
        data-testid="button-back-to-browse"
      >
        返回列表
      </button>
    </section>
  );
}
