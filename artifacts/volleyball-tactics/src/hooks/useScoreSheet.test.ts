import { describe, it, expect, beforeEach } from "vitest";
import { useScoreSheet } from "./useScoreSheet";

// 這裡測的是「復原」的核心：動作快照堆疊（issue #41）。單元測試只打 store 的純 reducer
// （snapshotForUndo / scorePoint / recordRegularSub / setLiberoSubstitution / undoLast），
// 不碰 controller 那層（背景 POST/DELETE 是 React hook，要 render 才跑）——因為容易出錯、
// 最該被釘住的是「快照存了什麼、undo 有沒有整包正確還原」這段邏輯，後端刪除是另一回事。
//
// 每個測試都自己模擬 controller 的動作順序：使用者動作前先 snapshotForUndo(...)，再跑 reducer。

const M = "match-1";

// 重置：store 是 module 級單例，測試之間會共用，每次清乾淨兩張表。
beforeEach(() => {
  useScoreSheet.setState({ recordingsByMatch: {}, undoStacksByMatch: {} });
});

const s = () => useScoreSheet.getState();
const set = (matchId = M) => s().recordingsByMatch[matchId]?.currentSet;
const stackLen = (matchId = M) => s().undoStacksByMatch[matchId]?.length ?? 0;

// 開一局 + 選好先發方，之後才能記分（scorePoint 會擋 serving===null）。
function startSet(serving: "us" | "opponent" = "us") {
  s().startSet(M, serving);
}

// 模擬 controller.score()：先存 rally 快照，再跑記分 reducer。
function score(side: "us" | "opponent") {
  s().snapshotForUndo(M, "rally");
  s().scorePoint(M, side);
}

// 模擬 controller.substitute()：先存 substitution 快照，再跑換人 reducer。
function sub(outId: string, inId: string) {
  s().snapshotForUndo(M, "substitution");
  s().recordRegularSub(M, outId, inId);
}

// 模擬 handleLiberoSubstitute：先存 null（純本地）快照，再設 libero。
function liberoSub(targetId: string | null) {
  s().snapshotForUndo(M, null);
  s().setLiberoSubstitution(M, targetId);
}

describe("undoLast — 單一動作復原", () => {
  it("復原一顆得分：比分退回、堆疊清空", () => {
    startSet("us");
    score("us");
    expect(set()?.ourScore).toBe(1);
    expect(stackLen()).toBe(1);

    s().undoLast(M);
    expect(set()?.ourScore).toBe(0);
    expect(set()?.history).toHaveLength(0);
    expect(stackLen()).toBe(0);
  });

  it("復原一次一般換人：換人清單退回空、比分不動", () => {
    startSet("us");
    score("us"); // 先得一分，才有比分背景
    sub("p1", "p2");
    expect(s().recordingsByMatch[M].regularSubs).toEqual([{ outPlayerId: "p1", inPlayerId: "p2" }]);

    s().undoLast(M);
    expect(s().recordingsByMatch[M].regularSubs).toEqual([]);
    expect(set()?.ourScore).toBe(1); // 換人的復原不該碰比分
  });

  it("復原一次手動 libero 替補：libero 狀態退回 null", () => {
    startSet("us");
    liberoSub("p3");
    expect(s().recordingsByMatch[M].liberoSubstitution).toBe("p3");

    s().undoLast(M);
    expect(s().recordingsByMatch[M].liberoSubstitution).toBeNull();
    expect(stackLen()).toBe(0);
  });

  it("空堆疊時 undoLast 是 no-op（不丟錯、不改狀態）", () => {
    startSet("us");
    const before = s().recordingsByMatch[M];
    s().undoLast(M);
    expect(s().recordingsByMatch[M]).toBe(before); // 參照不變＝沒動
  });
});

describe("undoLast — 一次退一個動作、連按往回（issue #41 重現案例）", () => {
  // 重現：得分（造成輪轉）→ 換自由球員 L → 復原。
  // 期望：按一次只退 libero（比分/輪轉留著），再按一次才退那顆球。
  it("得分後換 libero：第一次復原只退 libero、球留著；第二次才退球", () => {
    startSet("us");
    score("us");
    liberoSub("p3");
    expect(set()?.ourScore).toBe(1);
    expect(s().recordingsByMatch[M].liberoSubstitution).toBe("p3");
    expect(stackLen()).toBe(2);

    // 第一次復原 → 只退 libero
    s().undoLast(M);
    expect(s().recordingsByMatch[M].liberoSubstitution).toBeNull();
    expect(set()?.ourScore).toBe(1); // 球還在
    expect(stackLen()).toBe(1);

    // 第二次復原 → 才退球
    s().undoLast(M);
    expect(set()?.ourScore).toBe(0);
    expect(stackLen()).toBe(0);
  });

  it("換人後得分：第一次復原退球、換人留著；第二次才退換人", () => {
    startSet("us");
    sub("p1", "p2");
    score("us");
    expect(set()?.ourScore).toBe(1);

    // 第一次復原 → 退球，換人還在
    s().undoLast(M);
    expect(set()?.ourScore).toBe(0);
    expect(s().recordingsByMatch[M].regularSubs).toEqual([{ outPlayerId: "p1", inPlayerId: "p2" }]);

    // 第二次復原 → 才退換人
    s().undoLast(M);
    expect(s().recordingsByMatch[M].regularSubs).toEqual([]);
  });

  it("連續換人（A→B→C）逐次復原能精準倒回上一步，不是整包消失", () => {
    startSet("us");
    sub("pA", "pB"); // 場上 A 被換成 B → [{pA,pB}]
    sub("pB", "pC"); // B 又被換成 C：dedup 濾掉 in=pB 那筆、接上這筆 → [{pB,pC}]
    // 註：淨疊加 dedup 保留的是「最後一手」的 out（pB），不是最初的 pA——這是 recordRegularSub
    // 現有行為（見 issue #41 顧問對帳），也正是為什麼「逐步倒回」很難用逆運算做、改用快照法。
    expect(s().recordingsByMatch[M].regularSubs).toEqual([{ outPlayerId: "pB", inPlayerId: "pC" }]);

    // 退一步 → 快照精準還原到「A 換成 B」的中間狀態，而不是清空
    s().undoLast(M);
    expect(s().recordingsByMatch[M].regularSubs).toEqual([{ outPlayerId: "pA", inPlayerId: "pB" }]);

    // 再退一步 → 才回到沒換過
    s().undoLast(M);
    expect(s().recordingsByMatch[M].regularSubs).toEqual([]);
  });
});

describe("nextSet 清空復原堆疊（不能跨局往回退）", () => {
  it("進下一局後堆疊歸零、之前的動作退不回來", () => {
    startSet("us");
    score("us");
    expect(stackLen()).toBe(1);

    s().nextSet(M);
    expect(stackLen()).toBe(0);

    // 此時 undoLast 應該是 no-op，不會去動已封存的上一局
    const before = s().recordingsByMatch[M];
    s().undoLast(M);
    expect(s().recordingsByMatch[M]).toBe(before);
  });
});
