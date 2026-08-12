// ── 為什麼要有這個檔案（issue #292 → #306）──
// scoreSheetMapping.test.ts 原本每個 describe 都自己手刻一份「假的後端 DTO」物件字面量
// （像 `const set: MatchSet = { id: "9", matchId: 3, ... }`），同一種資料形狀在檔案裡重複
// 出現幾十次。問題不是「打字比較累」，而是耦合：#64 PR1 把 sets/rallies/events 這幾張表的
// 主鍵從 `number` 改成 `uuid`（string）時，這些欄位散落在 36+ 個地方，得逐一手動改型別，
// 而且改漏一處只有 TypeScript 報錯才會發現。
//
// 這裡改用「builder 函式」集中造假資料：每個型別只在這一個檔案裡描述一次「一筆最普通、
// 不帶任何特殊意義的資料長什麼樣子」，各測試呼叫時只覆寫自己在意的欄位（用
// `Partial<T>` 當 overrides）。下次後端型別再變（例如哪個欄位改型別、加欄位），只要
// 改這裡的預設值，其他呼叫端幾乎不用動。
//
// 規則（很重要，之後加新 builder 也要遵守）：
// 預設值必須是「最無意義、最普通」的值，不能是某個測試正在斷言的條件。
// 例如：不能把 `firstServer` 的預設值定成 `null`，因為某個測試可能剛好在驗證
// 「firstServer 是 null 時會怎樣」——如果這個測試沒有明確自己傳入 `firstServer: null`，
// 讀測試的人會看不出這個 null 是刻意安排的還是 fixture 剛好給的。凡是某個測試在乎的值，
// 一律要在該測試的呼叫裡明講，不能只靠 fixture 的預設值撐著。

import type {
  MatchSet,
  Rally,
  MatchEvent,
  Substitution,
  Timeout,
  Lineup,
} from "@workspace/api-client-react";

// 造一筆最普通的 set（第 1 局、home 先發、matchId 固定給 1）。
export function makeSet(over: Partial<MatchSet> = {}): MatchSet {
  return {
    id: "set-1",
    matchId: 1,
    setNumber: 1,
    firstServer: "home",
    ...over,
  };
}

// 造一筆最普通的 rally（比分/輪轉都是 0，winner 固定 home——重建邏輯只看 winner 誰贏，
// 需要驗證比分/輪轉細節的測試要自己覆寫這些欄位）。
export function makeRally(over: Partial<Rally> = {}): Rally {
  return {
    id: "rally-1",
    setId: "set-1",
    rallyNumber: 1,
    homeScore: 0,
    awayScore: 0,
    homeRotation: 0,
    awayRotation: 0,
    winner: "home",
    ...over,
  };
}

// 造一筆最普通的 event（只填重建會用到的欄位，其他 nullable 欄位給 null 當「沒有值」）。
export function makeEvent(over: Partial<MatchEvent> = {}): MatchEvent {
  return {
    id: "event-1",
    rallyId: "rally-1",
    sequence: 1,
    side: "home",
    playerId: null,
    action: "attack",
    // ballType 是 `BallType | undefined`（optional，不是 nullable）——跟其他欄位不同，
    // 不能填 null 當預設值，這裡直接不給、讓它維持 undefined（optional 屬性沒帶等同 undefined）。
    quality: null,
    fromX: null,
    fromY: null,
    toX: null,
    toY: null,
    tags: [],
    note: null,
    videoTimestamp: null,
    source: "live",
    ...over,
  };
}

// 造一筆最普通的 substitution（換人事件，kind 固定 regular——libero 情境的測試要自己
// 覆寫 kind）。seq 是伺服器插入時指派的順序流水號，這裡固定給 1，只是為了滿足型別
// （Substitution.seq 是必填欄位），大多數測試不看這個值。
export function makeSubstitution(over: Partial<Substitution> = {}): Substitution {
  return {
    id: "sub-1",
    setId: "set-1",
    homeScore: 0,
    awayScore: 0,
    playerInId: "1",
    playerOutId: "2",
    kind: "regular",
    seq: 1,
    ...over,
  };
}

// 造一筆最普通的暫停紀錄。
export function makeTimeout(over: Partial<Timeout> = {}): Timeout {
  return {
    id: "timeout-1",
    setId: "set-1",
    homeScore: 0,
    awayScore: 0,
    side: "home",
    seq: 1,
    ...over,
  };
}

// 造一筆最普通的先發名單（六個站位）。
// 注意：Lineup.id 是 DB serial 整數（不是像其他表那樣的 client-mintable uuid），
// 所以這裡的預設值維持 number 型別，跟其他 builder 的 id 是字串不同。
export function makeLineup(over: Partial<Lineup> = {}): Lineup {
  return {
    id: 1,
    setId: "set-1",
    zone1PlayerId: "1",
    zone2PlayerId: "2",
    zone3PlayerId: "3",
    zone4PlayerId: "4",
    zone5PlayerId: "5",
    zone6PlayerId: "6",
    // 預設「這局沒排自由球員」（#359）：這兩欄 nullable，多數 fixture 用不到，要測 L 的
    // case 用 over 覆寫即可。明寫 null 而不是省略，是因為 DTO 上它們是必填的 nullable
    // 欄位——省略就編不過，這正是 openapi 那邊刻意把讀取端設成 required 想要的效果。
    startingLiberoId: null,
    liberoReplacesPlayerId: null,
    ...over,
  };
}
