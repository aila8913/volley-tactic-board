import type { MatchPlayer } from "./match";
import type { LineupZones } from "./scoresheet";

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

// 「一場比賽」自己的輪轉狀態（issue #119）。這是會跨場污染的部分，所以在 store 裡用
// matchId 當 key 分片存放（dataByMatch[matchId]），一場一份、彼此不互相覆寫。
//
// 刻意不含 circleLabel（圈圈顯示姓名/背號/位置）：那是全域顯示偏好，不隨某一場比賽走，
// ScoreSheetCourt 也直接讀它，所以它留在 store 頂層當全域欄位、不進 dataByMatch 分片。
export interface PerMatchRotationState {
  // 完整球員名單（人數不固定），跟比賽列表那邊的 match.players 是同一份資料、同一個型別，
  // 編輯這裡會回寫到 match list。lineup 裡的 playerId 直接存這份名單裡的球員 id，
  // 哪個球員站哪個號位，完全由教練拖曳決定（右欄輪轉表的六格 → setLineupZones）。
  roster: MatchPlayer[];
  currentRotation: number;

  // ── 站位的唯一表示法（issue #231 PR3）────────────────────────────────────────
  // 這裡以前存的是 rotations: RotationPositions[]（六輪各一份座標陣列）。那個形狀有兩個
  // 問題：(a) 六輪裡有五輪是第一輪用 rotateZone 算出來的，存起來等於同一件事存六份；
  // (b) 座標本身也只是號位的另一種編碼（findNearestZone/getZoneCoords 只認 6 個固定格），
  // 又是同一件事的第二種寫法。同一件事存好幾份 → 必然有「幾份不同步」這種 bug 的空間，
  // #14 / #231 那一串自由球員的怪象全都是這麼來的。
  //
  // 現在只存「真正帶資訊量」的兩樣東西，其他一律渲染時現算（lib/rotationLogic.ts 的
  // deriveRotation）。這就是 docs/event-grammar-spec.md 那條「能推導就不存」套到前端 store。

  // 先發：起始號位（1~6）→ 球員 id。key 是「第 0 輪站哪一格」，其他輪次用 rotateZone 換算。
  // 刻意允許 0~6 人（不是「要嘛滿六人、要嘛沒有」）——教練排先發必然經過 1~5 人的中間狀態，
  // 用「不滿六人就不算數」去表示編輯中的資料，就是 #174 那個「點了放不上去」死結的成因。
  // 「可不可以開賽」是另一個問題，由 isLineupFull 這道獨立的門檻回答。
  // 不含自由球員：L 不參與輪轉，他是換人上場的（見下面 startingLiberoId 的說明）。
  lineup: LineupZones;

  // 這一場的先發自由球員是誰——名單裡可能有多位 L，但一次只有一位是先發。
  //
  // ⚠️ 這是賽前**規劃**的全部：只有「誰」，沒有「他頂替誰」。
  //
  // 這裡以前還有一個 liberoReplacesPlayerId（L 頂替哪一個球員），在 #425 移除。#326 定下
  // 「頂替誰」這個表示法時是對的——它取代的是更糟的 liberoZones（L 在六輪各站哪一格，一次
  // 換人卻要記六次，#14 那串自由球員怪象的病根）。#425 改的不是表示法而是**時機**：賽前
  // 一次替換都還沒發生，那時寫下的「L 頂替 12 號」是計畫；但它會被凍進該局的先發快照，
  // 讀起來就像紀錄。這個 app 產出的是紀錄，所以那個欄位的家不在這裡。
  //
  // 「L 現在頂替著誰」仍然存在，只是住在它該住的地方——比賽進行中的 useScoreSheet
  //（record.liberoSubstitution，由球場上那顆 L 鈕寫入）。lib/rotationLogic 的 deriveRotation
  // 第三個參數就是餵那個值：純函式沒變，變的是「賽前這一側沒有值可以餵給它」。
  startingLiberoId: string | null;
}
