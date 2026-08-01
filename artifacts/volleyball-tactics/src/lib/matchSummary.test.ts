import { describe, it, expect } from "vitest";
import { formatMatchResult } from "./matchSummary";

// 只測 formatMatchResult：它是 issue #175 卡片右端那格文字的唯一來源，而「幾比幾、勝還是敗、
// 還是進行中」正是這個環裡唯一有分支的規則。formatMatchDateTime 只是字串拼接、沒有分支，
// 而且它依賴系統時區，測它得先造一個受控的 Date 環境，投報率不成比例，先不測。
//
// issue #238：formatMatchResult 從吃 winsNeeded 改成直接吃呼叫端算好的 MatchStatus
// （不再自己用 completedSets.length === 0 判斷「尚未開賽」）——既有案例都改成直接傳
// status 字面值，不用像以前那樣還要先 winsNeededFor(match.format) 換算門檻。
describe("formatMatchResult", () => {
  it("狀態是 not_started：回「尚未開賽」", () => {
    expect(formatMatchResult([], "not_started")).toBe("尚未開賽");
  });

  // #238：lineup_only（已排先發、還沒開賽）文字上刻意跟 not_started 一樣顯示「尚未開賽」
  // ——這裡文字故意不分兩種狀態，列表頁是用另一個獨立的黃標（statusHint）另外催辦「尚未排
  // 先發」，不是靠這句文字分辨。
  it("狀態是 lineup_only：也回「尚未開賽」，不因為已經排過先發就顯示別的文字", () => {
    expect(formatMatchResult([], "lineup_only")).toBe("尚未開賽");
  });

  it("狀態是 won：局比數 + 勝", () => {
    const swept = [
      { ourScore: 25, opponentScore: 20 },
      { ourScore: 25, opponentScore: 18 },
      { ourScore: 25, opponentScore: 22 },
    ];
    expect(formatMatchResult(swept, "won")).toBe("3:0 勝");
  });

  it("狀態是 lost：局比數 + 敗", () => {
    // 把 won 案例的每一局比分對調，同一份資料就變成我方落敗，剛好驗證兩個方向共用同一條規則。
    const lost = [
      { ourScore: 20, opponentScore: 25 },
      { ourScore: 18, opponentScore: 25 },
      { ourScore: 22, opponentScore: 25 },
    ];
    expect(formatMatchResult(lost, "lost")).toBe("0:3 敗");
  });

  it("狀態是 in_progress：顯示局比數 + 進行中，不早下勝負定論", () => {
    expect(
      formatMatchResult(
        [
          { ourScore: 25, opponentScore: 20 },
          { ourScore: 21, opponentScore: 25 },
        ],
        "in_progress",
      ),
    ).toBe("1:1 進行中");
  });

  it("領先但還沒贏，狀態仍是 in_progress——2:0 不等於已經結束（例如賽制是五戰三勝）", () => {
    expect(
      formatMatchResult(
        [
          { ourScore: 25, opponentScore: 20 },
          { ourScore: 25, opponentScore: 23 },
        ],
        "in_progress",
      ),
    ).toBe("2:0 進行中");
  });

  // #215 原本這裡測的是「三戰兩勝 2:1 已經分出勝負」；#238 之後 formatMatchResult 已經不自己
  // 判斷勝負（呼叫端要用 deriveMatchStatus 算好 status 再傳進來），這個案例改成單純驗證
  // status: "won" 時局比數照樣正確組出來，不受賽制影響（賽制判斷的職責已經不在這支函式裡）。
  it("三戰兩勝 2:1 且狀態是 won：顯示「2:1 勝」", () => {
    expect(
      formatMatchResult(
        [
          { ourScore: 25, opponentScore: 20 }, // us
          { ourScore: 20, opponentScore: 25 }, // opponent
          { ourScore: 25, opponentScore: 22 }, // us（決勝局）
        ],
        "won",
      ),
    ).toBe("2:1 勝");
  });
});
