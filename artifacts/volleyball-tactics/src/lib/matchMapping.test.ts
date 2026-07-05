import { describe, it, expect } from "vitest";
import {
  localInputToIso,
  isoToLocalInput,
  serverMatchToDomain,
  serverPlayerToDomain,
  diffRoster,
} from "./matchMapping";
import type { MatchPlayer } from "../types/match";

// 這些都是純函式（沒碰網路/store），最適合用單元測試釘住行為。重點是三層落差的轉換：
// id 整數↔字串、日期 local 字串↔ISO、名單 diff。

describe("date mapping", () => {
  it("round-trips a datetime-local string through ISO and back", () => {
    // 不管跑測試的機器在哪個時區，local→ISO→local 都應該回到同一個牆上時鐘時間。
    const local = "2026-06-24T15:30";
    expect(isoToLocalInput(localInputToIso(local))).toBe(local);
  });

  it("localInputToIso produces a valid ISO string", () => {
    expect(localInputToIso("2026-01-02T09:05")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("isoToLocalInput zero-pads month/day/hour/minute", () => {
    // 用本地時間建一個 Date 再轉 ISO，避免測試寫死時區。
    const iso = new Date(2026, 0, 2, 9, 5).toISOString();
    expect(isoToLocalInput(iso)).toBe("2026-01-02T09:05");
  });
});

describe("server → domain mapping", () => {
  it("maps a player, stringifying its id", () => {
    expect(
      serverPlayerToDomain({ id: 7, matchId: 3, name: "小明", number: 12, role: "S" }),
    ).toEqual({
      id: "7",
      name: "小明",
      number: 12,
      role: "S",
    });
  });

  it("maps a match with roster, stringifying id and normalizing tournamentId", () => {
    const iso = new Date(2026, 5, 24, 15, 30).toISOString();
    const domain = serverMatchToDomain(
      {
        id: 3,
        name: null,
        date: iso,
        opponent: "台大",
        location: null,
        videoUrl: null,
        tournamentId: null,
        createdAt: iso,
      },
      [{ id: 7, matchId: 3, name: "小明", number: 12, role: "S" }],
    );
    expect(domain.id).toBe("3");
    expect(domain.opponent).toBe("台大");
    expect(domain.dateTime).toBe("2026-06-24T15:30");
    expect(domain.tournamentId).toBeNull();
    expect(domain.players).toHaveLength(1);
    expect(domain.players[0].id).toBe("7");
  });
});

describe("diffRoster", () => {
  const existing: MatchPlayer[] = [
    { id: "1", name: "A", number: 1, role: "S" },
    { id: "2", name: "B", number: 2, role: "OH" },
  ];

  it("flags a player with no matching id as create", () => {
    const diff = diffRoster(existing, [
      ...existing,
      { name: "C", number: 3, role: "MB" }, // 沒 id → 新增
    ]);
    expect(diff.toCreate).toEqual([{ name: "C", number: 3, role: "MB" }]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });

  it("flags a changed existing player as update (playerId as number)", () => {
    const diff = diffRoster(existing, [
      { id: "1", name: "A", number: 10, role: "S" }, // 背號改了
      { id: "2", name: "B", number: 2, role: "OH" }, // 沒變
    ]);
    expect(diff.toUpdate).toEqual([{ playerId: 1, data: { name: "A", number: 10, role: "S" } }]);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });

  it("flags a removed player as delete", () => {
    const diff = diffRoster(existing, [{ id: "1", name: "A", number: 1, role: "S" }]);
    expect(diff.toDelete).toEqual([2]);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it("no-ops when nothing changed", () => {
    const diff = diffRoster(existing, existing);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });
});
