import { describe, it, expect, beforeEach } from "vitest";
import { useAdvancedRecording } from "./useAdvancedRecording";

// store 是全域單例，每個測試之間要手動重置，不然前一個測試留下的 chainsByMatch 會漏進下一個。
const MATCH_ID = "match-1";
beforeEach(() => {
  useAdvancedRecording.setState({ chainsByMatch: {} });
});

// 大多數測試不在乎影片錨點，統一傳 null（等於「這場比賽沒掛影片，或播放器還沒就緒」）——
// 專門測 anchor 行為的 describe 區塊會自己帶真的錨點值。
const NO_ANCHOR = null;

describe("useAdvancedRecording", () => {
  it("初始狀態：沒有這場比賽的分片時，讀出來是 undefined（元件端用 ?? 補預設值）", () => {
    expect(useAdvancedRecording.getState().chainsByMatch[MATCH_ID]).toBeUndefined();
  });

  it("startBall：滑完成後，current 是半完成的球（toX/toY 皆為 null），balls 還是空的", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack", NO_ANCHOR);
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
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack", NO_ANCHOR);
    useAdvancedRecording.getState().startBall(MATCH_ID, "opponent", null, "block", NO_ANCHOR);
    const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
    expect(draft.current).toMatchObject({ side: "opponent", playerId: null, action: "block" });
    expect(draft.balls).toEqual([]); // 第一次那顆從沒被收進鏈裡
  });

  it("setLandingPoint：補上落點後，那顆球被收進 balls，current 清空", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack", NO_ANCHOR);
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
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack", NO_ANCHOR);
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
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack", NO_ANCHOR);
    useAdvancedRecording.getState().setLandingPoint(MATCH_ID, 1, 1);
    useAdvancedRecording.getState().clearRally(MATCH_ID);
    const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
    expect(draft).toEqual({ balls: [], current: null, anchor: null });
  });

  it("per-match 分片：兩場比賽的補填狀態互不污染", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack", NO_ANCHOR);
    useAdvancedRecording.getState().startBall("match-2", "opponent", null, "serve", NO_ANCHOR);
    expect(useAdvancedRecording.getState().chainsByMatch[MATCH_ID].current).toMatchObject({
      playerId: "player-1",
    });
    expect(useAdvancedRecording.getState().chainsByMatch["match-2"].current).toMatchObject({
      side: "opponent",
      playerId: null,
    });
  });

  it("完整鏈：滑＋tap 兩球後，balls 依序累積", () => {
    useAdvancedRecording.getState().startBall(MATCH_ID, "opponent", null, "serve", NO_ANCHOR);
    useAdvancedRecording.getState().setLandingPoint(MATCH_ID, 50, 10);
    useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "receive", NO_ANCHOR);
    useAdvancedRecording.getState().setLandingPoint(MATCH_ID, 50, 150);
    const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
    expect(draft.balls.map((b) => b.action)).toEqual(["serve", "receive"]);
    expect(draft.current).toBeNull();
  });

  // 影片錨點（#393，實作 ADR-0010 決定 5）：第一個手勢贏，之後的球不覆寫。
  describe("anchor：第一個手勢的播放秒數贏，之後不覆寫", () => {
    it("第一顆球的錨點會被存進 draft.anchor", () => {
      useAdvancedRecording
        .getState()
        .startBall(MATCH_ID, "us", "player-1", "attack", { videoId: "v1", seconds: 42 });
      const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
      expect(draft.anchor).toEqual({ videoId: "v1", seconds: 42 });
    });

    it("第二顆球帶不同的秒數進來，不會覆寫第一顆已經定下的錨點", () => {
      useAdvancedRecording
        .getState()
        .startBall(MATCH_ID, "opponent", null, "serve", { videoId: "v1", seconds: 42 });
      useAdvancedRecording.getState().setLandingPoint(MATCH_ID, 50, 10);
      // 使用者記完第一球花了十幾秒才記第二球，這裡秒數理當比第一球大——但無論多大都不該
      // 被採用，這正是「第一個手勢贏」要擋的情境（見 startBall 型別旁的說明）。
      useAdvancedRecording
        .getState()
        .startBall(MATCH_ID, "us", "player-1", "receive", { videoId: "v1", seconds: 55 });
      const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
      expect(draft.anchor).toEqual({ videoId: "v1", seconds: 42 });
    });

    it("clearRally 之後 anchor 重置回 null，下一分重新從第一個手勢擷取", () => {
      useAdvancedRecording
        .getState()
        .startBall(MATCH_ID, "us", "player-1", "attack", { videoId: "v1", seconds: 42 });
      useAdvancedRecording.getState().clearRally(MATCH_ID);
      const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
      expect(draft.anchor).toBeNull();
    });

    it("startBall 帶 null 錨點（沒有影片／播放器還沒就緒）：anchor 維持 null，不是誤存成別的值", () => {
      useAdvancedRecording.getState().startBall(MATCH_ID, "us", "player-1", "attack", null);
      const draft = useAdvancedRecording.getState().chainsByMatch[MATCH_ID];
      expect(draft.anchor).toBeNull();
    });
  });
});
