import { describe, it, expect } from "vitest";
import {
  applyRally,
  applyRegularSub,
  splitCompletedAndCurrent,
  type RuleState,
} from "./volleyballRules";
import { reconstructSetFromRallies, countRegularSubs } from "./scoreSheetMapping";
import { useScoreSheet } from "../hooks/useScoreSheet";
import type { RegularSub, Side } from "../types/scoresheet";
import type { MatchSet, Rally, Substitution } from "@workspace/api-client-react";

// 這個檔案分成兩層：
//   1. applyRally / applyRegularSub 本身的單元測試——規則細節（side-out 才輪轉、
//      輪轉繞回 0、換人淨疊加摺疊）逐條釘住。
//   2. 「live 與 replay 一致性」測試（parity test）——這才是整個重構（issue #226）
//      真正要保護的東西。以前 useScoreSheet.ts（live）跟 scoreSheetMapping.ts（replay）
//      各自手寫一份一模一樣的規則，這個測試把兩條路徑餵同一組得分序列，斷言算出來的
//      結果完全一致；只要之後有人「只改其中一條路徑」（例如手滑在 useScoreSheet.ts
//      裡加了個特例，卻沒想到 replay 也要跟著改），這個測試就會炸——這正是它存在的理由，
//      也是為什麼不能只寫第 1 類單元測試就滿足。

describe("applyRally", () => {
  const base: RuleState = {
    ourScore: 0,
    opponentScore: 0,
    serving: "us",
    ourRotation: 0,
    opponentRotation: 0,
  };

  it("side-out (winner !== serving) rotates the winning side and flips serve", () => {
    const { state, wasSideOut } = applyRally(base, "opponent");
    expect(wasSideOut).toBe(true);
    expect(state.opponentScore).toBe(1);
    expect(state.ourScore).toBe(0);
    expect(state.opponentRotation).toBe(1);
    expect(state.ourRotation).toBe(0);
    expect(state.serving).toBe("opponent");
  });

  it("server holding serve (winner === serving) scores without rotating", () => {
    const { state, wasSideOut } = applyRally(base, "us");
    expect(wasSideOut).toBe(false);
    expect(state.ourScore).toBe(1);
    expect(state.ourRotation).toBe(0); // 續分不輪轉
    expect(state.serving).toBe("us");
  });

  it("rotation wraps 5 → 0", () => {
    const atFive: RuleState = { ...base, serving: "opponent", ourRotation: 5 };
    const { state } = applyRally(atFive, "us"); // 我方 side-out 奪回發球權
    expect(state.ourRotation).toBe(0);
  });

  it("our and opponent rotations advance independently", () => {
    // serving 從 "opponent" 開始，這樣「我方贏第一分」才是 side-out（贏家跟發球方不同才轉）。
    let state: RuleState = { ...base, serving: "opponent", ourRotation: 2, opponentRotation: 4 };
    // 我方 side-out（奪回發球權）：只有我方輪轉往前，對手不動。
    ({ state } = applyRally(state, "us"));
    expect(state.ourRotation).toBe(3);
    expect(state.opponentRotation).toBe(4);
    // 接著對手 side-out（從我方手上奪回發球權）：只有對手輪轉往前，我方不動。
    ({ state } = applyRally(state, "opponent"));
    expect(state.ourRotation).toBe(3);
    expect(state.opponentRotation).toBe(5);
  });

  it("only the winning side's score increases", () => {
    const { state: s1 } = applyRally(base, "us");
    expect(s1.ourScore).toBe(1);
    expect(s1.opponentScore).toBe(0);

    const { state: s2 } = applyRally(base, "opponent");
    expect(s2.ourScore).toBe(0);
    expect(s2.opponentScore).toBe(1);
  });
});

// #218：「最後一局＝進行中」這條慣例現在吃 isFinished。這組測試把兩種切法都釘住——
// 尤其是 isFinished=true 時「最後一局也算已結束局」，那正是 #218 修掉的病灶（打完的
// 決勝局以前永遠不算數，局比數因此少一局）。
describe("splitCompletedAndCurrent", () => {
  it("比賽進行中：最後一個元素是 current，其餘是 completed", () => {
    expect(splitCompletedAndCurrent([1, 2, 3])).toEqual({ completed: [1, 2], current: 3 });
  });

  it("比賽進行中：只有一局時 completed 是空的（那一局就是進行中那局）", () => {
    expect(splitCompletedAndCurrent([1])).toEqual({ completed: [], current: 1 });
  });

  it("空陣列：兩種切法都不會爆，current 是 undefined", () => {
    expect(splitCompletedAndCurrent([])).toEqual({ completed: [], current: undefined });
    expect(splitCompletedAndCurrent([], true)).toEqual({ completed: [], current: undefined });
  });

  it("已完賽：每一局都是 completed，沒有 current", () => {
    expect(splitCompletedAndCurrent([1, 2, 3], true)).toEqual({
      completed: [1, 2, 3],
      current: undefined,
    });
  });

  it("預設值是「進行中」——沒帶第二個參數時行為跟 #218 之前完全一樣", () => {
    expect(splitCompletedAndCurrent([1, 2, 3])).toEqual(splitCompletedAndCurrent([1, 2, 3], false));
  });
});

describe("applyRegularSub", () => {
  it("collapses a chained re-substitution: A→B then B→C keeps the original starter (issue #247)", () => {
    // A 被換成 B（out:A,in:B），這個位置之後又被換成 C（out:B,in:C）：這次的
    // outPlayerId="B" 剛好等於前一筆的 inPlayerId="B"，代表 B 本身也是替補上場的——
    // 往前追一筆找到這個位置真正的原始先發是 A，摺疊結果是 {out:A, in:C}，不是
    // {out:B, in:C}——跟 scoreSheetMapping.test.ts 的 reconstructRegularSubs
    // 「collapses a chained re-substitution」是同一個斷言（同一份實作）。
    let list: RegularSub[] = [];
    list = applyRegularSub(list, { outPlayerId: "A", inPlayerId: "B" });
    list = applyRegularSub(list, { outPlayerId: "B", inPlayerId: "C" });
    expect(list).toEqual([{ outPlayerId: "A", inPlayerId: "C" }]);
  });

  it("A→B then B→A (换回原始先發) nets out to nothing", () => {
    // 換人換回原始先發本人：這個位置淨效果等於沒換過，整筆從清單消失，
    // 不會留下 {out:A, in:A} 這種「被自己頂替」的怪紀錄。
    let list: RegularSub[] = [];
    list = applyRegularSub(list, { outPlayerId: "A", inPlayerId: "B" });
    list = applyRegularSub(list, { outPlayerId: "B", inPlayerId: "A" });
    expect(list).toEqual([]);
  });

  it("keeps unrelated subs at different positions independent", () => {
    let list: RegularSub[] = [];
    list = applyRegularSub(list, { outPlayerId: "1", inPlayerId: "2" });
    list = applyRegularSub(list, { outPlayerId: "4", inPlayerId: "5" });
    expect(list).toEqual([
      { outPlayerId: "1", inPlayerId: "2" },
      { outPlayerId: "4", inPlayerId: "5" },
    ]);
  });
});

// ── live ↔ replay parity test（issue #226 的重點）──
describe("applyRally parity between the live path and the replay path", () => {
  // 固定的得分序列：us 代表我方贏這一分、opponent 代表對手贏，涵蓋數次 side-out
  // （換手）跟同一方連續得分（不換手）。
  const winners: Side[] = [
    "us",
    "us",
    "opponent",
    "us",
    "opponent",
    "opponent",
    "opponent",
    "us",
    "us",
    "us",
    "opponent",
    "us",
  ];

  // 同一組序列包成後端會回傳的形狀，兩個測試共用。firstServer="home"＝我方先發，
  // 跟 live 路徑的 startSet(MATCH, "us") 對齊。
  const paritySet: MatchSet = { id: 1, matchId: 1, setNumber: 1, firstServer: "home" };
  const parityRallies: Rally[] = winners.map((winner, i) => ({
    id: i + 1,
    setId: 1,
    rallyNumber: i + 1,
    // reconstruct 不讀這幾個 before-score/before-rotation 欄位（它靠 replay 自己重算，
    // 見 ADR-0003：欄位是重放結果的物化，重放才是真相來源），所以這裡填什麼都不影響。
    homeScore: 0,
    awayScore: 0,
    homeRotation: 0,
    awayRotation: 0,
    winner: winner === "us" ? "home" : "away",
  }));

  // 兩條路徑「每記完一分」的狀態快照，攤平成可以直接 toEqual 比較的形狀。
  type Snapshot = {
    ourScore: number;
    opponentScore: number;
    serving: Side | null;
    ourRotation: number;
    opponentRotation: number;
    wasSideOut: boolean;
  };

  it("agrees step by step, not just on the final state", () => {
    // ⚠️ 為什麼一定要「逐分」比對、只比最終狀態不夠：輪轉是 % 6 的循環值，任何「每分多轉
    // 一格」之類的漂移，只要累積的差剛好是 6 的倍數，最終值就會完全一樣、測試照樣全綠
    // （這不是假想——寫這個測試時實際用 12 分的序列驗證過，每分 +1 的人工 bug 因為
    // 12 ≡ 0 (mod 6) 而完全隱形）。比分也有類似問題：只看最終比分，看不出中間是不是
    // 記到了錯的一方又被後面抵銷。所以這裡對每一分都各留一張快照、整串比對。

    // ── live 路徑：走**真正的** zustand store（useScoreSheet 的 startSet / scorePoint），
    //    不是在這裡自己再手寫一份 applyRally 迴圈。
    //
    //    這個差別是這個測試有沒有價值的關鍵：如果 live 路徑只是在測試檔裡自己跑
    //    `applyRally`，那兩條路徑都直接呼叫同一個純函式，測試永遠會過——它只證明了
    //    「同一個函式呼叫兩次結果一樣」，完全抓不到「有人在 scorePoint 裡加了特例、
    //    replay 卻沒跟著改」這種真正的漂移。打進 store 才是真的把 useScoreSheet.ts 的
    //    那條路徑納入保護範圍。
    const MATCH = "parity-match-stepwise";
    useScoreSheet.setState({ recordingsByMatch: {}, undoStacksByMatch: {} });
    const store = () => useScoreSheet.getState();
    store().startSet(MATCH, "us"); // 我方先發

    const liveSnapshots: Snapshot[] = [];
    for (const winner of winners) {
      store().scorePoint(MATCH, winner);
      const cs = store().recordingsByMatch[MATCH].currentSet;
      liveSnapshots.push({
        ourScore: cs.ourScore,
        opponentScore: cs.opponentScore,
        serving: cs.serving,
        ourRotation: cs.ourRotation,
        opponentRotation: cs.opponentRotation,
        // 這一分的 wasSideOut＝剛推進 history 的最後一筆。
        wasSideOut: cs.history[cs.history.length - 1].wasSideOut,
      });
    }

    // ── replay 路徑：對「前 n 分」各重建一次（rallies.slice(0, n)），拿到跟 live 對齊的
    //    逐分快照。順便也涵蓋了「只重建到一半的資料」這種真實情境（reload 時後端就是
    //    只有到目前為止的 rally）。
    const replaySnapshots: Snapshot[] = winners.map((_, i) => {
      const st = reconstructSetFromRallies(paritySet, parityRallies.slice(0, i + 1));
      return {
        ourScore: st.ourScore,
        opponentScore: st.opponentScore,
        serving: st.serving,
        ourRotation: st.ourRotation,
        opponentRotation: st.opponentRotation,
        wasSideOut: st.history[st.history.length - 1].wasSideOut,
      };
    });

    expect(replaySnapshots).toEqual(liveSnapshots);
  });

  it("produces identical final score/serving/rotation and identical per-point wasSideOut", () => {
    // ── live 路徑：走**真正的** zustand store（useScoreSheet 的 startSet / scorePoint），
    //    不是在這裡自己再手寫一份 applyRally 迴圈。
    //
    //    這個差別是這個測試有沒有價值的關鍵：如果 live 路徑只是在測試檔裡自己跑
    //    `applyRally`，那兩條路徑都直接呼叫同一個純函式，測試永遠會過——它只證明了
    //    「同一個函式呼叫兩次結果一樣」，完全抓不到「有人在 scorePoint 裡加了特例、
    //    replay 卻沒跟著改」這種真正的漂移。打進 store 才是真的把 useScoreSheet.ts 的
    //    那條路徑納入保護範圍。
    const MATCH = "parity-match";
    useScoreSheet.setState({ recordingsByMatch: {}, undoStacksByMatch: {} });
    const store = () => useScoreSheet.getState();
    store().startSet(MATCH, "us"); // 我方先發
    for (const winner of winners) {
      store().scorePoint(MATCH, winner);
    }
    const liveSet = store().recordingsByMatch[MATCH].currentSet;
    const liveWasSideOut = liveSet.history.map((h) => h.wasSideOut);

    // ── replay 路徑：把同一組得分序列餵給 reconstructSetFromRallies（跟 reload 時
    //    真正會走的函式一樣）。
    const replayState = reconstructSetFromRallies(paritySet, parityRallies);

    // 兩條路徑的最終結果必須完全相同。
    expect(replayState.ourScore).toBe(liveSet.ourScore);
    expect(replayState.opponentScore).toBe(liveSet.opponentScore);
    expect(replayState.serving).toBe(liveSet.serving);
    expect(replayState.ourRotation).toBe(liveSet.ourRotation);
    expect(replayState.opponentRotation).toBe(liveSet.opponentRotation);

    // 每一步的 wasSideOut 序列也必須完全相同——這是兩邊都要吐出來、給呼叫端存進
    // history/PointRecord 的值，光是最終比分一樣還不夠，逐步過程也不能兜不起來。
    expect(replayState.history.map((h) => h.wasSideOut)).toEqual(liveWasSideOut);
  });
});

// ── 換人「次數」live ↔ replay 一致性測試（issue #289）──
//
// 跟上面 applyRally 的 parity test 是同一個理由：subCount 也有兩條路徑——live 是
// useScoreSheet.ts 的 recordRegularSub 逐次 +1，replay 是 scoreSheetMapping.ts 的
// countRegularSubs 數後端 substitution row 的筆數。兩條路徑必須對同一組換人序列算出
// 同一個數字，尤其是「連鎖換人」「換回原始先發」這兩種會讓淨疊加清單（regularSubs）
// 跟原始次數（subCount）發散的情境——這正是 #289 要修的病灶，見
// types/scoresheet.ts 的 ScoreSheetState.subCount 註解。
describe("subCount parity between the live path and the replay path (issue #289)", () => {
  // 造一筆後端 substitution row（只填 countRegularSubs 會用到的欄位）。homeScore/awayScore
  // 只是排序用的時間戳記，這裡不影響次數計算，固定填 0 即可。
  const makeSub = (outPlayerId: string, inPlayerId: string): Substitution => ({
    id: `sub-${outPlayerId}-${inPlayerId}`,
    setId: "set-1",
    homeScore: 0,
    awayScore: 0,
    playerOutId: outPlayerId,
    playerInId: inPlayerId,
    kind: "regular",
    seq: 0,
  });

  // 三種情境對照表（PO 判定，見 issue #289）：
  //   A→B          規則上換了 1 次
  //   A→B→C（連鎖） 規則上換了 2 次（即使淨疊加清單只剩 1 筆 {out:A,in:C}）
  //   A→B→A（換回先發） 規則上換了 2 次（即使淨疊加清單摺成 0 筆）
  const scenarios: { name: string; subs: [string, string][]; expectedCount: number }[] = [
    { name: "A→B", subs: [["A", "B"]], expectedCount: 1 },
    {
      name: "A→B→C (chained)",
      subs: [
        ["A", "B"],
        ["B", "C"],
      ],
      expectedCount: 2,
    },
    {
      name: "A→B→A (subbed back to the original starter)",
      subs: [
        ["A", "B"],
        ["B", "A"],
      ],
      expectedCount: 2,
    },
  ];

  for (const { name, subs, expectedCount } of scenarios) {
    it(`${name}: live subCount and replay subCount both equal ${expectedCount}`, () => {
      // ── live 路徑：走真正的 zustand store（跟上面 applyRally 的 parity test 同一套理由，
      //    不在測試檔裡自己再手寫一份計數邏輯）。
      const MATCH = `subcount-parity-${name}`;
      useScoreSheet.setState({ recordingsByMatch: {}, undoStacksByMatch: {} });
      const store = () => useScoreSheet.getState();
      store().startSet(MATCH, "us");
      for (const [outPlayerId, inPlayerId] of subs) {
        store().recordRegularSub(MATCH, outPlayerId, inPlayerId);
      }
      const liveSubCount = store().recordingsByMatch[MATCH].subCount;

      // ── replay 路徑：把同一組換人序列包成後端會回傳的 substitution rows，餵給
      //    countRegularSubs（reload 時真正會走的函式）。
      const replaySubs = subs.map(([outPlayerId, inPlayerId]) => makeSub(outPlayerId, inPlayerId));
      const replaySubCount = countRegularSubs(replaySubs);

      expect(liveSubCount).toBe(expectedCount);
      expect(replaySubCount).toBe(expectedCount);
      expect(replaySubCount).toBe(liveSubCount);
    });
  }
});
