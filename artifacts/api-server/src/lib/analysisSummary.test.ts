import { describe, it, expect } from "vitest";
import {
  summariseMatches,
  summarisePerson,
  type MatchRow,
  type SetScoreRow,
  type LineupMatchRow,
  type SetRow,
  type AppearanceRow,
  type ActionRow,
} from "./analysisSummary";

// 固定一個測試用日期，各筆 MatchRow 都借用同一個值——這支測試只在乎合併規則，
// 不在乎日期本身，用同一個 Date 物件可以少打幾次字。
const testDate = new Date("2026-01-01T00:00:00Z");

describe("summariseMatches", () => {
  it("進行中的比賽：setResults 排除最後一局，但其分數仍算進 ourPoints/opponentPoints", () => {
    const matches: MatchRow[] = [
      { matchId: 1, opponent: "對手A", date: testDate, teamId: null, status: "in_progress" },
    ];
    const setScoreRows: SetScoreRow[] = [
      { matchId: 1, setNumber: 1, firstServer: "home", ourScore: 25, opponentScore: 20 },
      // 第 2 局還在打（最後一局），不該進 setResults，但分數要算進整場總分。
      { matchId: 1, setNumber: 2, firstServer: "away", ourScore: 10, opponentScore: 8 },
    ];
    const summaries = summariseMatches(matches, setScoreRows, [], []);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].setResults).toEqual([{ ourScore: 25, opponentScore: 20 }]);
    expect(summaries[0].ourPoints).toBe(35);
    expect(summaries[0].opponentPoints).toBe(28);
  });

  it("已完賽的比賽：不排除任何一局（最後一局也算已結束局）", () => {
    const matches: MatchRow[] = [
      { matchId: 1, opponent: "對手A", date: testDate, teamId: null, status: "finished" },
    ];
    const setScoreRows: SetScoreRow[] = [
      { matchId: 1, setNumber: 1, firstServer: "home", ourScore: 25, opponentScore: 20 },
      { matchId: 1, setNumber: 2, firstServer: "away", ourScore: 25, opponentScore: 18 },
    ];
    const summaries = summariseMatches(matches, setScoreRows, [], []);

    expect(summaries[0].setResults).toEqual([
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 18 },
    ]);
  });

  it("已完賽但有一局從沒開球的尾巴局：那一局要被砍掉，不算進 setResults", () => {
    const matches: MatchRow[] = [
      { matchId: 1, opponent: "對手A", date: testDate, teamId: null, status: "finished" },
    ];
    const setScoreRows: SetScoreRow[] = [
      { matchId: 1, setNumber: 1, firstServer: "home", ourScore: 25, opponentScore: 20 },
      // 按了「下一局」但根本沒開球就結束比賽——這局要被砍掉。
      { matchId: 1, setNumber: 2, firstServer: null, ourScore: 0, opponentScore: 0 },
    ];
    const summaries = summariseMatches(matches, setScoreRows, [], []);

    expect(summaries[0].setResults).toEqual([{ ourScore: 25, opponentScore: 20 }]);
  });

  it("已完賽但有好幾局從沒開球的尾巴局：全部要被砍掉，不是只砍一局", () => {
    const matches: MatchRow[] = [
      { matchId: 1, opponent: "對手A", date: testDate, teamId: null, status: "finished" },
    ];
    const setScoreRows: SetScoreRow[] = [
      { matchId: 1, setNumber: 1, firstServer: "home", ourScore: 25, opponentScore: 20 },
      { matchId: 1, setNumber: 2, firstServer: "away", ourScore: 25, opponentScore: 22 },
      { matchId: 1, setNumber: 3, firstServer: null, ourScore: 0, opponentScore: 0 },
      { matchId: 1, setNumber: 4, firstServer: null, ourScore: 0, opponentScore: 0 },
    ];
    const summaries = summariseMatches(matches, setScoreRows, [], []);

    expect(summaries[0].setResults).toEqual([
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 22 },
    ]);
  });

  it("進行中且只有一局：setResults 是空陣列（slice(0, -1) 對單一元素安全，不會炸也不會回整局）", () => {
    const matches: MatchRow[] = [
      { matchId: 1, opponent: "對手A", date: testDate, teamId: null, status: "in_progress" },
    ];
    const setScoreRows: SetScoreRow[] = [
      { matchId: 1, setNumber: 1, firstServer: "home", ourScore: 12, opponentScore: 9 },
    ];
    const summaries = summariseMatches(matches, setScoreRows, [], []);

    expect(summaries[0].setResults).toEqual([]);
    // 唯一那局還在打，不進 setResults，但總分照算。
    expect(summaries[0].ourPoints).toBe(12);
    expect(summaries[0].opponentPoints).toBe(9);
  });

  it("已完賽：沒開球的局在「中間」不該被砍——砍尾巴的迴圈只從最後一局往前收", () => {
    const matches: MatchRow[] = [
      { matchId: 1, opponent: "對手A", date: testDate, teamId: null, status: "finished" },
    ];
    const setScoreRows: SetScoreRow[] = [
      { matchId: 1, setNumber: 1, firstServer: "home", ourScore: 25, opponentScore: 20 },
      // 這局 firstServer 是 null，但後面還有開過球的局，所以它不是「尾巴」，要保留
      // （保留才看得出資料有異常，靜靜吞掉反而會讓局數對不上）。
      { matchId: 1, setNumber: 2, firstServer: null, ourScore: 0, opponentScore: 0 },
      { matchId: 1, setNumber: 3, firstServer: "away", ourScore: 25, opponentScore: 18 },
    ];
    const summaries = summariseMatches(matches, setScoreRows, [], []);

    expect(summaries[0].setResults).toEqual([
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 0, opponentScore: 0 },
      { ourScore: 25, opponentScore: 18 },
    ]);
  });

  it("完全沒有局/rally 的比賽：仍要出現在結果裡，setsPlayed 0、setResults 空陣列", () => {
    const matches: MatchRow[] = [
      { matchId: 1, opponent: "對手A", date: testDate, teamId: null, status: "in_progress" },
    ];
    const summaries = summariseMatches(matches, [], [], []);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].setsPlayed).toBe(0);
    expect(summaries[0].setResults).toEqual([]);
    expect(summaries[0].ourPoints).toBe(0);
    expect(summaries[0].opponentPoints).toBe(0);
  });

  it("hasLineup：只有出現在 lineupMatchRows 裡的比賽才是 true", () => {
    const matches: MatchRow[] = [
      { matchId: 1, opponent: "對手A", date: testDate, teamId: null, status: "in_progress" },
      { matchId: 2, opponent: "對手B", date: testDate, teamId: null, status: "in_progress" },
    ];
    const lineupMatchRows: LineupMatchRow[] = [{ matchId: 1 }];
    const summaries = summariseMatches(matches, [], lineupMatchRows, []);

    const byId = new Map(summaries.map((s) => [s.matchId, s]));
    expect(byId.get(1)?.hasLineup).toBe(true);
    expect(byId.get(2)?.hasLineup).toBe(false);
  });

  it("setsPlayed 只數 firstServer 不是 null 的局（來自 setRows，不是自己重算）", () => {
    const matches: MatchRow[] = [
      { matchId: 1, opponent: "對手A", date: testDate, teamId: null, status: "in_progress" },
    ];
    const setRows: SetRow[] = [{ matchId: 1, setsPlayed: 2 }];
    const summaries = summariseMatches(matches, [], [], setRows);

    expect(summaries[0].setsPlayed).toBe(2);
  });
});

describe("summarisePerson", () => {
  it("同一個人同一場出現兩筆名單列：matchesPlayed 只算一場，teamBreakdown 不重複計入", () => {
    const appearanceRows: AppearanceRow[] = [
      {
        matchId: 1,
        opponent: "對手A",
        date: testDate,
        teamId: 10,
        playerId: "p1",
        number: 5,
        role: "OH",
      },
      // 同一場比賽（matchId 1）第二筆名單列，理論上不該發生但要防呆。
      {
        matchId: 1,
        opponent: "對手A",
        date: testDate,
        teamId: 10,
        playerId: "p2",
        number: 12,
        role: "OH",
      },
    ];
    const result = summarisePerson(1, { name: "王小明" }, appearanceRows, [], undefined);

    expect(result.matchesPlayed).toBe(1);
    expect(result.teamBreakdown).toEqual([{ teamId: 10, matchesPlayed: 1 }]);
  });

  it("跨兩個不同球隊出賽：teamBreakdown 各自一筆，teamId 為 null 也是合法的 key", () => {
    const appearanceRows: AppearanceRow[] = [
      {
        matchId: 1,
        opponent: "對手A",
        date: testDate,
        teamId: 10,
        playerId: "p1",
        number: 5,
        role: "OH",
      },
      {
        matchId: 2,
        opponent: "對手B",
        date: testDate,
        teamId: null,
        playerId: "p2",
        number: 5,
        role: "OH",
      },
    ];
    const result = summarisePerson(1, { name: "王小明" }, appearanceRows, [], undefined);

    expect(result.matchesPlayed).toBe(2);
    // 順序跟著 Map 插入順序（appearanceRows 的順序），這裡分別斷言兩筆而不是整體 toEqual
    // 陣列順序，避免測試綁死在插入順序的實作細節上。
    expect(result.teamBreakdown).toHaveLength(2);
    expect(result.teamBreakdown).toContainEqual({ teamId: 10, matchesPlayed: 1 });
    expect(result.teamBreakdown).toContainEqual({ teamId: null, matchesPlayed: 1 });
  });

  it("沒有任何出賽紀錄的人：回全零/空陣列的形狀", () => {
    const result = summarisePerson(1, { name: "王小明" }, [], [], undefined);

    expect(result).toEqual({
      personId: 1,
      name: "王小明",
      matchesPlayed: 0,
      setsStarted: 0,
      teamBreakdown: [],
      actionCounts: [],
      appearances: [],
    });
  });

  it("person 查無資料（undefined）時 name 補空字串，setsStartedRow 為 undefined 時 setsStarted 補 0", () => {
    const result = summarisePerson(1, undefined, [], [], undefined);

    expect(result.name).toBe("");
    expect(result.setsStarted).toBe(0);
  });

  it("actionCounts / setsStarted 原樣帶入回應（合併規則本身不改動這兩者）", () => {
    const actionRows: ActionRow[] = [
      { action: "serve", count: 3 },
      { action: "attack", count: 7 },
    ];
    const result = summarisePerson(1, { name: "王小明" }, [], actionRows, { count: 4 });

    expect(result.actionCounts).toEqual(actionRows);
    expect(result.setsStarted).toBe(4);
  });
});
