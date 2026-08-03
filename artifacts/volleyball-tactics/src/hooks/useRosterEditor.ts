import { useState } from "react";
import { useRotationTable } from "./useRotationTable";
import { useRoster, useSaveRoster } from "./useMatches";
import { useToast } from "./use-toast";
import type { MatchPlayer } from "../types/match";

// 這一場還沒有分片資料時的空白預設值，定義在模組層（不是每次 render 新建）——跟
// RotationTable.tsx／Court.tsx 的 EMPTY_ROSTER 是同一個理由：Zustand selector 的回傳值
// 若每次都是新的陣列參照（即使內容一樣），React 的 useSyncExternalStore 會判定「快照
// 每次都變了」而卡進無限重繪迴圈（"The result of getSnapshot should be cached" 那個錯誤，
// 實機會看到整個 <RotationPanel> 崩潰、戰術板頁面直接空白）。這裡原本兩個 fallback
// 分支（matchId 不存在／roster 不存在）各自寫一個 `[]` 字面值，兩個都會產生新參照，
// 正是這個 bug 的根因——2026-08-03 修掉，統一指回同一個模組層常數。
const EMPTY_ROSTER: MatchPlayer[] = [];

// 「編輯球員名單」的彈窗開關 + 存檔邏輯，抽成共用 hook 的理由（issue #251）：
// 這一串「開彈窗 → local-first 寫進 useRotationTable 分片 → diff 回寫後端 → 失敗時 toast」
// 原本整套寫死在 RotationTable.tsx 裡（mode B 用）。issue #251 修 mode D（佈陣中）的
// 球員名單重複顯示問題時，發現 mode D 的 TacticsRosterPanel 也需要同一顆「編輯」按鈕——
// 兩邊要的是完全一樣的邏輯，只是觸發點所在的元件不同。與其在 TacticsRosterPanel 裡
// 複製貼上一份幾乎一樣的 handleRosterSave，不如把「跟名單編輯有關、不牽涉畫面排版」
// 的狀態跟副作用抽出來，兩個元件都呼叫同一個 hook、各自只負責渲染自己的按鈕/彈窗位置。
export function useRosterEditor(matchId: string | undefined) {
  // 這一場目前的球員名單（本地分片），編輯彈窗要拿這份當初始值、儲存後也要立刻反映在這裡。
  const roster = useRotationTable((state) =>
    matchId ? (state.dataByMatch[matchId]?.roster ?? EMPTY_ROSTER) : EMPTY_ROSTER,
  );
  const setRoster = useRotationTable((state) => state.setRoster);
  // 伺服器目前的名單，當作「儲存名單」時算差異（新增/修改/刪除哪些球員）的基準。
  const { players: serverRoster } = useRoster(Number(matchId));
  const saveRoster = useSaveRoster();
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  // 球員名單同時要存進輪轉表自己的 roster（本地即時反映），也要回寫到後端。
  // 回寫用 diff：把新名單對伺服器現有名單比對，只送有變動的 create/patch/delete。
  //
  // 為什麼要 async/await 而不是原本的 void saveRoster(...)：
  // 原本不等待背景回寫的結果，寫入失敗（網路斷線、後端驗證錯誤等）會被無聲吞掉——
  // setRoster 已經讓畫面看起來「存好了」，但球員其實沒進資料庫，使用者完全不會發現。
  // 這裡改成 await，抓到錯誤時用 toast 提醒使用者，跟 MatchFormDialog.tsx 儲存失敗
  // 用的是同一套 useToast + destructive 樣式，不重複造一套新的錯誤提示模式。
  const handleSave = async (players: MatchPlayer[]) => {
    if (!matchId) return;
    // local-first：不管後端回寫成不成功，先讓畫面立刻反映使用者剛編輯的名單。
    setRoster(matchId, players);
    try {
      await saveRoster(Number(matchId), serverRoster, players);
    } catch {
      toast({
        title: "名單儲存失敗",
        description: "球員名單尚未同步到伺服器，請稍後再試一次",
        variant: "destructive",
      });
    }
  };

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    // RosterEditDialog（跟它底下的 Dialog 元件）不是只靠「編輯」按鈕開關——按 Esc、點背景
    // 遮罩都會觸發 onOpenChange(false)，所以呼叫端還是需要一個「接受 boolean」的 setter，
    // 不能只給上面兩個無參數的 open/close。這裡直接把 setIsOpen 原封不動遞出去，
    // 兩個呼叫端（RotationTable/TacticsRosterPanel）的 <RosterEditDialog onOpenChange={...}>
    // 都接這個。
    onOpenChange: setIsOpen,
    roster,
    handleSave,
  };
}
