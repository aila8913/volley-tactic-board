import { create } from "zustand";
import type { DraftEvent, PlayAction, Side } from "../types/scoresheet";
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
  // 這一分錨在影片的哪裡（#393，實作 ADR-0010 決定 5）。null＝還沒錨定，可能是這一分還沒
  // 記任何一球、或這場比賽根本沒掛影片（見 startBall 的說明：讀不到播放器位置時傳 null 進來，
  // 這裡就維持 null，畫面上沒有錨點可顯示、寫進後端的 rallies.videoId/videoTimestamp 也是 null）。
  //
  // 「第一個手勢發生時自動擷取當下播放秒數」——這正是 ADR-0010 決定 5 明講的「不做對齊這個
  // 獨立步驟」：補填某一分時，使用者早就已經把影片停在那一分開始的地方了，不需要再多按一次
  // 「對齊」，第一個手勢的當下就是這一分在影片上的位置。
  anchor: { videoId: string; seconds: number } | null;
}

const emptyRallyDraft = (): RallyDraft => ({ balls: [], current: null, anchor: null });

interface AdvancedRecordingStore {
  chainsByMatch: Record<string, RallyDraft>;

  // 滑完成：記下這一球是誰、做了什麼動作，落點留白（半完成）。
  // 如果目前已經有一顆半完成的球（使用者滑錯了、想重選），這裡直接覆蓋掉，不用先手動取消
  // ——重新滑一次本來就是「我要換一個」最自然的操作，不用逼使用者多按一次取消。
  //
  // anchor 參數：呼叫端（AdvancedRecordingCourt.tsx）每次滑完都會傳「現在播放器在哪」進來，
  // 但這支動作只在這一分**還沒有錨點**時才真的採用它——第一個手勢贏，之後的球不覆寫
  // （見 RallyDraft.anchor 的說明：後面的球傳進來的秒數是使用者記完好幾球之後才按的，
  // 拿它當這一分的錨點會把時間點推到這一分早就結束之後）。
  startBall: (
    matchId: string,
    side: Side,
    playerId: string | null,
    action: PlayAction,
    anchor: { videoId: string; seconds: number } | null,
  ) => void;
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

  startBall: (matchId, side, playerId, action, anchor) =>
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
      return {
        chainsByMatch: {
          ...state.chainsByMatch,
          [matchId]: {
            ...draft,
            current,
            // 只在這一分還沒有錨點時才採用（第一個手勢贏），見上面 startBall 型別旁的說明。
            anchor: draft.anchor ?? anchor,
          },
        },
      };
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
