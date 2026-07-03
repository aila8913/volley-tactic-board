import type { PlayerPosition, LiberoReplacement, CircleLabelType } from "./rotationTable";
import type { MatchPlayer } from "./match";

// 情境即是戰術的名稱，可以是預設選項（如「接發球」），也可以自由輸入（如「接發11號強發」）。
export type SituationTag = string;

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

// 戰術板的「畫了什麼」資料，一個輪次一份，跟輪轉表的 RotationPositions 用同一個
// index（0~5）對應同一個輪次，但存在不同 store 裡——戰術板不擁有站位資料，只在畫箭頭
// 之類的東西時去讀輪轉表的站位（見 hooks/useTacticsBoard.ts 開頭對 useRotationTable 的
// import，這是刻意設計成單向依賴：戰術板讀輪轉表，輪轉表不知道戰術板的存在）。
export interface RotationTactics {
  // 戰術視圖用：在布置模式裡自由拖曳的站位，placePlayerFree 寫入。
  // 空陣列代表還沒客製化，顯示時會以輪轉表的 positions 為 fallback。
  tacticPositions: PlayerPosition[];
  markers: Marker[];
  defenseRanges: DefenseRange[];
}

export interface TacticsBoardData {
  tacticsByRotation: RotationTactics[];
  // zone 是球場上 1~6 號位的疊圖，跟圈圈裡顯示什麼是兩件事，所以留在這裡單獨開關。
  labelToggles: { zone: boolean };
  projectSituation: SituationTag;
  activeProjectId: string | null;
}

// ── 存檔／讀檔用的「整份戰術」快照格式 ──
// 存到後端 /tactics API 的 JSON，跟前面兩個 store 各自的內部資料形狀不一樣：
// 存檔時要把輪轉表 + 戰術板兩份資料「攤平」合併成一個輪次一筆的舊格式，這樣資料庫裡
// 舊的、在拆分兩個 store 之前存的戰術資料才能繼續正常讀取（存檔格式沒變，只有前端
// 記憶體裡怎麼管理這份資料變了）。
export interface SavedTacticRotation {
  positions: PlayerPosition[];
  liberoReplacement: LiberoReplacement | null;
  tacticPositions?: PlayerPosition[];
  markers?: Marker[];
  defenseRanges?: DefenseRange[];
}

export interface SavedTacticData {
  roster: MatchPlayer[];
  currentRotation: number;
  rotations: SavedTacticRotation[];
  circleLabel: CircleLabelType;
  labelToggles: { zone: boolean };
}
