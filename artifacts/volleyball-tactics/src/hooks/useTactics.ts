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

export interface ProjectInfo {
  id: string;
  name: string;
  team: string;
  date: string;
  // 存檔當下選的情境標籤，純粹給「戰術專案」列表分類用，跟球場即時編輯無關。
  situation: SituationTag;
  data: TacticsState;
}

interface TacticsStore extends TacticsState {
  activeTool: ToolType;
  selectedObjectId: string | null;
  projects: ProjectInfo[];

  // 目前「戰術管理」面板裡選的情境標籤，存檔時打包進 ProjectInfo.situation，
  // 跟 projectName/teamName 是同一種東西——存檔用的中繼資料，不是球場上的即時狀態。
  projectSituation: SituationTag;

  // 是否處於「戰術布置」編輯模式——畫筆/防守範圍工具跟既有標記的選取/拖曳/刪除都鎖在這個
  // 模式裡才能用，平常球場只是唯讀的站位圖。故意不存進 localStorage（看 partialize），
  // 重新整理頁面一律回到唯讀檢視。
  isLayoutMode: boolean;

  history: RotationState[];
  historyIndex: number;

  setActiveTool: (tool: ToolType) => void;
  setSelectedObjectId: (id: string | null) => void;
  setLayoutMode: (value: boolean) => void;
  setProjectName: (name: string) => void;
  setTeamName: (name: string) => void;
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

  saveProject: () => void;
  loadProject: (id: string) => void;
  deleteProject: (id: string) => void;
  importState: (data: TacticsState) => void;
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
      projectName: "新戰術專案",
      teamName: "",
      roster: [],
      liberoSubstitution: null,
      currentRotation: 0,
      rotations: emptyRotations,
      circleLabel: "name",
      labelToggles: { zone: false },

      activeTool: "select",
      selectedObjectId: null,
      projects: [],
      projectSituation: "base",
      isLayoutMode: false,

      history: [],
      historyIndex: -1,

      setActiveTool: (tool) => set({ activeTool: tool, selectedObjectId: null }),
      setSelectedObjectId: (id) => set({ selectedObjectId: id }),
      setLayoutMode: (value) =>
        set({ isLayoutMode: value, activeTool: "select", selectedObjectId: null }),

      setProjectName: (name) => set({ projectName: name }),
      setTeamName: (name) => set({ teamName: name }),
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

      saveProject: () =>
        set((state) => {
          const id = uuidv4();
          const newProject: ProjectInfo = {
            id,
            name: state.projectName || "未命名",
            team: state.teamName || "無",
            date: new Date().toISOString(),
            situation: state.projectSituation,
            data: {
              projectName: state.projectName,
              teamName: state.teamName,
              roster: state.roster,
              liberoSubstitution: state.liberoSubstitution,
              currentRotation: state.currentRotation,
              rotations: state.rotations,
              circleLabel: state.circleLabel,
              labelToggles: state.labelToggles,
            },
          };
          return { projects: [...state.projects, newProject] };
        }),

      loadProject: (id) =>
        set((state) => {
          const proj = state.projects.find((p) => p.id === id);
          if (proj && proj.data) {
            return {
              ...proj.data,
              projectSituation: proj.situation,
              history: [proj.data.rotations[proj.data.currentRotation]],
              historyIndex: 0,
            };
          }
          return state;
        }),

      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
        })),

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
        projectName: state.projectName,
        teamName: state.teamName,
        roster: state.roster,
        liberoSubstitution: state.liberoSubstitution,
        currentRotation: state.currentRotation,
        rotations: state.rotations,
        circleLabel: state.circleLabel,
        labelToggles: state.labelToggles,
        projects: state.projects,
        projectSituation: state.projectSituation,
      }),
    },
  ),
);
