import type { MatchPlayer } from "./match";
import type { LineupSnapshot } from "./scoresheet";

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
  // 哪個球員站哪個號位，完全由教練拖曳決定（見 hooks/useRotationTable.ts 的 placePlayerOnCourt）。
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
  // 不含自由球員：L 走下面的 liberoZones（他不參與輪轉，見那裡的說明）。
  lineup: LineupSnapshot;

  // 自由球員這一輪站哪個後排號位（1/5/6），null＝這一輪沒派 L。長度固定 6，index 是輪次。
  //
  // 為什麼是六格陣列、而不是單一個 liberoZone：自由球員不佔輪轉序（規則上他是替換上場的），
  // 所以「L 站哪格」本來就不能從第 0 輪推算到其他輪——教練可以在第 0 輪讓 L 守 1 號位、
  // 第 3 輪讓他守 5 號位，這是各輪獨立的真實資訊，不是冗餘。真正冗餘、因此被刪掉的是舊的
  // liberoReplacement（被 L 蓋住的人）：那個人 = 該輪落在 liberoZones[i] 那一格的人，
  // 從 lineup 現算得出來，不需要另存一份會跟 lineup 走鐘的副本。
  liberoZones: (number | null)[];

  // 備位區要顯示哪位 L——名單裡可能有多個 L，但場上（備位區）同時只能有一位。
  startingLiberoId: string | null;
}
