import { SECONDARY_BTN_CLASS } from "../lib/tacticsBoardStyles";

// viewing 模式（viewingScene !== null）——issue #160 C2 三模式裡最單薄的一個：正在看一張
// 已存戰術的「唯讀照片」（見 useTacticsBoard.ts 的 viewingScene / PR B 的說明），畫面上
// 只有「這是哪一張」的名稱，沒有畫筆工具、也沒有球員名單——這些都要先升級成可改的 session
// 才會出現（見 TacticsEditToolRail，issue #176 把原本的 TacticsEditPanel 搬進右欄工具軌）。
//
// issue #177：「編輯」鈕原本住在這個面板裡，現在搬到球場右上角那顆共用的模式鈕
//（TacticsBoard.tsx，跟佈陣模式的「確定」鈕共用同一個位置/樣式語彙），所以這個面板不再收
// onEdit——它只負責顯示戰術名稱＋返回列表。
interface TacticsViewingPanelProps {
  viewingTacticName: string;
  onBackToBrowse: () => void;
}

export default function TacticsViewingPanel({
  viewingTacticName,
  onBackToBrowse,
}: TacticsViewingPanelProps) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-panel-title font-bold">唯讀檢視</h2>
        <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-micro font-bold text-[#a9b096]">
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
        onClick={onBackToBrowse}
        className={`w-full py-1.5 text-xs font-bold ${SECONDARY_BTN_CLASS}`}
        data-testid="button-back-to-browse"
      >
        返回列表
      </button>
    </section>
  );
}
