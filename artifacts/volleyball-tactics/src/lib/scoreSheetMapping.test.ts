import { describe, it, expect } from "vitest";
import {
  sideToApi,
  apiToSide,
  pointRecordToRally,
  pointRecordToEvent,
  eventToMeta,
  reconstructSetFromRallies,
  isSetComplete,
  regularSubToApi,
  reconstructRegularSubs,
  timeoutToApi,
  reconstructTimeouts,
  reconstructRecording,
  disabledActions,
  lineupSnapshotToApi,
  apiLineupToSnapshot,
} from "./scoreSheetMapping";
import type { PointRecord, RegularSub, LineupSnapshot } from "../types/scoresheet";
import type {
  MatchSet,
  Rally,
  MatchEvent,
  Substitution,
  Timeout,
  Lineup,
} from "@workspace/api-client-react";

// 純函式，最適合單元測試。重點是 us/opponent↔home/away 的翻譯，以及最容易出錯的
// 「從 rally 序列 replay 回比分/發球方/輪轉」——輪轉規則（只有 side-out 才轉）很細，
// 用測試釘住比較安心。

describe("side mapping", () => {
  it("maps us↔home and opponent↔away both ways", () => {
    expect(sideToApi("us")).toBe("home");
    expect(sideToApi("opponent")).toBe("away");
    expect(apiToSide("home")).toBe("us");
    expect(apiToSide("away")).toBe("opponent");
  });
});

describe("isSetComplete", () => {
  it("needs 25 with a 2-point lead in a normal set", () => {
    expect(isSetComplete(1, 0, 0)).toBe(false);
    expect(isSetComplete(1, 25, 24)).toBe(false); // 到 25 但只領先 1，deuce
    expect(isSetComplete(1, 25, 23)).toBe(true);
    expect(isSetComplete(1, 24, 22)).toBe(false); // 領先 2 但還沒到 25
    expect(isSetComplete(1, 27, 25)).toBe(true); // deuce 後淨勝 2
  });

  it("only needs 15 in the deciding 5th set", () => {
    expect(isSetComplete(5, 15, 13)).toBe(true);
    expect(isSetComplete(5, 15, 14)).toBe(false); // 領先 1，要 deuce
    expect(isSetComplete(5, 14, 12)).toBe(false); // 領先 2 但還沒到 15
    expect(isSetComplete(4, 15, 13)).toBe(false); // 第 4 局仍是 25 分制
  });
});

describe("disabledActions (issue #50 規則#1：發球/接發互斥)", () => {
  it("disables nothing before the first server is chosen", () => {
    expect(disabledActions(null, "us")).toEqual([]);
    expect(disabledActions(null, "opponent")).toEqual([]);
  });

  it("greys 接發 for whichever side is serving", () => {
    // 我方發球：我方球員是發球方 → 不會「接發」；對手是接發方 → 不會「發球」。
    expect(disabledActions("us", "us")).toEqual(["receive"]);
    expect(disabledActions("us", "opponent")).toEqual(["serve"]);
  });

  it("flips when the opponent is serving", () => {
    // 對方發球：對手是發球方 → 不會「接發」；我方是接發方 → 不會「發球」。
    expect(disabledActions("opponent", "opponent")).toEqual(["receive"]);
    expect(disabledActions("opponent", "us")).toEqual(["serve"]);
  });

  it("only ever greys serve or receive, never the other four actions", () => {
    // 不管誰發球、誰動作，被反灰的永遠只有 serve 或 receive 這一對，且恰好一顆。
    // 舉球/攻擊/攔網/防守在一分裡兩邊都可能做、都可能是決定球，一律保留（見 #50：C8
    // 得分分支依 Data Volley 慣例站不住，防守/舉球得分各記自己、不轉攻擊）。
    const combos: Array<["us" | "opponent", "us" | "opponent"]> = [
      ["us", "us"],
      ["us", "opponent"],
      ["opponent", "us"],
      ["opponent", "opponent"],
    ];
    for (const [serving, actor] of combos) {
      const disabled = disabledActions(serving, actor);
      expect(disabled).toHaveLength(1);
      expect(["serve", "receive"]).toContain(disabled[0]);
      for (const kept of ["set", "attack", "block", "dig"]) expect(disabled).not.toContain(kept);
    }
  });
});

describe("pointRecordToRally", () => {
  it("carries the score-before and maps the winner side", () => {
    const point: PointRecord = { side: "us", wasSideOut: true };
    expect(pointRecordToRally(point, 5, 4, 3)).toEqual({
      rallyNumber: 5,
      homeScore: 4,
      awayScore: 3,
      winner: "home",
    });
  });
});

describe("pointRecordToEvent", () => {
  it("returns null when there is no action (e.g. 沒看到)", () => {
    expect(pointRecordToEvent({ side: "us", wasSideOut: false }, 1)).toBeNull();
  });

  it("returns null when action exists but no touchedBy", () => {
    expect(pointRecordToEvent({ side: "us", wasSideOut: false, action: "attack" }, 1)).toBeNull();
  });

  it("maps our player's touch, stringified id → int", () => {
    const point: PointRecord = {
      side: "us",
      wasSideOut: false,
      action: "attack",
      touchedBy: { side: "us", playerId: "12", zone: 4 },
    };
    expect(pointRecordToEvent(point, 1)).toEqual({
      sequence: 1,
      side: "home",
      playerId: "12",
      action: "attack",
      source: "live",
    });
  });

  it("maps 對手(全體) touch to away with null playerId", () => {
    const point: PointRecord = {
      side: "opponent",
      wasSideOut: true,
      action: "serve",
      touchedBy: { side: "opponent" }, // 對手沒有名單 → playerId undefined
    };
    expect(pointRecordToEvent(point, 1)).toEqual({
      sequence: 1,
      side: "away",
      playerId: null,
      action: "serve",
      source: "live",
    });
  });
});

// 造一個後端 event（只填重建會用到的欄位，其他 nullable 給預設）。
const makeEvent = (over: Partial<MatchEvent> & Pick<MatchEvent, "rallyId">): MatchEvent => ({
  id: 1,
  sequence: 1,
  side: "home",
  playerId: null,
  action: "attack",
  ballType: null,
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
});

describe("eventToMeta", () => {
  it("maps our player's event back to touchedBy (int id → string)", () => {
    expect(
      eventToMeta(makeEvent({ rallyId: 1, side: "home", playerId: "12", action: "attack" })),
    ).toEqual({ action: "attack", touchedBy: { side: "us", playerId: "12" } });
  });

  it("maps an opponent-side event with null player to undefined playerId", () => {
    expect(
      eventToMeta(makeEvent({ rallyId: 1, side: "away", playerId: null, action: "serve" })),
    ).toEqual({ action: "serve", touchedBy: { side: "opponent", playerId: undefined } });
  });

  it("round-trips with pointRecordToEvent for our player", () => {
    const point: PointRecord = {
      side: "us",
      wasSideOut: false,
      action: "block",
      touchedBy: { side: "us", playerId: "7" },
    };
    const ev = pointRecordToEvent(point, 1)!;
    const meta = eventToMeta(makeEvent({ ...ev, rallyId: 1 }));
    expect(meta.action).toBe("block");
    expect(meta.touchedBy).toEqual({ side: "us", playerId: "7" });
  });
});

describe("reconstructSetFromRallies", () => {
  const set: MatchSet = { id: 9, matchId: 3, setNumber: 1, firstServer: "home" };
  const rally = (rallyNumber: number, winner: "home" | "away", id = rallyNumber): Rally => ({
    id,
    setId: 9,
    rallyNumber,
    homeScore: 0, // 重建時不看 rally 存的 before-score，靠 replay 自己算，這欄位在測試裡不重要
    awayScore: 0,
    winner,
  });

  it("with no rallies, serving stays the first server and everything is zero", () => {
    const state = reconstructSetFromRallies(set, []);
    expect(state).toEqual({
      setNumber: 1,
      ourScore: 0,
      opponentScore: 0,
      serving: "us", // firstServer = home = us
      ourRotation: 0,
      opponentRotation: 0,
      history: [],
      serverId: 9,
    });
  });

  it("server holding serve scores without rotating", () => {
    // 我方先發，連得兩分：都不是 side-out，不輪轉。
    const state = reconstructSetFromRallies(set, [rally(1, "home"), rally(2, "home")]);
    expect(state.ourScore).toBe(2);
    expect(state.opponentScore).toBe(0);
    expect(state.serving).toBe("us");
    expect(state.ourRotation).toBe(0);
    expect(state.opponentRotation).toBe(0);
    expect(state.history.map((h) => h.wasSideOut)).toEqual([false, false]);
  });

  it("a side-out rotates only the side that won it, and flips serve", () => {
    // 我方先發，第 1 分對方贏（side-out）→ 對方奪回發球權、對方輪轉一格；我方不動。
    const state = reconstructSetFromRallies(set, [rally(1, "away")]);
    expect(state.ourScore).toBe(0);
    expect(state.opponentScore).toBe(1);
    expect(state.serving).toBe("opponent");
    expect(state.ourRotation).toBe(0);
    expect(state.opponentRotation).toBe(1);
    expect(state.history[0].wasSideOut).toBe(true);
    expect(state.history[0].serverId).toBe(1);
  });

  it("replays an alternating exchange, tracking both rotations independently", () => {
    // home 先發：away 贏(side-out, away轉1) → home 贏(side-out, home轉1) → home 續分(不轉)
    //          → away 贏(side-out, away轉2)
    const state = reconstructSetFromRallies(set, [
      rally(1, "away"),
      rally(2, "home"),
      rally(3, "home"),
      rally(4, "away"),
    ]);
    expect(state.ourScore).toBe(2);
    expect(state.opponentScore).toBe(2);
    expect(state.serving).toBe("opponent");
    expect(state.ourRotation).toBe(1);
    expect(state.opponentRotation).toBe(2);
  });

  it("sorts by rallyNumber before replaying (order-independent input)", () => {
    const shuffled = [rally(2, "home"), rally(1, "away")];
    const state = reconstructSetFromRallies(set, shuffled);
    // 正確順序應為 away 然後 home：away side-out 得 1，home side-out 奪回，比分 1:1，發球回我方
    expect(state.ourScore).toBe(1);
    expect(state.opponentScore).toBe(1);
    expect(state.serving).toBe("us");
  });

  it("attaches action/touchedBy from events when the map is provided (3b-ii)", () => {
    const rallies = [rally(1, "home", 100), rally(2, "away", 200)];
    const eventsByRallyId = new Map<number, MatchEvent[]>([
      [100, [makeEvent({ rallyId: 100, side: "home", playerId: "12", action: "attack" })]],
      [200, [makeEvent({ rallyId: 200, side: "away", playerId: null, action: "serve" })]],
    ]);
    const state = reconstructSetFromRallies(set, rallies, eventsByRallyId);
    expect(state.history[0]).toMatchObject({
      side: "us",
      serverId: 100,
      action: "attack",
      touchedBy: { side: "us", playerId: "12" },
    });
    expect(state.history[1]).toMatchObject({
      side: "opponent",
      serverId: 200,
      action: "serve",
      touchedBy: { side: "opponent", playerId: undefined },
    });
  });

  it("leaves a rally with no event as a 沒看到 point (no action/touchedBy)", () => {
    const rallies = [rally(1, "home", 100), rally(2, "home", 200)];
    // 只有 rally 100 有 event；rally 200 是「沒看到」，map 裡沒有它。
    const eventsByRallyId = new Map<number, MatchEvent[]>([
      [100, [makeEvent({ rallyId: 100, side: "home", playerId: "5", action: "dig" })]],
    ]);
    const state = reconstructSetFromRallies(set, rallies, eventsByRallyId);
    expect(state.history[0].action).toBe("dig");
    expect(state.history[1].action).toBeUndefined();
    expect(state.history[1].touchedBy).toBeUndefined();
  });

  it("picks the first event (lowest sequence) when a rally has several", () => {
    const rallies = [rally(1, "home", 100)];
    const eventsByRallyId = new Map<number, MatchEvent[]>([
      [
        100,
        [
          makeEvent({ rallyId: 100, sequence: 1, side: "home", playerId: "3", action: "receive" }),
          makeEvent({ rallyId: 100, sequence: 2, side: "home", playerId: "9", action: "attack" }),
        ],
      ],
    ]);
    const state = reconstructSetFromRallies(set, rallies, eventsByRallyId);
    expect(state.history[0]).toMatchObject({ action: "receive", touchedBy: { playerId: "3" } });
  });
});

describe("regularSubToApi", () => {
  it("stringifies player ids to ints and tags kind='regular'", () => {
    const sub: RegularSub = { outPlayerId: "7", inPlayerId: "12" };
    expect(regularSubToApi(sub, 10, 8)).toEqual({
      homeScore: 10,
      awayScore: 8,
      playerInId: "12",
      playerOutId: "7",
      kind: "regular",
    });
  });
});

// 造一個後端 substitution row（只填重建會用到的欄位）。
const makeSub = (
  over: Partial<Substitution> & Pick<Substitution, "playerInId" | "playerOutId">,
): Substitution => ({
  id: 1,
  setId: 9,
  homeScore: 0,
  awayScore: 0,
  kind: "regular",
  ...over,
});

describe("reconstructRecording", () => {
  it("returns an empty record when the match has no sets yet", () => {
    const state = reconstructRecording([], [], [], []);
    expect(state).toEqual({
      currentSet: {
        setNumber: 1,
        ourScore: 0,
        opponentScore: 0,
        serving: null,
        ourRotation: 0,
        opponentRotation: 0,
        history: [],
      },
      completedSets: [],
      lineup: null,
      liberoSubstitution: null,
      regularSubs: [],
      subCountsHistory: [],
      timeouts: [],
      timeoutCountsHistory: [],
    });
  });

  it("treats the last set (highest setNumber) as in-progress, earlier ones as completed", () => {
    const set1: MatchSet = { id: 1, matchId: 3, setNumber: 1, firstServer: "home" };
    const set2: MatchSet = { id: 2, matchId: 3, setNumber: 2, firstServer: "away" };
    const rally = (
      setId: number,
      rallyNumber: number,
      winner: "home" | "away",
      id: number,
    ): Rally => ({
      id,
      setId,
      rallyNumber,
      homeScore: 0,
      awayScore: 0,
      winner,
    });
    // 第 1 局：home 先發，home 連得 2 分 → 2:0 已結束。
    const set1Rallies = [rally(1, 1, "home", 100), rally(1, 2, "home", 101)];
    // 第 2 局：away 先發，home 得 1 分（side-out）→ 1:0 進行中。
    const set2Rallies = [rally(2, 1, "home", 200)];

    const state = reconstructRecording([set1, set2], [set1Rallies, set2Rallies], [], []);

    // lineup: null——這個測試沒有傳 lineups 參數（第 5 個參數留空預設 []），沒有任何
    // 先發資料可以回填，見 findLineupSnapshotForSet 找不到 setId 對應 row 時回傳 null。
    expect(state.completedSets).toEqual([
      { setNumber: 1, ourScore: 2, opponentScore: 0, history: expect.any(Array), lineup: null },
    ]);
    expect(state.currentSet.setNumber).toBe(2);
    expect(state.currentSet.ourScore).toBe(1);
    expect(state.currentSet.opponentScore).toBe(0);
    expect(state.currentSet.serverId).toBe(2);
  });

  it("attaches events to the right rallies across multiple sets", () => {
    const set1: MatchSet = { id: 1, matchId: 3, setNumber: 1, firstServer: "home" };
    const set2: MatchSet = { id: 2, matchId: 3, setNumber: 2, firstServer: "home" };
    const set1Rallies: Rally[] = [
      { id: 100, setId: 1, rallyNumber: 1, homeScore: 0, awayScore: 0, winner: "home" },
    ];
    const set2Rallies: Rally[] = [
      { id: 200, setId: 2, rallyNumber: 1, homeScore: 0, awayScore: 0, winner: "home" },
    ];
    const events: MatchEvent[] = [
      makeEvent({ rallyId: 100, side: "home", playerId: "5", action: "serve" }),
      makeEvent({ rallyId: 200, side: "home", playerId: "9", action: "attack" }),
    ];

    const state = reconstructRecording([set1, set2], [set1Rallies, set2Rallies], events, []);

    expect(state.completedSets[0].history[0]).toMatchObject({
      action: "serve",
      touchedBy: { playerId: "5" },
    });
    expect(state.currentSet.history[0]).toMatchObject({
      action: "attack",
      touchedBy: { playerId: "9" },
    });
  });

  it("rebuilds subCountsHistory per completed set and regularSubs for the in-progress set", () => {
    const set1: MatchSet = { id: 1, matchId: 3, setNumber: 1, firstServer: "home" };
    const set2: MatchSet = { id: 2, matchId: 3, setNumber: 2, firstServer: "home" };
    const set1Rallies: Rally[] = [
      { id: 100, setId: 1, rallyNumber: 1, homeScore: 0, awayScore: 0, winner: "home" },
    ];
    const set2Rallies: Rally[] = [
      { id: 200, setId: 2, rallyNumber: 1, homeScore: 0, awayScore: 0, winner: "home" },
    ];
    const subs = [
      makeSub({ setId: 1, playerOutId: "1", playerInId: "2", homeScore: 0, awayScore: 0 }),
      makeSub({ setId: 2, playerOutId: "3", playerInId: "4", homeScore: 1, awayScore: 0 }),
    ];

    const state = reconstructRecording([set1, set2], [set1Rallies, set2Rallies], [], subs);

    expect(state.subCountsHistory).toEqual([1]); // 第 1 局（已結束）換了 1 次
    expect(state.regularSubs).toEqual([{ outPlayerId: "3", inPlayerId: "4" }]); // 第 2 局（進行中）
  });

  // #63 迴歸測試：按「下一局」後那個「還沒選先發方」的空局，現在會先寫進後端成一筆
  // firstServer=null 的 set row。重建時它是最後一局（進行中），必須還原成「這局由誰先發球？」
  // 的空狀態——而不是退回顯示上一局（那正是 #63 修好前的錯誤行為）。
  it("rebuilds a trailing firstServer=null set as an empty in-progress set (issue #63)", () => {
    const set1: MatchSet = { id: 1, matchId: 3, setNumber: 1, firstServer: "home" };
    // 剛按下一局建出來的空局：firstServer 還沒選，是 null，底下一定沒有任何 rally。
    const set2: MatchSet = { id: 2, matchId: 3, setNumber: 2, firstServer: null };
    const set1Rallies: Rally[] = [
      { id: 100, setId: 1, rallyNumber: 1, homeScore: 0, awayScore: 0, winner: "home" },
      { id: 101, setId: 1, rallyNumber: 2, homeScore: 1, awayScore: 0, winner: "home" },
    ];

    const state = reconstructRecording([set1, set2], [set1Rallies, []], [], []);

    // 第 1 局照常收進 completedSets（2:0）；lineup: null 理由同上一個測試——沒傳 lineups。
    expect(state.completedSets).toEqual([
      { setNumber: 1, ourScore: 2, opponentScore: 0, history: expect.any(Array), lineup: null },
    ]);
    // 第 2 局是進行中，但因為 firstServer=null 而重建成空局：serving=null 觸發「誰先發球？」畫面，
    // 比分/輪轉全 0、沒有任何 history，且已帶著後端 row 的 serverId（選好先發後 PATCH 這個 id）。
    expect(state.currentSet.setNumber).toBe(2);
    expect(state.currentSet.serving).toBeNull();
    expect(state.currentSet.ourScore).toBe(0);
    expect(state.currentSet.opponentScore).toBe(0);
    expect(state.currentSet.history).toEqual([]);
    expect(state.currentSet.serverId).toBe(2);
  });

  // issue #115：reload 後把每一局的先發從後端 lineups 讀回來，計分表才不會又退回去讀
  // （可能被別場/存檔污染的）全域 store。
  it("seeds the current set's lineup from the lineups list", () => {
    const set1: MatchSet = { id: 1, matchId: 3, setNumber: 1, firstServer: "home" };
    const set1Rallies: Rally[] = [
      { id: 100, setId: 1, rallyNumber: 1, homeScore: 0, awayScore: 0, winner: "home" },
    ];
    const lineups: Lineup[] = [
      {
        id: 1,
        setId: 1,
        zone1PlayerId: "11",
        zone2PlayerId: "12",
        zone3PlayerId: "13",
        zone4PlayerId: "14",
        zone5PlayerId: "15",
        zone6PlayerId: "16",
      },
    ];

    const state = reconstructRecording([set1], [set1Rallies], [], [], lineups);
    expect(state.lineup).toEqual({ 1: "11", 2: "12", 3: "13", 4: "14", 5: "15", 6: "16" });
  });

  it("does NOT carry a previous set's lineup into a trailing firstServer=null set (per-set lineup)", () => {
    // 先發每局可不同：剛按下一局的空局（set2, firstServer=null）還沒寫自己的 lineup，就給 null
    // ——畫面停在「這局誰先發球」、還不需要顯示球場，等教練選先發方時才擷取這一局的新先發。
    // 不沿用 set1 的先發，才能支援逐局換陣。
    const set1: MatchSet = { id: 1, matchId: 3, setNumber: 1, firstServer: "home" };
    const set2: MatchSet = { id: 2, matchId: 3, setNumber: 2, firstServer: null };
    const set1Rallies: Rally[] = [
      { id: 100, setId: 1, rallyNumber: 1, homeScore: 0, awayScore: 0, winner: "home" },
    ];
    const lineups: Lineup[] = [
      {
        id: 1,
        setId: 1,
        zone1PlayerId: "11",
        zone2PlayerId: "12",
        zone3PlayerId: "13",
        zone4PlayerId: "14",
        zone5PlayerId: "15",
        zone6PlayerId: "16",
      },
    ];

    const state = reconstructRecording([set1, set2], [set1Rallies, []], [], [], lineups);
    expect(state.currentSet.setNumber).toBe(2);
    expect(state.lineup).toBeNull();
  });

  it("reads the in-progress set's own lineup, independent of earlier sets (per-set lineup)", () => {
    // set2 進行中，且有自己的先發（跟 set1 不同人）——要讀回 set2 自己那一份，不是 set1 的。
    const set1: MatchSet = { id: 1, matchId: 3, setNumber: 1, firstServer: "home" };
    const set2: MatchSet = { id: 2, matchId: 3, setNumber: 2, firstServer: "home" };
    const set1Rallies: Rally[] = [
      { id: 100, setId: 1, rallyNumber: 1, homeScore: 0, awayScore: 0, winner: "home" },
    ];
    const set2Rallies: Rally[] = [
      { id: 200, setId: 2, rallyNumber: 1, homeScore: 0, awayScore: 0, winner: "home" },
    ];
    const lineups: Lineup[] = [
      {
        id: 1,
        setId: 1,
        zone1PlayerId: "11",
        zone2PlayerId: "12",
        zone3PlayerId: "13",
        zone4PlayerId: "14",
        zone5PlayerId: "15",
        zone6PlayerId: "16",
      },
      {
        id: 2,
        setId: 2,
        zone1PlayerId: "21",
        zone2PlayerId: "22",
        zone3PlayerId: "23",
        zone4PlayerId: "24",
        zone5PlayerId: "25",
        zone6PlayerId: "26",
      },
    ];

    const state = reconstructRecording([set1, set2], [set1Rallies, set2Rallies], [], [], lineups);
    expect(state.lineup).toEqual({ 1: "21", 2: "22", 3: "23", 4: "24", 5: "25", 6: "26" });
  });

  it("leaves lineup null when no lineups are provided", () => {
    const set1: MatchSet = { id: 1, matchId: 3, setNumber: 1, firstServer: "home" };
    const set1Rallies: Rally[] = [
      { id: 100, setId: 1, rallyNumber: 1, homeScore: 0, awayScore: 0, winner: "home" },
    ];
    const state = reconstructRecording([set1], [set1Rallies], [], []);
    expect(state.lineup).toBeNull();
  });
});

// issue #115：先發快照（號位→字串 id）跟後端 lineups DTO（zone1~6PlayerId 整數）互轉，
// 跟 regularSub 的 Number()/String() 是同一套慣例，round-trip 要對得回來。
describe("lineup snapshot mapping", () => {
  it("round-trips snapshot ↔ api", () => {
    const snapshot: LineupSnapshot = { 1: "11", 2: "12", 3: "13", 4: "14", 5: "15", 6: "16" };
    expect(lineupSnapshotToApi(snapshot)).toEqual({
      zone1PlayerId: "11",
      zone2PlayerId: "12",
      zone3PlayerId: "13",
      zone4PlayerId: "14",
      zone5PlayerId: "15",
      zone6PlayerId: "16",
    });
    const row: Lineup = {
      id: 9,
      setId: 2,
      zone1PlayerId: "11",
      zone2PlayerId: "12",
      zone3PlayerId: "13",
      zone4PlayerId: "14",
      zone5PlayerId: "15",
      zone6PlayerId: "16",
    };
    expect(apiLineupToSnapshot(row)).toEqual(snapshot);
  });
});

describe("reconstructRegularSubs", () => {
  it("keeps two independent subs at different positions", () => {
    // 位置 1 換成 2，位置 4 換成 5，兩筆彼此不相干，都保留。
    const subs = [
      makeSub({ playerOutId: "1", playerInId: "2", homeScore: 3, awayScore: 1 }),
      makeSub({ playerOutId: "4", playerInId: "5", homeScore: 6, awayScore: 2 }),
    ];
    expect(reconstructRegularSubs(subs)).toEqual([
      { outPlayerId: "1", inPlayerId: "2" },
      { outPlayerId: "4", inPlayerId: "5" },
    ]);
  });

  it("collapses a chained re-substitution the same way the live store's dedup does", () => {
    // 先 {out:1,in:2}，之後 {out:2,in:3}：後者的 outPlayerId="2" 剛好等於前一筆的
    // inPlayerId，dedup 會把前一筆濾掉，只留下最後這筆——跟 useScoreSheet.ts 的
    // recordRegularSub 是同一套邏輯（見 scoreSheetMapping.ts 的函式註解）。
    const subs = [
      makeSub({ playerOutId: "1", playerInId: "2", homeScore: 3, awayScore: 1 }),
      makeSub({ playerOutId: "2", playerInId: "3", homeScore: 5, awayScore: 2 }),
    ];
    expect(reconstructRegularSubs(subs)).toEqual([{ outPlayerId: "2", inPlayerId: "3" }]);
  });

  it("ignores libero rows (issue #43 territory, not regular subs)", () => {
    const subs = [
      makeSub({ playerOutId: "1", playerInId: "2", homeScore: 3, awayScore: 1 }),
      makeSub({ playerOutId: "6", playerInId: null, kind: "libero", homeScore: 4, awayScore: 1 }),
    ];
    expect(reconstructRegularSubs(subs)).toEqual([{ outPlayerId: "1", inPlayerId: "2" }]);
  });

  it("skips regular rows with a null player id (shouldn't happen, but defends against it)", () => {
    const subs = [
      makeSub({ playerOutId: "1", playerInId: null, homeScore: 3, awayScore: 1 }),
      makeSub({ playerOutId: null, playerInId: "2", homeScore: 4, awayScore: 1 }),
    ];
    expect(reconstructRegularSubs(subs)).toEqual([]);
  });
});

// ── 暫停（issue #44）──
describe("timeout mapping", () => {
  it("maps side us/opponent → home/away in the API body, carrying the score snapshot", () => {
    expect(timeoutToApi("us", 5, 3)).toEqual({ homeScore: 5, awayScore: 3, side: "home" });
    expect(timeoutToApi("opponent", 8, 10)).toEqual({ homeScore: 8, awayScore: 10, side: "away" });
  });

  it("reconstructs timeouts back to front-end side, preserving order (no dedup)", () => {
    const rows: Timeout[] = [
      { id: 1, setId: 7, homeScore: 4, awayScore: 2, side: "home" },
      { id: 2, setId: 7, homeScore: 4, awayScore: 8, side: "away" },
      { id: 3, setId: 7, homeScore: 20, awayScore: 15, side: "home" },
    ];
    expect(reconstructTimeouts(rows)).toEqual([
      { side: "us" },
      { side: "opponent" },
      { side: "us" },
    ]);
  });
});
