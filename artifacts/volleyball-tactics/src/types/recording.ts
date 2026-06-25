// 紀錄模式（比賽期間快速記分）用的型別，跟戰術板（types/tactics.ts）的輪轉是分開的概念：
// 戰術板的「目前輪次」是教練手動選來編輯/檢視戰術用的，紀錄模式的輪轉則是跟著比分自動算出來、
// 反映場上真實狀況，兩者不能共用同一個欄位，所以獨立開一份 store（hooks/useRecording.ts）。

// 發球方是哪一邊：'us' 是我方，'opponent' 是對手。我方輪轉用真實球員名單畫位置；
// 對手沒有名單資料，只追蹤號位輪轉（見 lib/rotationLogic.ts 的 getZoneLayout）。
export type Side = "us" | "opponent";

// 紀錄每一分發生時的狀況，用來支援「復原上一球」：
// wasSideOut 代表這一分是不是從對方手上把發球權贏回來（side-out），
// 只有 side-out 才會讓贏球的那一方輪轉一個位置。
export interface PointRecord {
  side: Side;
  wasSideOut: boolean;
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
