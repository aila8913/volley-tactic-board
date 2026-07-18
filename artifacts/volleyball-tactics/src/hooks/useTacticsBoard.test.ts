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
    viewingScene: null,
    selectedObjectId: null,
    activeTool: "select",
  });
});

// 一份「舊格式」戰術存檔（legacy SavedTacticData）。roster 內嵌在檔案裡（這正是舊格式的特徵，
// 也是 denormalize 能相容舊檔的關鍵），站位放進第 0 輪的 positions。
const legacySave = (roster: MatchPlayer[]) => ({
  roster,
  currentRotation: 0,
  circleLabel: "name" as const,
  labelToggles: { zone: false },
  rotations: [
    {
      positions: roster.map((p, i) => ({ playerId: p.id, x: 0.1 * (i + 1), y: 0.5 })),
      liberoReplacement: null,
    },
  ],
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

describe("undo/redo 一次只走一步（issue #147）", () => {
  // 回歸 #147：戰術布置按 Ctrl+Z 一次回復兩個操作。根因是「先記歷史、再改狀態」，
  // 使 history[historyIndex] 比畫面現況慢一拍；修法改成「先改、再記」。這裡連放三個站位，
  // 第一次 undo 只能退掉最後一個（p3），p1/p2 要留著——舊的錯誤版會一次退掉 p2+p3。
  const ids = () => tb().dataByMatch[A].tacticsByRotation[0].tacticPositions.map((p) => p.playerId);

  it("連放三步後，每次 undo 只退一步", () => {
    tb().placePlayerFree(A, "p1", 0.1, 0.1);
    tb().placePlayerFree(A, "p2", 0.2, 0.2);
    tb().placePlayerFree(A, "p3", 0.3, 0.3);
    expect(ids()).toEqual(["p1", "p2", "p3"]);

    tb().undo(A);
    expect(ids()).toEqual(["p1", "p2"]); // 只退掉 p3，不是連 p2 一起退

    tb().undo(A);
    expect(ids()).toEqual(["p1"]);
  });

  // 回歸 #147 殘留的「畫線」分支：線是拖曳畫的（pointerDown 放起點、pointerMove 更新終點、
  // pointerUp 放開）。舊寫法在 pointerDown 就 pushHistory，記進去的是「起點＝終點」的殘缺線、
  // 完成後的終點永不進歷史，於是畫兩條線後按一次 undo，會把最後一條整條刪掉、前一條退成只剩
  // 起點線頭。修法：addMarker 傳 skipHistory，改在 pointerUp（畫完）才記一次完整的線。
  const markers = () => tb().dataByMatch[A].tacticsByRotation[0].markers;
  // 模擬一次完整的「拖曳畫線」：放起點 → 拖到終點 → 放開時記一次歷史。
  const drawLine = (from: [number, number], to: [number, number]) => {
    tb().addMarker(
      A,
      {
        type: "arrow",
        points: [
          { x: from[0], y: from[1] },
          { x: from[0], y: from[1] },
        ],
      },
      { skipHistory: true },
    );
    const ms = markers();
    const id = ms[ms.length - 1].id;
    tb().updateMarker(A, id, {
      points: [
        { x: from[0], y: from[1] },
        { x: to[0], y: to[1] },
      ],
    });
    tb().pushHistory(A); // pointerUp
  };

  it("拖曳畫兩條線後，一次 undo 只退掉最後一條完整的線（不留線頭）", () => {
    rt().setRoster(A, []);
    tb().enterTacticsLayout(A); // 種入起始空白快照當歷史第 0 格（跟真實進入布置一樣）

    drawLine([1, 1], [2, 2]);
    drawLine([5, 5], [6, 6]);
    expect(markers()).toHaveLength(2);

    tb().undo(A);
    // 第二條線整條消失，只剩第一條——而且第一條是「完整」的線（終點不等於起點），不是殘缺線頭。
    expect(markers()).toHaveLength(1);
    expect(markers()[0].points).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);

    tb().undo(A);
    expect(markers()).toHaveLength(0); // 再退一步回到空白起點
  });

  it("undo 後 redo 把剛退掉的那一步原樣還原", () => {
    tb().placePlayerFree(A, "p1", 0.1, 0.1);
    tb().placePlayerFree(A, "p2", 0.2, 0.2);

    tb().undo(A);
    expect(ids()).toEqual(["p1"]);

    tb().redo(A);
    expect(ids()).toEqual(["p1", "p2"]);
  });
});

describe("載入已存戰術＝唯讀檢視（issue #154 PR B）", () => {
  it("loadProject 不覆寫輪轉表的名單/站位，只改成檢視快照（bug 1/2）", () => {
    // 先在輪轉表放一份「現在的」名單（站位真相來源）。
    rt().setRoster(A, [player("live1"), player("live2")]);
    const liveRosterBefore = rt().dataByMatch[A].roster;

    // 載入一份存檔——存檔內嵌的是完全不同的名單。
    tb().loadProject(A, legacySave([player("saved1"), player("saved2")]), "tid", "接發強發");

    // 核心：輪轉表分片原封不動（連參照都沒變）——反向寫回那道門已焊死，bug 1/2 從架構上消失。
    expect(rt().dataByMatch[A].roster).toBe(liveRosterBefore);
    expect(rt().dataByMatch[A].roster.map((p) => p.id)).toEqual(["live1", "live2"]);

    // 畫面改成唯讀檢視存檔那張快照。
    const scene = tb().viewingScene;
    expect(scene).not.toBeNull();
    expect(scene?.snapshot.players.map((p) => p.name)).toEqual(["saved1", "saved2"]);
    expect(tb().courtView).toBe("tactics");
    expect(tb().isLayoutMode).toBe(false);
    expect(tb().dataByMatch[A].activeProjectId).toBe("tid");
  });

  it("舊快照 denormalize：名單刪掉的人，照片裡仍在（bug 3）", () => {
    // 現在的 live 名單只剩 p1（p2 已被刪），但存檔當時名單有 p1、p2 兩個人。
    rt().setRoster(A, [player("p1")]);
    tb().loadProject(A, legacySave([player("p1"), player("p2")]), "tid", "x");

    // 快照 join 的是存檔內嵌的 roster（不是現在的 live 名單），所以 p2 沒有跟著消失。
    const names = tb().viewingScene?.snapshot.players.map((p) => p.name) ?? [];
    expect(names).toContain("p2");
  });

  it("翻回輪轉視圖會清掉檢視中的快照", () => {
    rt().setRoster(A, [player("p1")]);
    tb().loadProject(A, legacySave([player("p1")]), "tid", "x");
    expect(tb().viewingScene).not.toBeNull();

    tb().setCourtView("rotation");
    expect(tb().viewingScene).toBeNull();
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
