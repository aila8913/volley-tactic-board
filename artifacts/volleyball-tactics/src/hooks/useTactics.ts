import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import {
  TacticsState,
  RotationState,
  DefenseRange,
  Marker,
  PlayerPosition,
  SituationTag,
  CircleLabelType,
} from "../types/tactics";
import { findNearestZone, getZoneCoords, rotateZone } from "../lib/rotationLogic";
import type { MatchPlayer } from "../types/match";

// 把目前編輯器狀態打包成可存檔的 TacticsState snapshot，
// saveProject / saveProjectAs 共用同一份邏輯，避免兩處分別維護欄位清單。
function buildProjectData(state: TacticsStore): TacticsState {
  return {
    roster: state.roster,
    liberoSubstitution: state.liberoSubstitution,
    currentRotation: state.currentRotation,
    rotations: state.rotations,
    circleLabel: state.circleLabel,
    labelToggles: state.labelToggles,
  };
}

// 把目前場上的站位轉成「哪個格子站了誰」，方便用格子（1~6 號位）做吸附/換位/
// 推算其他輪次的邏輯，而不用每次都跟 x/y 浮點數打交道。
function positionsToZoneMap(positions: PlayerPosition[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const pos of positions) {
    map.set(findNearestZone(pos.x, pos.y), pos.playerId);
  }
  return map;
}

function zoneMapToPositions(zoneMap: Map<number, string>): PlayerPosition[] {
  return Array.from(zoneMap.entries()).map(([zone, playerId]) => {
    const coords = getZoneCoords(zone);
    return { playerId, x: coords.x, y: coords.y };
  });
}

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

interface TacticsStore extends TacticsState {
  activeTool: ToolType;
  selectedObjectId: string | null;

  // 戰術列表改由 API（/tactics）提供，不再存在 store 裡。
  // 這裡只保留「目前正在編輯的戰術名稱」，存檔時作為 name 傳給 API。
  projectSituation: SituationTag;

  // 目前正在編輯哪個已存戰術的 id。null 代表是還沒存過的新草稿。
  // 存進 localStorage（看 partialize），重整頁面後知道上次在編輯哪個。
  activeProjectId: string | null;

  // 是否處於「戰術布置」編輯模式——畫筆/防守範圍工具跟既有標記的選取/拖曳/刪除都鎖在這個
  // 模式裡才能用，平常球場只是唯讀的站位圖。故意不存進 localStorage（看 partialize），
  // 重新整理頁面一律回到唯讀檢視。
  isLayoutMode: boolean;

  history: RotationState[];
  historyIndex: number;

  setActiveTool: (tool: ToolType) => void;
  setSelectedObjectId: (id: string | null) => void;
  setLayoutMode: (value: boolean) => void;
  // 設定完整名單（新增/刪除/編輯球員都透過這個，一次整批換掉）。
  // 進入戰術板時用比賽名單帶入，編輯名單彈窗按「儲存」時也是呼叫這個。
  setRoster: (roster: MatchPlayer[]) => void;
  setCircleLabel: (label: CircleLabelType) => void;
  setLiberoSubstitution: (playerId: string | null) => void;
  setProjectSituation: (situation: SituationTag) => void;
  setCurrentRotation: (index: number) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // 把球員放到場上某個格子（1~6 號位）——不管是從球員設定名單拖上場的新人，還是把
  // 已經在場上的人拖到別的格子，都是呼叫這個。放開時格子已經有人會直接互換位置；
  // 這個格子排定之後，其他 5 個輪次會依照「輪轉了幾格」自動推算，不用每輪都重新拖。
  placePlayerOnCourt: (playerId: string, zone: number) => void;
  // 戰術布置模式下的自由放置：直接用正規化座標（0~1 範圍），只影響目前輪次，不做格子吸附也不做輪轉傳播。
  placePlayerFree: (playerId: string, x: number, y: number) => void;
  addDefenseRange: (range: Omit<DefenseRange, "id">) => void;
  updateDefenseRange: (id: string, updates: Partial<DefenseRange>) => void;
  removeDefenseRange: (id: string) => void;
  addMarker: (marker: Omit<Marker, "id">) => void;
  updateMarker: (id: string, updates: Partial<Marker>) => void;
  removeMarker: (id: string) => void;
  clearMarkers: () => void;
  resetCurrentRotation: () => void;
  copyRotation: () => void;

  toggleLabel: (key: keyof TacticsState["labelToggles"]) => void;

  // 重置編輯器回初始值，activeProjectId = null
  newProject: () => void;
  // 只更新 activeProjectId（create mutation 成功後把伺服器回傳的 id 寫進來用）
  setActiveProjectId: (id: string | null) => void;
  // 把 API 回傳的 TacticsState 載入編輯器（取代原本從 projects[] 查找的版本）
  loadProject: (data: TacticsState, id: string, name: string) => void;
  importState: (data: TacticsState) => void;
  // 把目前編輯器狀態打包成可送給 API 的 TacticsState snapshot
  buildSnapshot: () => TacticsState;
}

const emptyRotations: RotationState[] = Array(6)
  .fill(null)
  .map(() => ({
    positions: [],
    defenseRanges: [],
    markers: [],
  }));

export const useTactics = create<TacticsStore>()(
  persist(
    (set, get) => ({
      roster: [],
      liberoSubstitution: null,
      currentRotation: 0,
      rotations: emptyRotations,
      circleLabel: "name",
      labelToggles: { zone: false },

      activeTool: "select",
      selectedObjectId: null,
      projectSituation: "基礎輪轉",
      activeProjectId: null,
      isLayoutMode: false,

      history: [],
      historyIndex: -1,

      setActiveTool: (tool) => set({ activeTool: tool, selectedObjectId: null }),
      setSelectedObjectId: (id) => set({ selectedObjectId: id }),
      setLayoutMode: (value) =>
        set({ isLayoutMode: value, activeTool: "select", selectedObjectId: null }),

      setRoster: (roster) => set({ roster }),
      setCircleLabel: (label) => set({ circleLabel: label }),
      setLiberoSubstitution: (sub) => set({ liberoSubstitution: sub }),
      setProjectSituation: (situation) => set({ projectSituation: situation }),

      setCurrentRotation: (index) =>
        set((state) => ({
          currentRotation: index,
          history: [state.rotations[index]],
          historyIndex: 0,
          selectedObjectId: null,
        })),

      pushHistory: () =>
        set((state) => {
          const r = state.currentRotation;
          const currentRotState = state.rotations[r];
          const newHistory = state.history.slice(0, state.historyIndex + 1);
          newHistory.push(JSON.parse(JSON.stringify(currentRotState)));
          if (newHistory.length > 30) newHistory.shift();
          return { history: newHistory, historyIndex: newHistory.length - 1 };
        }),

      undo: () =>
        set((state) => {
          if (state.historyIndex > 0) {
            const newIndex = state.historyIndex - 1;
            const r = state.currentRotation;
            const newRotations = [...state.rotations];
            newRotations[r] = state.history[newIndex];
            return { historyIndex: newIndex, rotations: newRotations, selectedObjectId: null };
          }
          return state;
        }),

      redo: () =>
        set((state) => {
          if (state.historyIndex < state.history.length - 1) {
            const newIndex = state.historyIndex + 1;
            const r = state.currentRotation;
            const newRotations = [...state.rotations];
            newRotations[r] = state.history[newIndex];
            return { historyIndex: newIndex, rotations: newRotations, selectedObjectId: null };
          }
          return state;
        }),

      placePlayerOnCourt: (playerId, zone) => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const currentPositions = state.rotations[r].positions;
          const zoneMap = positionsToZoneMap(currentPositions);

          // 這個人現在在不在場上：場上重新拖曳 vs 從名單把新人拖上場，要分開處理。
          let sourceZone: number | null = null;
          let occupantZone: number | null = null;
          let occupantId: string | undefined;
          for (const [z, id] of zoneMap.entries()) {
            if (id === playerId) sourceZone = z;
            if (z === zone) {
              occupantZone = z;
              occupantId = id;
            }
          }
          if (sourceZone === zone) return state; // 拖到自己原本站的格子，沒變化

          if (sourceZone !== null) zoneMap.delete(sourceZone);
          if (occupantZone !== null) zoneMap.delete(occupantZone);
          // 目標格子原本有人：如果這個人是從場上別的格子拖過來的，互換位置；
          // 如果是從名單拖上場的新人，原本佔格的人就被換下場（回到名單，不留在場上）。
          if (occupantId && sourceZone !== null) {
            zoneMap.set(sourceZone, occupantId);
          }
          zoneMap.set(zone, playerId);

          // 這個輪次排好之後，其他 5 個輪次依「輪轉了幾格」的公式自動推算
          // （跟以前 getDefaultPositions 用的是同一套順時鐘輪轉公式）。
          const newRotations = state.rotations.map((rotation, i) => {
            const shiftedMap = new Map<number, string>();
            for (const [z, id] of zoneMap.entries()) {
              shiftedMap.set(rotateZone(z, i - r), id);
            }
            return {
              ...rotation,
              positions: zoneMapToPositions(shiftedMap),
            };
          });

          return { rotations: newRotations };
        });
      },

      placePlayerFree: (playerId, x, y) => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          // 移除這位球員目前在這個輪次的舊位置，再以自由座標放回
          const filtered = newRotations[r].positions.filter((p) => p.playerId !== playerId);
          newRotations[r] = { ...newRotations[r], positions: [...filtered, { playerId, x, y }] };
          return { rotations: newRotations };
        });
      },

      addDefenseRange: (range) => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            defenseRanges: [...newRotations[r].defenseRanges, { ...range, id: uuidv4() }],
          };
          return { rotations: newRotations, activeTool: "select" };
        });
      },

      updateDefenseRange: (id, updates) => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            defenseRanges: newRotations[r].defenseRanges.map((dr) =>
              dr.id === id ? { ...dr, ...updates } : dr,
            ),
          };
          return { rotations: newRotations };
        });
      },

      removeDefenseRange: (id) => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            defenseRanges: newRotations[r].defenseRanges.filter((dr) => dr.id !== id),
          };
          return { rotations: newRotations, selectedObjectId: null };
        });
      },

      addMarker: (marker) => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const id = uuidv4();
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            markers: [...newRotations[r].markers, { ...marker, id }],
          };
          return { rotations: newRotations, selectedObjectId: id };
        });
      },

      updateMarker: (id, updates) => {
        set((state) => {
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            markers: newRotations[r].markers.map((m) => (m.id === id ? { ...m, ...updates } : m)),
          };
          return { rotations: newRotations };
        });
      },

      removeMarker: (id) => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            markers: newRotations[r].markers.filter((m) => m.id !== id),
          };
          return { rotations: newRotations, selectedObjectId: null };
        });
      },

      clearMarkers: () => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            markers: [],
            defenseRanges: [],
          };
          return { rotations: newRotations, selectedObjectId: null };
        });
      },

      // 把這個輪次的球場清空（球員退回名單、畫筆/防守範圍都清掉），不會動到其他輪次——
      // 拖曳上場是手動的，沒有「預設站位」可以還原，所以「重置」就是清空讓你重新拖。
      resetCurrentRotation: () => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            positions: [],
            markers: [],
            defenseRanges: [],
          };
          return { rotations: newRotations, selectedObjectId: null };
        });
      },

      copyRotation: () => {
        get().pushHistory();
        set((state) => state);
      },

      toggleLabel: (key) =>
        set((state) => ({
          labelToggles: { ...state.labelToggles, [key]: !state.labelToggles[key] },
        })),

      setActiveProjectId: (id) => set({ activeProjectId: id }),

      newProject: () =>
        set({
          roster: [],
          liberoSubstitution: null,
          currentRotation: 0,
          rotations: emptyRotations,
          circleLabel: "name",
          labelToggles: { zone: false },
          projectSituation: "基礎輪轉",
          activeProjectId: null,
          history: [],
          historyIndex: -1,
          selectedObjectId: null,
          activeTool: "select",
        }),

      // data 來自 API 回傳的 Tactic.data，直接載入編輯器；
      // id 和 name 同步更新 activeProjectId / projectSituation。
      loadProject: (data, id, name) =>
        set({
          ...data,
          projectSituation: name,
          activeProjectId: id,
          history: [data.rotations[data.currentRotation ?? 0]],
          historyIndex: 0,
        }),

      buildSnapshot: () => buildProjectData(get()),

      importState: (data) =>
        set((state) => ({
          ...state,
          ...data,
          history: [data.rotations[data.currentRotation || 0]],
          historyIndex: 0,
        })),
    }),
    {
      name: "volleyboard_current",
      partialize: (state) => ({
        roster: state.roster,
        liberoSubstitution: state.liberoSubstitution,
        currentRotation: state.currentRotation,
        rotations: state.rotations,
        circleLabel: state.circleLabel,
        labelToggles: state.labelToggles,
        projectSituation: state.projectSituation,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);
