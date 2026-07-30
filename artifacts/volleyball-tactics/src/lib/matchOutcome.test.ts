import { describe, it, expect } from "vitest";
import { countSetWins, getMatchWinner, setWinner, winsNeededFor } from "./matchOutcome";

// #226 PR2：setWinner / countSetWins 是從五處複製實作收上來的。這裡測的重點不是
// 「大的那邊贏」（那太顯然），而是**平手這個 edge case 的處理是被鎖住的**——原本散在
// UI 裡的 `ourScore > opponentScore` 把平手悄悄算成「對手贏」，收成函式之後平手回 null、
// 兩邊都不計分，這是唯一一個「五份複製其實可能各自飄掉」的行為點。
describe("setWinner", () => {
  it('分數高的一方獲勝：25:20 回 "us"、20:25 回 "opponent"', () => {
    expect(setWinner({ ourScore: 25, opponentScore: 20 })).toBe("us");
    expect(setWinner({ ourScore: 20, opponentScore: 25 })).toBe("opponent");
  });

  it("平手回 null，而不是預設判給某一方（一局排球不會平手封存，屬不合理資料）", () => {
    expect(setWinner({ ourScore: 25, opponentScore: 25 })).toBeNull();
    expect(setWinner({ ourScore: 0, opponentScore: 0 })).toBeNull();
  });
});

describe("countSetWins", () => {
  it("空陣列回 0:0（還沒開打）", () => {
    expect(countSetWins([])).toEqual({ ourWins: 0, opponentWins: 0 });
  });

  it("數的是贏局數不是打了幾局：3 勝 2 敗回 3:2", () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 22, opponentScore: 25 },
      { ourScore: 25, opponentScore: 23 },
      { ourScore: 19, opponentScore: 25 },
      { ourScore: 15, opponentScore: 12 },
    ];
    expect(countSetWins(sets)).toEqual({ ourWins: 3, opponentWins: 2 });
  });

  it("平手局兩邊都不計，總和會小於局數", () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 25 },
    ];
    expect(countSetWins(sets)).toEqual({ ourWins: 1, opponentWins: 0 });
  });
});

// getMatchWinner 是純函式（見 matchOutcome.ts 的說明），重點是驗證「用贏局數判定、不是
// 用打了幾局判定」這個核心規則：2:0（打了兩局）不該被誤判成打完，3:2（打了五局）也不該
// 因為「五局都打完了」才判定，而是打到第 3 局贏就該立刻判出勝負。
//
// #215 之後 winsNeeded 改成必填參數（不再是內部寫死的 WINS_NEEDED_TO_CLINCH = 3），
// 下面既有的五戰三勝案例都補上 winsNeededFor("best_of_5")，另外新增一批 best_of_3 案例，
// 以及一顆「同一組 sets 在不同賽制下判出不同結果」的對照案例，鎖住 #215 的回歸。
describe("getMatchWinner", () => {
  it("回傳 null：我方 2:0 領先，五戰三勝制下還沒拿到 3 局，比賽還沒結束", () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 18 },
    ];
    expect(getMatchWinner(sets, winsNeededFor("best_of_5"))).toBeNull();
  });

  it('回傳 "us"：五戰三勝制，我方 3:0 直落三局已經拿到 3 局', () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 18 },
      { ourScore: 25, opponentScore: 22 },
    ];
    expect(getMatchWinner(sets, winsNeededFor("best_of_5"))).toBe("us");
  });

  it('回傳 "us"：五戰三勝制，我方 3:2（五局全打完），不是靠「五局都打完」判定，是靠贏了 3 局', () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 }, // us
      { ourScore: 20, opponentScore: 25 }, // opponent
      { ourScore: 25, opponentScore: 22 }, // us
      { ourScore: 18, opponentScore: 25 }, // opponent
      { ourScore: 15, opponentScore: 10 }, // us（第 3 局贏，決勝局）
    ];
    expect(getMatchWinner(sets, winsNeededFor("best_of_5"))).toBe("us");
  });

  it("回傳 null：五戰三勝制，2:2 平手，還沒打決勝局，比賽還沒結束", () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 }, // us
      { ourScore: 20, opponentScore: 25 }, // opponent
      { ourScore: 25, opponentScore: 22 }, // us
      { ourScore: 18, opponentScore: 25 }, // opponent
    ];
    expect(getMatchWinner(sets, winsNeededFor("best_of_5"))).toBeNull();
  });

  it('回傳 "opponent"：五戰三勝制，對手先拿到 3 局', () => {
    const sets = [
      { ourScore: 20, opponentScore: 25 },
      { ourScore: 18, opponentScore: 25 },
      { ourScore: 22, opponentScore: 25 },
    ];
    expect(getMatchWinner(sets, winsNeededFor("best_of_5"))).toBe("opponent");
  });

  it("空陣列（還沒開打任何一局）回傳 null", () => {
    expect(getMatchWinner([], winsNeededFor("best_of_5"))).toBeNull();
  });

  // ── #215：三戰兩勝制（winsNeededFor("best_of_3") = 2）──
  it('三戰兩勝：我方 2:0 直落二局，回傳 "us"', () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 18 },
    ];
    expect(getMatchWinner(sets, winsNeededFor("best_of_3"))).toBe("us");
  });

  it('三戰兩勝：2:1 打完決勝局、我方贏，回傳 "us"', () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 }, // us
      { ourScore: 20, opponentScore: 25 }, // opponent
      { ourScore: 15, opponentScore: 10 }, // us（決勝局）
    ];
    expect(getMatchWinner(sets, winsNeededFor("best_of_3"))).toBe("us");
  });

  it("三戰兩勝：1:1 平手，還沒打決勝局，回傳 null", () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 }, // us
      { ourScore: 20, opponentScore: 25 }, // opponent
    ];
    expect(getMatchWinner(sets, winsNeededFor("best_of_3"))).toBeNull();
  });

  it('三戰兩勝：對手 2:1 打完決勝局贏，回傳 "opponent"', () => {
    const sets = [
      { ourScore: 20, opponentScore: 25 }, // opponent
      { ourScore: 25, opponentScore: 20 }, // us
      { ourScore: 10, opponentScore: 15 }, // opponent（決勝局）
    ];
    expect(getMatchWinner(sets, winsNeededFor("best_of_3"))).toBe("opponent");
  });

  // 這一顆直接鎖住 #215 的回歸：同一組 2:1 的局比數，賽制不同、判定結果就該不同——
  // 五戰三勝這 2 局都還沒決出勝負（可能還在打），三戰兩勝已經有一方拿到 2 局、比賽結束了。
  // 舊的寫死邏輯（WINS_NEEDED_TO_CLINCH = 3）會把三戰兩勝的這種情況也誤判成 null（進行中）。
  it("同一組 2:1 局比數：五戰三勝判 null（還沒結束），三戰兩勝判有勝隊（已經結束）", () => {
    const sets = [
      { ourScore: 25, opponentScore: 20 }, // us
      { ourScore: 20, opponentScore: 25 }, // opponent
      { ourScore: 25, opponentScore: 22 }, // us
    ];
    expect(getMatchWinner(sets, winsNeededFor("best_of_5"))).toBeNull();
    expect(getMatchWinner(sets, winsNeededFor("best_of_3"))).toBe("us");
  });
});
