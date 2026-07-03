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
import { findNearestZone, BACK_ROW_ZONES } from "../lib/rotationLogic";

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

  // 戰術布置模式下的自由放置：直接用正規化座標（0~1 範圍），只影響目前輪次，不做格子吸附也不做輪轉傳播。
  // 放自由球員時需要改動「誰在場上」，那是輪轉表的資料，所以這裡會呼叫 useRotationTable 的
  // placeLiberoFree——戰術板讀得到、也用得到輪轉表的動作，但輪轉表完全不知道戰術板存在，
  // 這就是我們說好的「單向依賴」：戰術板依賴輪轉表，反過來不行。
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
  // 球員被移出球場時（輪轉表的 removePlayerFromCourt），戰術視圖裡殘留的自由站位
  // 也要清掉，不然會變成沒人認領的幽靈站位。呼叫端（PlayerNode.tsx）要同時呼叫
  // useRotationTable.removePlayerFromCourt 跟這個函式。
  removePlayerTacticPositions: (playerId: string) => void;

  // 重置編輯器回初始值，activeProjectId = null；同時清空輪轉表（新戰術從空白開始）。
  newProject: () => void;
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

      placePlayerFree: (playerId, x, y) => {
        get().pushHistory();
        const rt = useRotationTable.getState();
        const player = rt.roster.find((p) => p.id === playerId);
        const isLibero = player?.role === "L";
        const r = rt.currentRotation;

        // ── 自由球員邏輯 ──────────────────────────────────────────────────────
        // 戰術視圖的自由座標放置也要遵守跟輪轉視圖一樣的規則：同一時間只能有一位 L
        // 在場上、上場時要頂替掉目標位置原本的人。這部分邏輯（誰在場上）屬於輪轉表，
        // 所以交給 useRotationTable.placeLiberoFree 處理，這裡只負責戰術視圖自己的
        // tacticPositions 顯示座標。
        if (isLibero) {
          const zone = findNearestZone(x, y); // 只拿來判斷蓋到了哪個人／哪一格，座標仍用原始 x/y
          if (!BACK_ROW_ZONES.has(zone)) return; // 前排拒絕放置

          rt.placeLiberoFree(r, playerId, zone, { x, y });

          // positions 換完人之後，tacticPositions 裡任何屬於「舊 L」或「剛被換下場那位」的
          // 殘留自由座標都要清掉，不然戰術視圖還是會照著舊資料疊圖，變成幽靈重複站位。
          const updatedRot = useRotationTable.getState().rotations[r];
          const liberoIds = new Set(rt.roster.filter((p) => p.role === "L").map((p) => p.id));
          const replacedId = updatedRot.liberoReplacement?.replacedPosition.playerId;

          set((state) => {
            const newTactics = [...state.tacticsByRotation];
            newTactics[r] = {
              ...newTactics[r],
              tacticPositions: [
                ...newTactics[r].tacticPositions.filter(
                  (p) => !liberoIds.has(p.playerId) && p.playerId !== replacedId,
                ),
                { playerId, x, y },
              ],
            };
            return { tacticsByRotation: newTactics };
          });
          return;
        }

        // ── 一般球員邏輯 ──────────────────────────────────────────────────────
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

      removePlayerTacticPositions: (playerId) =>
        set((state) => ({
          tacticsByRotation: state.tacticsByRotation.map((rt) => ({
            ...rt,
            tacticPositions: rt.tacticPositions.filter((p) => p.playerId !== playerId),
          })),
        })),

      setActiveProjectId: (id) => set({ activeProjectId: id }),

      newProject: () => {
        useRotationTable.getState().resetAll();
        set({
          tacticsByRotation: emptyTacticsByRotation,
          labelToggles: { zone: false },
          projectSituation: "基礎輪轉",
          activeProjectId: null,
          history: [],
          historyIndex: -1,
          selectedObjectId: null,
          activeTool: "select",
        });
      },

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
