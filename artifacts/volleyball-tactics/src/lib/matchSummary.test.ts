import { describe, it, expect } from "vitest";
import { formatMatchResult } from "./matchSummary";
import { winsNeededFor } from "./matchOutcome";

// 只測 formatMatchResult：它是 issue #175 卡片右端那格文字的唯一來源，而「幾比幾、勝還是敗、
// 還是進行中」正是這個環裡唯一有分支的規則。formatMatchDateTime 只是字串拼接、沒有分支，
// 而且它依賴系統時區，測它得先造一個受控的 Date 環境，投報率不成比例，先不測。
//
// #215 之後 formatMatchResult 也要求呼叫端傳 winsNeeded，既有案例都補上
// winsNeededFor("best_of_5")（沿用原本假設的五戰三勝），另外新增一個三戰兩勝案例，鎖住
// #215 修的那個回歸（2:1 在三戰兩勝其實已經打完，不該再顯示「進行中」）。
describe("formatMatchResult", () => {
  it("還沒有任何一局打完：回「尚未開賽」", () => {
    expect(formatMatchResult([], winsNeededFor("best_of_5"))).toBe("尚未開賽");
  });

  it("已分出勝負：局比數 + 勝/敗", () => {
    const swept = [
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 18 },
      { ourScore: 25, opponentScore: 22 },
    ];
    expect(formatMatchResult(swept, winsNeededFor("best_of_5"))).toBe("3:0 勝");
    // 把每一局的比分對調，同一份資料就變成我方 0:3 落敗，剛好驗證兩個方向共用同一條規則。
    expect(
      formatMatchResult(
        swept.map((s) => ({ ourScore: s.opponentScore, opponentScore: s.ourScore })),
        winsNeededFor("best_of_5"),
      ),
    ).toBe("0:3 敗");
  });

  it("還沒有人拿到 3 局：顯示局比數 + 進行中，不早下勝負定論", () => {
    expect(
      formatMatchResult(
        [
          { ourScore: 25, opponentScore: 20 },
          { ourScore: 21, opponentScore: 25 },
        ],
        winsNeededFor("best_of_5"),
      ),
    ).toBe("1:1 進行中");
  });

  it("領先但還沒贏，也還是「進行中」——2:0 不等於已經結束（賽制是五戰三勝）", () => {
    expect(
      formatMatchResult(
        [
          { ourScore: 25, opponentScore: 20 },
          { ourScore: 25, opponentScore: 23 },
        ],
        winsNeededFor("best_of_5"),
      ),
    ).toBe("2:0 進行中");
  });

  // #215：三戰兩勝制下 2:1 其實已經分出勝負（拿到 2 局就贏了），不該再顯示「進行中」——
  // 這正是 issue #215 描述的那個 bug（舊邏輯全站寫死五戰三勝，誤標成進行中）。
  it("三戰兩勝：2:1 已經分出勝負，顯示「2:1 勝」而不是「2:1 進行中」", () => {
    expect(
      formatMatchResult(
        [
          { ourScore: 25, opponentScore: 20 }, // us
          { ourScore: 20, opponentScore: 25 }, // opponent
          { ourScore: 25, opponentScore: 22 }, // us（決勝局）
        ],
        winsNeededFor("best_of_3"),
      ),
    ).toBe("2:1 勝");
  });
});
