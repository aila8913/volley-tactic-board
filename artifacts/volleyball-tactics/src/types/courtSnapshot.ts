// ── 戰術板單向化重構（issue #154）用的「快照」型別 ──
//
// 這裡要解決的核心問題：戰術板以前是「正規化（normalized）」存資料——球場上每個站位只記
// `playerId`，畫面渲染時再回頭去查目前的球員名單（roster）拿姓名/背號/位置。這種做法對
// 「目前正在編輯中」的資料很好（改名字、換背號，所有引用它的地方自動更新），但對
// 「已經存檔、要當作歷史紀錄保存」的資料是災難：如果之後刪除或改掉某個球員，舊的存檔
// 讀回來時，會找不到那個 playerId，站位就整個消失或顯示錯誤的人。
//
// 解法是這裡的 `SnapshotPlayer`：把「當下 join 出來的結果」直接凍結存起來（denormalized）。
// 概念上就像「拍照片」跟「留地址」的差別——PlayerPosition 存的是地址（playerId，去查才知道
// 現在那裡住誰），SnapshotPlayer 存的是照片（姓名/背號/位置當時長怎樣，就算原本那個人已經
// 搬走/改名，照片還是照片，永遠是拍下那一刻的樣子）。這正是「戰術板降級成暫時白板」的意思：
// 存檔不再是一份會跟著名單變動的正規化資料，而是「某個時間點的一張快照」。

import type { PlayerRole } from "./match";
import type { Marker, DefenseRange } from "./tacticsBoard";

export interface SnapshotPlayer {
  // sourcePlayerId 僅供追溯用（例如未來想做「這個球員後來去哪了」之類的除錯/分析）。
  // 渲染畫面、或再次存檔時，一律不得拿這個 id 回名單查資料——那樣就違背了「快照」的意義，
  // 又變回正規化、又會被刪球員/改名污染。null 代表這個站位當初就查無此人（幽靈 id）。
  sourcePlayerId: string | null;
  name: string;
  number: number;
  role: PlayerRole;
  x: number; // 0~1 normalized，與 PlayerPosition 同座標系（見 rotationLogic.ts 的 zoneCoords）
  y: number;
  isLibero: boolean;
}

// 快照是從哪裡擷取出來的——之後除錯、或畫面上想標示「這是輪轉表當時的站位」等情境會用到。
export type SnapshotSource = "rotation" | "scoresheet" | "saved-tactic" | "blank";

export interface CourtSnapshot {
  source: SnapshotSource;
  matchId: string | null;
  rotation: number; // 來源輪次（scoresheet/blank 沒有輪次概念，一律給 0）
  capturedAt: string; // ISO 字串，記錄「拍照片」的當下時間
  players: SnapshotPlayer[];
}

// 一個「場景」＝一張快照 + 畫在上面的箭頭/防守範圍。之所以叫 scene（景）而不是沿用舊的
// 「輪次」概念，是因為戰術板降級後不再跟著輪轉表的 0~5 輪次走，而是「這一刻擷取的一張獨立
// 畫面」，跟輪次數字脫鉤。
export interface TacticScene {
  label: string;
  snapshot: CourtSnapshot;
  markers: Marker[];
  defenseRanges: DefenseRange[];
}

export interface SavedTacticDataV2 {
  version: 2;
  // 存檔格式先設計成陣列，即使目前恆為長度 1（見上面「單景決策」）——這樣未來如果要做
  // 「一份戰術存多個畫面（多景）」，只要放寬「恆為 1」這條產品限制，資料格式（DB 裡的
  // jsonb 欄位）完全不用改、不用寫任何 migration，舊資料也自動相容（scenes 陣列本來就
  // 存在，只是舊資料永遠只有一個元素）。這是先把「資料形狀」留好彈性，之後加功能才不用
  // 動資料庫。
  scenes: TacticScene[];
}
