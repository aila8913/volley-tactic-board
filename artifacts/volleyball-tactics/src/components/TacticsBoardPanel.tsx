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
import { captureFromRotation } from "../lib/courtSnapshot";
import { exportCourtAsPng, exportStateAsJson, importStateFromJson } from "../lib/exportUtils";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";

// 未存內容捨棄前的確認訊息（issue #154 PR C）：白板單向化後，唯一還會「弄丟東西」的動作
// 就是捨棄一個編到一半、還沒存的 session——所以確認彈窗集中搬到這裡（取代舊的載入覆蓋確認）。
const DISCARD_MSG = "未儲存的戰術內容將會捨棄，確定嗎？";

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
  // 戰術白板改成單景 session 後（issue #154 PR C）：正在編輯的名稱/serverId/畫筆/undo 歷史
  // 全都住在 session 這一個物件裡，用完即丟；沒有 session 就是「沒在編輯」（顯示戰術布置入口）。
  const {
    session,
    activeTool,
    setActiveTool,
    startSession,
    discardSession,
    enterEditFromViewing,
    setSessionName,
    loadProject,
    importState,
    buildSavedTactic,
    removeMarker,
    removeDefenseRange,
    selectedObjectId,
    updateDefenseRange,
    undo,
    redo,
    viewingScene,
    viewingTacticId,
  } = useTacticsBoard();
  // 有 session＝正在即時布置（取代舊的 isLayoutMode 常駐布林）。
  const isLayoutMode = session !== null;
  // 「有未存內容」判準：session 一開始就種了一格起始歷史（history[0]），只要使用者動過任何
  // 東西就會 push 成第 1 格以後，所以 length > 1 剛好等於「編過、還沒存」。
  const isDirty = session !== null && session.history.length > 1;
  const projectSituation = session?.name ?? "";
  // 清單高亮：正在編輯就看 session.serverId，正在唯讀檢視就看 viewingTacticId。
  const activeTacticId = session?.serverId ?? viewingTacticId;
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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTacticsQueryKey() });
        toast({ title: "戰術已儲存" });
        // 存完就結束 session（內容已進資料庫），畫面回到輪轉表——白板是暫時工具，用完即丟。
        discardSession();
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
        discardSession();
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
      removeMarker(selectedObjectId);
      removeDefenseRange(selectedObjectId);
    }
  };

  const situationLabel = projectSituation || "tactics";

  const handleExportPNG = () => {
    exportCourtAsPng("court-wrapper", `${situationLabel}_輪次${currentRotation + 1}`);
    toast({ title: "匯出成功", description: "PNG 下載中..." });
  };

  // 匯出 JSON：直接用 buildSavedTactic() 組出 v2 格式（單景快照）。白板單向化後，存檔/匯出
  // 的內容就是「當前 session 這一景」，不再需要回頭去併輪轉表兩份資料。
  const handleExportJSON = () => {
    exportStateAsJson(buildSavedTactic(), situationLabel);
    toast({ title: "匯出成功", description: "JSON 下載中..." });
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importStateFromJson(file);
      // importStateFromJson 回傳 unknown（JSON 檔內容沒驗證），直接交給 importState——
      // 它內部走 parseSavedTactic 用 zod 驗證，格式錯誤會拋錯、落到下面的 catch 顯示「匯入失敗」。
      importState(data);
      toast({ title: "匯入成功", description: "戰術板已更新（唯讀檢視）" });
    } catch {
      toast({ title: "匯入失敗", description: "檔案格式錯誤", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 進入戰術布置：在「元件層」讀輪轉表當下的站位 + 名單，用純函式 captureFromRotation 擷取成
  // 一張純值快照（capture by value）再傳進 startSession——store 自己完全不碰輪轉表，單向性靠這
  // 條邊界保證（見 useTacticsBoard.ts 的說明）。編到一半按這顆會重新擷取，先確認捨棄。
  const handleEnterLayout = () => {
    if (isDirty && !window.confirm(DISCARD_MSG)) return;
    const rt = useRotationTable.getState().dataByMatch[matchId];
    const r = rt?.currentRotation ?? 0;
    const positions = rt?.rotations[r]?.positions ?? [];
    const roster = rt?.roster ?? [];
    const snapshot = captureFromRotation(positions, roster, { matchId, rotation: r });
    startSession(snapshot);
  };

  // 儲存：session 有 serverId → 覆寫那一筆；沒有（草稿）→ 新建。buildSavedTactic() 回傳 v2 物件，
  // cast 成 Record<string, unknown> 是為了滿足 codegen 從 additionalProperties:true 生成的
  // NewTacticData 型別要求（實際就是把整包當 JSON 送）。
  const handleSave = () => {
    if (!session) return;
    const data = buildSavedTactic() as unknown as Record<string, unknown>;
    if (session.serverId) {
      updateTactic.mutate({ tacticId: session.serverId, data: { name: session.name, data } });
    } else {
      createTactic.mutate({ data: { name: session.name, data, matchId: Number(matchId) } });
    }
  };

  // 另存新檔：永遠建新的一筆，不管 session 有沒有 serverId——跟「儲存」的差別是「儲存」在
  // 有 serverId 時會覆寫原本那筆，另存新檔則是複製一份新的。
  const handleSaveAs = () => {
    if (!session) return;
    const data = buildSavedTactic() as unknown as Record<string, unknown>;
    createTactic.mutate({ data: { name: session.name, data, matchId: Number(matchId) } });
  };

  // 取消：放棄這次編輯、回到輪轉表。有未存內容先確認（唯一還會弄丟東西的動作）。
  const handleCancel = () => {
    if (isDirty && !window.confirm(DISCARD_MSG)) return;
    discardSession();
  };

  const selectedRange = session?.defenseRanges.find((dr) => dr.id === selectedObjectId);

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
              className={`flex items-center gap-1 rounded p-1 text-[10px] ${t.id === activeTacticId ? "bg-[#c6f135]/20" : "hover:bg-white/[0.08]"}`}
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
                    // 點清單＝切到唯讀檢視這張快照。若正在編一個沒存的 session，會被清掉，先確認。
                    if (isDirty && !window.confirm(DISCARD_MSG)) return;
                    // loadProject 現在走 parseSavedTactic（zod 驗證），格式無法辨識會 throw，
                    // 包起來給使用者明確提示，而不是整個畫面炸掉。
                    try {
                      loadProject(t.data, t.id, t.name);
                      toast({ title: "已載入（唯讀檢視），按「編輯」可修改" });
                    } catch {
                      toast({
                        title: "載入失敗",
                        description: "戰術格式無法辨識",
                        variant: "destructive",
                      });
                    }
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
                「戰術布置」用輪轉表現在的站位擷取一張快照、疊在白板上編排一個戰術。點下面清單的已儲存戰術是「唯讀檢視」（看一張凍結的照片），按下方「編輯」才進可修改模式。
              </p>
              <button
                onClick={handleEnterLayout}
                className={`w-full py-1.5 text-xs font-bold ${PRIMARY_BTN_CLASS}`}
                data-testid="button-enter-layout-mode"
              >
                戰術布置
              </button>
              <button
                onClick={enterEditFromViewing}
                disabled={!viewingScene}
                title={viewingScene ? "編輯這張已存戰術" : "先從下方清單點一張已存戰術檢視"}
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
