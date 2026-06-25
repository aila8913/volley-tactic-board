// 紀錄模式（比賽期間快速記分）用的型別，跟戰術板（types/tactics.ts）的輪轉是分開的概念：
// 戰術板的「目前輪次」是教練手動選來編輯/檢視戰術用的，紀錄模式的輪轉則是跟著比分自動算出來、
// 反映場上真實狀況，兩者不能共用同一個欄位，所以獨立開一份 store（hooks/useRecording.ts）。

// 發球方是哪一邊：'us' 是我方，'opponent' 是對手。我方輪轉用真實球員名單畫位置；
// 對手沒有名單資料，只追蹤號位輪轉（見 lib/rotationLogic.ts 的 getZoneLayout）。
export type Side = "us" | "opponent";

// 快速操作手勢（畫線連到球員→選動作→選得失分）裡，「選動作」那一步的四個選項。
export const PLAY_ACTIONS = ["serve", "defense", "attack", "block"] as const;
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
    // 我方球員才有 playerId（對手只有號位沒有名單，見 RecordingCourt.tsx）。
    playerId?: string;
    zone?: number;
  };
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
}

export interface CompletedSet {
  setNumber: number;
  ourScore: number;
  opponentScore: number;
}

export interface MatchRecordingState {
  currentSet: SetRecordingState;
  completedSets: CompletedSet[];
}
