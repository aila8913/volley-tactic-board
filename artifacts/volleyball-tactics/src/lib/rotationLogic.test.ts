import { describe, it, expect } from "vitest";
import {
  isBackRowPosition,
  BACK_ROW_ZONES,
  getZoneCoords,
  findNearestZone,
  isLineupComplete,
  captureLineupFromRotations,
  lineupToPositions,
  rotateZone,
} from "./rotationLogic";
import type { RotationPositions } from "../types/rotationTable";
import type { MatchPlayer } from "../types/match";

// isBackRowPosition 是自由球員「能不能上這個位置」的共用判定，輪轉表跟計分表都靠它，
// 所以規則要釘死（issue #43：以前計分表自己寫 y<=0.75，跟輪轉表的 BACK_ROW_ZONES 各判各的）。
describe("isBackRowPosition", () => {
  it("treats the three back-row zones (1/5/6) as legal libero positions", () => {
    for (const zone of [1, 5, 6]) {
      const { x, y } = getZoneCoords(zone);
      expect(isBackRowPosition(x, y)).toBe(true);
    }
  });

  it("treats the three front-row zones (2/3/4) as illegal", () => {
    for (const zone of [2, 3, 4]) {
      const { x, y } = getZoneCoords(zone);
      expect(isBackRowPosition(x, y)).toBe(false);
    }
  });

  it("stays consistent with BACK_ROW_ZONES for every zone (single source of truth)", () => {
    // 直接對照：吸附到的號位在 BACK_ROW_ZONES 裡 ⇔ isBackRowPosition 回 true。
    for (const zone of [1, 2, 3, 4, 5, 6]) {
      const { x, y } = getZoneCoords(zone);
      expect(isBackRowPosition(x, y)).toBe(BACK_ROW_ZONES.has(findNearestZone(x, y)));
    }
  });

  it("snaps a slightly-off coordinate to the nearest zone before judging", () => {
    // 拖放不會剛好落在格子正中心：靠近 6 號位(0.5, 0.85, 後排)的點仍算後排。
    expect(isBackRowPosition(0.52, 0.83)).toBe(true);
    // 靠近 3 號位(0.5, 0.6, 前排)的點算前排。
    expect(isBackRowPosition(0.48, 0.62)).toBe(false);
  });
});

// isLineupComplete 是「先發排好了沒」的共用判定（issue #37），輪轉表 hasRotations 跟
// 計分表 hasLineup 都靠它，門檻是「至少一輪站滿 6 人」，不強制指定自由球員。
describe("isLineupComplete", () => {
  // 產生一個有 n 個站位的輪次（座標無所謂，這裡只看人數）。
  const rot = (n: number): RotationPositions => ({
    positions: Array.from({ length: n }, (_, i) => ({ playerId: String(i), x: 0, y: 0 })),
    liberoReplacement: null,
  });

  it("rejects an empty or partial lineup (< 6 on court)", () => {
    expect(isLineupComplete([])).toBe(false);
    expect(isLineupComplete([rot(0), rot(0)])).toBe(false);
    expect(isLineupComplete([rot(5), rot(5)])).toBe(false); // 舊的寬鬆判定會誤放行
  });

  it("accepts once at least one rotation has a full 6 on court", () => {
    expect(isLineupComplete([rot(6)])).toBe(true);
    expect(isLineupComplete([rot(3), rot(6), rot(0)])).toBe(true);
  });
});

// issue #115：計分表先發快照的擷取/換算是解耦的核心，最容易踩的是「id 對不上這場球員時
// 該不該收」——這正是跨場導航/載入存檔把先發掃空的根因，用測試把它釘死。
describe("captureLineupFromRotations", () => {
  // 6 個非自由球員 id "1"~"6"，外加一個自由球員 "7"。
  const roster: MatchPlayer[] = [
    { id: "1", name: "A", number: 1, role: "OH" },
    { id: "2", name: "B", number: 2, role: "MB" },
    { id: "3", name: "C", number: 3, role: "S" },
    { id: "4", name: "D", number: 4, role: "OH" },
    { id: "5", name: "E", number: 5, role: "MB" },
    { id: "6", name: "F", number: 6, role: "OPP" },
    { id: "7", name: "L", number: 7, role: "L" },
  ];

  // 把「號位→球員 id」擺成 rotation 0 的 positions（座標用該號位中心，findNearestZone 才吸得準）。
  const rot0 = (zoneToId: Record<number, string>): RotationPositions => ({
    positions: Object.entries(zoneToId).map(([z, playerId]) => ({
      playerId,
      ...getZoneCoords(Number(z)),
    })),
    liberoReplacement: null,
  });

  const FULL = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };

  it("captures the 6 starting zones from rotation 0", () => {
    expect(captureLineupFromRotations([rot0(FULL)], roster)).toEqual(FULL);
  });

  it("returns null when positions are keyed by another match's ids (cross-match nav / loaded save)", () => {
    // 站位排好了（6 個），但 id 是別場球員（101~106）——全都是幽靈站位，不屬於這場 roster。
    const foreign = rot0({ 1: "101", 2: "102", 3: "103", 4: "104", 5: "105", 6: "106" });
    expect(captureLineupFromRotations([foreign], roster)).toBeNull();
  });

  it("returns null when only partially valid (< 6 zones survive filtering)", () => {
    expect(captureLineupFromRotations([rot0({ ...FULL, 6: "999" })], roster)).toBeNull();
  });

  it("restores the player covered by a libero so all 6 zones are counted", () => {
    const c1 = getZoneCoords(1);
    const covered: RotationPositions = {
      positions: [
        { playerId: "7", x: c1.x, y: c1.y }, // L 蓋住 1 號位
        ...[2, 3, 4, 5, 6].map((z) => ({ playerId: String(z), ...getZoneCoords(z) })),
      ],
      liberoReplacement: { liberoId: "7", replacedPosition: { playerId: "1", x: c1.x, y: c1.y } },
    };
    // L 不列入六個號位，被蓋的 "1" 還原成 1 號位先發。
    expect(captureLineupFromRotations([covered], roster)).toEqual(FULL);
  });

  it("returns null for an empty rotation set", () => {
    expect(captureLineupFromRotations([], roster)).toBeNull();
  });
});

describe("lineupToPositions", () => {
  const FULL = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };

  it("places each starter at its own zone coords at rotation 0", () => {
    const positions = lineupToPositions(FULL, 0);
    expect(positions).toHaveLength(6);
    expect(positions.find((p) => p.playerId === "1")).toEqual({
      playerId: "1",
      ...getZoneCoords(1),
    });
  });

  it("shifts starters by the rotation formula for other rotations", () => {
    // 起始 1 號位的人，轉 1 次後落在 rotateZone(1, 1) 的座標。
    const positions = lineupToPositions(FULL, 1);
    expect(positions.find((p) => p.playerId === "1")).toEqual({
      playerId: "1",
      ...getZoneCoords(rotateZone(1, 1)),
    });
  });
});
