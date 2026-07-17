import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import {
  TacticsBoardData,
  RotationTactics,
  DefenseRange,
  Marker,
  SituationTag,
  SavedTacticData,
} from "../types/tacticsBoard";
import { useRotationTable } from "./useRotationTable";

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

const emptyTacticsByRotation: RotationTactics[] = Array(6)
  .fill(null)
  .map(() => ({ tacticPositions: [], markers: [], defenseRanges: [] }));

// 一場比賽的戰術板資料（issue #119 用 matchId 當 key 分片存放的單位）。TacticsBoardData 的
// 形狀（tacticsByRotation/labelToggles/projectSituation/activeProjectId）剛好就是「一場一份」
// 要存的東西，直接重用當分片型別。
const emptyTactics = (): TacticsBoardData => ({
  tacticsByRotation: emptyTacticsByRotation,
  labelToggles: { zone: false },
  projectSituation: "基礎輪轉",
  activeProjectId: null,
});

// 讀「某一場目前在第幾輪」——輪轉表是站位的真相來源，currentRotation 現在也存在它的
// per-match 分片裡（issue #119）。戰術板的每個動作都要知道「現在在編哪一輪」，所以統一
// 從輪轉表拿；拿不到（那場還沒任何資料）就當第 0 輪。
const currentRotationOf = (matchId: string): number =>
  useRotationTable.getState().dataByMatch[matchId]?.currentRotation ?? 0;

interface TacticsBoardStore {
  // ── per-match 分片（issue #119）──
  // 戰術本身的資料一場一份，用 matchId 當 key。以前戰術庫是全域單例：A 場的 activeProjectId
  // 會殘留到 B 場，切場後按「儲存」還會覆寫別場的存檔（症狀 C）。分片後每場各讀自己的 key，
  // 跨場覆寫從根本不可能。刻意不用 persist（見檔尾說明）。
  dataByMatch: Record<string, TacticsBoardData>;

  // ── 全域、暫時性的畫面狀態（不隨 match 走、也本來就不持久化）──
  // 一次只會看到一塊戰術板，這些「目前選什麼工具、在不在布置模式、undo 歷史」重整頁面
  // 就該回預設值，留在全域最單純。（拆分前它們也不在 persist 的 partialize 名單裡。）
  activeTool: ToolType;
  selectedObjectId: string | null;
  isLayoutMode: boolean;
  courtView: "rotation" | "tactics";
  // undo/redo 只管戰術板自己畫的東西（畫筆、防守範圍、戰術視圖自由站位），不管輪轉表的
  // 站位。歷史堆疊是「當前正在編的那一輪」的快照，切輪次/切場都會重置（見 syncRotationChange）。
  history: RotationTactics[];
  historyIndex: number;

  // 全域畫面狀態的 setter（不需要 matchId）
  setActiveTool: (tool: ToolType) => void;
  setSelectedObjectId: (id: string | null) => void;
  setLayoutMode: (value: boolean) => void;
  setCourtView: (v: "rotation" | "tactics") => void;
  // 進入某一場的戰術板時，把全域、暫時性的畫面狀態歸零（issue #119）。因為 history/isLayoutMode/
  // courtView 是全域共用、但 tacticsByRotation 是 per-match：若不歸零，從 A 場帶著 undo 歷史切到
  // B 場再按 Ctrl+Z，會把 A 的快照還原進 B 的分片。TacticsBoard 頁在 matchId 變動時呼叫一次。
  resetBoardView: () => void;

  // 以下動作都收 matchId 第一參數，指定要動哪一場的分片。
  setProjectSituation: (matchId: string, situation: SituationTag) => void;
  toggleLabel: (matchId: string, key: keyof TacticsBoardData["labelToggles"]) => void;

  pushHistory: (matchId: string) => void;
  undo: (matchId: string) => void;
  redo: (matchId: string) => void;

  // 輪次切換時的跨 store 同步（取代舊的全域 subscribe）：切輪次後重置這塊戰術板的 undo 歷史、
  // 取消選取、跳回輪轉視圖。改由 RotationSwitcher 在呼叫 setCurrentRotation 後「明確」呼叫一次，
  // 而不是靠全域 subscribe——因為 currentRotation 現在存在 per-match 分片裡，全域 subscribe
  // 沒辦法乾淨地分辨「是哪一場的輪次變了」。這就是專案偏好的「資料用傳輸的」明確呼叫。
  syncRotationChange: (matchId: string) => void;

  // 進入戰術布置的唯一入口：把輪轉表「當下」的即時站位複製一份到 tacticPositions，
  // 當作這次編輯的起點。之後不管在戰術布置裡怎麼拖，都只改這份複製出來的快照，
  // 不會寫回輪轉表——兩邊從這一刻起完全獨立。
  enterTacticsLayout: (matchId: string) => void;

  // 戰術布置模式下的自由放置：直接用正規化座標（0~1 範圍），只影響目前輪次的快照。
  placePlayerFree: (matchId: string, playerId: string, x: number, y: number) => void;
  addDefenseRange: (matchId: string, range: Omit<DefenseRange, "id">) => void;
  updateDefenseRange: (matchId: string, id: string, updates: Partial<DefenseRange>) => void;
  removeDefenseRange: (matchId: string, id: string) => void;
  addMarker: (matchId: string, marker: Omit<Marker, "id">) => void;
  updateMarker: (matchId: string, id: string, updates: Partial<Marker>) => void;
  removeMarker: (matchId: string, id: string) => void;
  clearMarkers: (matchId: string) => void;
  resetCurrentRotationTactics: (matchId: string) => void;
  removePlayerFromTacticView: (matchId: string, playerId: string) => void;

  setActiveProjectId: (matchId: string, id: string | null) => void;
  // 把 API 回傳的已存戰術資料載入編輯器，同時分派給輪轉表 + 戰術板兩個 store。
  loadProject: (matchId: string, data: SavedTacticData, id: string, name: string) => void;
  importState: (matchId: string, data: SavedTacticData) => void;
  // 把輪轉表 + 戰術板兩份資料合併成可以存檔/匯出的單一 JSON（跟拆分 store 之前的
  // 格式一樣，這樣資料庫裡舊的已存戰術才能繼續正常讀取）。
  buildSnapshot: (matchId: string) => SavedTacticData;
}

// 在 set() 裡對「某一場的戰術分片」做 immutable 更新的共用小工具（同 useRotationTable）。
function updateMatch(
  state: TacticsBoardStore,
  matchId: string,
  updater: (prev: TacticsBoardData) => TacticsBoardData,
): Pick<TacticsBoardStore, "dataByMatch"> {
  const prev = state.dataByMatch[matchId] ?? emptyTactics();
  return { dataByMatch: { ...state.dataByMatch, [matchId]: updater(prev) } };
}

// 只改「某一場、目前輪次」那一格 RotationTactics 的便捷版：大多數畫筆/站位動作都是這個形狀。
function updateCurrentRotation(
  state: TacticsBoardStore,
  matchId: string,
  updater: (rot: RotationTactics) => RotationTactics,
): Pick<TacticsBoardStore, "dataByMatch"> {
  const r = currentRotationOf(matchId);
  return updateMatch(state, matchId, (m) => {
    const newTactics = [...m.tacticsByRotation];
    newTactics[r] = updater(newTactics[r]);
    return { ...m, tacticsByRotation: newTactics };
  });
}

export const useTacticsBoard = create<TacticsBoardStore>()((set, get) => ({
  dataByMatch: {},

  activeTool: "select",
  selectedObjectId: null,
  isLayoutMode: false,
  courtView: "rotation",
  history: [],
  historyIndex: -1,

  setActiveTool: (tool) => set({ activeTool: tool, selectedObjectId: null }),
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  setLayoutMode: (value) =>
    set({ isLayoutMode: value, activeTool: "select", selectedObjectId: null }),
  setCourtView: (v) => set({ courtView: v }),
  resetBoardView: () =>
    set({
      history: [],
      historyIndex: -1,
      isLayoutMode: false,
      courtView: "rotation",
      selectedObjectId: null,
      activeTool: "select",
    }),

  setProjectSituation: (matchId, situation) =>
    set((state) => updateMatch(state, matchId, (m) => ({ ...m, projectSituation: situation }))),

  toggleLabel: (matchId, key) =>
    set((state) =>
      updateMatch(state, matchId, (m) => ({
        ...m,
        labelToggles: { ...m.labelToggles, [key]: !m.labelToggles[key] },
      })),
    ),

  pushHistory: (matchId) =>
    set((state) => {
      const r = currentRotationOf(matchId);
      const currentRotState = state.dataByMatch[matchId]?.tacticsByRotation[r];
      if (!currentRotState) return state;
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(currentRotState)));
      if (newHistory.length > 30) newHistory.shift();
      return { history: newHistory, historyIndex: newHistory.length - 1 };
    }),

  undo: (matchId) =>
    set((state) => {
      if (state.historyIndex <= 0) return state;
      const newIndex = state.historyIndex - 1;
      return {
        historyIndex: newIndex,
        selectedObjectId: null,
        ...updateCurrentRotation(state, matchId, () => state.history[newIndex]),
      };
    }),

  redo: (matchId) =>
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state;
      const newIndex = state.historyIndex + 1;
      return {
        historyIndex: newIndex,
        selectedObjectId: null,
        ...updateCurrentRotation(state, matchId, () => state.history[newIndex]),
      };
    }),

  syncRotationChange: (matchId) =>
    set((state) => {
      const r = currentRotationOf(matchId);
      const tacticsByRotation =
        state.dataByMatch[matchId]?.tacticsByRotation ?? emptyTacticsByRotation;
      return {
        history: [tacticsByRotation[r]],
        historyIndex: 0,
        selectedObjectId: null,
        courtView: "rotation",
      };
    }),

  enterTacticsLayout: (matchId) => {
    const rt = useRotationTable.getState().dataByMatch[matchId];
    const r = rt?.currentRotation ?? 0;
    // 複製（不是參照）目前輪次的即時站位，當作這次布置的起點——之後怎麼編輯
    // 都只碰這份副本，跟輪轉表的即時資料從這一刻起完全脫鉤。
    const snapshot = (rt?.rotations[r].positions ?? []).map((p) => ({ ...p }));
    set((state) => {
      const patch = updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        tacticPositions: snapshot,
      }));
      const newRotState = patch.dataByMatch[matchId].tacticsByRotation[r];
      return {
        ...patch,
        isLayoutMode: true,
        courtView: "tactics",
        activeTool: "select",
        selectedObjectId: null,
        history: [newRotState],
        historyIndex: 0,
      };
    });
  },

  placePlayerFree: (matchId, playerId, x, y) => {
    get().pushHistory(matchId);
    // 戰術布置是自由畫布，自由球員在這裡跟一般球員一視同仁——只改這張快照的
    // tacticPositions，不檢查「只能站後排」（那是輪轉表的比賽規則），也不寫回 startingLiberoId。
    set((state) =>
      updateCurrentRotation(state, matchId, (rot) => {
        const filtered = rot.tacticPositions.filter((p) => p.playerId !== playerId);
        return { ...rot, tacticPositions: [...filtered, { playerId, x, y }] };
      }),
    );
  },

  addDefenseRange: (matchId, range) => {
    get().pushHistory(matchId);
    set((state) => ({
      activeTool: "select",
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        defenseRanges: [...rot.defenseRanges, { ...range, id: uuidv4() }],
      })),
    }));
  },

  updateDefenseRange: (matchId, id, updates) => {
    get().pushHistory(matchId);
    set((state) =>
      updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        defenseRanges: rot.defenseRanges.map((dr) => (dr.id === id ? { ...dr, ...updates } : dr)),
      })),
    );
  },

  removeDefenseRange: (matchId, id) => {
    get().pushHistory(matchId);
    set((state) => ({
      selectedObjectId: null,
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        defenseRanges: rot.defenseRanges.filter((dr) => dr.id !== id),
      })),
    }));
  },

  addMarker: (matchId, marker) => {
    get().pushHistory(matchId);
    const id = uuidv4();
    set((state) => ({
      selectedObjectId: id,
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        markers: [...rot.markers, { ...marker, id }],
      })),
    }));
  },

  updateMarker: (matchId, id, updates) =>
    set((state) =>
      updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        markers: rot.markers.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      })),
    ),

  removeMarker: (matchId, id) => {
    get().pushHistory(matchId);
    set((state) => ({
      selectedObjectId: null,
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        markers: rot.markers.filter((m) => m.id !== id),
      })),
    }));
  },

  clearMarkers: (matchId) => {
    get().pushHistory(matchId);
    set((state) => ({
      selectedObjectId: null,
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        markers: [],
        defenseRanges: [],
      })),
    }));
  },

  resetCurrentRotationTactics: (matchId) => {
    get().pushHistory(matchId);
    set((state) => ({
      selectedObjectId: null,
      ...updateCurrentRotation(state, matchId, () => ({
        tacticPositions: [],
        markers: [],
        defenseRanges: [],
      })),
    }));
  },

  removePlayerFromTacticView: (matchId, playerId) =>
    set((state) => ({
      selectedObjectId: null,
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        tacticPositions: rot.tacticPositions.filter((p) => p.playerId !== playerId),
      })),
    })),

  setActiveProjectId: (matchId, id) =>
    set((state) => updateMatch(state, matchId, (m) => ({ ...m, activeProjectId: id }))),

  // data 來自 API 回傳的 Tactic.data，分派給輪轉表 + 戰術板兩個 store。
  // 舊存檔可能沒有 tacticPositions/markers/defenseRanges，加 ?? [] 做向後相容。
  loadProject: (matchId, data, id, name) => {
    useRotationTable.getState().loadRotationData(matchId, {
      roster: data.roster,
      currentRotation: data.currentRotation ?? 0,
      circleLabel: data.circleLabel ?? "name",
      rotations: data.rotations.map((r) => ({
        positions: r.positions,
        liberoReplacement: r.liberoReplacement ?? null,
      })),
      // 載入戰術時重新推算先發 L（以名單第一個 L 為預設）
      startingLiberoId: data.roster.find((p) => p.role === "L")?.id ?? null,
    });
    const tacticsByRotation = data.rotations.map((r) => ({
      tacticPositions: r.tacticPositions ?? [],
      markers: r.markers ?? [],
      defenseRanges: r.defenseRanges ?? [],
    }));
    set((state) => ({
      history: [tacticsByRotation[data.currentRotation ?? 0]],
      historyIndex: 0,
      selectedObjectId: null,
      // 點已儲存戰術是「檢視」，不是自動進入編輯——中間球場切去戰術視圖顯示這張
      // 快照，但先保持唯讀；要編輯的話再按「編輯」。
      isLayoutMode: false,
      courtView: "tactics",
      ...updateMatch(state, matchId, (m) => ({
        ...m,
        tacticsByRotation,
        labelToggles: data.labelToggles ?? { zone: false },
        projectSituation: name,
        activeProjectId: id,
      })),
    }));
  },

  importState: (matchId, data) => {
    useRotationTable.getState().loadRotationData(matchId, {
      roster: data.roster,
      currentRotation: data.currentRotation ?? 0,
      circleLabel: data.circleLabel ?? "name",
      rotations: data.rotations.map((r) => ({
        positions: r.positions,
        liberoReplacement: r.liberoReplacement ?? null,
      })),
      startingLiberoId: data.roster.find((p) => p.role === "L")?.id ?? null,
    });
    const tacticsByRotation = data.rotations.map((r) => ({
      tacticPositions: r.tacticPositions ?? [],
      markers: r.markers ?? [],
      defenseRanges: r.defenseRanges ?? [],
    }));
    set((state) => ({
      history: [tacticsByRotation[data.currentRotation ?? 0]],
      historyIndex: 0,
      selectedObjectId: null,
      isLayoutMode: false,
      courtView: "tactics",
      ...updateMatch(state, matchId, (m) => ({
        ...m,
        tacticsByRotation,
        labelToggles: data.labelToggles ?? { zone: false },
      })),
    }));
  },

  buildSnapshot: (matchId) => {
    const rt = useRotationTable.getState();
    const rotationData = rt.dataByMatch[matchId] ?? {
      roster: [],
      currentRotation: 0,
      rotations: [],
      startingLiberoId: null,
    };
    const tb = get().dataByMatch[matchId] ?? emptyTactics();
    // 幽靈站位過濾（issue #119 症狀 B）：tacticPositions 裡可能殘留「已不在名單」的球員
    // （被刪掉、或根本是別場遺留的 id），存檔前只保留還在這場名單裡的，避免把幽靈站位
    // 靜靜寫進 DB。roster 是這場的真相來源，用它的 id 集合當白名單。
    const validIds = new Set(rotationData.roster.map((p) => p.id));
    return {
      roster: rotationData.roster,
      currentRotation: rotationData.currentRotation,
      circleLabel: rt.circleLabel,
      labelToggles: tb.labelToggles,
      rotations: rotationData.rotations.map((r, i) => ({
        positions: r.positions,
        liberoReplacement: r.liberoReplacement,
        tacticPositions: (tb.tacticsByRotation[i]?.tacticPositions ?? []).filter((p) =>
          validIds.has(p.playerId),
        ),
        markers: tb.tacticsByRotation[i]?.markers ?? [],
        defenseRanges: tb.tacticsByRotation[i]?.defenseRanges ?? [],
      })),
    };
  },
}));
