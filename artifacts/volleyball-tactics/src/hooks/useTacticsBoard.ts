import { create } from "zustand";
import { persist } from "zustand/middleware";
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

interface TacticsBoardStore extends TacticsBoardData {
  activeTool: ToolType;
  selectedObjectId: string | null;

  // 是否處於「戰術布置」編輯模式——畫筆/防守範圍工具跟既有標記的選取/拖曳/刪除都鎖在這個
  // 模式裡才能用，平常球場只是唯讀的站位圖。故意不存進 localStorage（看 partialize），
  // 重新整理頁面一律回到唯讀檢視。
  isLayoutMode: boolean;

  // 球場視圖模式：「rotation」只顯示站位圓圈；「tactics」疊加顯示畫筆標記跟防守範圍。
  // ephemeral，不存進 localStorage，切輪次時自動回到 "rotation"。
  courtView: "rotation" | "tactics";

  // undo/redo 只管戰術板自己畫的東西（畫筆、防守範圍、戰術視圖自由站位），不管輪轉表的
  // 站位——拖錯站位用滑鼠拖回去或右鍵刪除就好，跟「畫錯一條線按 Ctrl+Z」是不同層級的操作，
  // 拆開兩個 store 之後這樣分工比較單純。
  history: RotationTactics[];
  historyIndex: number;

  setActiveTool: (tool: ToolType) => void;
  setSelectedObjectId: (id: string | null) => void;
  setLayoutMode: (value: boolean) => void;
  setCourtView: (v: "rotation" | "tactics") => void;
  setProjectSituation: (situation: SituationTag) => void;
  toggleLabel: (key: keyof TacticsBoardData["labelToggles"]) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // 進入戰術布置的唯一入口：把輪轉表「當下」的即時站位複製一份到 tacticPositions，
  // 當作這次編輯的起點。之後不管在戰術布置裡怎麼拖，都只改這份複製出來的快照，
  // 不會寫回輪轉表——兩邊從這一刻起完全獨立。每次點「戰術布置」都會重新拍照、
  // 蓋掉上次编輯的內容（想保留上次的編輯，要先另存成戰術，之後用「已儲存」載入）。
  enterTacticsLayout: () => void;

  // 戰術布置模式下的自由放置：直接用正規化座標（0~1 範圍），只影響目前輪次的快照，
  // 不做格子吸附、不做輪轉傳播，也不寫回輪轉表——自由球員在這裡就是普通的一個標記，
  // 不再強制「只能站後排」（那是輪轉表的比賽規則，戰術布置只是自由畫布）。
  placePlayerFree: (playerId: string, x: number, y: number) => void;
  addDefenseRange: (range: Omit<DefenseRange, "id">) => void;
  updateDefenseRange: (id: string, updates: Partial<DefenseRange>) => void;
  removeDefenseRange: (id: string) => void;
  addMarker: (marker: Omit<Marker, "id">) => void;
  updateMarker: (id: string, updates: Partial<Marker>) => void;
  removeMarker: (id: string) => void;
  clearMarkers: () => void;
  // 只清空目前輪次的畫筆/自由站位（LeftPanel「重置站位」按鈕的另一半，
  // 跟 useRotationTable.resetCurrentRotationPositions 一起被呼叫）。
  resetCurrentRotationTactics: () => void;
  // 在戰術布置裡移除一個人：只影響「這張快照」（目前輪次的 tacticPositions），
  // 不動輪轉表——跟輪轉表那邊的 removePlayerFromCourt 是兩件事，各自獨立。
  removePlayerFromTacticView: (playerId: string) => void;

  setActiveProjectId: (id: string | null) => void;
  // 把 API 回傳的已存戰術資料載入編輯器，同時分派給輪轉表 + 戰術板兩個 store。
  loadProject: (data: SavedTacticData, id: string, name: string) => void;
  importState: (data: SavedTacticData) => void;
  // 把輪轉表 + 戰術板兩份資料合併成可以存檔/匯出的單一 JSON（跟拆分 store 之前的
  // 格式一樣，這樣資料庫裡舊的已存戰術才能繼續正常讀取）。
  buildSnapshot: () => SavedTacticData;
}

export const useTacticsBoard = create<TacticsBoardStore>()(
  persist(
    (set, get) => ({
      tacticsByRotation: emptyTacticsByRotation,
      labelToggles: { zone: false },
      projectSituation: "基礎輪轉",
      activeProjectId: null,

      activeTool: "select",
      selectedObjectId: null,
      isLayoutMode: false,
      courtView: "rotation" as const,

      history: [],
      historyIndex: -1,

      setActiveTool: (tool) => set({ activeTool: tool, selectedObjectId: null }),
      setSelectedObjectId: (id) => set({ selectedObjectId: id }),
      setLayoutMode: (value) =>
        set({ isLayoutMode: value, activeTool: "select", selectedObjectId: null }),
      setCourtView: (v) => set({ courtView: v }),
      setProjectSituation: (situation) => set({ projectSituation: situation }),
      toggleLabel: (key) =>
        set((state) => ({
          labelToggles: { ...state.labelToggles, [key]: !state.labelToggles[key] },
        })),

      pushHistory: () =>
        set((state) => {
          const r = useRotationTable.getState().currentRotation;
          const currentRotState = state.tacticsByRotation[r];
          const newHistory = state.history.slice(0, state.historyIndex + 1);
          newHistory.push(JSON.parse(JSON.stringify(currentRotState)));
          if (newHistory.length > 30) newHistory.shift();
          return { history: newHistory, historyIndex: newHistory.length - 1 };
        }),

      undo: () =>
        set((state) => {
          if (state.historyIndex > 0) {
            const newIndex = state.historyIndex - 1;
            const r = useRotationTable.getState().currentRotation;
            const newTactics = [...state.tacticsByRotation];
            newTactics[r] = state.history[newIndex];
            return {
              historyIndex: newIndex,
              tacticsByRotation: newTactics,
              selectedObjectId: null,
            };
          }
          return state;
        }),

      redo: () =>
        set((state) => {
          if (state.historyIndex < state.history.length - 1) {
            const newIndex = state.historyIndex + 1;
            const r = useRotationTable.getState().currentRotation;
            const newTactics = [...state.tacticsByRotation];
            newTactics[r] = state.history[newIndex];
            return {
              historyIndex: newIndex,
              tacticsByRotation: newTactics,
              selectedObjectId: null,
            };
          }
          return state;
        }),

      enterTacticsLayout: () => {
        const rt = useRotationTable.getState();
        const r = rt.currentRotation;
        // 複製（不是參照）目前輪次的即時站位，當作這次布置的起點——之後怎麼編輯
        // 都只碰這份副本，跟輪轉表的即時資料從這一刻起完全脫鉤。
        const snapshot = rt.rotations[r].positions.map((p) => ({ ...p }));
        set((state) => {
          const newTactics = [...state.tacticsByRotation];
          newTactics[r] = { ...newTactics[r], tacticPositions: snapshot };
          return {
            tacticsByRotation: newTactics,
            isLayoutMode: true,
            courtView: "tactics",
            activeTool: "select",
            selectedObjectId: null,
            history: [newTactics[r]],
            historyIndex: 0,
          };
        });
      },

      placePlayerFree: (playerId, x, y) => {
        get().pushHistory();
        const r = useRotationTable.getState().currentRotation;
        // 戰術布置是自由畫布，自由球員在這裡跟一般球員一視同仁——只改這張快照的
        // tacticPositions，不檢查「只能站後排」（那是輪轉表的比賽規則），也不寫回
        // startingLiberoId。
        set((state) => {
          const newTactics = [...state.tacticsByRotation];
          const filtered = newTactics[r].tacticPositions.filter((p) => p.playerId !== playerId);
          newTactics[r] = { ...newTactics[r], tacticPositions: [...filtered, { playerId, x, y }] };
          return { tacticsByRotation: newTactics };
        });
      },

      addDefenseRange: (range) => {
        get().pushHistory();
        set((state) => {
          const r = useRotationTable.getState().currentRotation;
          const newTactics = [...state.tacticsByRotation];
          newTactics[r] = {
            ...newTactics[r],
            defenseRanges: [...newTactics[r].defenseRanges, { ...range, id: uuidv4() }],
          };
          return { tacticsByRotation: newTactics, activeTool: "select" };
        });
      },

      updateDefenseRange: (id, updates) => {
        get().pushHistory();
        set((state) => {
          const r = useRotationTable.getState().currentRotation;
          const newTactics = [...state.tacticsByRotation];
          newTactics[r] = {
            ...newTactics[r],
            defenseRanges: newTactics[r].defenseRanges.map((dr) =>
              dr.id === id ? { ...dr, ...updates } : dr,
            ),
          };
          return { tacticsByRotation: newTactics };
        });
      },

      removeDefenseRange: (id) => {
        get().pushHistory();
        set((state) => {
          const r = useRotationTable.getState().currentRotation;
          const newTactics = [...state.tacticsByRotation];
          newTactics[r] = {
            ...newTactics[r],
            defenseRanges: newTactics[r].defenseRanges.filter((dr) => dr.id !== id),
          };
          return { tacticsByRotation: newTactics, selectedObjectId: null };
        });
      },

      addMarker: (marker) => {
        get().pushHistory();
        set((state) => {
          const r = useRotationTable.getState().currentRotation;
          const id = uuidv4();
          const newTactics = [...state.tacticsByRotation];
          newTactics[r] = {
            ...newTactics[r],
            markers: [...newTactics[r].markers, { ...marker, id }],
          };
          return { tacticsByRotation: newTactics, selectedObjectId: id };
        });
      },

      updateMarker: (id, updates) => {
        set((state) => {
          const r = useRotationTable.getState().currentRotation;
          const newTactics = [...state.tacticsByRotation];
          newTactics[r] = {
            ...newTactics[r],
            markers: newTactics[r].markers.map((m) => (m.id === id ? { ...m, ...updates } : m)),
          };
          return { tacticsByRotation: newTactics };
        });
      },

      removeMarker: (id) => {
        get().pushHistory();
        set((state) => {
          const r = useRotationTable.getState().currentRotation;
          const newTactics = [...state.tacticsByRotation];
          newTactics[r] = {
            ...newTactics[r],
            markers: newTactics[r].markers.filter((m) => m.id !== id),
          };
          return { tacticsByRotation: newTactics, selectedObjectId: null };
        });
      },

      clearMarkers: () => {
        get().pushHistory();
        set((state) => {
          const r = useRotationTable.getState().currentRotation;
          const newTactics = [...state.tacticsByRotation];
          newTactics[r] = { ...newTactics[r], markers: [], defenseRanges: [] };
          return { tacticsByRotation: newTactics, selectedObjectId: null };
        });
      },

      resetCurrentRotationTactics: () => {
        get().pushHistory();
        set((state) => {
          const r = useRotationTable.getState().currentRotation;
          const newTactics = [...state.tacticsByRotation];
          newTactics[r] = { tacticPositions: [], markers: [], defenseRanges: [] };
          return { tacticsByRotation: newTactics, selectedObjectId: null };
        });
      },

      removePlayerFromTacticView: (playerId) =>
        set((state) => {
          const r = useRotationTable.getState().currentRotation;
          const newTactics = [...state.tacticsByRotation];
          newTactics[r] = {
            ...newTactics[r],
            tacticPositions: newTactics[r].tacticPositions.filter((p) => p.playerId !== playerId),
          };
          return { tacticsByRotation: newTactics, selectedObjectId: null };
        }),

      setActiveProjectId: (id) => set({ activeProjectId: id }),

      // data 來自 API 回傳的 Tactic.data，分派給輪轉表 + 戰術板兩個 store。
      // 舊存檔可能沒有 tacticPositions/markers/defenseRanges，加 ?? [] 做向後相容。
      loadProject: (data, id, name) => {
        useRotationTable.getState().loadRotationData({
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
        set({
          tacticsByRotation,
          labelToggles: data.labelToggles ?? { zone: false },
          projectSituation: name,
          activeProjectId: id,
          history: [tacticsByRotation[data.currentRotation ?? 0]],
          historyIndex: 0,
          selectedObjectId: null,
          // 點已儲存戰術是「檢視」，不是自動進入編輯——中間球場切去戰術視圖顯示這張
          // 快照，但先保持唯讀；要編輯的話再按「編輯」。
          isLayoutMode: false,
          courtView: "tactics",
        });
      },

      importState: (data) => {
        useRotationTable.getState().loadRotationData({
          roster: data.roster,
          currentRotation: data.currentRotation ?? 0,
          circleLabel: data.circleLabel ?? "name",
          rotations: data.rotations.map((r) => ({
            positions: r.positions,
            liberoReplacement: r.liberoReplacement ?? null,
          })),
          startingLiberoId: data.roster.find((p) => p.role === "L")?.id ?? null,
        });
        set(() => {
          const tacticsByRotation = data.rotations.map((r) => ({
            tacticPositions: r.tacticPositions ?? [],
            markers: r.markers ?? [],
            defenseRanges: r.defenseRanges ?? [],
          }));
          return {
            tacticsByRotation,
            labelToggles: data.labelToggles ?? { zone: false },
            history: [tacticsByRotation[data.currentRotation ?? 0]],
            historyIndex: 0,
            selectedObjectId: null,
            isLayoutMode: false,
            courtView: "tactics" as const,
          };
        });
      },

      buildSnapshot: () => {
        const rt = useRotationTable.getState();
        const tb = get();
        return {
          roster: rt.roster,
          currentRotation: rt.currentRotation,
          circleLabel: rt.circleLabel,
          labelToggles: tb.labelToggles,
          rotations: rt.rotations.map((r, i) => ({
            positions: r.positions,
            liberoReplacement: r.liberoReplacement,
            tacticPositions: tb.tacticsByRotation[i]?.tacticPositions ?? [],
            markers: tb.tacticsByRotation[i]?.markers ?? [],
            defenseRanges: tb.tacticsByRotation[i]?.defenseRanges ?? [],
          })),
        };
      },
    }),
    {
      name: "volleyboard_tacticsboard",
      // 只存戰術本身的資料，畫面暫時性的狀態（目前選的工具、有沒有在布置模式、
      // undo 歷史……）重整頁面就該回到預設值，不需要存進 localStorage。
      partialize: (state) => ({
        tacticsByRotation: state.tacticsByRotation,
        labelToggles: state.labelToggles,
        projectSituation: state.projectSituation,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);

// ── 跨 store 同步：輪轉切換時，戰術板要跟著重置自己的 undo 歷史、取消選取、
// 並跳回輪轉視圖 ──
// 這段邏輯以前是寫在 useTactics.ts 唯一一個 store 的 setCurrentRotation 裡，直接一次
// set 兩邊的欄位。拆成兩個 store 之後不能這樣做（輪轉表不能反過來 import 戰術板，
// 那樣會變成循環依賴），所以改用 Zustand 的 subscribe：戰術板訂閱輪轉表的變化，
// 一發現 currentRotation 變了就自己反應，輪轉表完全不需要知道戰術板的存在。
useRotationTable.subscribe((state, prevState) => {
  if (state.currentRotation === prevState.currentRotation) return;
  const tacticsByRotation = useTacticsBoard.getState().tacticsByRotation;
  useTacticsBoard.setState({
    history: [tacticsByRotation[state.currentRotation]],
    historyIndex: 0,
    selectedObjectId: null,
    courtView: "rotation",
  });
});
