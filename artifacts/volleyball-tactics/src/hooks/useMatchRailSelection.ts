import { useCallback, useRef, useState } from "react";
import type { MatchListSelection } from "@/components/MatchInfoRail";

// 比賽列表（MatchList）／資料夾內頁（TournamentDetail）共用的「右欄選了什麼、現在是不是編輯中」。
//
// 為什麼是一支共用 hook，而不是兩個頁面各寫一份 useState（#329）：
//
// 這兩頁的右欄本來就已經共用同一個 MatchInfoRail 了，選取語意也早就共用同一個
// MatchListSelection 型別（見該檔案開頭的說明；#372 之前這裡還提到 ListNavRail.tsx——那是
// 「把 selected 翻譯成 matchId 餵給左欄 NavRail」的薄包裝，NavRail 不再吃 matchId 之後
// 已刪除，見 NavRail.tsx 開頭的說明）。#329 把「編輯比賽」從彈窗搬進右欄
// 之後，又多了三件必須兩頁一致的事：編輯模式的開關、未存檔切走的攔截、新增成功後要選到新那場。
// 三份狀態機複製兩份，遲早會飄開成「頂層列表會攔、資料夾內頁不會攔」這種只有使用者才發現得了
// 的不一致。
//
// ── 為什麼「編輯中」放在頁面層、不是放在 MatchInfoRail 內部 ──
//
// 因為「編輯」鈕在**左欄的卡片上**（ListItemCard 的 onEdit），跟右欄的面板不在同一棵子樹裡，
// 它們最近的共同祖先就是頁面。狀態放在共同祖先是 React 的一般作法（lifting state up），
// 硬要塞進右欄內部就得再發明一條「從外面叫右欄進編輯模式」的訊號管道（ref / 每按一次 +1 的
// counter…），只是把同一件事繞遠路。
//
// tournamentId：這一頁「新增比賽」預設要把比賽歸到哪個資料夾。頂層列表傳 null（放在最上層），
// 資料夾內頁傳該資料夾的 id——驗收條件「資料夾內頁新增的比賽會歸到該資料夾」就靠這個值一路
// 帶進 selected，右欄不必再另外收一條 prop。
export function useMatchRailSelection(tournamentId: string | null) {
  const [selected, setSelected] = useState<MatchListSelection>(null);
  const [editing, setEditing] = useState(false);

  // 表單髒不髒（使用者到底改過東西沒有）用 ref 存、不用 useState：這個值每打一個字就可能翻動，
  // 進 state 會讓整個頁面（含左欄整份清單）跟著重繪，而我們只在「使用者要切走」那一瞬間讀它，
  // 中間的每一次變動都不需要畫面有任何反應。ref 正是給這種「要記住、但不影響畫面」的值用的。
  const dirtyRef = useRef(false);

  // 未存檔就切走（#329 PO 定案）：沿用這個 repo 既有的 window.confirm 慣例（刪比賽、刪資料夾
  // 都是這樣問的；專案還沒有 AlertDialog 元件，見 MatchList.tsx handleDeleteMatch 的說明）。
  // 只有「真的在編輯」而且「真的改過」才問——沒改過就跳確認框，只是在懲罰隨手點開又點掉的人。
  const confirmDiscard = useCallback(() => {
    if (!editing || !dirtyRef.current) return true;
    return window.confirm("這場比賽的編輯還沒儲存，要放棄變更嗎？");
  }, [editing]);

  // 離開編輯模式時 dirty 一定要一起清掉：下一次進編輯模式是一份全新的表單，
  // 沿用上一次的 dirty 會讓使用者什麼都還沒改就被問「要放棄變更嗎？」。
  const leaveEdit = useCallback(() => {
    dirtyRef.current = false;
    setEditing(false);
  }, []);

  // 左欄卡片單擊＝選取。編輯到一半切走要先問過。
  const select = useCallback(
    (next: MatchListSelection) => {
      if (!confirmDiscard()) return;
      leaveEdit();
      setSelected(next);
    },
    [confirmDiscard, leaveEdit],
  );

  // 「新增比賽」：右欄直接開在空白編輯模式，不需要先有一個選中的對象（#329 驗收第 3 條）。
  const startCreate = useCallback(() => {
    if (!confirmDiscard()) return;
    dirtyRef.current = false;
    setSelected({ kind: "new-match", tournamentId });
    setEditing(true);
  }, [confirmDiscard, tournamentId]);

  // 卡片上的「編輯」鈕：選到那場、並且就地進編輯模式。
  const startEdit = useCallback(
    (matchId: string) => {
      if (!confirmDiscard()) return;
      dirtyRef.current = false;
      setSelected({ kind: "match", id: matchId });
      setEditing(true);
    },
    [confirmDiscard],
  );

  // 新增成功：把選取切到剛建好的那一場並回唯讀，使用者立刻看到「我剛建的比賽長這樣」
  // ——而不是留在一張已經送出去、內容卻還在畫面上的空表單。
  const finishCreate = useCallback((newMatchId: string) => {
    dirtyRef.current = false;
    setEditing(false);
    setSelected({ kind: "match", id: newMatchId });
  }, []);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  return { selected, editing, select, startCreate, startEdit, leaveEdit, finishCreate, setDirty };
}
