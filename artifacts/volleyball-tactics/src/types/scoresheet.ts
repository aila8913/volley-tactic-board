// 計分表（比賽期間快速記分）用的型別，跟輪轉表/戰術板（types/rotationTable.ts、
// types/tacticsBoard.ts）的輪轉是分開的概念：輪轉表的「目前輪次」是教練手動選來
// 編輯/檢視戰術用的，計分表的輪轉則是跟著比分自動算出來、反映場上真實狀況，
// 兩者不能共用同一個欄位，所以獨立開一份 store（hooks/useScoreSheet.ts）。

// 發球方是哪一邊：'us' 是我方，'opponent' 是對手。我方輪轉用真實球員名單畫位置；
// 對手沒有名單資料，只追蹤號位輪轉（見 lib/rotationLogic.ts 的 getZoneLayout）。
export type Side = "us" | "opponent";

// 快速操作手勢（點選球員/對手(全體)→選動作→選得失分）裡，「選動作」那一步的選項。
// 這 6 大類刻意跟 lib/db/src/schema/events.ts 的 eventActionEnum 對齊，是簡易版（這裡）
// 跟進階版（events 表）共用同一套分類的第一步——之前是各自一套（這裡只有 4 類、
// events 表已經是 6 類），現在統一成 6 類，之後兩邊的統計才能直接放在一起比較。
export const PLAY_ACTIONS = ["serve", "receive", "set", "attack", "block", "dig"] as const;
export type PlayAction = (typeof PLAY_ACTIONS)[number];

// 紀錄每一分發生時的狀況，用來支援「復原上一球」：
// wasSideOut 代表這一分是不是從對方手上把發球權贏回來（side-out），
// 只有 side-out 才會讓贏球的那一方輪轉一個位置。
// action/touchedBy 是從快速操作手勢來的額外資訊（這一球是哪一方哪個球員做了什麼動作），
// 純粹補充紀錄用，沒有也不影響比分/輪轉怎麼算——所以是 optional。
export interface PointRecord {
  side: Side;
  wasSideOut: boolean;
  action?: PlayAction;
  touchedBy?: {
    side: Side;
    // 我方球員才有 playerId（對手只有號位沒有名單，見 ScoreSheetCourt.tsx）。
    playerId?: string;
    zone?: number;
  };
  // 這一分在後端 rallies 表對應的 id（一個 PointRecord = 一個 rally）。持久化記帳用：
  // 「復原上一球」要靠它打 DELETE /rallies/:id、補記 event 也要掛在這個 rally 底下。
  // 只在已成功寫進後端後才有值；純本地（還沒 flush）或舊資料是 undefined。
  serverId?: number;
}

export interface SetRecordingState {
  setNumber: number;
  ourScore: number;
  opponentScore: number;
  // 還沒選定這局由誰先發球時是 null，畫面上要先讓教練選，選完才能開始記分。
  serving: Side | null;
  ourRotation: number;
  opponentRotation: number;
  history: PointRecord[];
  // 這一局在後端 sets 表對應的 id。開局（startSet）成功建立 set row 後才有值；
  // 記分（POST rally）要掛在這個 setId 底下。純本地未 flush 時是 undefined。
  serverId?: number;
}

export interface CompletedSet {
  setNumber: number;
  ourScore: number;
  opponentScore: number;
  // 保留這局的球序歷史，讓結果頁可以做跨局統計。
  // 舊的 persist 資料沒有這個欄位，所以讀取時要用 ?? [] 補空陣列。
  history: PointRecord[];
}

export interface ScoreSheetState {
  currentSet: SetRecordingState;
  completedSets: CompletedSet[];
  // 自由球員即時替補：記錄目前正在替補中的球員 id，null 代表沒有 L 在場上頂替別人。
  // 這個欄位以前放在戰術板共用的 store 裡（全域唯一一份），但比賽是一場一場分開記錄的，
  // 放在全域會導致切換不同比賽的計分表時互相污染彼此的替補狀態——所以搬來這裡，
  // 跟著 recordingsByMatch 用 matchId 分開存，才是它真正該待的地方。
  liberoSubstitution: string | null;
}
