import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { DefenseRange, Marker } from "../types/tacticsBoard";
import {
  CourtSnapshot,
  SnapshotPlayer,
  TacticScene,
  SavedTacticDataV2,
} from "../types/courtSnapshot";
import { parseSavedTactic } from "../lib/courtSnapshot";

// ── issue #154 PR C：戰術白板 session 化重構 ──
//
// 這個 store 過去的形狀（dataByMatch[matchId].tacticsByRotation[6]、直接 import
// useRotationTable 反向讀站位）是 #154 一系列 bug 的結構根源：戰術板明明是「消費者」，
// 卻握著能寫回輪轉表的資料與參照。PR C 把它整個換成「用完即丟的單景 session」：
//
//   1. 白板一次只編一張「快照」（CourtSnapshot）。快照裡的球員是**反正規化**的
//      SnapshotPlayer——姓名/背號/位置在擷取當下就凍進去了，沒有 playerId 外鍵、也沒有
//      對輪轉表 roster 的任何參照。既然型別裡「根本沒有能寫回去的東西」，單向性就不再靠
//      「小心不要寫回」的自律，而是架構保證（capture by value, not by reference）。
//   2. 擷取這件事發生在 **UI 邊界**（TacticsBoardPanel 的按鈕 handler 自己讀輪轉表 state →
//      呼叫純函式 captureFromRotation → 把純值 snapshot 傳進 startSession）。所以這個 store
//      **完全不 import useRotationTable / useScoreSheet**（並用 ESLint no-restricted-imports
//      把這條規則焊進 CI，見 eslint.config.mjs）。
//   3. session 用完即丟：存檔 / 取消 / 切場都直接把 session 設回 null，沒有常駐分片，也就
//      沒有「A 場資料殘留污染 B 場」的可能（#119 那組症狀在架構上消失）。
//
// 唯讀檢視已存戰術（PR B 的 viewingScene）保留：點清單只是「看一張凍結的照片」，按「編輯」
// 才用那張 scene 開一個可改的 session（enterEditFromViewing）。

export type ToolType =
  | "select"
  | "arrow"
  | "dashed"
  | "attack"
  | "text"
  | "volleyball"
  | "circle"
  | "ellipse"
  | "fan";

// 一段可 undo 的「畫面內容」＝場上球員（含座標）＋畫筆＋防守範圍。undo/redo 的堆疊就是
// 一連串這種 content 的深拷貝（見 pushHistory 的 #147 說明）。
interface SceneContent {
  players: SnapshotPlayer[];
  markers: Marker[];
  defenseRanges: DefenseRange[];
}

// 正在編輯的白板 session。單景（PO 拍板）：只持有一張 snapshot，不做 scenes[] + 輪次切換。
interface WhiteboardSession {
  // 反正規化的當前畫面。snapshot.players 的座標會隨拖曳更新，但每個 player 的身分
  //（name/number/role/sourcePlayerId）從擷取那一刻起就凍住不動。
  snapshot: CourtSnapshot;
  markers: Marker[];
  defenseRanges: DefenseRange[];
  name: string; // 戰術名稱（取代舊的 per-match projectSituation）
  serverId: string | null; // 正在覆寫哪一筆已存戰術；null = 新建草稿（取代舊的 activeProjectId）
  // undo/redo 歷史：sceneContent 的堆疊，index 指向「畫面現況那一格」（#147 先改後記約定）。
  history: SceneContent[];
  historyIndex: number;
}

// 深拷貝小工具：undo 歷史每一格都必須是「當下的獨立快照」，不能跟 session 內的陣列共用
// 參照，否則之後改 session 會連歷史一起改掉。用 JSON round-trip 跟 store 其他地方一致
//（這些資料都是純 plain object，沒有函式/Date/循環參照，JSON 拷貝安全且夠快）。
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const contentOf = (s: WhiteboardSession): SceneContent =>
  clone({ players: s.snapshot.players, markers: s.markers, defenseRanges: s.defenseRanges });

// session 不存在時 buildSavedTactic 的保底空快照（正常流程存檔一定在 session 內，這只是
// 讓回傳型別永遠合法、不用回傳 null）。
const blankSnapshot = (): CourtSnapshot => ({
  source: "blank",
  matchId: null,
  rotation: 0,
  capturedAt: new Date().toISOString(),
  players: [],
});

interface TacticsBoardStore {
  // ── 可編輯的白板 session（用完即丟；null = 目前沒在編）──
  session: WhiteboardSession | null;

  // ── 唯讀檢視已存戰術（issue #154 PR B）──
  // viewingScene 是當下正在看的那張凍結照片；viewingTacticId/Name 記住「這張是哪一筆已存
  // 戰術」，好讓「編輯」按鈕能把它升級成可改的 session（帶回原本的 serverId/name）。
  viewingScene: TacticScene | null;
  viewingTacticId: string | null;
  viewingTacticName: string;

  // ── 全域、暫時性的畫面狀態（重整頁面就回預設，不持久化、不隨 match 分片）──
  activeTool: ToolType;
  selectedObjectId: string | null;
  courtView: "rotation" | "tactics";
  labelToggles: { zone: boolean };

  // 全域畫面狀態的 setter
  setActiveTool: (tool: ToolType) => void;
  setSelectedObjectId: (id: string | null) => void;
  setCourtView: (v: "rotation" | "tactics") => void;
  toggleLabel: (key: keyof TacticsBoardStore["labelToggles"]) => void;
  // 切場（換 matchId）時把所有暫時狀態歸零：丟掉 session、清掉唯讀檢視、跳回輪轉視圖。
  resetBoardView: () => void;

  // ── session 生命週期 ──
  // 進入白板的唯一入口：吃一張「已經在外面擷取好的」純值快照（capture by value）。opts 給
  // 「編輯已存戰術」時帶入原本的畫筆/防守範圍/名稱/serverId。
  startSession: (
    snapshot: CourtSnapshot,
    opts?: {
      markers?: Marker[];
      defenseRanges?: DefenseRange[];
      name?: string;
      serverId?: string | null;
    },
  ) => void;
  discardSession: () => void;
  // 把目前唯讀檢視中的那張 scene 升級成可編輯 session（面板「編輯」按鈕）。
  enterEditFromViewing: () => void;
  setSessionName: (name: string) => void;

  // ── session 內的編輯動作（都作用在當前 session；沒有 session 時是 no-op）──
  // 球員以 sourcePlayerId 當 key：可編輯 session 的球員都來自 roster 擷取，sourcePlayerId 必為
  // 非 null，拿來當穩定識別安全（null 只會出現在唯讀檢視的舊快照，那條路不會呼叫這些動作）。
  moveSessionPlayer: (sourcePlayerId: string, x: number, y: number) => void;
  removeSessionPlayer: (sourcePlayerId: string) => void;
  placeSessionPlayer: (player: SnapshotPlayer) => void; // upsert（從名單拖入新球員用）

  // options.skipHistory：拖曳畫線（arrow/dashed/attack）用 pointerDown 放起點、pointerMove
  // 更新終點、pointerUp 才記一次完整的線。pointerDown 時傳 skipHistory 避免把「起點＝終點」的
  // 殘缺線記進歷史（#147 殘留的病灶）；點擊型標記（text/volleyball）不傳，維持「新增即記歷史」。
  addMarker: (marker: Omit<Marker, "id">, options?: { skipHistory?: boolean }) => void;
  updateMarker: (id: string, updates: Partial<Marker>) => void;
  removeMarker: (id: string) => void;
  addDefenseRange: (range: Omit<DefenseRange, "id">) => void;
  updateDefenseRange: (id: string, updates: Partial<DefenseRange>) => void;
  removeDefenseRange: (id: string) => void;
  clearDrawings: () => void; // 清掉所有畫筆＋防守範圍（保留球員站位）

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // ── 唯讀檢視入口（走 parseSavedTactic：zod 驗證 + 舊檔轉接）──
  loadProject: (data: unknown, id: string, name: string) => void;
  importState: (data: unknown) => void;

  // 把當前 session 組成可存檔/匯出的 v2 格式（單景）。反正規化後 legacy 格式已無法忠實
  // 重建，所以一律寫 v2（issue #154 PR C 把原設計的 PR D「寫 v2」併進來）。
  buildSavedTactic: () => SavedTacticDataV2;
}

export const useTacticsBoard = create<TacticsBoardStore>()((set, get) => ({
  session: null,
  viewingScene: null,
  viewingTacticId: null,
  viewingTacticName: "",

  activeTool: "select",
  selectedObjectId: null,
  courtView: "rotation",
  labelToggles: { zone: false },

  setActiveTool: (tool) => set({ activeTool: tool, selectedObjectId: null }),
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  // 翻回輪轉視圖＝離開「看已存戰術」，順手清掉檢視狀態，避免下次進戰術視圖殘留上一張照片。
  //（切到 tactics 不清，因為即時 session 也用 tactics 視圖。）
  setCourtView: (v) =>
    set(
      v === "rotation"
        ? { courtView: v, viewingScene: null, viewingTacticId: null, viewingTacticName: "" }
        : { courtView: v },
    ),
  toggleLabel: (key) =>
    set((state) => ({ labelToggles: { ...state.labelToggles, [key]: !state.labelToggles[key] } })),
  resetBoardView: () =>
    set({
      session: null,
      viewingScene: null,
      viewingTacticId: null,
      viewingTacticName: "",
      courtView: "rotation",
      selectedObjectId: null,
      activeTool: "select",
    }),

  startSession: (snapshot, opts) => {
    // 深拷貝入值：session 拿到的是跟外面來源完全脫鉤的獨立資料，之後怎麼編都碰不到輪轉表。
    const players = snapshot.players.map((p) => ({ ...p }));
    const markers = (opts?.markers ?? []).map((m) => ({ ...m }));
    const defenseRanges = (opts?.defenseRanges ?? []).map((d) => ({ ...d }));
    const session: WhiteboardSession = {
      snapshot: { ...snapshot, players },
      markers,
      defenseRanges,
      name: opts?.name ?? "",
      serverId: opts?.serverId ?? null,
      // 種入「起始畫面」當歷史第 0 格：任何後續編輯都會 push 成第 1 格以後，於是
      //「history.length > 1」剛好等於「使用者動過東西＝有未存內容」（見面板的 dirty 判斷）。
      history: [
        { players: clone(players), markers: clone(markers), defenseRanges: clone(defenseRanges) },
      ],
      historyIndex: 0,
    };
    set({
      session,
      viewingScene: null,
      viewingTacticId: null,
      viewingTacticName: "",
      courtView: "tactics",
      activeTool: "select",
      selectedObjectId: null,
    });
  },

  discardSession: () =>
    set({ session: null, courtView: "rotation", selectedObjectId: null, activeTool: "select" }),

  enterEditFromViewing: () => {
    const { viewingScene, viewingTacticId, viewingTacticName } = get();
    if (!viewingScene) return;
    get().startSession(viewingScene.snapshot, {
      markers: viewingScene.markers,
      defenseRanges: viewingScene.defenseRanges,
      name: viewingTacticName,
      serverId: viewingTacticId,
    });
  },

  setSessionName: (name) =>
    set((state) => (state.session ? { session: { ...state.session, name } } : state)),

  moveSessionPlayer: (sourcePlayerId, x, y) => {
    set((state) => {
      const s = state.session;
      if (!s) return state;
      const players = s.snapshot.players.map((p) =>
        p.sourcePlayerId === sourcePlayerId ? { ...p, x, y } : p,
      );
      return { session: { ...s, snapshot: { ...s.snapshot, players } } };
    });
    get().pushHistory(); // 先改後記（#147）
  },

  removeSessionPlayer: (sourcePlayerId) => {
    set((state) => {
      const s = state.session;
      if (!s) return state;
      return {
        selectedObjectId: null,
        session: {
          ...s,
          snapshot: {
            ...s.snapshot,
            players: s.snapshot.players.filter((p) => p.sourcePlayerId !== sourcePlayerId),
          },
        },
      };
    });
    get().pushHistory();
  },

  placeSessionPlayer: (player) => {
    set((state) => {
      const s = state.session;
      if (!s) return state;
      // upsert：同一個 sourcePlayerId 已在場上就換位置，否則新增（從名單拖入板外球員）。
      const filtered = s.snapshot.players.filter((p) => p.sourcePlayerId !== player.sourcePlayerId);
      return { session: { ...s, snapshot: { ...s.snapshot, players: [...filtered, player] } } };
    });
    get().pushHistory();
  },

  addMarker: (marker, options) => {
    const id = uuidv4();
    set((state) => {
      const s = state.session;
      if (!s) return state;
      return {
        selectedObjectId: id,
        session: { ...s, markers: [...s.markers, { ...marker, id }] },
      };
    });
    if (!options?.skipHistory) get().pushHistory();
  },

  updateMarker: (id, updates) =>
    set((state) => {
      const s = state.session;
      if (!s) return state;
      return {
        session: { ...s, markers: s.markers.map((m) => (m.id === id ? { ...m, ...updates } : m)) },
      };
    }),

  removeMarker: (id) => {
    set((state) => {
      const s = state.session;
      if (!s) return state;
      return {
        selectedObjectId: null,
        session: { ...s, markers: s.markers.filter((m) => m.id !== id) },
      };
    });
    get().pushHistory();
  },

  addDefenseRange: (range) => {
    set((state) => {
      const s = state.session;
      if (!s) return state;
      return {
        activeTool: "select",
        session: { ...s, defenseRanges: [...s.defenseRanges, { ...range, id: uuidv4() }] },
      };
    });
    get().pushHistory();
  },

  updateDefenseRange: (id, updates) => {
    set((state) => {
      const s = state.session;
      if (!s) return state;
      return {
        session: {
          ...s,
          defenseRanges: s.defenseRanges.map((dr) => (dr.id === id ? { ...dr, ...updates } : dr)),
        },
      };
    });
    get().pushHistory();
  },

  removeDefenseRange: (id) => {
    set((state) => {
      const s = state.session;
      if (!s) return state;
      return {
        selectedObjectId: null,
        session: { ...s, defenseRanges: s.defenseRanges.filter((dr) => dr.id !== id) },
      };
    });
    get().pushHistory();
  },

  clearDrawings: () => {
    set((state) => {
      const s = state.session;
      if (!s) return state;
      return { selectedObjectId: null, session: { ...s, markers: [], defenseRanges: [] } };
    });
    get().pushHistory();
  },

  // 把「動作完成後的當前畫面」存進 undo 歷史。#147 的約定：每個動作都是「先 set 改狀態、
  // 再 pushHistory」，所以 history[historyIndex] 永遠等於畫面現況，undo 往回退一格剛好差一步。
  pushHistory: () =>
    set((state) => {
      const s = state.session;
      if (!s) return state;
      // 砍掉 redo 分支：剛 undo 過又畫了新東西，被退掉的未來就不該還留著。
      const newHistory = s.history.slice(0, s.historyIndex + 1);
      newHistory.push(contentOf(s));
      if (newHistory.length > 30) newHistory.shift();
      return { session: { ...s, history: newHistory, historyIndex: newHistory.length - 1 } };
    }),

  undo: () =>
    set((state) => {
      const s = state.session;
      if (!s || s.historyIndex <= 0) return state;
      const idx = s.historyIndex - 1;
      const c = clone(s.history[idx]);
      return {
        selectedObjectId: null,
        session: {
          ...s,
          historyIndex: idx,
          snapshot: { ...s.snapshot, players: c.players },
          markers: c.markers,
          defenseRanges: c.defenseRanges,
        },
      };
    }),

  redo: () =>
    set((state) => {
      const s = state.session;
      if (!s || s.historyIndex >= s.history.length - 1) return state;
      const idx = s.historyIndex + 1;
      const c = clone(s.history[idx]);
      return {
        selectedObjectId: null,
        session: {
          ...s,
          historyIndex: idx,
          snapshot: { ...s.snapshot, players: c.players },
          markers: c.markers,
          defenseRanges: c.defenseRanges,
        },
      };
    }),

  // 載入已存戰術＝唯讀檢視（issue #154 PR B）。parseSavedTactic 會用 zod 驗證並把舊格式
  // 轉成單景 v2；解析失敗會 throw，交給呼叫端 try/catch 提示。刻意「不」開 session、也不碰
  // 任何真相來源——這就是把「載入會覆蓋名單/站位」那道門焊死的地方。
  loadProject: (data, id, name) => {
    const scene = parseSavedTactic(data).scenes[0] ?? null;
    set({
      session: null,
      viewingScene: scene,
      viewingTacticId: id,
      viewingTacticName: name,
      courtView: "tactics",
      selectedObjectId: null,
    });
  },

  // 匯入 JSON 也是唯讀檢視，跟 loadProject 同一條路，只是沒有 server id/name（匯入的檔案
  // 不屬於任何一筆已存戰術）。
  importState: (data) => {
    const scene = parseSavedTactic(data).scenes[0] ?? null;
    set({
      session: null,
      viewingScene: scene,
      viewingTacticId: null,
      viewingTacticName: "",
      courtView: "tactics",
      selectedObjectId: null,
    });
  },

  buildSavedTactic: () => {
    const s = get().session;
    const scene: TacticScene = s
      ? { label: s.name, snapshot: s.snapshot, markers: s.markers, defenseRanges: s.defenseRanges }
      : { label: "", snapshot: blankSnapshot(), markers: [], defenseRanges: [] };
    return { version: 2, scenes: [scene] };
  },
}));
