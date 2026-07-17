import { describe, it, expect, beforeEach } from "vitest";
import { useRotationTable } from "./useRotationTable";
import { useTacticsBoard } from "./useTacticsBoard";
import type { MatchPlayer } from "../types/match";

// issue #119 的核心：戰術板/輪轉表兩個 store 改用 matchId 分片後，「一場的編輯不會污染另一場」。
// 這裡只打 store 的純 reducer（不 render 元件），釘住三件最容易回歸的事：
//   1. 跨場隔離——動 A 場不會影響 B 場（症狀根因：以前是全域單例）。
//   2. activeProjectId 跟著 matchId 走（症狀 C：以前切場後按儲存會覆寫別場的存檔）。
//   3. buildSnapshot 出口過濾幽靈站位（症狀 B：名單裡沒有的球員不該被靜靜寫進存檔）。

const A = "match-A";
const B = "match-B";

const player = (id: string, role: MatchPlayer["role"] = "OH"): MatchPlayer => ({
  id,
  name: id,
  number: 1,
  role,
});

// store 是 module 級單例，測試之間共用，每次清乾淨兩個 store 的分片與全域畫面狀態。
beforeEach(() => {
  useRotationTable.setState({ dataByMatch: {}, circleLabel: "name" });
  useTacticsBoard.setState({
    dataByMatch: {},
    history: [],
    historyIndex: -1,
    isLayoutMode: false,
    courtView: "rotation",
    selectedObjectId: null,
    activeTool: "select",
  });
});

const rt = () => useRotationTable.getState();
const tb = () => useTacticsBoard.getState();

describe("跨場隔離（issue #119）", () => {
  it("在 A 場放自由站位，不會出現在 B 場的分片裡", () => {
    rt().setRoster(A, [player("p1")]);
    tb().placePlayerFree(A, "p1", 0.5, 0.5);

    expect(tb().dataByMatch[A].tacticsByRotation[0].tacticPositions).toHaveLength(1);
    // B 場從沒被動過，分片應該根本不存在。
    expect(tb().dataByMatch[B]).toBeUndefined();
  });

  it("A、B 兩場各自的先發 L 互不覆寫", () => {
    rt().setStartingLiberoId(A, "libero-A");
    rt().setStartingLiberoId(B, "libero-B");

    expect(rt().dataByMatch[A].startingLiberoId).toBe("libero-A");
    expect(rt().dataByMatch[B].startingLiberoId).toBe("libero-B");
  });

  it("activeProjectId 跟著 matchId 走，不跨場外洩（症狀 C）", () => {
    tb().setActiveProjectId(A, "tactic-A");

    expect(tb().dataByMatch[A].activeProjectId).toBe("tactic-A");
    // B 場沒載入任何戰術，不該繼承 A 場正在編輯的 id。
    expect(tb().dataByMatch[B]?.activeProjectId ?? null).toBeNull();
  });
});

describe("buildSnapshot 幽靈站位過濾（issue #119 症狀 B）", () => {
  it("只保留名單裡還存在的球員的 tacticPositions", () => {
    rt().setRoster(A, [player("p1")]);
    // p1 在名單裡（合法），ghost 不在名單裡（幽靈——可能是被刪掉、或別場遺留的 id）。
    tb().placePlayerFree(A, "p1", 0.3, 0.3);
    tb().placePlayerFree(A, "ghost", 0.6, 0.6);

    const snapshot = tb().buildSnapshot(A);
    const ids = snapshot.rotations[0].tacticPositions.map((p) => p.playerId);

    expect(ids).toContain("p1");
    expect(ids).not.toContain("ghost");
  });
});
