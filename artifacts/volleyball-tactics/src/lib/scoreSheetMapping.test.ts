import { describe, it, expect } from "vitest";
import {
  sideToApi,
  apiToSide,
  pointRecordToRally,
  pointRecordToEvent,
  reconstructSetFromRallies,
} from "./scoreSheetMapping";
import type { PointRecord } from "../types/scoresheet";
import type { MatchSet, Rally } from "@workspace/api-client-react";

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
});
