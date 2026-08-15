import { useState } from "react";
import type { Tactic } from "@workspace/api-client-react";

// 「已儲存戰術」清單本體——issue #331 右欄 v2 重寫：拿掉外層那張獨立的玻璃卡片與
// 「已儲存 (點擊載入)」標題（那個標題連同「返回列表」ghost 鈕現在由呼叫端 TacticsBoardPanel
// 畫在清單正上方，理由是「返回列表」只在唯讀檢視態才出現、得跟標題同一列，而知不知道
// 現在是不是唯讀檢視態不是這個元件該管的事——它只負責「畫出清單、回報點了誰」）。
//
// 高度規則也跟著 v2 統一（不再收 maxHeight prop）：固定 flex:1 + min-height 176px（≈4 列），
// 容器塞不下時交給外層一起捲，不會被壓成只露兩列的「塞不下」訊號——這正是 #331 起因。
// 呼叫端只有 TacticsBoardPanel 這一個，不用擔心動到其他頁面的高度假設。
interface TacticsListProps {
  tactics: Tactic[];
  // 目前反白哪一筆：編輯中看 session.serverId，唯讀檢視看 viewingTacticId（由呼叫端決定給誰）。
  activeTacticId: string | null;
  onSelect: (t: Tactic) => void;
  // 直接跳進可編輯模式（issue #331 新增：spec 的「編輯」圖示鈕）——等同「先選取、再按
  // 球場右上角的編輯鈕」兩步，這裡收成一步。跟 onSelect 分開兩個 callback 而不是加一個
  // boolean 參數，是因為兩者背後接的是完全不同的 store 動作序列（見 TacticsBoardRail.tsx
  // 的 handleEditTactic）。
  onEdit: (t: Tactic) => void;
  onRename: (t: Tactic, newName: string) => void;
  onDelete: (tacticId: string) => void;
}

// 三顆操作圖示的路徑直接取自設計稿（explorations/tactics-rail-v2.html），16×16 viewBox、
// stroke-width 1.5——保持跟設計稿逐筆對得起來，不要另外找一套圖示庫拼字重畫。
function RenameIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path d="M4 3h8M8 3v10M6 13h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path d="M10.5 2.5l3 3-7.5 7.5H3v-3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DeleteIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 8.5h6.6l.7-8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ICON_BTN_CLASS =
  "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[#a9b096] transition hover:bg-white/[0.09] hover:text-[#f5f5f0]";

export default function TacticsList({
  tactics,
  activeTacticId,
  onSelect,
  onEdit,
  onRename,
  onDelete,
}: TacticsListProps) {
  // 改名 inline 編輯的暫存狀態：editingId 是正在被改名的那筆 id。這是「這個清單元件自己
  // 才在乎」的暫時 UI 狀態（不影響任何真相資料），留在元件內部就好，不必上提給父層。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const commitRename = (t: Tactic) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== t.name) onRename(t, trimmed);
    setEditingId(null);
  };

  if (tactics.length === 0) {
    return <p className="py-1 text-caption text-[#a9b096]">尚無已儲存戰術</p>;
  }

  return (
    <div className="min-h-[176px] flex-1 space-y-1 overflow-y-auto pr-0.5">
      {tactics.map((t) => {
        const isActive = t.id === activeTacticId;
        return (
          <div
            key={t.id}
            className={`flex h-[38px] items-center gap-1.5 rounded-lg px-2 text-caption transition ${
              isActive
                ? "bg-[#c6f135]/[0.09] shadow-[inset_0_0_0_1px_rgba(198,241,53,0.28)]"
                : "hover:bg-white/[0.05]"
            }`}
          >
            {editingId === t.id ? (
              <input
                autoFocus
                className="min-w-0 flex-1 rounded border border-white/[0.26] bg-white/[0.05] px-1
                  text-caption text-[#f5f5f0] outline-none focus:border-[#c6f135]"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => commitRename(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(t);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(t)}
                className={`min-w-0 flex-1 truncate text-left hover:underline ${
                  isActive ? "text-[#c6f135]" : ""
                }`}
              >
                {t.name}
              </button>
            )}
            <span className="shrink-0 text-micro text-[#a9b096]/70">
              {new Date(t.updatedAt).toLocaleDateString()}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingId(t.id);
                setEditingName(t.name);
              }}
              className={ICON_BTN_CLASS}
              title="改名"
              aria-label="改名"
            >
              <RenameIcon />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(t);
              }}
              className={ICON_BTN_CLASS}
              title="編輯"
              aria-label="編輯"
            >
              <EditIcon />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(t.id);
              }}
              className={`${ICON_BTN_CLASS} text-[rgba(239,68,68,0.85)] bg-[rgba(239,68,68,0.10)] hover:bg-[rgba(239,68,68,0.18)] hover:text-[rgba(239,68,68,1)]`}
              title="刪除"
              aria-label="刪除"
              data-testid={`button-delete-project-${t.id}`}
            >
              <DeleteIcon />
            </button>
          </div>
        );
      })}
    </div>
  );
}
