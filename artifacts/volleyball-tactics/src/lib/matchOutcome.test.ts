import { describe, it, expect } from "vitest";
import { getMatchWinner } from "./matchOutcome";

// getMatchWinner 是純函式（見 matchOutcome.ts 的說明），重點是驗證「用贏局數判定、不是
// 用打了幾局判定」這個核心規則：2:0（打了兩局）不該被誤判成打完，3:2（打了五局）也不該
// 因為「五局都打完了」才判定，而是打到第 3 局贏就該立刻判出勝負。
describe("getMatchWinner", () => {
  it("回傳 null：我方 2:0 領先，還沒拿到 3 局，比賽還沒結束", () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 18 },
    ];
    expect(getMatchWinner(sets)).toBeNull();
  });

  it('回傳 "us"：我方 3:0，直落三局已經拿到 3 局', () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 18 },
      { ourScore: 25, opponentScore: 22 },
    ];
    expect(getMatchWinner(sets)).toBe("us");
  });

  it('回傳 "us"：我方 3:2（五局全打完），不是靠「五局都打完」判定，是靠贏了 3 局', () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 }, // us
      { ourScore: 20, opponentScore: 25 }, // opponent
      { ourScore: 25, opponentScore: 22 }, // us
      { ourScore: 18, opponentScore: 25 }, // opponent
      { ourScore: 15, opponentScore: 10 }, // us（第 3 局贏，決勝局）
    ];
    expect(getMatchWinner(sets)).toBe("us");
  });

  it("回傳 null：2:2 平手，還沒打決勝局，比賽還沒結束", () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 }, // us
      { ourScore: 20, opponentScore: 25 }, // opponent
      { ourScore: 25, opponentScore: 22 }, // us
      { ourScore: 18, opponentScore: 25 }, // opponent
    ];
    expect(getMatchWinner(sets)).toBeNull();
  });

  it('回傳 "opponent"：對手先拿到 3 局', () => {
    const sets = [
      { ourScore: 20, opponentScore: 25 },
      { ourScore: 18, opponentScore: 25 },
      { ourScore: 22, opponentScore: 25 },
    ];
    expect(getMatchWinner(sets)).toBe("opponent");
  });

  it("空陣列（還沒開打任何一局）回傳 null", () => {
    expect(getMatchWinner([])).toBeNull();
  });
});
