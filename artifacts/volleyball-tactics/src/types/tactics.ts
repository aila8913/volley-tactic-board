import type { MatchPlayer } from "./match";

// 情境標籤：現在只在「存檔」時當標籤用（戰術管理區塊選一個、存進 ProjectInfo.situation），
// 球場上不會即時切換、也不會讓同一個輪次同時存好幾份站位。
export type SituationTag = "base" | "serve-receive" | "defense" | "attack" | "cover";

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
