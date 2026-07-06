import { describe, it, expect } from "vitest";
import {
  sideToApi,
  apiToSide,
  pointRecordToRally,
  pointRecordToEvent,
  eventToMeta,
  reconstructSetFromRallies,
  isSetComplete,
} from "./scoreSheetMapping";
import type { PointRecord } from "../types/scoresheet";
import type { MatchSet, Rally, MatchEvent } from "@workspace/api-client-react";

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
      playerId: 12,
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
      eventToMeta(makeEvent({ rallyId: 1, side: "home", playerId: 12, action: "attack" })),
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
      [100, [makeEvent({ rallyId: 100, side: "home", playerId: 12, action: "attack" })]],
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
      [100, [makeEvent({ rallyId: 100, side: "home", playerId: 5, action: "dig" })]],
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
          makeEvent({ rallyId: 100, sequence: 1, side: "home", playerId: 3, action: "receive" }),
          makeEvent({ rallyId: 100, sequence: 2, side: "home", playerId: 9, action: "attack" }),
        ],
      ],
    ]);
    const state = reconstructSetFromRallies(set, rallies, eventsByRallyId);
    expect(state.history[0]).toMatchObject({ action: "receive", touchedBy: { playerId: "3" } });
  });
});
