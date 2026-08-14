import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { useRotationTable } from "../hooks/useRotationTable";
import { useToast } from "@/hooks/use-toast";
import { exportCourtAsPng, exportStateAsJson, importStateFromJson } from "../lib/exportUtils";
import NavSaveIcon from "./icons/NavSaveIcon";

// 「出」（匯出／匯入）搬回戰術板頁本身（issue #372 範圍第 3 點）。
//
// 這三個動作原本住在左欄 NavRail 的「出」子選單。NavRail 改版（#372）把左欄整組拆成固定
// 四個目的地連結（見 NavRail.tsx 開頭的說明），子選單跟著整組拆掉——但匯出／匯入的功能
// 本身沒有被砍，只是「原本掛在一個到處都連得到、卻只有一頁真的能用的入口上」，這件事本身
// 才是該修的問題：匯出 PNG 抓的是 DOM 裡 id="court-wrapper" 的球場元素，離開戰術板頁根本
// 沒有東西可以截圖；NavRail 舊版只好靠「有沒有 matchId」硬做一套停用邏輯（沒選比賽就整組
// 灰掉、點下去彈「先選一場比賽」的 toast），本質上是在假裝「出」是個全站入口，卻要另外
// 花力氣掩飾「其實只有一頁能用」這件事。這裡把它搬回它唯一誠實的位置：戰術板頁球場正上方
// 的 header。
//
// handler 邏輯（判斷式、動作內容）整段沿用舊版 NavRail.tsx 的
// handleExportPNG／handleExportJSON／handleImportJSON（搬家前的版本可以用
// `git show <搬家前的 commit>:artifacts/volleyball-tactics/src/components/NavRail.tsx` 找到，
// 那邊的長註解也解釋了「為什麼 PNG 認 DOM、JSON 走 store」這個分工，這裡不重複抄一次），
// 只改了兩件事：
//   1. matchId 從 NavRail 讀 hook 參數改成這裡的 prop，由 TacticsBoard.tsx 算好傳進來
//      （#372 part 1 之後戰術板可以不綁比賽，matchId 可能是 null）。
//   2. handleExportPNG 拿掉了「請先開啟戰術板」的守衛 toast。那句提示是「這其實是個假的
//      全站入口」的症狀——因為 NavRail 到處都連得到，才需要在真的按下去時再補一句「其實
//      你要先去戰術板頁」；現在這顆按鈕只會出現在戰術板頁本身，這個前提永遠成立，守衛
//      變成恆真的防呆，留著只會讓使用者疑惑「我明明就在戰術板頁，為什麼還跳這句」。
//      「DOM 元素真的不存在」這一層防呆沒有不見，改用 exportUtils.ts 的 exportCourtAsPng
//      自己那句 `if (!el) return;`（找不到就靜靜跳過，不丟例外、不彈誤導使用者的提示）。
interface TacticsExportMenuProps {
  matchId: string | null;
}

export default function TacticsExportMenu({ matchId }: TacticsExportMenuProps) {
  const { toast } = useToast();
  const session = useTacticsBoard((s) => s.session);
  const buildSavedTactic = useTacticsBoard((s) => s.buildSavedTactic);
  const importState = useTacticsBoard((s) => s.importState);

  // 下拉開關：純粹這顆按鈕自己的暫時 UI 狀態，跟 TacticsEditToolRail.tsx 的 rosterOpen
  // 同一種考量——只有這個元件自己在乎「現在開著還是關著」，不需要進 Zustand store。
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const situationLabel = session?.name || "tactics";

  const handleExportPNG = () => {
    // 檔名的輪次後綴：舊版無條件讀 `dataByMatch[matchId ?? ""]?.currentRotation ?? 0`，
    // 沒有比賽時會落到 `?? 0`、印出「輪次1」——但空板根本沒有輪轉表這個概念，那句話是
    // 憑空生出一個看起來像真數字的假資訊。這裡改成沒有比賽就直接不帶輪次後綴，檔名誠實
    // 反映「這張圖沒有輪次可言」，而不是編一個。
    const rotation = matchId
      ? (useRotationTable.getState().dataByMatch[matchId]?.currentRotation ?? 0)
      : null;
    const fileName = rotation !== null ? `${situationLabel}_輪次${rotation + 1}` : situationLabel;
    exportCourtAsPng("court-wrapper", fileName);
    toast({ title: "匯出成功", description: "PNG 下載中..." });
    setMenuOpen(false);
  };

  const handleExportJSON = () => {
    exportStateAsJson(buildSavedTactic(), situationLabel);
    toast({ title: "匯出成功", description: "JSON 下載中..." });
    setMenuOpen(false);
  };

  const handleImportJSON = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importStateFromJson(file);
      importState(data);
      toast({ title: "匯入成功", description: "戰術板已更新（唯讀檢視）" });
    } catch {
      toast({ title: "匯入失敗", description: "檔案格式錯誤", variant: "destructive" });
    }
    // 檔案 input 用完要清空 value，不然使用者連續兩次選「同一個檔案」時，瀏覽器認為
    // value 沒變不會觸發 onChange，第二次匯入就悄悄沒反應——跟舊版 NavRail 的處理一致。
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMenuOpen(false);
  };

  return (
    // 掛在 TacticsBoard.tsx header（relative）的右緣：absolute 定位不佔 flex 排版的空間，
    // 才不會把 header 原本「標題＋選單置中」的排版基準拉歪，見 TacticsBoard.tsx 掛載處的
    // 說明。
    <div className="absolute right-4 top-1/2 -translate-y-1/2">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        title="匯出／匯入"
        aria-label="匯出／匯入"
        aria-pressed={menuOpen}
        data-testid="button-tactics-export-menu"
        className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
          menuOpen
            ? "border-[#c6f135] text-[#c6f135]"
            : "border-white/[0.26] bg-white/[0.05] text-[#f5f5f0] hover:border-[#c6f135] hover:text-[#c6f135]"
        }`}
      >
        <NavSaveIcon className="size-4" />
      </button>

      {menuOpen && (
        <div
          data-testid="tactics-export-menu"
          className="absolute right-0 top-full z-40 mt-2 flex w-40 flex-col gap-1 rounded-xl
            border border-white/[0.14] bg-[#12140f]/97 p-2 shadow-2xl shadow-black/50
            backdrop-blur-lg"
        >
          <button
            type="button"
            onClick={handleExportPNG}
            data-testid="button-tactics-export-png"
            className="flex h-9 items-center rounded-lg px-2 text-left text-xs font-semibold
              text-[#f5f5f0]/80 transition hover:bg-white/[0.06]"
          >
            匯出 PNG
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            data-testid="button-tactics-export-json"
            className="flex h-9 items-center rounded-lg px-2 text-left text-xs font-semibold
              text-[#f5f5f0]/80 transition hover:bg-white/[0.06]"
          >
            匯出 JSON
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-tactics-import-json"
            className="flex h-9 items-center rounded-lg px-2 text-left text-xs font-semibold
              text-[#f5f5f0]/80 transition hover:bg-white/[0.06]"
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
      )}
    </div>
  );
}
