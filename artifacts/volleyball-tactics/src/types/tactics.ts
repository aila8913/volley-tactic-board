import type { MatchPlayer } from "./match";

export type ScenarioType = "base" | "serve-receive" | "defense" | "attack" | "cover";

// 比賽名單（roster）裡的角色只分 S/OH/MB/OPP/L 五類，同一類可以有任意人數
// （見 types/match.ts 的 PLAYER_ROLES）。但球場上六個站位 + 自由球員替補，
// 需要明確知道「這是第幾個 OH/MB」才能畫位置跟算輪轉，所以戰術板內部仍用
// 7 個固定站位（S/OH1/OH2/MB1/MB2/OPP/L）。這份名單跟場上站位的對應關係，
// 是從 roster 依序取「第 1、2 個 OH」「第 1、2 個 MB」等方式自動推算出來的
// （見 hooks/useTactics.ts 的 deriveCourtPlayers）。
export interface Player {
  id: string;
  name: string;
  // 背號，跟 types/match.ts 的 MatchPlayer.number 對齊。
  number: number;
  role: "S" | "OH1" | "OH2" | "MB1" | "MB2" | "OPP" | "L";
}

// role 內部仍區分 OH1/OH2、MB1/MB2（輪轉邏輯要靠這個區分場上兩個 OH/MB 各自的站位），
// 但畫面上不需要讓使用者看到編號，兩個主攻/兩個攔中其實就是同一種位置，所以顯示時把數字去掉。
export function displayRole(role: Player["role"]): string {
  return role.replace(/\d+$/, "");
}

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
  scenarioPositions: Record<ScenarioType, PlayerPosition[]>;
  defenseRanges: DefenseRange[];
  markers: Marker[];
}

export interface TacticsState {
  projectName: string;
  teamName: string;
  // 完整球員名單（人數不固定），跟比賽列表那邊的 match.players 是同一份資料、同一個型別，
  // 編輯這裡會回寫到 match list。場上 7 個固定站位（players 欄位）是從這份名單推算出來的。
  roster: MatchPlayer[];
  players: Player[];
  liberoSubstitution: "MB1" | "MB2" | null;
  scenario: ScenarioType;
  currentRotation: number;
  rotations: RotationState[];
  // 圈圈裡顯示姓名/背號/位置，三選一。
  circleLabel: CircleLabelType;
  // zone 是球場上 1~6 號位的疊圖，跟圈圈裡顯示什麼是兩件事，所以留在這裡單獨開關。
  labelToggles: { zone: boolean };
}
