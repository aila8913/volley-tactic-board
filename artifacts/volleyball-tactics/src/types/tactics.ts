import type { MatchPlayer } from "./match";

// 情境即是戰術的名稱，可以是預設選項（如「接發球」），也可以自由輸入（如「接發11號強發」）。
export type SituationTag = string;

// 圈圈裡面要顯示哪種資訊，三選一（不是像 labelToggles 那樣可以同時勾多個）。
export const CIRCLE_LABEL_TYPES = ["name", "number", "role"] as const;
export type CircleLabelType = (typeof CIRCLE_LABEL_TYPES)[number];

export interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

export interface DefenseRange {
  id: string;
  playerId: string;
  type: "circle" | "ellipse" | "fan";
  x: number;
  y: number;
  radius?: number;
  rx?: number;
  ry?: number;
  startAngle?: number;
  endAngle?: number;
  rotation?: number;
  color: string;
  opacity: number;
  visible: boolean;
}

export interface Marker {
  id: string;
  type: "arrow" | "dashed" | "attack" | "text" | "volleyball";
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  text?: string;
}

export interface RotationState {
  positions: PlayerPosition[];
  defenseRanges: DefenseRange[];
  markers: Marker[];
}

export interface TacticsState {
  // 完整球員名單（人數不固定），跟比賽列表那邊的 match.players 是同一份資料、同一個型別，
  // 編輯這裡會回寫到 match list。球場上 PlayerPosition.playerId 直接存這份名單裡的球員 id，
  // 哪個球員站場上哪個位置，完全由教練拖曳決定（見 hooks/useTactics.ts 的 placePlayerOnCourt）。
  roster: MatchPlayer[];
  // 自由球員替補：存被替換下場的那位球員的 id（必須是 roster 裡 role === 'MB' 的人）。
  liberoSubstitution: string | null;
  currentRotation: number;
  rotations: RotationState[];
  // 圈圈裡顯示姓名/背號/位置，三選一。
  circleLabel: CircleLabelType;
  // zone 是球場上 1~6 號位的疊圖，跟圈圈裡顯示什麼是兩件事，所以留在這裡單獨開關。
  labelToggles: { zone: boolean };
}
