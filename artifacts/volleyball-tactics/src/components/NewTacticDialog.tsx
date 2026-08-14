import { useEffect } from "react";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { captureBlank } from "../lib/courtSnapshot";
import { SECONDARY_BTN_CLASS } from "../lib/tacticsBoardStyles";
import type { CourtSnapshot } from "../types/courtSnapshot";

// 「新增戰術」中央浮層——issue #177（layout-spec §6）：戰術板頁專用。左欄或瀏覽面板按
// 「+ 新增戰術」時，只蓋住中央球場那一欄，左右欄（NavRail／球員清單或戰術瀏覽面板）仍然
// 看得見——這跟已退役的 NewTacticDialogModal.tsx（#372 刪除；原本是其他頁面用的全螢幕
// Radix Dialog、走 Portal 蓋滿整個視窗）刻意不同：那個版本的呼叫端（NavRail）已經不存在了
// （左欄「戰」不再是子清單，是固定連結，見 NavRail.tsx 開頭的說明），這個中央浮層版本是
// 現在戰術板頁「+ 新增戰術」唯一的入口。
//
// 為什麼用「絕對定位、鋪滿呼叫端容器」而不是 Portal？因為這個元件現在固定被放進
// TacticsBoard.tsx 中央欄那個 `<div className="relative ...">` 容器內部（跟 <Court/>
// 同一層）。CSS 的 `position: absolute` 預設是相對「最近的 position 不是 static 的祖先」
// 定位，只要中央欄容器有 `relative`，這裡的 `absolute inset-0` 就會自然而然只鋪滿那個
// 容器，蓋不到外面的左欄／右欄——不需要額外算座標、也不需要 Portal 那種「掛到
// document.body、自己再處理層級」的機制。這正是 §6 要的「只蓋中央球場」效果的最簡單做法。
//
// 選了起點後怎麼進白板：兩個按鈕都呼叫 startSession(snapshot, { arranging: true })——
// 「重新佈陣」是全新的起點（capture by value，見 useTacticsBoard.ts 開頭的單向依賴說明），
// 「現有輪轉位」複製呼叫端指定的「現在站位」。arranging: true 讓 session 一開始就進佈陣
// 模式（mode D，見 useTacticsBoard.ts 的 WhiteboardSession.arranging 說明）——這是這個
// 浮層跟已退役的舊版全螢幕彈窗最大的行為差異：舊版開的 session 直接進編輯模式（C），
// 這裡刻意先停在佈陣模式，讓使用者先把人排上場，按「確定」才進工具軌。
//
// 為什麼「擷取目前站位」不再自己內部呼叫 useRotationTable.getState()，改成收一個
// captureCurrent 函式 prop？因為「現在站位」這個詞在不同頁面意思不一樣：戰術頁的「現在」
// 指輪轉表當下排的站位，計分頁的「現在」指計分表自己逐局凍結的先發快照（issue #115 把
// 這兩份資料的耦合切開、#154 又用 ESLint no-restricted-imports 把「戰術白板單向依賴」焊進
// CI）。這個浮層現在是新增戰術唯一的入口，沿用的仍然是「呼叫端注入擷取邏輯」這個介面
//（原本是為了跟已退役的全螢幕彈窗版本共用同一套心智模型，見上面的說明）。
//
// captureCurrent 故意設計成 required（沒有預設值）：逼呼叫端明確想清楚「我的現在站位從哪
// 來」，寫錯了 TypeScript 編譯期就會擋下來。
interface NewTacticDialogProps {
  open: boolean;
  onClose: () => void;
  // #372：空板（/board）沒有 matchId 可傳，這裡跟著放寬成 string | null——captureBlank
  // 本來就吃 matchId: string | null（見 lib/courtSnapshot.ts），沒有比賽時新建的戰術一律
  // 是「不屬於任何一場」的空快照，跟決策④「空板戰術庫只收全域戰術」是同一件事的兩面。
  matchId: string | null;
  // 使用者「真的選了一個起點」時呼叫，session 已經開好才觸發（例如讓呼叫端做導覽）。
  onStarted?: () => void;
  // 呼叫端提供「現在站位」的擷取邏輯：按下按鈕的當下呼叫一次，回傳一張純值快照，不是即時
  // 訂閱——才符合「擷取」（capture）的語意。
  captureCurrent: () => CourtSnapshot;
  // 「現有輪轉位」按鈕下方的說明文字，例如「將複製第 N 輪」——文字內容跟資料來源綁在一起，
  // 交給知道來源是什麼的呼叫端決定。
  captureLabel: string;
  // 擷取來源目前是否可用。可選、預設 false（可用）。
  captureDisabled?: boolean;
}

export default function NewTacticDialog({
  open,
  onClose,
  matchId,
  onStarted,
  captureCurrent,
  captureLabel,
  captureDisabled = false,
}: NewTacticDialogProps) {
  const startSession = useTacticsBoard((s) => s.startSession);

  // Esc 關閉：跟 Radix Dialog 內建的 Esc 行為對齊——這裡改成手刻的 div，不能再靠 Radix
  // 免費附贈這個行為，要自己補上。只在 open 時掛監聽，避免浮層關著時仍佔用一個全域事件。
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleCaptureCurrent = () => {
    const snapshot = captureCurrent();
    startSession(snapshot, { arranging: true });
    onStarted?.();
    onClose();
  };

  const handleBlank = () => {
    startSession(captureBlank({ matchId }), { arranging: true });
    onStarted?.();
    onClose();
  };

  return (
    // absolute inset-0：鋪滿呼叫端提供的（relative 定位的）中央欄容器，不會蓋到左右欄——
    // 見上面的說明。z-40 蓋過球場本身（Court 內部畫面元素多半是 z-10 以下），但仍在
    // TacticsEditToolRail「換球員」浮層之類 z-40 的層級之下，不衝突（這個浮層只會在
    // mode B 出現，跟 mode C 的工具軌浮層不會同時存在）。
    <div className="absolute inset-0 z-40 flex items-center justify-center">
      {/* 半透明遮罩：點擊視為取消，跟 Esc 同一個 onClose。 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        data-testid="new-tactic-overlay-backdrop"
      />
      {/* 置中卡片：沿用跟 NewTacticDialogModal 一致的深色玻璃風格 token。relative 讓它疊在
          遮罩之上（遮罩沒有 z-index，靠 DOM 順序：卡片在後面，天然疊上層）。 */}
      <div
        className="relative flex w-80 flex-col gap-3 rounded-xl border border-white/[0.18]
          bg-[#12140f] p-4 text-[#f5f5f0] shadow-2xl shadow-black/50"
        data-testid="new-tactic-overlay-card"
      >
        <div>
          <h2 className="text-sm font-bold text-[#f5f5f0]">新增戰術</h2>
          <p className="mt-1 text-xs text-[#a9b096]">選一個起點開始布置站位。</p>
        </div>
        {/* 兩顆並排選項鈕（issue #177：跟舊版直排不同，中央浮層版寬度有限，並排更省高度，
            也呼應「兩個平行選項」的視覺語意）。 */}
        <div className="flex gap-2">
          <button
            onClick={handleCaptureCurrent}
            disabled={captureDisabled}
            className={`flex-1 rounded-lg p-3 text-left text-xs font-bold ${SECONDARY_BTN_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
            data-testid="button-new-tactic-from-rotation"
          >
            現有輪轉位
            <div className="mt-1 text-micro font-normal text-[#a9b096]">{captureLabel}</div>
          </button>
          <button
            onClick={handleBlank}
            className={`flex-1 rounded-lg p-3 text-left text-xs font-bold ${SECONDARY_BTN_CLASS}`}
            data-testid="button-new-tactic-blank"
          >
            重新佈陣
            <div className="mt-1 text-micro font-normal text-[#a9b096]">直接拉球員上場</div>
          </button>
        </div>
      </div>
    </div>
  );
}
