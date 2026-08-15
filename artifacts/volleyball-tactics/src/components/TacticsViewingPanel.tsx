import { useState } from "react";
import { SECONDARY_BTN_CLASS } from "../lib/tacticsBoardStyles";

// viewing 模式（viewingScene !== null）——issue #160 C2 三模式裡最單薄的一個：正在看一張
// 已存戰術的「唯讀照片」（見 useTacticsBoard.ts 的 viewingScene / PR B 的說明），畫面上
// 只有「這是哪一張」的名稱，沒有畫筆工具、也沒有球員名單——這些都要先升級成可改的 session
// 才會出現（見 TacticsEditToolRail，issue #176 把原本的 TacticsEditPanel 搬進右欄工具軌）。
//
// issue #177：「編輯」鈕原本住在這個面板裡，現在搬到球場右上角那顆共用的模式鈕
//（TacticsBoard.tsx，跟佈陣模式的「確定」鈕共用同一個位置/樣式語彙），所以這個面板不再收
// onEdit——它只負責顯示戰術名稱＋返回列表。
//
// issue #408：名稱從純顯示的 <p> 變成「可以就地改名」。新增一張戰術之後會直接落在這個
// 唯讀態，而改名原本只有瀏覽模式的清單列上有入口——使用者得先發現「球場右上角的『編輯』
// 才能離開唯讀」、再退回列表去改，實際試玩沒有人找得到。#408 列的三個選項裡選了第 2 案
//（唯讀態補入口）：它補在使用者當下真的站著的位置，而且不必強迫人在還沒畫任何東西前先命名。
//
// ⚠️ 這裡放輸入框**不**違反 #176 那條「不要往 132px 工具軌塞輸入框」：那條講的是 mode C
// 的編輯工具軌，這個面板住在 aside（一般寬度的右欄），本來就放得下。
interface TacticsViewingPanelProps {
  viewingTacticName: string;
  onBackToBrowse: () => void;
  // 改名。null = 這張唯讀照片不是某一筆已存戰術（例如從 JSON 匯入進來的），沒有東西可以改名
  // ——這時候就不長出改名入口，而不是給一顆按了會靜靜失敗的按鈕。
  onRename: ((newName: string) => void) | null;
}

export default function TacticsViewingPanel({
  viewingTacticName,
  onBackToBrowse,
  onRename,
}: TacticsViewingPanelProps) {
  // 跟 TacticsList 的改名一樣是「只有這個元件在乎」的暫時 UI 狀態，不上提。
  // 這裡不需要 editingId（唯讀態一次只看一張），一個布林就夠。
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEditing = () => {
    setDraft(viewingTacticName);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    // 空白名字與沒改動都當作沒事發生——跟 TacticsList.commitRename 同一條規則，
    // 免得使用者不小心清空之後存下一張叫「」的戰術。
    if (trimmed && trimmed !== viewingTacticName) onRename?.(trimmed);
    setEditing(false);
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-panel-title font-bold">唯讀檢視</h2>
        <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-micro font-bold text-[#a9b096]">
          唯讀
        </span>
      </div>

      {editing ? (
        <input
          autoFocus
          className="mb-3 w-full truncate rounded-lg border border-white/[0.26] bg-white/[0.05]
            px-2 py-1.5 text-xs text-[#f5f5f0] outline-none focus:border-[#c6f135]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // blur 就存：這一格沒有「確定」鈕，使用者點去別的地方就是「我打完了」。
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          data-testid="input-rename-viewing-tactic"
          aria-label="戰術名稱"
        />
      ) : (
        <div className="mb-3 flex items-center gap-1">
          <p
            className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.18] bg-white/[0.11]
              px-2 py-1.5 text-xs shadow-sm shadow-black/20 backdrop-blur-lg"
            title={viewingTacticName || undefined}
          >
            {viewingTacticName || "（未命名戰術）"}
          </p>
          {onRename && (
            <button
              onClick={startEditing}
              className="shrink-0 px-1 leading-none text-[#a9b096] hover:text-[#f5f5f0]"
              title="改名"
              aria-label="改名"
              data-testid="button-rename-viewing-tactic"
            >
              ✏
            </button>
          )}
        </div>
      )}

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
