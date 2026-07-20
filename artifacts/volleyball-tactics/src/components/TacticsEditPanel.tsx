import type { Tactic } from "@workspace/api-client-react";
import { useTacticsBoard, ToolType } from "../hooks/useTacticsBoard";
import TacticsRosterPanel from "./TacticsRosterPanel";
import TacticsList from "./TacticsList";
import { PRIMARY_BTN_CLASS, SECONDARY_BTN_CLASS } from "../lib/tacticsBoardStyles";

const COLORS = [
  "#CCFF00",
  "#3b82f6",
  "#ef4444",
  "#f97316",
  "#a855f7",
  "#eab308",
  "#ffffff",
  "#111111",
];

// edit 模式（session !== null）——issue #160 C2 從 TacticsBoardPanel 拆出來的第三塊，也是
// 三個模式面板裡最重的一塊：戰術名稱、常駐球員名單（新，見 TacticsRosterPanel）、畫筆
// 工具列、防守範圍工具與屬性編輯器、已儲存清單（切去看別張）、底部存檔動作列，全部只在
// 「正在編輯」時出現。
//
// 這裡直接訂閱 useTacticsBoard（不像 tactics/save 相關的 callback 那樣由父層 props 傳入）：
// session 內容本來就是這個面板要即時反映的畫面狀態，直接訂閱 store 拿最新值，跟
// Court.tsx / PlayerNode.tsx 對同一個 store 的用法一致；只有牽涉到 React Query mutation
// （存檔/改名/刪除）跟「這是哪一場比賽」的 matchId，才透過 props 從父層（TacticsBoardPanel，
// 那些 mutation 的擁有者）傳進來，避免這個檔案自己重新掛一份 useCreateTactic 之類的 hook。
interface TacticsEditPanelProps {
  matchId: string;
  tactics: Tactic[];
  onSelectTactic: (t: Tactic) => void;
  onRenameTactic: (t: Tactic, name: string) => void;
  onDeleteTactic: (id: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  saving: boolean;
  savingAs: boolean;
}

export default function TacticsEditPanel({
  matchId,
  tactics,
  onSelectTactic,
  onRenameTactic,
  onDeleteTactic,
  onCancel,
  onSave,
  onSaveAs,
  saving,
  savingAs,
}: TacticsEditPanelProps) {
  const session = useTacticsBoard((s) => s.session);
  const activeTool = useTacticsBoard((s) => s.activeTool);
  const setActiveTool = useTacticsBoard((s) => s.setActiveTool);
  const setSessionName = useTacticsBoard((s) => s.setSessionName);
  const removeMarker = useTacticsBoard((s) => s.removeMarker);
  const removeDefenseRange = useTacticsBoard((s) => s.removeDefenseRange);
  const selectedObjectId = useTacticsBoard((s) => s.selectedObjectId);
  const updateDefenseRange = useTacticsBoard((s) => s.updateDefenseRange);
  const undo = useTacticsBoard((s) => s.undo);
  const redo = useTacticsBoard((s) => s.redo);

  const projectSituation = session?.name ?? "";
  const activeTacticId = session?.serverId ?? null;
  const selectedRange = session?.defenseRanges.find((dr) => dr.id === selectedObjectId);

  const handleTool = (tool: ToolType) => setActiveTool(tool);

  const toolBtnClass = (tool: ToolType) =>
    `rounded-lg border py-1.5 text-xs font-bold transition ${
      activeTool === tool
        ? "border-[#c6f135] bg-[#c6f135] text-[#0a0b07]"
        : "border-white/[0.26] bg-white/[0.05] text-[#f5f5f0] hover:border-[#c6f135] hover:text-[#c6f135]"
    }`;

  const handleDelete = () => {
    if (selectedObjectId) {
      removeMarker(selectedObjectId);
      removeDefenseRange(selectedObjectId);
    }
  };

  return (
    <>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-bold">戰術管理</h2>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${session?.serverId ? "bg-[#c6f135] text-[#0a0b07]" : "bg-white/[0.08] text-[#a9b096]"}`}
          >
            {session?.serverId ? "正在編輯" : "草稿"}
          </span>
        </div>
        <input
          className="w-full rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1.5
            text-xs text-[#f5f5f0] outline-none focus:border-[#c6f135] focus:ring-1
            focus:ring-[#c6f135]"
          placeholder="戰術名稱（如：接發11號強發）"
          value={projectSituation}
          onChange={(e) => setSessionName(e.target.value)}
          data-testid="input-project-situation"
        />
      </section>

      <TacticsRosterPanel matchId={matchId} />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-bold">畫筆工具</h2>
          <div className="flex gap-1">
            <button
              onClick={() => undo()}
              disabled={!session || session.historyIndex <= 0}
              className={`px-2 py-1 text-xs disabled:opacity-50 ${SECONDARY_BTN_CLASS}`}
              title="Undo (Ctrl+Z)"
            >
              ↩
            </button>
            <button
              onClick={() => redo()}
              disabled={!session || session.historyIndex >= session.history.length - 1}
              className={`px-2 py-1 text-xs disabled:opacity-50 ${SECONDARY_BTN_CLASS}`}
              title="Redo (Ctrl+Y)"
            >
              ↪
            </button>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <button
            onClick={() => handleTool("select")}
            className={toolBtnClass("select")}
            data-testid="tool-select"
          >
            選取移動
          </button>
          <button
            onClick={() => handleTool("arrow")}
            className={toolBtnClass("arrow")}
            data-testid="tool-arrow"
          >
            實線箭頭
          </button>
          <button
            onClick={() => handleTool("dashed")}
            className={toolBtnClass("dashed")}
            data-testid="tool-dashed"
          >
            虛線路徑
          </button>
          <button
            onClick={() => handleTool("attack")}
            className={toolBtnClass("attack")}
            data-testid="tool-attack"
          >
            攻擊線
          </button>
          <button
            onClick={() => handleTool("text")}
            className={toolBtnClass("text")}
            data-testid="tool-text"
          >
            文字
          </button>
          <button
            onClick={() => handleTool("volleyball")}
            className={toolBtnClass("volleyball")}
            data-testid="tool-volleyball"
          >
            排球
          </button>
        </div>
        <button
          onClick={handleDelete}
          disabled={!selectedObjectId}
          className="w-full rounded-lg border border-white/[0.26] bg-white/[0.05] py-1.5 text-xs
            font-bold text-[#ef4444] transition hover:border-[#ef4444] hover:bg-[#ef4444]/10
            disabled:opacity-50"
          data-testid="button-delete-marker"
        >
          刪除選取標記 (Del)
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-bold">防守範圍</h2>
        <div className="mb-2 grid grid-cols-3 gap-1.5">
          <button
            onClick={() => handleTool("circle")}
            className={toolBtnClass("circle")}
            data-testid="tool-circle"
          >
            圓形
          </button>
          <button
            onClick={() => handleTool("ellipse")}
            className={toolBtnClass("ellipse")}
            data-testid="tool-ellipse"
          >
            橢圓
          </button>
          <button
            onClick={() => handleTool("fan")}
            className={toolBtnClass("fan")}
            data-testid="tool-fan"
          >
            扇形
          </button>
        </div>

        {selectedRange && (
          <div className="space-y-2 rounded-lg border border-white/[0.18] bg-white/[0.11] p-2 text-xs shadow-sm shadow-black/20 backdrop-blur-lg">
            <div className="text-xs font-bold">範圍屬性</div>
            <div>
              <label className="mb-1 block text-[10px] text-[#a9b096]">
                透明度: {Math.round(selectedRange.opacity * 100)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={selectedRange.opacity}
                onChange={(e) =>
                  updateDefenseRange(selectedRange.id, {
                    opacity: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-[#c6f135]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-[#a9b096]">顏色</label>
              <div className="flex flex-wrap gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`h-5 w-5 rounded border border-white/[0.26] ${selectedRange.color === c ? "ring-2 ring-[#c6f135] ring-offset-1 ring-offset-[#0a0b07]" : ""}`}
                    style={{ backgroundColor: c }}
                    onClick={() => updateDefenseRange(selectedRange.id, { color: c })}
                  />
                ))}
              </div>
            </div>
            {selectedRange.type === "circle" && (
              <div>
                <label className="mb-1 block text-[10px] text-[#a9b096]">
                  半徑: {selectedRange.radius || 15}
                </label>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={selectedRange.radius || 15}
                  onChange={(e) =>
                    updateDefenseRange(selectedRange.id, {
                      radius: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-[#c6f135]"
                />
              </div>
            )}
            {selectedRange.type === "ellipse" && (
              <>
                <div>
                  <label className="mb-1 block text-[10px] text-[#a9b096]">
                    長軸: {selectedRange.rx || 15}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    value={selectedRange.rx || 15}
                    onChange={(e) =>
                      updateDefenseRange(selectedRange.id, {
                        rx: parseInt(e.target.value),
                      })
                    }
                    className="w-full accent-[#c6f135]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[#a9b096]">
                    短軸: {selectedRange.ry || 10}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    value={selectedRange.ry || 10}
                    onChange={(e) =>
                      updateDefenseRange(selectedRange.id, {
                        ry: parseInt(e.target.value),
                      })
                    }
                    className="w-full accent-[#c6f135]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[#a9b096]">
                    旋轉: {selectedRange.rotation || 0}°
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="359"
                    value={selectedRange.rotation || 0}
                    onChange={(e) =>
                      updateDefenseRange(selectedRange.id, {
                        rotation: parseInt(e.target.value),
                      })
                    }
                    className="w-full accent-[#c6f135]"
                  />
                </div>
              </>
            )}
            {selectedRange.type === "fan" && (
              <>
                <div>
                  <label className="mb-1 block text-[10px] text-[#a9b096]">
                    半徑: {selectedRange.radius || 15}
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={selectedRange.radius || 15}
                    onChange={(e) =>
                      updateDefenseRange(selectedRange.id, {
                        radius: parseInt(e.target.value),
                      })
                    }
                    className="w-full accent-[#c6f135]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[#a9b096]">
                    扇形角度:{" "}
                    {Math.abs((selectedRange.endAngle || 45) - (selectedRange.startAngle || -45))}°
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="340"
                    value={Math.abs(
                      (selectedRange.endAngle || 45) - (selectedRange.startAngle || -45),
                    )}
                    onChange={(e) => {
                      const half = parseInt(e.target.value) / 2;
                      updateDefenseRange(selectedRange.id, {
                        startAngle: -half,
                        endAngle: half,
                      });
                    }}
                    className="w-full accent-[#c6f135]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[#a9b096]">
                    旋轉方向: {selectedRange.rotation || 0}°
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="359"
                    value={selectedRange.rotation || 0}
                    onChange={(e) =>
                      updateDefenseRange(selectedRange.id, {
                        rotation: parseInt(e.target.value),
                      })
                    }
                    className="w-full accent-[#c6f135]"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section>
        <TacticsList
          tactics={tactics}
          activeTacticId={activeTacticId}
          maxHeight="80px"
          onSelect={onSelectTactic}
          onRename={onRenameTactic}
          onDelete={onDeleteTactic}
        />
      </section>

      {/* 布置模式底端：取消 / 儲存 / 另存新檔 */}
      <section>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={onCancel}
            className={`py-1.5 text-xs font-bold ${SECONDARY_BTN_CLASS}`}
            data-testid="button-cancel-layout"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className={`py-1.5 text-xs font-bold disabled:opacity-50 ${PRIMARY_BTN_CLASS}`}
            data-testid="button-finish-layout"
          >
            儲存
          </button>
          <button
            onClick={onSaveAs}
            disabled={savingAs}
            className={`py-1.5 text-xs font-bold disabled:opacity-50 ${SECONDARY_BTN_CLASS}`}
            data-testid="button-save-as-layout"
          >
            另存新檔
          </button>
        </div>
      </section>
    </>
  );
}
