import { describe, it, expect, beforeEach } from "vitest";
import { useAdvancedRecording } from "./useAdvancedRecording";

// store 是全域單例，每個測試之間要手動重置，不然前一個測試留下的 chainsByMatch 會漏進下一個。
const MATCH_ID = "match-1";
beforeEach(() => {
  useAdvancedRecording.setState({ chainsByMatch: {} });
});

describe("useAdvancedRecording", () => {
  it("初始狀態：沒有這場比賽的分片時，讀出來是 undefined（元件端用 ?? 補預設值）", () => {
    expect(useAdvancedRecording.getState().chainsByMatch[MATCH_ID]).toBeUndefined();
  });

  it("startBall：滑完成後，current 是半完成的球（toX/toY 皆為 null），balls 還是空的", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack");
    const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
    expect(draft.balls).toEqual([]);
    expect(draft.current).toMatchObject({
      side: "us",
      playerId: "player-1",
      action: "attack",
      toX: null,
      toY: null,
    });
    expect(draft.current?.id).toBeTruthy();
  });

  it("startBall 兩次：第二次覆蓋掉第一次的半完成球（重新滑＝反悔重選，不用先取消）", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack");
    useAdvancedRecording.getState().startBall(MATCH_ID, "opponent", null, "block");
    const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
    expect(draft.current).toMatchObject({ side: "opponent", playerId: null, action: "block" });
    expect(draft.balls).toEqual([]); // 第一次那顆從沒被收進鏈裡
  });

  it("setLandingPoint：補上落點後，那顆球被收進 balls，current 清空", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack");
    useAdvancedRecording.getState().setLandingPoint(MATCH_ID, 42, 88);
    const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
    expect(draft.current).toBeNull();
    expect(draft.balls).toHaveLength(1);
    expect(draft.balls[0]).toMatchObject({ side: "us", playerId: "player-1", toX: 42, toY: 88 });
  });

  it("setLandingPoint：沒有半完成的球時是 no-op", () => {
    useAdvancedRecording.getState().setLandingPoint(MATCH_ID, 1, 2);
    expect(useAdvancedRecording.getState().chainsByMatch[MATCH_ID]).toBeUndefined();
  });

  it("cancelCurrentBall：把半完成的球丟掉，不進 balls", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack");
    useAdvancedRecording.getState().cancelCurrentBall(MATCH_ID);
    const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
    expect(draft.current).toBeNull();
    expect(draft.balls).toEqual([]);
  });

  it("cancelCurrentBall：沒有半完成的球時是 no-op", () => {
    useAdvancedRecording.getState().cancelCurrentBall(MATCH_ID);
    expect(useAdvancedRecording.getState().chainsByMatch[MATCH_ID]).toBeUndefined();
  });

  it("clearRally：全部歸零，回到剛開始補這一分之前的樣子", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack");
    useAdvancedRecording.getState().setLandingPoint(MATCH_ID, 1, 1);
    useAdvancedRecording.getState().clearRally(MATCH_ID);
    const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
    expect(draft).toEqual({ balls: [], current: null });
  });

  it("per-match 分片：兩場比賽的補填狀態互不污染", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack");
    useAdvancedRecording.getState().startBall("match-2", "opponent", null, "serve");
    expect(useAdvancedRecording.getState().chainsByMatch[MATCH_ID].current).toMatchObject({
      playerId: "player-1",
    });
    expect(useAdvancedRecording.getState().chainsByMatch["match-2"].current).toMatchObject({
      side: "opponent",
      playerId: null,
    });
  });

  it("完整鏈：滑＋tap 兩球後，balls 依序累積", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "opponent", null, "serve");
    useAdvancedRecording.getState().setLandingPoint(MATCH_ID, 50, 10);
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "receive");
    useAdvancedRecording.getState().setLandingPoint(MATCH_ID, 50, 150);
    const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
    expect(draft.balls.map((b) => b.action)).toEqual(["serve", "receive"]);
    expect(draft.current).toBeNull();
  });
});
