import React, { useRef } from "react";
import { useTactics, ToolType } from "../hooks/useTactics";
import { exportCourtAsPng, exportStateAsJson, importStateFromJson } from "../lib/exportUtils";
import { SituationTag } from "../types/tactics";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";

// 情境標籤只在存檔時當分類用，跟球場上即時編輯無關，所以放在「戰術管理」區塊裡選。
const SITUATION_OPTIONS: { id: SituationTag; label: string }[] = [
  { id: "base", label: "基礎輪轉" },
  { id: "serve-receive", label: "接發球" },
  { id: "defense", label: "防守" },
  { id: "attack", label: "進攻" },
  { id: "cover", label: "Cover保護" },
];
const SITUATION_TEXT: Record<SituationTag, string> = SITUATION_OPTIONS.reduce(
  (acc, { id, label }) => ({ ...acc, [id]: label }),
  {} as Record<SituationTag, string>,
);

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

export default function RightPanel() {
  const {
    activeTool,
    setActiveTool,
    projectSituation,
    setProjectSituation,
    saveProject,
    saveProjectAs,
    newProject,
    activeProjectId,
    projects,
    loadProject,
    deleteProject,
    importState,
    rotations,
    currentRotation,
    setCurrentRotation,
    removeMarker,
    removeDefenseRange,
    selectedObjectId,
    updateDefenseRange,
    undo,
    redo,
    historyIndex,
    history,
    isLayoutMode,
    setLayoutMode,
  } = useTactics();

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTool = (tool: ToolType) => setActiveTool(tool);

  const toolBtnClass = (tool: ToolType) =>
    `wobbly-border py-1.5 text-xs font-bold transition-colors ${activeTool === tool ? "bg-[#CCFF00] shadow-[2px_2px_0_0_#111]" : "bg-white hover:bg-gray-100"}`;

  const handleDelete = () => {
    if (selectedObjectId) {
      removeMarker(selectedObjectId);
      removeDefenseRange(selectedObjectId);
    }
  };

  const situationLabel = SITUATION_TEXT[projectSituation] || "tactics";

  const handleExportPNG = () => {
    exportCourtAsPng("court-wrapper", `${situationLabel}_輪次${currentRotation + 1}`);
    toast({ title: "匯出成功", description: "PNG 下載中..." });
  };

  const handleExportAllPNG = async () => {
    toast({ title: "匯出中", description: "即將下載多個檔案..." });
    const originalRotation = currentRotation;
    for (let i = 0; i < 6; i++) {
      setCurrentRotation(i);
      await new Promise((resolve) => setTimeout(resolve, 300));
      exportCourtAsPng("court-wrapper", `${situationLabel}_輪次${i + 1}`);
    }
    setCurrentRotation(originalRotation);
  };

  const handleExportJSON = () => {
    const stateStr = localStorage.getItem("volleyboard_current");
    if (stateStr) {
      exportStateAsJson(JSON.parse(stateStr).state, situationLabel);
      toast({ title: "匯出成功", description: "JSON 下載中..." });
    }
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importStateFromJson(file);
      importState(data);
      toast({ title: "匯入成功", description: "戰術板已更新" });
    } catch (err) {
      toast({ title: "匯入失敗", description: "檔案格式錯誤", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleNewProject = () => newProject();

  const handleFinishLayout = () => {
    saveProject();
    setLayoutMode(false);
    toast({ title: "戰術已儲存" });
  };

  const currentRotState = rotations[currentRotation];
  const selectedRange = currentRotState?.defenseRanges.find((dr) => dr.id === selectedObjectId);

  return (
    <div className="flex flex-col h-full bg-[#f8f8f8]">
      <div className="p-3 flex flex-col gap-4 overflow-y-auto flex-1">
        {!isLayoutMode ? (
          <section>
            <h2 className="font-display mb-2 text-[15px] font-bold">戰術布置</h2>
            <p className="text-[10px] text-gray-500 mb-2">
              進入後才能使用箭頭、文字、防守範圍等工具標註戰術；平常球場只顯示已經畫好的內容，
              不能選取或修改。
            </p>
            <button
              onClick={() => setLayoutMode(true)}
              className="w-full wobbly-border py-1.5 bg-[#CCFF00] hover:bg-[#111] hover:text-[#CCFF00] transition-colors font-bold text-xs shadow-[2px_2px_0_0_#111]"
              data-testid="button-enter-layout-mode"
            >
              進入戰術布置
            </button>
          </section>
        ) : (
          <>
            <section>
              <button
                onClick={handleFinishLayout}
                className="w-full wobbly-border py-1.5 bg-[#CCFF00] hover:bg-[#111] hover:text-[#CCFF00] transition-colors font-bold text-xs shadow-[2px_2px_0_0_#111]"
                data-testid="button-finish-layout"
              >
                完成並儲存
              </button>
              <p className="text-[10px] text-gray-500 mt-1 text-center">
                {activeProjectId ? `將更新「${situationLabel}」` : "將建立新戰術"}
              </p>
            </section>
            <section>
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-display text-[15px] font-bold">畫筆工具</h2>
                <div className="flex gap-1">
                  <button
                    onClick={undo}
                    disabled={historyIndex <= 0}
                    className="px-2 py-1 wobbly-border bg-white text-xs disabled:opacity-50 hover:bg-[#CCFF00]"
                    title="Undo (Ctrl+Z)"
                  >
                    ↩
                  </button>
                  <button
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1}
                    className="px-2 py-1 wobbly-border bg-white text-xs disabled:opacity-50 hover:bg-[#CCFF00]"
                    title="Redo (Ctrl+Y)"
                  >
                    ↪
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mb-2">
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
                className="w-full wobbly-border py-1.5 text-xs bg-white hover:bg-red-100 disabled:opacity-50 text-red-600 font-bold transition-colors"
                data-testid="button-delete-marker"
              >
                刪除選取標記 (Del)
              </button>
            </section>

            <section>
              <h2 className="font-display mb-2 text-[15px] font-bold">防守範圍</h2>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
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
                <div className="p-2 bg-white wobbly-border text-xs space-y-2">
                  <div className="font-bold text-xs">範圍屬性</div>
                  <div>
                    <label className="text-[10px] mb-1 block">
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
                      className="w-full accent-[#CCFF00]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] mb-1 block">顏色</label>
                    <div className="flex gap-1 flex-wrap">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          className={`w-5 h-5 border-2 border-[#111] ${selectedRange.color === c ? "ring-2 ring-offset-1 ring-[#111]" : ""}`}
                          style={{ backgroundColor: c }}
                          onClick={() => updateDefenseRange(selectedRange.id, { color: c })}
                        />
                      ))}
                    </div>
                  </div>

                  {selectedRange.type === "circle" && (
                    <div>
                      <label className="text-[10px] mb-1 block">
                        半徑: {selectedRange.radius || 15}
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="60"
                        value={selectedRange.radius || 15}
                        onChange={(e) =>
                          updateDefenseRange(selectedRange.id, { radius: parseInt(e.target.value) })
                        }
                        className="w-full accent-[#CCFF00]"
                      />
                    </div>
                  )}

                  {selectedRange.type === "ellipse" && (
                    <>
                      <div>
                        <label className="text-[10px] mb-1 block">
                          長軸: {selectedRange.rx || 15}
                        </label>
                        <input
                          type="range"
                          min="5"
                          max="60"
                          value={selectedRange.rx || 15}
                          onChange={(e) =>
                            updateDefenseRange(selectedRange.id, { rx: parseInt(e.target.value) })
                          }
                          className="w-full accent-[#CCFF00]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] mb-1 block">
                          短軸: {selectedRange.ry || 10}
                        </label>
                        <input
                          type="range"
                          min="5"
                          max="60"
                          value={selectedRange.ry || 10}
                          onChange={(e) =>
                            updateDefenseRange(selectedRange.id, { ry: parseInt(e.target.value) })
                          }
                          className="w-full accent-[#CCFF00]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] mb-1 block">
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
                          className="w-full accent-[#CCFF00]"
                        />
                      </div>
                    </>
                  )}

                  {selectedRange.type === "fan" && (
                    <>
                      <div>
                        <label className="text-[10px] mb-1 block">
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
                          className="w-full accent-[#CCFF00]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] mb-1 block">
                          扇形角度:{" "}
                          {Math.abs(
                            (selectedRange.endAngle || 45) - (selectedRange.startAngle || -45),
                          )}
                          °
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
                          className="w-full accent-[#CCFF00]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] mb-1 block">
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
                          className="w-full accent-[#CCFF00]"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-[15px] font-bold">戰術管理</h2>
            {/* 目前是草稿（沒有 activeProjectId）還是正在編輯某個已存戰術 */}
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 wobbly-border ${activeProjectId ? "bg-[#CCFF00]" : "bg-gray-200 text-gray-500"}`}
            >
              {activeProjectId ? "正在編輯" : "草稿"}
            </span>
          </div>
          <div className="space-y-2">
            {/* 情境即是這個戰術的名稱，選好情境再儲存就好，不需要另外填名稱 */}
            <select
              className="w-full wobbly-border px-2 py-1.5 text-xs bg-white outline-none focus:ring-2 focus:ring-[#CCFF00]"
              value={projectSituation}
              onChange={(e) => setProjectSituation(e.target.value as SituationTag)}
              data-testid="select-project-situation"
            >
              {SITUATION_OPTIONS.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.label}
                </option>
              ))}
            </select>
            {/* 3 個按鈕：儲存（update-or-create）、另存新檔（永遠新增）、新建（清空編輯器） */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => {
                  saveProject();
                  toast({ title: activeProjectId ? "專案已更新" : "專案已儲存" });
                }}
                className="wobbly-border py-1.5 bg-[#CCFF00] hover:bg-[#111] hover:text-[#CCFF00] transition-colors font-bold text-xs shadow-[2px_2px_0_0_#111]"
                data-testid="button-save-project"
              >
                儲存
              </button>
              <button
                onClick={() => {
                  saveProjectAs();
                  toast({ title: "已另存新檔" });
                }}
                className="wobbly-border py-1.5 bg-white hover:bg-gray-100 font-bold text-xs"
                data-testid="button-save-project-as"
              >
                另存新檔
              </button>
              <button
                onClick={handleNewProject}
                className="wobbly-border py-1.5 bg-white hover:bg-gray-100 font-bold text-xs"
                data-testid="button-new-project"
              >
                新建
              </button>
            </div>

            {projects.length > 0 && (
              <div className="border-2 border-[#111] bg-white p-2">
                <div className="text-[10px] font-bold mb-1">已儲存 (點擊載入)</div>
                <div className="space-y-1 max-h-[100px] overflow-y-auto">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center text-[10px] p-1 gap-1 ${p.id === activeProjectId ? "bg-[#CCFF00]/30" : "hover:bg-gray-100"}`}
                    >
                      <span
                        className="truncate flex-1 cursor-pointer hover:underline"
                        onClick={() => {
                          loadProject(p.id);
                          toast({ title: "專案已載入" });
                        }}
                      >
                        {SITUATION_TEXT[p.situation]}
                      </span>
                      <span className="text-gray-400 shrink-0">
                        {new Date(p.date).toLocaleDateString()}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProject(p.id);
                        }}
                        className="shrink-0 text-gray-400 hover:text-red-600 font-bold leading-none px-0.5"
                        title="刪除"
                        data-testid={`button-delete-project-${p.id}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="p-3 border-t-2 border-[#111] bg-white">
        <h2 className="font-display text-[15px] font-bold mb-2">分享匯出</h2>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={handleExportPNG}
            className="wobbly-border py-1.5 bg-white text-xs hover:bg-[#CCFF00] font-bold"
            data-testid="button-export-png"
          >
            匯出 PNG
          </button>
          <button
            onClick={handleExportAllPNG}
            className="wobbly-border py-1.5 bg-white text-xs hover:bg-[#CCFF00] font-bold"
            data-testid="button-export-all-png"
          >
            匯出6輪PNG
          </button>
          <button
            onClick={handleExportJSON}
            className="wobbly-border py-1.5 bg-white text-xs hover:bg-[#CCFF00] font-bold"
            data-testid="button-export-json"
          >
            匯出 JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="wobbly-border py-1.5 bg-white text-xs hover:bg-[#CCFF00] font-bold"
            data-testid="button-import-json"
          >
            匯入 JSON
          </button>
          <input
            type="file"
            accept=".json"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImportJSON}
          />
        </div>
      </div>
      <Toaster />
    </div>
  );
}
