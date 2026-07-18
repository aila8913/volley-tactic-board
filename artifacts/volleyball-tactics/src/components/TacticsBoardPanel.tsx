import React, { useRef, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTactics,
  useCreateTactic,
  useUpdateTactic,
  useDeleteTactic,
  getListTacticsQueryKey,
} from "@workspace/api-client-react";
import { useTacticsBoard, ToolType } from "../hooks/useTacticsBoard";
import { useRotationTable } from "../hooks/useRotationTable";
import { SavedTacticData, RotationTactics } from "../types/tacticsBoard";
import { exportCourtAsPng, exportStateAsJson, importStateFromJson } from "../lib/exportUtils";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";

// 這一場還沒有分片資料時的空白畫筆陣列（模組層、參照穩定）。
const EMPTY_TACTICS: RotationTactics[] = Array(6)
  .fill(null)
  .map(() => ({ tacticPositions: [], markers: [], defenseRanges: [] }));

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

// 次要按鈕（取消/undo-redo/匯出這類不強調的操作），跟比賽列表那邊的次要按鈕同一套語言。
const SECONDARY_BTN_CLASS =
  "rounded-lg border border-white/[0.26] bg-white/[0.05] text-[#f5f5f0] transition " +
  "hover:border-[#c6f135] hover:text-[#c6f135]";

// 主要按鈕（戰術布置/儲存這類最強調的操作），螢光綠底、深色文字。
const PRIMARY_BTN_CLASS = "rounded-lg bg-[#c6f135] text-[#0a0b07] transition hover:brightness-110";

export default function TacticsBoardPanel() {
  const { id: matchId } = useParams<{ id: string }>();
  // 全域畫面狀態（工具、選取、布置模式、undo 歷史）個別讀；per-match 資料
  //（目前情境名稱、正在編輯的戰術 id、各輪畫筆）從 dataByMatch[matchId] 讀（issue #119）。
  const {
    activeTool,
    setActiveTool,
    setSelectedObjectId,
    loadProject,
    importState,
    buildSnapshot,
    setProjectSituation,
    setActiveProjectId,
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
    setCourtView,
    enterTacticsLayout,
  } = useTacticsBoard();
  const tacticsData = useTacticsBoard((s) => (matchId ? s.dataByMatch[matchId] : undefined));
  const projectSituation = tacticsData?.projectSituation ?? "";
  const activeProjectId = tacticsData?.activeProjectId ?? null;
  const tacticsByRotation = tacticsData?.tacticsByRotation ?? EMPTY_TACTICS;
  const currentRotation = useRotationTable((state) =>
    matchId ? (state.dataByMatch[matchId]?.currentRotation ?? 0) : 0,
  );

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // ── API hooks ──
  // useListTactics：取得「這一場」的已儲存戰術（issue #119：帶 matchId 過濾，戰術庫 per-match，
  // 面板列表不再顯示別場的戰術）。matchId 是字串（URL 參數），後端要整數，轉一下。
  const { data: tactics = [] } = useListTactics(matchId ? { matchId: Number(matchId) } : undefined);

  // useCreateTactic：新增一筆戰術，成功後讓 list query 重新抓資料
  const createTactic = useCreateTactic({
    mutation: {
      onSuccess: (created) => {
        queryClient.invalidateQueries({ queryKey: getListTacticsQueryKey() });
        // 把伺服器回傳的 id 寫進「這一場」的分片，之後「儲存」才知道要覆寫哪筆
        if (matchId) setActiveProjectId(matchId, created.id);
        toast({ title: "戰術已儲存" });
        setLayoutMode(false);
        // 存完戰術後回到輪轉表——戰術布置的工作告一段落，畫面回到「誰站哪」的畫面。
        setCourtView("rotation");
      },
      onError: () => toast({ title: "儲存失敗", variant: "destructive" }),
    },
  });

  // useUpdateTactic：覆寫既有戰術
  const updateTactic = useUpdateTactic({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTacticsQueryKey() });
        toast({ title: "戰術已更新" });
        setLayoutMode(false);
        setCourtView("rotation");
      },
      onError: () => toast({ title: "更新失敗", variant: "destructive" }),
    },
  });

  // useDeleteTactic：刪除戰術
  const deleteTactic = useDeleteTactic({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTacticsQueryKey() });
      },
      onError: () => toast({ title: "刪除失敗", variant: "destructive" }),
    },
  });

  // useUpdateTactic 另一個實例，專門用來改名（跟存檔的 updateTactic 分開，避免 pending 狀態互相干擾）
  const renameTactic = useUpdateTactic({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTacticsQueryKey() });
        toast({ title: "已重新命名" });
      },
      onError: () => toast({ title: "改名失敗", variant: "destructive" }),
    },
  });

  // 改名 inline 編輯的暫存狀態：editingId 是正在被改名的那筆 id
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // 所有 hook 都在上面呼叫完了，這裡才 early return——這個面板只在 /matches/:id/board 底下
  // 渲染，matchId 實務上一定存在；抽出這個守衛後，下面所有 handler 都能把 matchId 當
  // string 用，不必每個呼叫點各自防呆。
  if (!matchId) return null;

  const handleTool = (tool: ToolType) => setActiveTool(tool);

  const toolBtnClass = (tool: ToolType) =>
    `rounded-lg border py-1.5 text-xs font-bold transition ${
      activeTool === tool
        ? "border-[#c6f135] bg-[#c6f135] text-[#0a0b07]"
        : "border-white/[0.26] bg-white/[0.05] text-[#f5f5f0] hover:border-[#c6f135] hover:text-[#c6f135]"
    }`;

  const handleDelete = () => {
    if (selectedObjectId) {
      removeMarker(matchId, selectedObjectId);
      removeDefenseRange(matchId, selectedObjectId);
    }
  };

  const situationLabel = projectSituation || "tactics";

  const handleExportPNG = () => {
    exportCourtAsPng("court-wrapper", `${situationLabel}_輪次${currentRotation + 1}`);
    toast({ title: "匯出成功", description: "PNG 下載中..." });
  };

  // 匯出 JSON：直接用 buildSnapshot() 組出完整資料，不再直接讀 localStorage 的原始字串——
  // 拆成兩個 store 之後，「目前狀態」分散在 volleyboard_rotationtable 跟
  // volleyboard_tacticsboard 兩把 localStorage key 裡，靠字串組合會很脆弱，
  // buildSnapshot() 已經知道怎麼把兩邊資料併成一份，直接重用最單純。
  const handleExportJSON = () => {
    exportStateAsJson(buildSnapshot(matchId), situationLabel);
    toast({ title: "匯出成功", description: "JSON 下載中..." });
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importStateFromJson(file);
      // importStateFromJson 現在誠實回傳 unknown（JSON 檔內容沒有驗證），這裡先用
      // 斷言相信它是 SavedTacticData——格式錯誤時 importState 內部讀不到欄位會拋錯，
      // 落到下面的 catch 顯示「匯入失敗」。之後若要更嚴謹，可以用 zod 在這裡驗證。
      importState(matchId, data as SavedTacticData);
      toast({ title: "匯入成功", description: "戰術板已更新" });
    } catch {
      toast({ title: "匯入失敗", description: "檔案格式錯誤", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 儲存：有 activeProjectId → 覆寫；沒有（草稿）→ 新建
  // SavedTacticData を Record<string, unknown> にキャストするのは、
  // codegen が additionalProperties:true から生成した NewTacticData の型要件を満たすため。
  // 実際には SavedTacticData をそのまま JSON として送る。
  const handleSave = () => {
    const data = buildSnapshot(matchId) as unknown as Record<string, unknown>;
    if (activeProjectId) {
      // 覆寫既有戰術：它已經歸屬某一場（matchId 欄早就寫好），這裡只更新 name/data。
      updateTactic.mutate({ tacticId: activeProjectId, data: { name: projectSituation, data } });
    } else {
      // 新建：把 matchId 一起送上去，戰術就歸屬到「這一場」（issue #119 戰術庫 per-match）。
      createTactic.mutate({ data: { name: projectSituation, data, matchId: Number(matchId) } });
    }
  };

  // 另存新檔：永遠建新的一筆，不管目前有沒有 activeProjectId——跟「儲存」的差別是
  // 「儲存」在已經有 activeProjectId 時會覆寫原本那筆，另存新檔則是複製一份新的。
  const handleSaveAs = () => {
    const data = buildSnapshot(matchId) as unknown as Record<string, unknown>;
    createTactic.mutate({ data: { name: projectSituation, data, matchId: Number(matchId) } });
  };

  // 取消：不呼叫存檔 API，直接放棄這次編輯、回到輪轉表——這次在球場上動的東西
  // （畫筆、移動的球員快照）不會被存進資料庫，但也不會特別復原，下次按「戰術布置」
  // 本來就會用輪轉表重新拍一張乾淨的照片蓋過去。
  const handleCancel = () => {
    setSelectedObjectId(null);
    setLayoutMode(false);
    setCourtView("rotation");
  };

  const currentRotState = tacticsByRotation[currentRotation];
  const selectedRange = currentRotState?.defenseRanges.find((dr) => dr.id === selectedObjectId);

  // 把已儲存戰術的名稱送 API 更新；名稱沒變或是空的就只關閉 input
  const handleRename = (t: (typeof tactics)[number]) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== t.name) {
      renameTactic.mutate({
        tacticId: t.id,
        data: { name: trimmed, data: t.data as unknown as Record<string, unknown> },
      });
    }
    setEditingId(null);
  };

  // 戰術列表區塊（非布置模式和布置模式都會用到，抽出來避免重複）
  const TacticsList = ({ maxHeight }: { maxHeight: string }) => (
    <div className="rounded-lg border border-white/[0.18] bg-white/[0.11] p-2 shadow-sm shadow-black/20 backdrop-blur-lg">
      <div className="mb-1 text-[10px] font-bold">已儲存 (點擊載入)</div>
      {tactics.length === 0 ? (
        <p className="py-1 text-[10px] text-[#a9b096]">尚無已儲存戰術</p>
      ) : (
        <div className="space-y-1 overflow-y-auto" style={{ maxHeight }}>
          {tactics.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-1 rounded p-1 text-[10px] ${t.id === activeProjectId ? "bg-[#c6f135]/20" : "hover:bg-white/[0.08]"}`}
            >
              {editingId === t.id ? (
                <input
                  autoFocus
                  className="flex-1 rounded border border-white/[0.26] bg-white/[0.05] px-1 text-[10px]
                    text-[#f5f5f0] outline-none focus:border-[#c6f135]"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleRename(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(t);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <span
                  className="flex-1 cursor-pointer truncate hover:underline"
                  onClick={() => {
                    loadProject(matchId, t.data as unknown as SavedTacticData, t.id, t.name);
                    toast({ title: "專案已載入" });
                  }}
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
                  deleteTactic.mutate({ tacticId: t.id });
                  if (t.id === activeProjectId) setActiveProjectId(matchId, null);
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

  return (
    <div className="flex h-full flex-col font-dash">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {!isLayoutMode ? (
          <>
            <section>
              <h2 className="mb-2 text-[15px] font-bold">戰術布置</h2>
              <p className="mb-2 text-[10px] text-[#a9b096]">
                「戰術布置」用輪轉表現在的站位重新編排一個戰術。想修改已儲存的戰術，先在下面清單點一個載入，「編輯」才會亮起。
              </p>
              <button
                onClick={() => enterTacticsLayout(matchId)}
                className={`w-full py-1.5 text-xs font-bold ${PRIMARY_BTN_CLASS}`}
                data-testid="button-enter-layout-mode"
              >
                戰術布置
              </button>
              <button
                onClick={() => {
                  setLayoutMode(true);
                  setCourtView("tactics");
                }}
                disabled={!activeProjectId}
                className={`mt-1.5 w-full py-1.5 text-xs font-bold disabled:opacity-40 ${SECONDARY_BTN_CLASS}`}
                data-testid="button-edit-current"
              >
                編輯
              </button>
            </section>
            <TacticsList maxHeight="160px" />
          </>
        ) : (
          <>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[15px] font-bold">戰術管理</h2>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${activeProjectId ? "bg-[#c6f135] text-[#0a0b07]" : "bg-white/[0.08] text-[#a9b096]"}`}
                >
                  {activeProjectId ? "正在編輯" : "草稿"}
                </span>
              </div>
              <input
                className="w-full rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1.5
                  text-xs text-[#f5f5f0] outline-none focus:border-[#c6f135] focus:ring-1
                  focus:ring-[#c6f135]"
                placeholder="戰術名稱（如：接發11號強發）"
                value={projectSituation}
                onChange={(e) => setProjectSituation(matchId, e.target.value)}
                data-testid="input-project-situation"
              />
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[15px] font-bold">畫筆工具</h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => undo(matchId)}
                    disabled={historyIndex <= 0}
                    className={`px-2 py-1 text-xs disabled:opacity-50 ${SECONDARY_BTN_CLASS}`}
                    title="Undo (Ctrl+Z)"
                  >
                    ↩
                  </button>
                  <button
                    onClick={() => redo(matchId)}
                    disabled={historyIndex >= history.length - 1}
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
                        updateDefenseRange(matchId, selectedRange.id, {
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
                          onClick={() =>
                            updateDefenseRange(matchId, selectedRange.id, { color: c })
                          }
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
                          updateDefenseRange(matchId, selectedRange.id, {
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
                            updateDefenseRange(matchId, selectedRange.id, {
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
                            updateDefenseRange(matchId, selectedRange.id, {
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
                            updateDefenseRange(matchId, selectedRange.id, {
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
                            updateDefenseRange(matchId, selectedRange.id, {
                              radius: parseInt(e.target.value),
                            })
                          }
                          className="w-full accent-[#c6f135]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-[#a9b096]">
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
                            updateDefenseRange(matchId, selectedRange.id, {
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
                            updateDefenseRange(matchId, selectedRange.id, {
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
              <TacticsList maxHeight="80px" />
            </section>

            {/* 布置模式底端：取消 / 儲存 / 另存新檔 */}
            <section>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={handleCancel}
                  className={`py-1.5 text-xs font-bold ${SECONDARY_BTN_CLASS}`}
                  data-testid="button-cancel-layout"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={createTactic.isPending || updateTactic.isPending}
                  className={`py-1.5 text-xs font-bold disabled:opacity-50 ${PRIMARY_BTN_CLASS}`}
                  data-testid="button-finish-layout"
                >
                  儲存
                </button>
                <button
                  onClick={handleSaveAs}
                  disabled={createTactic.isPending}
                  className={`py-1.5 text-xs font-bold disabled:opacity-50 ${SECONDARY_BTN_CLASS}`}
                  data-testid="button-save-as-layout"
                >
                  另存新檔
                </button>
              </div>
            </section>
          </>
        )}
      </div>

      <div className="border-t border-white/[0.12] p-3">
        <h2 className="mb-2 text-[15px] font-bold">分享匯出</h2>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={handleExportPNG}
            className={`py-1.5 text-xs font-bold ${SECONDARY_BTN_CLASS}`}
            data-testid="button-export-png"
          >
            匯出 PNG
          </button>
          <button
            onClick={handleExportJSON}
            className={`py-1.5 text-xs font-bold ${SECONDARY_BTN_CLASS}`}
            data-testid="button-export-json"
          >
            匯出 JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`py-1.5 text-xs font-bold ${SECONDARY_BTN_CLASS}`}
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
