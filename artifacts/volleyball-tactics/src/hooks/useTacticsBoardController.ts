import { useQueryClient } from "@tanstack/react-query";
import {
  Tactic,
  useListTactics,
  useCreateTactic,
  useUpdateTactic,
  useDeleteTactic,
  getListTacticsQueryKey,
} from "@workspace/api-client-react";
import { useTacticsBoard, isSessionDirty, DISCARD_MSG } from "./useTacticsBoard";
import { useRotationTable } from "./useRotationTable";
import { captureFromRotation } from "../lib/courtSnapshot";
import { deriveRotation } from "../lib/rotationLogic";
import { useToast } from "@/hooks/use-toast";
import type { CourtSnapshot } from "../types/courtSnapshot";

// issue #176（layout-spec 環 5）：把 TacticsBoardPanel 原本自己掛的「所有跟後端互動的
// mutation ＋ 相關 handler」抽成一支獨立的 hook。
//
// 為什麼要抽出來、不繼續放在 TacticsBoardPanel 裡？因為進入 mode C（編輯中）之後，
// AppShell 的右欄插槽會從 aside 換成 tools（見 AppShell.tsx 的 MODES 查表），
// TacticsBoardPanel（aside 的內容）根本不會被渲染——但新的 tools 插槽內容
//（TacticsEditToolRail，132px 工具軌）仍然需要「儲存／另存／取消」這幾顆按鈕，也需要
// 背後那些 React Query mutation。如果 mutation 繼續關在 TacticsBoardPanel 元件內部，
// 工具軌就完全拿不到——兩個元件各自重新掛一份 useCreateTactic/useUpdateTactic 又會有
// 「兩份 mutation 各自的 pending 狀態不同步」的問題（例如工具軌顯示「儲存中」轉圈轉完了，
// aside 那份的 pending 卻還沒歸零，或反過來）。
//
// 所以把「跟後端互動」這件事收斂成一支 hook，TacticsBoard.tsx（頁面殼）只呼叫一次，
// 拿到同一份 mutation/handler，分別傳給 aside 的 TacticsBoardPanel（browse/viewing 用）
// 跟 tools 的 TacticsEditToolRail（edit 用）——兩邊看到的 pending 狀態永遠是同一份。
//
// matchId 故意設計成參數（不在 hook 內部自己 useParams）：呼叫端 TacticsBoard.tsx 本來就
// 已經從網址解出 id 了，讓這個 hook 收同一個值當參數，可以避免兩邊各自解析網址、又要擔心
// 兩邊解出來的值萬一哪天邏輯改了會對不上。
export function useTacticsBoardController(matchId: string | undefined) {
  // 各自用 selector 訂閱，不整包解構——理由跟 TacticsBoardPanel.tsx 開頭的說明一樣：
  // 只有真的用到的欄位變動時才重繪，讀者是誰、要注意什麼都寫在那份註解裡了，不重複贅述。
  const session = useTacticsBoard((s) => s.session);
  const buildSavedTactic = useTacticsBoard((s) => s.buildSavedTactic);
  const loadProject = useTacticsBoard((s) => s.loadProject);
  const discardSession = useTacticsBoard((s) => s.discardSession);

  // 「有沒有未存內容」的判準跟捨棄前的確認訊息集中在 useTacticsBoard.ts（isSessionDirty/
  // DISCARD_MSG），這裡只是眾多使用者之一。
  const isDirty = isSessionDirty(session);

  // 「新增戰術」彈窗要顯示「將複製第 N 輪」，這個數字讀輪轉表當下輪次——只讀值，
  // 不寫回，符合 #154 單向依賴防線（見 lib/captureCurrentRotation.ts 開頭的說明）。
  const currentRotation = useRotationTable((state) =>
    matchId ? (state.dataByMatch[matchId]?.currentRotation ?? 0) : 0,
  );

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 這一場已儲存的戰術清單（issue #119：per-match，帶 matchId 過濾）。
  //
  // #372 決策④：沒有 matchId（空板 /board）不能解讀成「不過濾」。ListTacticsParams 沒帶任何
  // 條件時，後端會把資料庫裡每一場比賽的戰術全部倒出來——那正是 #119 當初要修的「跨場汙染」，
  // 只是換了個觸發方式（以前是「切場忘了清」，現在會是「壓根沒有場可以當過濾條件」）。所以空板
  // 改帶 `{ scope: "global" }`：後端只回 matchId IS NULL 的戰術（見 tactics.ts route），空板的
  // 戰術庫就只會看到「刻意存成全域」的那些，不會混進別場的戰術。
  const { data: tactics = [] } = useListTactics(
    matchId ? { matchId: Number(matchId) } : { scope: "global" },
  );

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

  // 另一個 useUpdateTactic 實例，專門用來改名（跟存檔的 updateTactic 分開，避免 pending
  // 狀態互相干擾——改名跟存檔理論上不會同時發生，但分開實例比較不會日後有人接錯）。
  const renameTactic = useUpdateTactic({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTacticsQueryKey() });
        toast({ title: "已重新命名" });
      },
      onError: () => toast({ title: "改名失敗", variant: "destructive" }),
    },
  });

  // 點清單裡一筆已存戰術＝切到唯讀檢視這張快照。若正在編一個沒存的 session，先確認要不要
  // 捨棄（browse/edit 兩種呼叫端共用同一顆邏輯）。
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

  // 「新增戰術」彈窗的擷取來源：戰術頁的「現在站位」＝輪轉表當下排的站位。這裡讀
  // getState() 而不是 hook 訂閱值——要的是「按下去那一刻」的快照，不該隨輪轉表變動
  // 重新執行（那樣就不是「擷取」，是「即時綁定」）。
  const captureCurrentFromRotation = (): CourtSnapshot => {
    const rt = useRotationTable.getState().dataByMatch[matchId ?? ""];
    const r = rt?.currentRotation ?? 0;
    // 這一輪的座標改用 deriveRotation 現算（#231 PR3：store 不再存六輪座標）。
    const positions = rt
      ? deriveRotation(rt.lineup, rt.startingLiberoId, rt.liberoReplacesPlayerId, r).positions
      : [];
    const roster = rt?.roster ?? [];
    return captureFromRotation(positions, roster, { matchId: matchId ?? "", rotation: r });
  };

  // #372 決策⑤：新建一筆戰術（不是覆寫）時，如果畫面上目前有選一場比賽，要先問一次「掛在
  // 這場，還是存成全域戰術」——因為「新建」是唯一一個「這筆戰術以後要不要被這一場的清單
  // 篩到」還沒有答案的時刻，之後不會再問。
  //   - 目前沒有選比賽（空板）：沒有「這場」可以選，直接存成全域（matchId: null），不問。
  //   - 目前有選比賽：跳 confirm。「確定」＝掛在這場（回傳這場的整數 id，之後只在這場的
  //     戰術庫看得到，等於延續 #119 之前的行為）；「取消」＝存成全域（回傳 null，空板的
  //     戰術庫看得到）。
  // NewTactic.matchId 的型別是 `number | null | undefined`（見 lib/api-client-react 產生的
  // api.schemas.ts），後端把 null 當「這筆是全域戰術」——不是「沒填」，所以這裡明確送 null
  // 而不是省略欄位。
  const decideAttachedMatchId = (): number | null => {
    if (!matchId) return null;
    const attach = window.confirm(
      "要把這份戰術掛在這場比賽底下嗎？\n\n確定＝掛在這場（只在這場的戰術庫看得到）\n取消＝存成全域戰術（在空板的戰術庫看得到）",
    );
    return attach ? Number(matchId) : null;
  };

  // 儲存：session 有 serverId → 覆寫那一筆；沒有（草稿）→ 新建。buildSavedTactic() 回傳 v2
  // 物件，cast 成 Record<string, unknown> 是為了滿足 codegen 從 additionalProperties:true
  // 生成的 NewTacticData 型別要求（實際就是把整包當 JSON 送）。
  //
  // 原本這裡多擋一個 `!matchId`：沒選比賽時「儲存」鈕按下去會直接 return，畫面上看起來像
  // 沒反應——但那不是刻意設計成「空板不能存」，只是戰術板過去從沒有「沒有比賽」這個狀態，
  // 這道 guard 只是從來沒被檢討過的舊殘留。#372 拿掉它之後，空板也能存（覆寫沿用原本的
  // matchId 歸屬不變；新建則走上面的 decideAttachedMatchId）。
  const handleSave = () => {
    if (!session) return;
    const data = buildSavedTactic() as unknown as Record<string, unknown>;
    if (session.serverId) {
      // 覆寫既有戰術：這裡完全不會問歸屬（也不會呼叫 decideAttachedMatchId）——歸屬只在
      // 「新建」那一刻決定過一次，UpdateTactic 沒有帶 matchId 欄位，後端自然維持原本存的
      // 那個歸屬。這是程式現有形狀白送的效果：PO 要的「確定後就不再問」根本不用另外寫判斷，
      // 覆寫這條路本來就摸不到 matchId 欄位。
      updateTactic.mutate({ tacticId: session.serverId, data: { name: session.name, data } });
    } else {
      createTactic.mutate({
        data: { name: session.name, data, matchId: decideAttachedMatchId() },
      });
    }
  };

  // 另存新檔：永遠建新的一筆，不管 session 有沒有 serverId——跟「儲存」的差別是「儲存」在
  // 有 serverId 時會覆寫原本那筆，另存新檔則是複製一份新的。因為一定是新建，一樣要走
  // decideAttachedMatchId 問一次歸屬。
  const handleSaveAs = () => {
    if (!session) return;
    const data = buildSavedTactic() as unknown as Record<string, unknown>;
    createTactic.mutate({ data: { name: session.name, data, matchId: decideAttachedMatchId() } });
  };

  // 取消：放棄這次編輯、回到瀏覽。有未存內容先確認（唯一還會弄丟東西的動作）。
  const handleCancel = () => {
    if (isDirty && !window.confirm(DISCARD_MSG)) return;
    discardSession();
  };

  return {
    tactics,
    isDirty,
    currentRotation,
    handleSelectTactic,
    handleRenameTactic,
    handleDeleteTactic,
    handleSave,
    handleSaveAs,
    handleCancel,
    captureCurrentFromRotation,
    // 兩個獨立的 pending 旗標：saving 涵蓋「儲存」（可能是 create 或 update 其中一個在跑），
    // savingAs 只看 create（另存新檔一定是 create）。跟原本 TacticsBoardPanel 的邏輯一致。
    saving: createTactic.isPending || updateTactic.isPending,
    savingAs: createTactic.isPending,
  };
}
