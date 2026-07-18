import { describe, it, expect, beforeEach } from "vitest";
import { useRotationTable } from "./useRotationTable";
import { useTacticsBoard } from "./useTacticsBoard";
import type { MatchPlayer } from "../types/match";
import type { CourtSnapshot, SnapshotPlayer } from "../types/courtSnapshot";

// issue #154 PR C：戰術白板改成「用完即丟的單景 session」。這裡只打 store 的純 reducer
//（不 render 元件），釘住幾件最容易回歸的事：
//   1. undo/redo 一次只走一步（#147），機制搬進 session 後仍成立。
//   2. 載入已存戰術＝唯讀檢視（#154 PR B），不碰輪轉表的站位真相。
//   3. 反正規化：載入的快照跟「現在的名單」完全脫鉤（bug 3）。
//   4. 「編輯」把唯讀檢視升級成可改 session；儲存組出 v2 格式。

const A = "match-A";

const player = (id: string, role: MatchPlayer["role"] = "OH"): MatchPlayer => ({
  id,
  name: id,
  number: 1,
  role,
});

// 一筆 SnapshotPlayer（反正規化：身分＋座標都凍在裡面，沒有回名單查的欄位）。
const snapPlayer = (id: string, x = 0.5, y = 0.5): SnapshotPlayer => ({
  sourcePlayerId: id,
  name: id,
  number: 1,
  role: "OH",
  x,
  y,
  isLibero: false,
});

// 一張擷取好的快照（模擬 captureFromRotation 的產物，直接以值傳給 startSession）。
const snapshot = (players: SnapshotPlayer[]): CourtSnapshot => ({
  source: "rotation",
  matchId: A,
  rotation: 0,
  capturedAt: new Date().toISOString(),
  players,
});

// 一份「舊格式」戰術存檔（legacy SavedTacticData）：roster 內嵌在檔案裡（這正是舊格式的特徵，
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

// store 是 module 級單例，測試之間共用，每次清乾淨兩個 store 的狀態。
beforeEach(() => {
  useRotationTable.setState({ dataByMatch: {}, circleLabel: "name" });
  useTacticsBoard.setState({
    session: null,
    viewingScene: null,
    viewingTacticId: null,
    viewingTacticName: "",
    selectedObjectId: null,
    activeTool: "select",
    courtView: "rotation",
    labelToggles: { zone: false },
  });
});

describe("undo/redo 一次只走一步（issue #147）", () => {
  // 回歸 #147：戰術布置按 Ctrl+Z 一次回復兩個操作。根因是「先記歷史、再改狀態」，
  // 使 history[historyIndex] 比畫面現況慢一拍；修法改成「先改、再記」。session 化後機制不變。
  const ids = () => tb().session?.snapshot.players.map((p) => p.sourcePlayerId) ?? [];

  it("連放三個球員後，每次 undo 只退一步", () => {
    tb().startSession(snapshot([])); // 空白起點當歷史第 0 格
    tb().placeSessionPlayer(snapPlayer("p1", 0.1, 0.1));
    tb().placeSessionPlayer(snapPlayer("p2", 0.2, 0.2));
    tb().placeSessionPlayer(snapPlayer("p3", 0.3, 0.3));
    expect(ids()).toEqual(["p1", "p2", "p3"]);

    tb().undo();
    expect(ids()).toEqual(["p1", "p2"]); // 只退掉 p3，不是連 p2 一起退

    tb().undo();
    expect(ids()).toEqual(["p1"]);
  });

  it("undo 後 redo 把剛退掉的那一步原樣還原", () => {
    tb().startSession(snapshot([]));
    tb().placeSessionPlayer(snapPlayer("p1"));
    tb().placeSessionPlayer(snapPlayer("p2"));

    tb().undo();
    expect(ids()).toEqual(["p1"]);

    tb().redo();
    expect(ids()).toEqual(["p1", "p2"]);
  });

  // 回歸 #147 殘留的「畫線」分支：線是拖曳畫的（pointerDown 放起點、pointerMove 更新終點、
  // pointerUp 放開）。舊寫法在 pointerDown 就 pushHistory，記進去的是「起點＝終點」的殘缺線；
  // 修法：addMarker 傳 skipHistory，改在 pointerUp（畫完）才記一次完整的線。
  const markers = () => tb().session?.markers ?? [];
  const drawLine = (from: [number, number], to: [number, number]) => {
    tb().addMarker(
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
    tb().updateMarker(id, {
      points: [
        { x: from[0], y: from[1] },
        { x: to[0], y: to[1] },
      ],
    });
    tb().pushHistory(); // pointerUp
  };

  it("拖曳畫兩條線後，一次 undo 只退掉最後一條完整的線（不留線頭）", () => {
    tb().startSession(snapshot([]));

    drawLine([1, 1], [2, 2]);
    drawLine([5, 5], [6, 6]);
    expect(markers()).toHaveLength(2);

    tb().undo();
    // 第二條線整條消失，只剩第一條——而且第一條是「完整」的線（終點不等於起點）。
    expect(markers()).toHaveLength(1);
    expect(markers()[0].points).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);

    tb().undo();
    expect(markers()).toHaveLength(0); // 再退一步回到空白起點
  });
});

describe("載入已存戰術＝唯讀檢視（issue #154 PR B/C）", () => {
  it("loadProject 不碰輪轉表的名單/站位，只設成檢視快照（bug 1/2）", () => {
    // 先在輪轉表放一份「現在的」名單（站位真相來源）。
    rt().setRoster(A, [player("live1"), player("live2")]);
    const liveRosterBefore = rt().dataByMatch[A].roster;

    // 載入一份存檔——存檔內嵌的是完全不同的名單。
    tb().loadProject(legacySave([player("saved1"), player("saved2")]), "tid", "接發強發");

    // 核心：輪轉表分片原封不動（連參照都沒變）——白板 store 根本不 import 輪轉表，寫不回去。
    expect(rt().dataByMatch[A].roster).toBe(liveRosterBefore);
    expect(rt().dataByMatch[A].roster.map((p) => p.id)).toEqual(["live1", "live2"]);

    // 畫面改成唯讀檢視存檔那張快照，且沒有開 session。
    const scene = tb().viewingScene;
    expect(scene).not.toBeNull();
    expect(scene?.snapshot.players.map((p) => p.name)).toEqual(["saved1", "saved2"]);
    expect(tb().session).toBeNull();
    expect(tb().courtView).toBe("tactics");
    expect(tb().viewingTacticId).toBe("tid");
  });

  it("舊快照 denormalize：名單刪掉的人，照片裡仍在（bug 3）", () => {
    // 現在的 live 名單只剩 p1（p2 已被刪），但存檔當時名單有 p1、p2 兩個人。
    rt().setRoster(A, [player("p1")]);
    tb().loadProject(legacySave([player("p1"), player("p2")]), "tid", "x");

    // 快照 join 的是存檔內嵌的 roster（不是現在的 live 名單），所以 p2 沒有跟著消失。
    const names = tb().viewingScene?.snapshot.players.map((p) => p.name) ?? [];
    expect(names).toContain("p2");
  });

  it("翻回輪轉視圖會清掉檢視中的快照", () => {
    tb().loadProject(legacySave([player("p1")]), "tid", "x");
    expect(tb().viewingScene).not.toBeNull();

    tb().setCourtView("rotation");
    expect(tb().viewingScene).toBeNull();
  });
});

describe("編輯已存戰術 + 存檔（issue #154 PR C）", () => {
  it("enterEditFromViewing 把唯讀檢視升級成可編輯 session（帶回 serverId/name）", () => {
    tb().loadProject(legacySave([player("p1"), player("p2")]), "tid", "接發強發");
    tb().enterEditFromViewing();

    const s = tb().session;
    expect(s).not.toBeNull();
    // session 拿到那張 scene 的內容，且記得原本是哪一筆（覆寫存檔要用）。
    expect(s?.serverId).toBe("tid");
    expect(s?.name).toBe("接發強發");
    expect(s?.snapshot.players.map((p) => p.name)).toEqual(["p1", "p2"]);
    // 升級成編輯後，唯讀檢視狀態清空（同一畫面不會又唯讀又可改）。
    expect(tb().viewingScene).toBeNull();
  });

  it("buildSavedTactic 產出單景 v2 格式，內容＝當前 session", () => {
    tb().startSession(snapshot([snapPlayer("p1")]), { name: "我的戰術" });
    tb().addMarker({ type: "volleyball", x: 10, y: 20 });

    const saved = tb().buildSavedTactic();
    expect(saved.version).toBe(2);
    expect(saved.scenes).toHaveLength(1);
    expect(saved.scenes[0].label).toBe("我的戰術");
    expect(saved.scenes[0].snapshot.players.map((p) => p.sourcePlayerId)).toEqual(["p1"]);
    expect(saved.scenes[0].markers).toHaveLength(1);
  });

  it("discardSession 用完即丟：session 歸零、回輪轉視圖", () => {
    tb().startSession(snapshot([snapPlayer("p1")]));
    expect(tb().session).not.toBeNull();

    tb().discardSession();
    expect(tb().session).toBeNull();
    expect(tb().courtView).toBe("rotation");
  });
});
