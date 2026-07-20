import { useState } from "react";
import type { Tactic } from "@workspace/api-client-react";

// 「已儲存戰術」清單——issue #160 C2 從 724 行的 TacticsBoardPanel 拆出來的第一塊。
// browse 模式（瀏覽戰術庫）跟 edit 模式（布置中，底下留一小塊清單方便切換去看別的戰術）
// 都會用到同一份清單 UI，所以獨立成元件，兩邊各自傳自己要的 maxHeight/callback 進來，
// 元件本身不知道「現在是哪個模式」——這正是拆檔案的目的：把「畫什麼」跟「什麼時候畫」分開。
interface TacticsListProps {
  tactics: Tactic[];
  // 目前反白哪一筆：編輯中看 session.serverId，唯讀檢視看 viewingTacticId（由呼叫端決定給誰）。
  activeTacticId: string | null;
  maxHeight: string;
  onSelect: (t: Tactic) => void;
  onRename: (t: Tactic, newName: string) => void;
  onDelete: (tacticId: string) => void;
}

export default function TacticsList({
  tactics,
  activeTacticId,
  maxHeight,
  onSelect,
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

  return (
    <div className="rounded-lg border border-white/[0.18] bg-white/[0.11] p-2 shadow-sm shadow-black/20 backdrop-blur-lg">
      <div className="mb-1 text-[10px] font-bold">已儲存 (點擊載入)</div>
      {tactics.length === 0 ? (
        <p className="py-1 text-[10px] text-[#a9b096]">尚無已儲存戰術</p>
      ) : (
        <div className="space-y-1 overflow-y-auto" style={{ maxHeight }}>
          {tactics.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-1 rounded p-1 text-[10px] ${t.id === activeTacticId ? "bg-[#c6f135]/20" : "hover:bg-white/[0.08]"}`}
            >
              {editingId === t.id ? (
                <input
                  autoFocus
                  className="flex-1 rounded border border-white/[0.26] bg-white/[0.05] px-1 text-[10px]
                    text-[#f5f5f0] outline-none focus:border-[#c6f135]"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => commitRename(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(t);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <span
                  className="flex-1 cursor-pointer truncate hover:underline"
                  onClick={() => onSelect(t)}
                >
                  {t.name}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingId(t.id);
                  setEditingName(t.name);
                }}
                className="shrink-0 px-0.5 leading-none text-[#a9b096] hover:text-[#f5f5f0]"
                title="改名"
              >
                ✏
              </button>
              <span className="shrink-0 text-[#a9b096]">
                {new Date(t.updatedAt).toLocaleDateString()}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(t.id);
                }}
                className="shrink-0 px-0.5 font-bold leading-none text-[#a9b096] hover:text-[#ef4444]"
                title="刪除"
                data-testid={`button-delete-project-${t.id}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
