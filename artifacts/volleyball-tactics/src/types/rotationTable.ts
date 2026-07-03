import type { MatchPlayer } from "./match";

// 圈圈裡面要顯示哪種資訊，三選一（不是像 labelToggles 那樣可以同時勾多個）。
// 放在這裡（而不是戰術板的型別檔）是因為輪轉表跟戰術板都要用同一份規則顯示球員，
// 這份「球員身分怎麼標示」的設定天生就跟著球員名單走，不是戰術板獨有的東西。
export const CIRCLE_LABEL_TYPES = ["name", "number", "role"] as const;
export type CircleLabelType = (typeof CIRCLE_LABEL_TYPES)[number];

export interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

export interface LiberoReplacement {
  liberoId: string;
  // 被替換下場的球員，連同其格子座標一起保存，移除 L 時才能還原到正確位置。
  replacedPosition: PlayerPosition;
}

// 輪轉表的「誰站哪」資料，一個輪次一份。原本這裡還包含 tacticPositions/markers/
// defenseRanges（畫戰術用的），但那些是戰術板自己的事，已經拆到 types/tacticsBoard.ts
// 的 RotationTactics 去了——輪轉表不需要知道戰術板怎麼畫圖，戰術板才需要知道輪轉表
// 站位在哪（畫箭頭要連到球員身上）。
export interface RotationPositions {
  positions: PlayerPosition[];
  // 自由球員替換記錄：記錄「這個輪次 L 替換了誰」，移除 L 時用來還原。
  // null 代表這個輪次沒有 L 上場。
  liberoReplacement: LiberoReplacement | null;
}

export interface RotationTableData {
  // 完整球員名單（人數不固定），跟比賽列表那邊的 match.players 是同一份資料、同一個型別，
  // 編輯這裡會回寫到 match list。球場上 PlayerPosition.playerId 直接存這份名單裡的球員 id，
  // 哪個球員站場上哪個位置，完全由教練拖曳決定（見 hooks/useRotationTable.ts 的 placePlayerOnCourt）。
  roster: MatchPlayer[];
  currentRotation: number;
  rotations: RotationPositions[];
  // 備位區要顯示哪位 L——名單裡可能有多個 L，但場上（備位區）同時只能有一位。
  startingLiberoId: string | null;
  circleLabel: CircleLabelType;
}
