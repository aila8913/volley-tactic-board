import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { captureBlank } from "../lib/courtSnapshot";
import { SECONDARY_BTN_CLASS } from "../lib/tacticsBoardStyles";
import type { CourtSnapshot } from "../types/courtSnapshot";

// 「新增戰術」彈窗——issue #160 C2 開的、C3 改過擷取來源注入方式。browse 模式（或計分頁的
// 戰術選單）按「新增戰術」開這個彈窗，選一個起點：
//   1. 擷取目前站位：複製呼叫端指定的「現在站位」當起點。
//   2. 空站位：完全空白的球場，球員全部從右側名單面板自己拖上去。
//
// 為什麼「擷取目前站位」不再自己內部呼叫 useRotationTable.getState()，改成收一個
// captureCurrent 函式 prop？因為「現在站位」這個詞在不同頁面意思不一樣：戰術頁的「現在」
// 指輪轉表當下排的站位，計分頁的「現在」指計分表自己逐局凍結的先發快照（issue #115 把
// 這兩份資料的耦合切開、#154 又用 ESLint no-restricted-imports 把「戰術白板單向依賴」焊進
// CI）。如果這個彈窗寫死呼叫 useRotationTable，未來計分頁想開同一個彈窗時，要嘛得引入
// useRotationTable（違反單向依賴、讀到錯的資料——計分頁的站位真相在 activeLineup，不在
// 輪轉表），要嘛得複製一份幾乎一樣的彈窗。所以把「怎麼查現在站位」整段挪到呼叫端決定，
// 這個彈窗只管「拿到 snapshot 之後怎麼開 session」，不管 snapshot 從哪來。
//
// captureCurrent 故意設計成 required（沒有預設值）：如果給一個預設值（例如預設走輪轉表），
// 未來新的呼叫端很容易偷懶不傳、不小心繼承到「讀輪轉表」這個對計分頁來說是錯的行為——
// 這正是 #115/#154 想根除的耦合。required prop 逼每個呼叫端都得明確想清楚「我的現在站位
// 從哪來」，寫錯了 TypeScript 編譯期就會擋下來，而不是等到執行期才發現資料來源接錯。
interface NewTacticDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  // 使用者「真的選了一個起點」（擷取現在站位／空站位）時呼叫，session 已經開好才觸發。
  //
  // 為什麼需要這個、不能讓呼叫端自己從 onOpenChange(false) 推：彈窗關閉有兩種原因——
  // 「選了起點」跟「按 Esc／點外面取消」——兩者都只會觸發 onOpenChange(false)，光看關閉
  // 這件事分不出來。呼叫端如果改去偷看 store 裡「有沒有 session」來推測，會在「這場本來
  // 就有一個編到一半的 session」時誤判成使用者剛選了起點（明明是按取消，卻被帶去戰術頁）。
  // 讓彈窗自己明講「我開了一個新 session」，比讓外面猜可靠得多——這是「明確的事件」勝過
  // 「從狀態反推意圖」的典型例子。
  onStarted?: () => void;
  // 呼叫端提供「現在站位」的擷取邏輯：按下按鈕的當下呼叫一次，回傳一張純值快照。跟
  // NewTacticDialog 內部原本 getState() 的用法同一個道理——只在使用者按下去那一刻讀一次，
  // 不是即時訂閱，才符合「擷取」（capture）的語意。
  captureCurrent: () => CourtSnapshot;
  // 「擷取目前站位」按鈕下方的說明文字，例如戰術頁的「將複製第 N 輪」、計分頁的
  // 「擷取目前計分站位」——文字內容跟資料來源綁在一起，交給知道來源是什麼的呼叫端決定。
  captureLabel: string;
  // 擷取來源目前是否可用（例如計分頁還沒排出完整先發時 activeLineup 是 null）。可選、預設
  // false（可用）——這只是控制按鈕能不能按的 UI 旗標，不像 captureCurrent 本身背負「读錯
  // store」的風險，給預設值沒有前面那段擔心的副作用。
  captureDisabled?: boolean;
}

export default function NewTacticDialog({
  open,
  onOpenChange,
  matchId,
  onStarted,
  captureCurrent,
  captureLabel,
  captureDisabled = false,
}: NewTacticDialogProps) {
  const startSession = useTacticsBoard((s) => s.startSession);

  const handleCaptureCurrent = () => {
    const snapshot = captureCurrent();
    startSession(snapshot);
    onStarted?.();
    onOpenChange(false);
  };

  const handleBlank = () => {
    startSession(captureBlank({ matchId }));
    onStarted?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.18] bg-[#12140f] text-[#f5f5f0]">
        <DialogHeader>
          <DialogTitle className="text-[#f5f5f0]">新增戰術</DialogTitle>
          <DialogDescription className="text-[#a9b096]">
            選一個起點開始布置，之後隨時可以在白板上調整站位。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={handleCaptureCurrent}
            disabled={captureDisabled}
            className={`rounded-lg p-3 text-left text-xs font-bold ${SECONDARY_BTN_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
            data-testid="button-new-tactic-from-rotation"
          >
            擷取目前站位
            <div className="mt-1 text-[10px] font-normal text-[#a9b096]">{captureLabel}</div>
          </button>
          <button
            onClick={handleBlank}
            className={`rounded-lg p-3 text-left text-xs font-bold ${SECONDARY_BTN_CLASS}`}
            data-testid="button-new-tactic-blank"
          >
            空站位
            <div className="mt-1 text-[10px] font-normal text-[#a9b096]">
              從空白球場開始，球員自己從名單拖上場
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
