import { create } from "zustand";
import type { PlayAction, Side } from "../types/scoresheet";
import { newRowId } from "../lib/writeLog";

// 進階版補填（賽後對著影片逐球記錄）中繼狀態的 store（issue #392）。
//
// ── 為什麼獨立開一個 store，不塞進 useScoreSheet ──
// useScoreSheet 的 recordingsByMatch 是「本地優先＋背景持久化、可從後端 sets/rallies/events
// 重建」的比賽紀錄——它是這場比賽的**事實**。這裡要放的東西完全不同：使用者正在補填、
// 還沒按下「收尾這一分」的那一分，是**還沒收尾的中繼狀態**，純粹活在記憶體裡，
// 重新整理就該消失（票面的規格，不是 bug）。跟 useScoreSheet 自己把 undoStacksByMatch
// 獨立拆出去（不塞進 ScoreSheetState、不 persist、不參與 hydrate）是同一個理由：
// 「這場比賽發生過什麼」跟「使用者現在正在編輯的半成品」是兩種不同壽命的資料，混在一起
// 會讓 reconstructRecording 的形狀被迫去容納一種它不該關心的東西。
//
// ── 為什麼要 per-match 分片（即使不 persist）──
// wouter 換頁（切換 matchId）不保證元件重新 mount——同一個 <ScoreSheet/> 元件實例可能被
// react-router/wouter 直接換 props 留用。這個 repo已經在 selectedLiberoId（ScoreSheet.tsx）
// 跟 recording-mode（同檔）兩處為了同一件事寫過「換場要重讀」的 effect（issue #119 的
// 教訓：不分片，切到別場比賽會看到上一場殘留的資料）。這裡即使不 persist，還是用
// `chainsByMatch[matchId]` 分片而不是 store 頂層單一份，理由完全一樣——沒有分片的話，
// 使用者從 A 場切到 B 場，B 場的球場會先閃一下 A 場記到一半的球線。

// 補填中的一球。欄位名對齊 lib/db/src/schema/events.ts（見該檔案的 eventsTable），
// #393 真的寫進後端時才不用重新翻譯一次欄位名。
export interface DraftEvent {
  // client-mintable uuid：#393 直接拿它當 events.id。跟 lib/writeLog.ts 的 newRowId 是
  // 同一套「離線也要能決定主鍵」的做法（sets/rallies/events 的 id 都是這樣鑄出來的）。
  id: string;
  // 前端沿用 types/scoresheet.ts 既有的 "us" | "opponent"，不是 events 表的 home/away——
  // 對 home/away 的轉換（跟先發方是誰、我方是不是 home 有關）留在寫入層，#393 再做，
  // 跟簡易版的 PointRecord 目前的作法一致（見 lib/scoreSheetMapping.ts 的 sideToApi）。
  side: Side;
  // 對手側沒有名單可指，一律 null（跟 events.playerId nullable 對齊）。
  playerId: string | null;
  action: PlayAction;
  // 落點；滑完、還沒 tap 時是 null——這正是「半完成」狀態的判準（見 currentBall 的說明）。
  toX: number | null;
  toY: number | null;
  // 這裡刻意不存 from（起點）。ADR-0010 決定 2：一球的起點＝上一球的落點，是渲染時從
  // 相鄰兩球現算的衍生值，不是存下來的欄位——「能推導就不存」。DB 層要不要在寫入當下把
  // from 複製進 events.from_x/from_y 是 #393 的事，這裡的 DraftEvent 型別故意不長這個
  // 欄位，避免在還沒有使用者（沒有任何程式碼會讀它）之前就先猜一個形狀出來。
}

// 一分（rally）補填到目前為止的狀態：空（balls=[]、current=null）→ 記了幾球（balls 有內容、
// current 可能還有一顆在等落點）。
//
// 這裡**沒有** done/winner 欄位（2026-08-13 拿掉的）。原本有，但那是一份活不過三行的資料：
// 收尾的當下，勝方要立刻交給真正的計分表（useScoreSheet 的 score()，也就是簡易版在用的
// 同一條路）去加分、輪轉、寫進 rallies——draft 這邊記一份 winner 只會變成第二份真相，而且
// 收完尾這一分的草稿馬上就被清空（clearRally），那份 winner 沒有任何讀取者。
// ADR-0010 決定 1（長按滑只產生 rallies.winner）因此仍然成立，只是那個 winner 從一開始就
// 直接寫在 rallies 該待的地方，不在這個暫存 store 裡繞一圈。
interface RallyDraft {
  // 已完成（滑＋tap 都做完）的球，依記錄順序排列——渲染球線時，第 i 球的起點就是
  // balls[i-1] 的落點（ADR-0010 決定 2），第一球沒有起點。
  balls: DraftEvent[];
  // 目前正在補的那一球：滑完成（有 playerId/action）、但還沒 tap（toX/toY 皆為 null）。
  // null 代表沒有半完成中的球——可能是還沒開始、或上一球剛 tap 完自動收進 balls。
  current: DraftEvent | null;
}

const emptyRallyDraft = (): RallyDraft => ({ balls: [], current: null });

interface AdvancedRecordingStore {
  chainsByMatch: Record<string, RallyDraft>;

  // 滑完成：記下這一球是誰、做了什麼動作，落點留白（半完成）。
  // 如果目前已經有一顆半完成的球（使用者滑錯了、想重選），這裡直接覆蓋掉，不用先手動取消
  // ——重新滑一次本來就是「我要換一個」最自然的操作，不用逼使用者多按一次取消。
  startBall: (matchId: string, side: Side, playerId: string | null, action: PlayAction) => void;
  // 補上落點：把目前半完成的球填上 toX/toY，正式收進 balls 鏈裡，current 清空。
  // 沒有半完成的球時是 no-op——沒有東西可以補落點（不猜使用者想幹嘛）。
  setLandingPoint: (matchId: string, toX: number, toY: number) => void;
  // 取消半完成的那一球：把 current 直接丟掉（不收進 balls），不動已經收進鏈裡的球。
  cancelCurrentBall: (matchId: string) => void;
  // 清空這一分：balls/current 歸零，回到剛開始補這一分之前的樣子。收尾（把勝方交給計分表）
  // 之後由呼叫端接著呼叫它，讓球場空出來給下一分。
  clearRally: (matchId: string) => void;
}

const getOrInit = (byMatch: Record<string, RallyDraft>, matchId: string): RallyDraft =>
  byMatch[matchId] ?? emptyRallyDraft();

export const useAdvancedRecording = create<AdvancedRecordingStore>()((set) => ({
  chainsByMatch: {},

  startBall: (matchId, side, playerId, action) =>
    set((state) => {
      const draft = getOrInit(state.chainsByMatch, matchId);
      const current: DraftEvent = {
        id: newRowId(),
        side,
        playerId,
        action,
        toX: null,
        toY: null,
      };
      return { chainsByMatch: { ...state.chainsByMatch, [matchId]: { ...draft, current } } };
    }),

  setLandingPoint: (matchId, toX, toY) =>
    set((state) => {
      const draft = state.chainsByMatch[matchId];
      if (!draft || !draft.current) return state; // 沒有半完成的球可以補落點，no-op。
      const completed: DraftEvent = { ...draft.current, toX, toY };
      return {
        chainsByMatch: {
          ...state.chainsByMatch,
          [matchId]: { ...draft, balls: [...draft.balls, completed], current: null },
        },
      };
    }),

  cancelCurrentBall: (matchId) =>
    set((state) => {
      const draft = state.chainsByMatch[matchId];
      if (!draft || !draft.current) return state;
      return { chainsByMatch: { ...state.chainsByMatch, [matchId]: { ...draft, current: null } } };
    }),

  clearRally: (matchId) =>
    set((state) => ({
      chainsByMatch: { ...state.chainsByMatch, [matchId]: emptyRallyDraft() },
    })),
}));
