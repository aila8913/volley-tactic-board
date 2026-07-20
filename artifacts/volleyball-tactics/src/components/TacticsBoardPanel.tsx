import React, { useRef, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Tactic,
  useListTactics,
  useCreateTactic,
  useUpdateTactic,
  useDeleteTactic,
  getListTacticsQueryKey,
} from "@workspace/api-client-react";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { useRotationTable } from "../hooks/useRotationTable";
import { exportCourtAsPng, exportStateAsJson, importStateFromJson } from "../lib/exportUtils";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import TacticsBrowsePanel from "./TacticsBrowsePanel";
import TacticsViewingPanel from "./TacticsViewingPanel";
import TacticsEditPanel from "./TacticsEditPanel";
import NewTacticDialog from "./NewTacticDialog";
import { SECONDARY_BTN_CLASS } from "../lib/tacticsBoardStyles";

// 未存內容捨棄前的確認訊息（issue #154 PR C）：白板單向化後，唯一還會「弄丟東西」的動作
// 就是捨棄一個編到一半、還沒存的 session——所以確認彈窗集中留在這裡（取代舊的載入覆蓋確認）。
const DISCARD_MSG = "未儲存的戰術內容將會捨棄，確定嗎？";

// ── issue #160 C2：戰術頁狀態機 + 面板拆檔 ──
//
// 這個檔案原本 724 行、把「戰術庫瀏覽」「唯讀檢視已存戰術」「布置編輯中」三種完全不同的
// 畫面塞在同一支元件裡，用巢狀三元運算子切換，越改越難讀。現在拆成「薄殼 + 三張模式面板」：
//
//   - 畫面「模式」由 store 現有的兩個欄位**推導**出來，不新增任何 store 欄位（沒有 arrange
//     phase 這種中間狀態——輸入一張快照、開始編輯，這件事本身就是 startSession 一次做完，
//     不需要另外一個「排列中」的過渡態）：
//       session   !== null            → edit（正在編輯一個 session）
//       viewingScene !== null（且無 session）→ viewing（唯讀看一張已存戰術）
//       兩者皆 null                    → browse（戰術庫瀏覽）
//   - 這支殼（TacticsBoardPanel）繼續擁有所有跟後端互動的 React Query mutation（存/改名/
//     刪除/建立），因為這些動作橫跨好幾個模式面板共用（例如已存戰術清單在 browse 跟 edit
//     模式都會出現）；三張模式面板（TacticsBrowsePanel / TacticsViewingPanel /
//     TacticsEditPanel）都是「純消費 props」的展示元件，不自己掛 mutation。
export default function TacticsBoardPanel() {
  const { id: matchId } = useParams<{ id: string }>();
  // 每個欄位各自用 selector 訂閱，而不是 `const { ... } = useTacticsBoard()` 一次解構整包。
  // 差別在於：不帶 selector 呼叫等於訂閱「store 的任何變化」——使用者每畫一筆線、每拖一次
  // 球員，這個殼元件都會跟著重繪一次，即使它根本沒用到那些欄位。帶 selector 則只有選中的
  // 那個欄位真的變了才重繪。（拆檔前這裡是整包解構，順手一起改掉。）
  const session = useTacticsBoard((s) => s.session);
  const viewingScene = useTacticsBoard((s) => s.viewingScene);
  const viewingTacticName = useTacticsBoard((s) => s.viewingTacticName);
  const enterEditFromViewing = useTacticsBoard((s) => s.enterEditFromViewing);
  const setCourtView = useTacticsBoard((s) => s.setCourtView);
  const loadProject = useTacticsBoard((s) => s.loadProject);
  const importState = useTacticsBoard((s) => s.importState);
  const buildSavedTactic = useTacticsBoard((s) => s.buildSavedTactic);
  const discardSession = useTacticsBoard((s) => s.discardSession);

  // 「有未存內容」判準：session 一開始就種了一格起始歷史（history[0]），只要使用者動過任何
  // 東西就會 push 成第 1 格以後，所以 length > 1 剛好等於「編過、還沒存」——切走前要先確認。
  const isDirty = session !== null && session.history.length > 1;

  // 三選一模式：見上面「戰術頁狀態機」的說明，純粹用 session / viewingScene 兩個既有欄位推導。
  const mode: "browse" | "viewing" | "edit" = session
    ? "edit"
    : viewingScene
      ? "viewing"
      : "browse";

  const currentRotation = useRotationTable((state) =>
    matchId ? (state.dataByMatch[matchId]?.currentRotation ?? 0) : 0,
  );

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [newTacticDialogOpen, setNewTacticDialogOpen] = useState(false);

  // ── API hooks ──
  // useListTactics：取得「這一場」的已儲存戰術（issue #119：帶 matchId 過濾，戰術庫 per-match，
  // 面板列表不再顯示別場的戰術）。matchId 是字串（URL 參數），後端要整數，轉一下。
  const { data: tactics = [] } = useListTactics(matchId ? { matchId: Number(matchId) } : undefined);

  const createTactic = useCreateTactic({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTacticsQueryKey() });
        toast({ title: "戰術已儲存" });
        // 存完就結束 session（內容已進資料庫），畫面回到瀏覽——白板是暫時工具，用完即丟。
        discardSession();
      },
      onError: () => toast({ title: "儲存失敗", variant: "destructive" }),
    },
  });

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

  const deleteTactic = useDeleteTactic({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTacticsQueryKey() });
      },
      onError: () => toast({ title: "刪除失敗", variant: "destructive" }),
    },
  });

  // 另一個 useUpdateTactic 實例，專門用來改名（跟存檔的 updateTactic 分開，避免 pending 狀態互相干擾）
  const renameTactic = useUpdateTactic({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTacticsQueryKey() });
        toast({ title: "已重新命名" });
      },
      onError: () => toast({ title: "改名失敗", variant: "destructive" }),
    },
  });

  // 所有 hook 都在上面呼叫完了，這裡才 early return——這個面板只在 /matches/:id/board 底下
  // 渲染，matchId 實務上一定存在；抽出這個守衛後，下面所有 handler 都能把 matchId 當
  // string 用，不必每個呼叫點各自防呆。
  if (!matchId) return null;

  const situationLabel = session?.name || "tactics";

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

  // 點清單裡的一筆已存戰術＝切到唯讀檢視這張快照（browse/edit 模式共用同一顆 TacticsList，
  // 所以這顆 handler 也共用）。若正在編一個沒存的 session，會被清掉，先確認。
  const handleSelectTactic = (t: Tactic) => {
    if (isDirty && !window.confirm(DISCARD_MSG)) return;
    // loadProject 走 parseSavedTactic（zod 驗證），格式無法辨識會 throw，包起來給使用者
    // 明確提示，而不是整個畫面炸掉。
    try {
      loadProject(t.data, t.id, t.name);
      toast({ title: "已載入（唯讀檢視），按「編輯」可修改" });
    } catch {
      toast({ title: "載入失敗", description: "戰術格式無法辨識", variant: "destructive" });
    }
  };

  const handleRenameTactic = (t: Tactic, name: string) => {
    renameTactic.mutate({
      tacticId: t.id,
      data: { name, data: t.data as unknown as Record<string, unknown> },
    });
  };

  const handleDeleteTactic = (tacticId: string) => {
    deleteTactic.mutate({ tacticId });
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

  // 取消：放棄這次編輯、回到瀏覽。有未存內容先確認（唯一還會弄丟東西的動作）。
  const handleCancel = () => {
    if (isDirty && !window.confirm(DISCARD_MSG)) return;
    discardSession();
  };

  return (
    <div className="flex h-full flex-col font-dash">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {mode === "browse" && (
          <TacticsBrowsePanel
            tactics={tactics}
            onOpenNewTacticDialog={() => setNewTacticDialogOpen(true)}
            onSelectTactic={handleSelectTactic}
            onRenameTactic={handleRenameTactic}
            onDeleteTactic={handleDeleteTactic}
          />
        )}
        {mode === "viewing" && (
          <TacticsViewingPanel
            viewingTacticName={viewingTacticName}
            onEdit={enterEditFromViewing}
            // setCourtView("rotation") 本來就會順手清掉 viewingScene/viewingTacticId/
            // viewingTacticName（見 useTacticsBoard.ts），不用另外加一個 store 動作。
            onBackToBrowse={() => setCourtView("rotation")}
          />
        )}
        {mode === "edit" && (
          <TacticsEditPanel
            matchId={matchId}
            tactics={tactics}
            onSelectTactic={handleSelectTactic}
            onRenameTactic={handleRenameTactic}
            onDeleteTactic={handleDeleteTactic}
            onCancel={handleCancel}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            saving={createTactic.isPending || updateTactic.isPending}
            savingAs={createTactic.isPending}
          />
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

      <NewTacticDialog
        open={newTacticDialogOpen}
        onOpenChange={setNewTacticDialogOpen}
        matchId={matchId}
      />
      <Toaster />
    </div>
  );
}
