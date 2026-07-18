import { describe, it, expect } from "vitest";
import { captureFromRotation, captureFromScoreSheet, parseSavedTactic } from "./courtSnapshot";
import type { MatchPlayer } from "../types/match";
import type { PlayerPosition } from "../types/rotationTable";
import type { LineupSnapshot } from "../types/scoresheet";
import type { SavedTacticDataV2 } from "../types/courtSnapshot";

// 這些函式都是純函式（不碰 store），跟 matchMapping.test.ts 一樣直接餵資料進去斷言輸出。
// 重點測「denormalize（凍結 join 結果）」跟「read-adapter 相容轉檔」這兩件事有沒有做對。

const roster: MatchPlayer[] = [
  { id: "p1", name: "小明", number: 1, role: "S" },
  { id: "p2", name: "小華", number: 2, role: "OH" },
  { id: "pL", name: "自由人", number: 9, role: "L" },
];

describe("captureFromRotation", () => {
  it("joins positions against roster and freezes name/number/role", () => {
    const positions: PlayerPosition[] = [{ playerId: "p1", x: 0.5, y: 0.6 }];
    const snapshot = captureFromRotation(positions, roster, { matchId: "m1", rotation: 2 });
    expect(snapshot.source).toBe("rotation");
    expect(snapshot.matchId).toBe("m1");
    expect(snapshot.rotation).toBe(2);
    expect(snapshot.players).toEqual([
      {
        sourcePlayerId: "p1",
        name: "小明",
        number: 1,
        role: "S",
        x: 0.5,
        y: 0.6,
        isLibero: false,
      },
    ]);
  });

  it("drops a position whose playerId is not found in roster (ghost position)", () => {
    const positions: PlayerPosition[] = [
      { playerId: "p1", x: 0.5, y: 0.6 },
      { playerId: "ghost-id", x: 0.1, y: 0.1 },
    ];
    const snapshot = captureFromRotation(positions, roster, { matchId: null, rotation: 0 });
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0].sourcePlayerId).toBe("p1");
  });

  it("marks an L-role player as isLibero: true", () => {
    const positions: PlayerPosition[] = [{ playerId: "pL", x: 0.5, y: 0.85 }];
    const snapshot = captureFromRotation(positions, roster, { matchId: null, rotation: 0 });
    expect(snapshot.players[0].isLibero).toBe(true);
  });
});

describe("captureFromScoreSheet", () => {
  it("denormalizes a LineupSnapshot (zone -> playerId) into named players", () => {
    // LineupSnapshot 是 Record<number, string>：號位 1~6 各對應一個 playerId。
    const lineup: LineupSnapshot = {
      1: "p1",
      2: "p2",
      3: "p1",
      4: "p2",
      5: "p1",
      6: "p2",
    };
    const snapshot = captureFromScoreSheet(lineup, 0, roster, { matchId: "m1" });
    expect(snapshot.source).toBe("scoresheet");
    expect(snapshot.matchId).toBe("m1");
    expect(snapshot.rotation).toBe(0);
    expect(snapshot.players).toHaveLength(6);
    const names = snapshot.players.map((p) => p.name);
    expect(names).toContain("小明");
    expect(names).toContain("小華");
  });
});

describe("parseSavedTactic", () => {
  it("legacy blob: denormalizes against the file's own embedded roster, not an external one", () => {
    // 這份「舊存檔」內嵌的 roster 裡有個 playerId "old-p1"，這個 id 在下面另外構造的
    // 「目前資料庫最新名單」(currentRoster) 裡已經不存在（模擬球員被刪掉的情境）。
    // 斷言重點：轉出來的快照姓名仍然是舊存檔自帶的名字，證明轉檔完全沒有去查外部名單。
    const legacyBlob = {
      roster: [{ id: "old-p1", name: "舊球員", number: 5, role: "OH" }],
      currentRotation: 0,
      rotations: [
        {
          positions: [{ playerId: "old-p1", x: 0.5, y: 0.6 }],
          liberoReplacement: null,
          tacticPositions: [],
          markers: [],
          defenseRanges: [],
        },
      ],
      circleLabel: "name",
      labelToggles: { zone: false },
    };

    // 目前資料庫最新名單：故意不含 "old-p1"，模擬「這個球員後來被刪掉了」。
    // parseSavedTactic 完全不接收這份名單當參數，這裡只是拿來對照、確認轉檔函式沒有
    // 偷偷用某個全域 import 去查它。
    const currentRoster: MatchPlayer[] = [
      { id: "someone-else", name: "別人", number: 1, role: "S" },
    ];
    expect(currentRoster.find((p) => p.id === "old-p1")).toBeUndefined();

    const result = parseSavedTactic(legacyBlob);
    expect(result.version).toBe(2);
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0].snapshot.players).toEqual([
      {
        sourcePlayerId: "old-p1",
        name: "舊球員",
        number: 5,
        role: "OH",
        x: 0.5,
        y: 0.6,
        isLibero: false,
      },
    ]);
  });

  it("v2 blob round-trips unchanged", () => {
    const v2: SavedTacticDataV2 = {
      version: 2,
      scenes: [
        {
          label: "接發球",
          snapshot: {
            source: "saved-tactic",
            matchId: "m1",
            rotation: 3,
            capturedAt: "2026-01-01T00:00:00.000Z",
            players: [
              {
                sourcePlayerId: "p1",
                name: "小明",
                number: 1,
                role: "S",
                x: 0.5,
                y: 0.6,
                isLibero: false,
              },
            ],
          },
          markers: [],
          defenseRanges: [],
        },
      ],
    };
    expect(parseSavedTactic(v2)).toEqual(v2);
  });

  it("throws on garbage input", () => {
    expect(() => parseSavedTactic({})).toThrow();
    expect(() => parseSavedTactic({ foo: 1 })).toThrow();
  });
});
