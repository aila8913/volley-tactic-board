import { describe, it, expect } from "vitest";
import { formatMatchResult } from "./matchSummary";

// 只測 formatMatchResult：它是 issue #175 卡片右端那格文字的唯一來源，而「幾比幾、勝還是敗、
// 還是進行中」正是這個環裡唯一有分支的規則。formatMatchDateTime 只是字串拼接、沒有分支，
// 而且它依賴系統時區，測它得先造一個受控的 Date 環境，投報率不成比例，先不測。
describe("formatMatchResult", () => {
  it("還沒有任何一局打完：回「尚未開賽」", () => {
    expect(formatMatchResult([])).toBe("尚未開賽");
  });

  it("已分出勝負：局比數 + 勝/敗", () => {
    const swept = [
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 18 },
      { ourScore: 25, opponentScore: 22 },
    ];
    expect(formatMatchResult(swept)).toBe("3:0 勝");
    // 把每一局的比分對調，同一份資料就變成我方 0:3 落敗，剛好驗證兩個方向共用同一條規則。
    expect(
      formatMatchResult(
        swept.map((s) => ({ ourScore: s.opponentScore, opponentScore: s.ourScore })),
      ),
    ).toBe("0:3 敗");
  });

  it("還沒有人拿到 3 局：顯示局比數 + 進行中，不早下勝負定論", () => {
    expect(
      formatMatchResult([
        { ourScore: 25, opponentScore: 20 },
        { ourScore: 21, opponentScore: 25 },
      ]),
    ).toBe("1:1 進行中");
  });

  it("領先但還沒贏，也還是「進行中」——2:0 不等於已經結束（賽制是五戰三勝）", () => {
    expect(
      formatMatchResult([
        { ourScore: 25, opponentScore: 20 },
        { ourScore: 25, opponentScore: 23 },
      ]),
    ).toBe("2:0 進行中");
  });
});
