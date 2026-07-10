import { describe, it, expect } from "vitest";
import { buildPlayerMatrix } from "./statsMapping";
import type { PointRecord } from "../types/scoresheet";
import type { MatchPlayer } from "../types/match";

// 造一個測試用球員，只填 buildPlayerMatrix 會用到的欄位（id/number），role 隨便給一個
// 合法值即可（型別要求，但這裡的邏輯不看它）。
const makePlayer = (id: string, number: number): MatchPlayer => ({
  id,
  number,
  name: `球員${number}`,
  role: "OH",
});

describe("buildPlayerMatrix", () => {
  it("adds our-player points to won and opponent-side points to lost", () => {
    const players = [makePlayer("1", 7)];
    const history: PointRecord[] = [
      // 我方 7 號扣球得分：won++
      { side: "us", wasSideOut: false, action: "attack", touchedBy: { side: "us", playerId: "1" } },
      // 我方 7 號攔網被得分（這球我方失分，仍記在觸球的 7 號身上）：lost++
      {
        side: "opponent",
        wasSideOut: true,
        action: "block",
        touchedBy: { side: "us", playerId: "1" },
      },
    ];
    const rows = buildPlayerMatrix(history, players);
    expect(rows).toHaveLength(1);
    expect(rows[0].stats.attack).toEqual({ won: 1, lost: 0 });
    expect(rows[0].stats.block).toEqual({ won: 0, lost: 1 });
  });

  it("skips points with no action, and points touched by 對手(全體) (no playerId)", () => {
    const players = [makePlayer("1", 7)];
    const history: PointRecord[] = [
      { side: "us", wasSideOut: false }, // 沒看到：沒有 action，略過
      {
        side: "opponent",
        wasSideOut: true,
        action: "serve",
        touchedBy: { side: "opponent" }, // 對手(全體) 沒有 playerId，略過
      },
    ];
    expect(buildPlayerMatrix(history, players)).toEqual([]);
  });

  it("sorts rows by player number ascending", () => {
    const players = [makePlayer("a", 10), makePlayer("b", 3), makePlayer("c", 7)];
    const history: PointRecord[] = [
      { side: "us", wasSideOut: false, action: "serve", touchedBy: { side: "us", playerId: "a" } },
      { side: "us", wasSideOut: false, action: "serve", touchedBy: { side: "us", playerId: "b" } },
      { side: "us", wasSideOut: false, action: "serve", touchedBy: { side: "us", playerId: "c" } },
    ];
    const rows = buildPlayerMatrix(history, players);
    expect(rows.map((r) => r.number)).toEqual([3, 7, 10]);
  });
});
