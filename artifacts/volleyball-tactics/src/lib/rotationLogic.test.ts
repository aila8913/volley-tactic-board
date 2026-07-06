import { describe, it, expect } from "vitest";
import {
  isBackRowPosition,
  BACK_ROW_ZONES,
  getZoneCoords,
  findNearestZone,
  isLineupComplete,
} from "./rotationLogic";
import type { RotationPositions } from "../types/rotationTable";

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
