import { describe, it, expect } from "vitest";
import { computeTournamentStats } from "./tournamentSummary";

// 沿用 matchOutcome.test.ts / matchSummary.test.ts 的風格：只測純函式的分支規則，
// 不牽扯 UI 或 API 資料源。
describe("computeTournamentStats", () => {
  it("空資料夾：場次/戰績都是 0，不誤顯示「0 勝 0 敗」以外的東西（型別上就是 0）", () => {
    const stats = computeTournamentStats([]);
    expect(stats).toEqual({
      matchCount: 0,
      ourWins: 0,
      opponentWins: 0,
      totalOurSets: 0,
      totalOpponentSets: 0,
      matches: [],
    });
  });

  it("已打完的比賽依勝負分別計進 ourWins/opponentWins，局數加總進 totalOurSets/totalOpponentSets", () => {
    const stats = computeTournamentStats([
      {
        matchId: "1",
        opponent: "台大",
        dateTime: "2026-01-05T19:00",
        format: "best_of_5",
        completedSets: [
          { ourScore: 25, opponentScore: 20 },
          { ourScore: 20, opponentScore: 25 },
          { ourScore: 25, opponentScore: 22 },
          { ourScore: 25, opponentScore: 18 },
        ], // 3:1 勝
        setsPlayed: 4,
        hasLineup: true,
      },
      {
        matchId: "2",
        opponent: "政大",
        dateTime: "2026-01-03T19:00",
        format: "best_of_5",
        completedSets: [
          { ourScore: 20, opponentScore: 25 },
          { ourScore: 18, opponentScore: 25 },
          { ourScore: 22, opponentScore: 25 },
        ], // 0:3 敗
        setsPlayed: 3,
        hasLineup: true,
      },
    ]);

    expect(stats.matchCount).toBe(2);
    expect(stats.ourWins).toBe(1);
    expect(stats.opponentWins).toBe(1);
    expect(stats.totalOurSets).toBe(3); // 3 + 0
    expect(stats.totalOpponentSets).toBe(4); // 1 + 3
    // 依 dateTime 由舊到新排序：政大（01/03）在台大（01/05）之前。
    expect(stats.matches.map((m) => m.opponent)).toEqual(["政大", "台大"]);
    expect(stats.matches[0]).toMatchObject({
      winner: "opponent",
      ourSetWins: 0,
      opponentSetWins: 3,
      status: "lost",
    });
    expect(stats.matches[1]).toMatchObject({
      winner: "us",
      ourSetWins: 3,
      opponentSetWins: 1,
      status: "won",
    });
  });

  it("還沒打完的比賽（三戰兩勝、1:1 平手）：winner 是 null，不計進 ourWins/opponentWins，但局數仍要加總", () => {
    const stats = computeTournamentStats([
      {
        matchId: "3",
        opponent: "師大",
        dateTime: "2026-01-10T19:00",
        format: "best_of_3",
        completedSets: [
          { ourScore: 25, opponentScore: 20 },
          { ourScore: 20, opponentScore: 25 },
        ], // 1:1，還沒打決勝局
        setsPlayed: 2,
        hasLineup: true,
      },
    ]);

    expect(stats.matchCount).toBe(1);
    expect(stats.ourWins).toBe(0);
    expect(stats.opponentWins).toBe(0);
    expect(stats.totalOurSets).toBe(1);
    expect(stats.totalOpponentSets).toBe(1);
    expect(stats.matches[0].winner).toBeNull();
    expect(stats.matches[0].status).toBe("in_progress");
  });

  it("一球都還沒發過（setsPlayed 0）時，用 hasLineup 分辨「已排先發」還是「未開始」，不再一律算「進行中」", () => {
    const lineupOnly = computeTournamentStats([
      {
        matchId: "5",
        opponent: "師大",
        dateTime: "2026-01-12T19:00",
        format: "best_of_3",
        completedSets: [],
        setsPlayed: 0,
        hasLineup: true,
      },
    ]);
    const notStarted = computeTournamentStats([
      {
        matchId: "6",
        opponent: "師大",
        dateTime: "2026-01-13T19:00",
        format: "best_of_3",
        completedSets: [],
        setsPlayed: 0,
        hasLineup: false,
      },
    ]);

    expect(lineupOnly.matches[0].winner).toBeNull();
    expect(lineupOnly.matches[0].status).toBe("lineup_only");
    expect(notStarted.matches[0].winner).toBeNull();
    expect(notStarted.matches[0].status).toBe("not_started");
  });

  it("同一組局比數在不同賽制下勝負不同（呼應 #215 的教訓）：三戰兩勝 2:1 已經算贏，五戰三勝還沒", () => {
    const bestOf3 = computeTournamentStats([
      {
        matchId: "4",
        opponent: "師大",
        dateTime: "2026-01-10T19:00",
        format: "best_of_3",
        completedSets: [
          { ourScore: 25, opponentScore: 20 },
          { ourScore: 20, opponentScore: 25 },
          { ourScore: 25, opponentScore: 22 },
        ],
        setsPlayed: 3,
        hasLineup: true,
      },
    ]);
    const bestOf5 = computeTournamentStats([
      {
        matchId: "4",
        opponent: "師大",
        dateTime: "2026-01-10T19:00",
        format: "best_of_5",
        completedSets: [
          { ourScore: 25, opponentScore: 20 },
          { ourScore: 20, opponentScore: 25 },
          { ourScore: 25, opponentScore: 22 },
        ],
        setsPlayed: 3,
        hasLineup: true,
      },
    ]);

    expect(bestOf3.matches[0].winner).toBe("us");
    expect(bestOf5.matches[0].winner).toBeNull();
  });
});
