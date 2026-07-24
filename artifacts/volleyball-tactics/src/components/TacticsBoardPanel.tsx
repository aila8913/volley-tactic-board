import { useState } from "react";
import { Tactic } from "@workspace/api-client-react";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { Toaster } from "@/components/ui/toaster";
import TacticsBrowsePanel from "./TacticsBrowsePanel";
import TacticsViewingPanel from "./TacticsViewingPanel";
import NewTacticDialog from "./NewTacticDialog";
import type { CourtSnapshot } from "../types/courtSnapshot";

// ── issue #160 C2：戰術頁狀態機 + 面板拆檔 ──
// ── issue #176（環 5）：edit 模式搬去右欄工具軌之後的瘦身 ──
//
// 這個檔案原本擁有全部三種模式（browse/viewing/edit）＋所有 React Query mutation。
// #176 把「戰術編輯」整個搬進 mode C 的 132px 工具軌（TacticsEditToolRail，見 AppShell.tsx
// 的 mode B/C 換欄說明）之後，這個殼只剩下 browse／viewing 兩種模式——TacticsBoard.tsx
// 現在只有 session === null（沒在編輯）時才會把這個元件塞進 aside 插槽，session 存在時
// AppShell 切去 mode C，aside 插槽整個不渲染，這個元件根本不會被 mount，所以不需要再處理
// 「edit」這個分支了（TacticsEditPanel 也已經沒有任何呼叫端在用）。
//
// mutation/handler 本身現在住在 hooks/useTacticsBoardController.ts，由 TacticsBoard.tsx
// 呼叫一次、透過 props 分別餵給這個殼跟工具軌——兩邊看到的 pending 狀態（saving/savingAs）
// 保證是同一份，不會出現「工具軌顯示存好了、aside 卻還在轉圈」這種不同步。這裡不再自己掛
// useCreateTactic 之類的 hook。
interface TacticsBoardPanelProps {
  matchId: string;
  tactics: Tactic[];
  onSelectTactic: (t: Tactic) => void;
  onRenameTactic: (t: Tactic, name: string) => void;
  onDeleteTactic: (id: string) => void;
  captureCurrentFromRotation: () => CourtSnapshot;
  currentRotation: number;
}

export default function TacticsBoardPanel({
  matchId,
  tactics,
  onSelectTactic,
  onRenameTactic,
  onDeleteTactic,
  captureCurrentFromRotation,
  currentRotation,
}: TacticsBoardPanelProps) {
  // 每個欄位各自用 selector 訂閱，理由見上面的說明搬遷前就有、原封不動保留：只有選中的
  // 那個欄位真的變了才重繪，不整包解構。
  const viewingScene = useTacticsBoard((s) => s.viewingScene);
  const viewingTacticName = useTacticsBoard((s) => s.viewingTacticName);
  const enterEditFromViewing = useTacticsBoard((s) => s.enterEditFromViewing);
  const setCourtView = useTacticsBoard((s) => s.setCourtView);

  // 兩選一模式：session 已經被排除在這個元件會出現的情境之外（見上面說明），所以只看
  // viewingScene 就夠分辨 browse／viewing，不用再檢查 session。
  const mode: "browse" | "viewing" = viewingScene ? "viewing" : "browse";

  const [newTacticDialogOpen, setNewTacticDialogOpen] = useState(false);

  return (
    <div className="flex h-full flex-col font-dash">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {mode === "browse" && (
          <TacticsBrowsePanel
            tactics={tactics}
            onOpenNewTacticDialog={() => setNewTacticDialogOpen(true)}
            onSelectTactic={onSelectTactic}
            onRenameTactic={onRenameTactic}
            onDeleteTactic={onDeleteTactic}
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
      </div>

      {/* issue #173：「分享匯出」這一整塊（PNG/JSON 匯出、JSON 匯入）已經搬到左欄 NavRail
          的「出」子清單，不再是戰術板專屬——理由見 NavRail.tsx 開頭的說明：匯出是全站行為，
          不該只藏在戰術板的編輯模式裡。這裡不用再留一份重複的按鈕。 */}

      <NewTacticDialog
        open={newTacticDialogOpen}
        onOpenChange={setNewTacticDialogOpen}
        matchId={matchId}
        captureCurrent={captureCurrentFromRotation}
        captureLabel={`將複製第 ${currentRotation + 1} 輪`}
      />
      <Toaster />
    </div>
  );
}
