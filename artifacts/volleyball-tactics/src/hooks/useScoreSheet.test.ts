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
// backendRef 的型別在 #230 後從單純的分類字串（'rally' | 'substitution' | 'timeout'）
// 改成 { table: DeletableTable; id: string }（見 types/scoresheet.ts 的 UndoEntry 註解、
// hooks/useScoreSheet.ts 實際呼叫處）——因為主鍵改成前端可自己鑄造的 uuid 後，
// 動作發生當下就知道「我要刪的是哪一筆」，不用再等 POST 回來才補記。這裡的測試只在乎
// undo 堆疊的長度/覆蓋行為，不會真的去打後端 DELETE，所以 id 用什麼字串不影響測試斷言，
// 隨意給一個能辨識用途的假 uuid 字串即可。
function score(side: "us" | "opponent") {
  s().snapshotForUndo(M, { table: "rallies", id: "rally-fake-id" });
  s().scorePoint(M, side);
}

// 模擬 controller.substitute()：先存 substitution 快照，再跑換人 reducer。
function sub(outId: string, inId: string) {
  s().snapshotForUndo(M, { table: "substitutions", id: "sub-fake-id" });
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
    sub("pB", "pC"); // B 又被換成 C：往前追一筆找到原始先發是 pA → [{pA,pC}]
    // 註：淨疊加 dedup 保留的是「原始先發」的 out（pA），不是中間那手的 pB——issue #247
    // 修正後的行為，跟 volleyballRules.ts 的 applyRegularSub 函式註解一致。這也正是為什麼
    // 「逐步倒回」很難用逆運算做、改用快照法：快照存的是每一步當下的完整清單。
    expect(s().recordingsByMatch[M].regularSubs).toEqual([{ outPlayerId: "pA", inPlayerId: "pC" }]);
    // subCount（issue #289）是原始次數，不摺疊：連鎖兩次換人＝2，即使淨疊加清單只剩 1 筆。
    expect(s().recordingsByMatch[M].subCount).toBe(2);

    // 退一步 → 快照精準還原到「A 換成 B」的中間狀態，而不是清空
    s().undoLast(M);
    expect(s().recordingsByMatch[M].regularSubs).toEqual([{ outPlayerId: "pA", inPlayerId: "pB" }]);
    expect(s().recordingsByMatch[M].subCount).toBe(1); // 快照法連 subCount 也整包退回

    // 再退一步 → 才回到沒換過
    s().undoLast(M);
    expect(s().recordingsByMatch[M].regularSubs).toEqual([]);
    expect(s().recordingsByMatch[M].subCount).toBe(0);
  });

  it("換回原始先發（A→B→A）：regularSubs 摺成空，但 subCount 仍是 2（issue #289）", () => {
    startSet("us");
    sub("pA", "pB"); // 場上 A 被換成 B → [{pA,pB}]，subCount=1
    sub("pB", "pA"); // 又換回 A：淨疊加摺成 []，但這仍是實際發生過的第 2 次換人
    expect(s().recordingsByMatch[M].regularSubs).toEqual([]);
    expect(s().recordingsByMatch[M].subCount).toBe(2);

    // 復原最後一次換人 → 退回「A 換成 B」的中間狀態，regularSubs 跟 subCount 都要對得上。
    s().undoLast(M);
    expect(s().recordingsByMatch[M].regularSubs).toEqual([{ outPlayerId: "pA", inPlayerId: "pB" }]);
    expect(s().recordingsByMatch[M].subCount).toBe(1);
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
