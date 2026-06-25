import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import {
  TacticsState,
  Player,
  RotationState,
  DefenseRange,
  Marker,
  PlayerPosition,
  ScenarioType,
  CircleLabelType,
} from "../types/tactics";
import { getDefaultPositions } from "../lib/rotationLogic";
import type { MatchPlayer } from "../types/match";

// 比賽名單（roster）裡同一類位置可能有任意人數（例如 3 個 OH、0 個 MB），但場上固定只有
// 7 個站位需要明確角色才能算輪轉（S/OH1/OH2/MB1/MB2/OPP + 自由球員 L）。這個函式依照在
// roster 裡出現的順序，取每一類的「第 1、第 2 個」對應到場上站位；多出來的人（例如第 3 個
// OH）目前不會被排上場，board id（p1~p7）固定不變，這樣輪轉站位資料才不會跟著斷掉。
function deriveCourtPlayers(roster: MatchPlayer[]): Player[] {
  const byRole = (role: MatchPlayer["role"]) => roster.filter((p) => p.role === role);
  const oh = byRole("OH");
  const mb = byRole("MB");
  const s = byRole("S")[0];
  const opp = byRole("OPP")[0];
  const l = byRole("L")[0];

  const slot = (id: string, role: Player["role"], match: MatchPlayer | undefined): Player => ({
    id,
    name: match?.name ?? "",
    number: match?.number ?? 0,
    role,
  });

  return [
    slot("p1", "S", s),
    slot("p2", "OH1", oh[0]),
    slot("p3", "OH2", oh[1]),
    slot("p4", "MB1", mb[0]),
    slot("p5", "MB2", mb[1]),
    slot("p6", "OPP", opp),
    slot("p7", "L", l),
  ];
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
  data: TacticsState;
}

interface TacticsStore extends TacticsState {
  activeTool: ToolType;
  selectedObjectId: string | null;
  projects: ProjectInfo[];

  history: RotationState[];
  historyIndex: number;

  setActiveTool: (tool: ToolType) => void;
  setSelectedObjectId: (id: string | null) => void;
  setProjectName: (name: string) => void;
  setTeamName: (name: string) => void;
  // 設定完整名單（新增/刪除/編輯球員都透過這個，一次整批換掉），同時會重新推算場上 7 個站位。
  // 進入戰術板時用比賽名單帶入，編輯名單彈窗按「儲存」時也是呼叫這個。
  setRoster: (roster: MatchPlayer[]) => void;
  setCircleLabel: (label: CircleLabelType) => void;
  setLiberoSubstitution: (sub: "MB1" | "MB2" | null) => void;
  setScenario: (scenario: ScenarioType) => void;
  setCurrentRotation: (index: number) => void;
  generateRotations: () => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  updatePlayerPosition: (playerId: string, x: number, y: number) => void;
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

const emptyCourtPlayers: Player[] = deriveCourtPlayers([]);

const SCENARIOS: ScenarioType[] = ["base", "serve-receive", "defense", "attack", "cover"];

const makeEmptyScenarioPositions = (): Record<ScenarioType, PlayerPosition[]> => ({
  base: [],
  "serve-receive": [],
  defense: [],
  attack: [],
  cover: [],
});

const emptyRotations: RotationState[] = Array(6)
  .fill(null)
  .map(() => ({
    scenarioPositions: makeEmptyScenarioPositions(),
    defenseRanges: [],
    markers: [],
  }));

export const getActivePositions = (
  rotation: RotationState,
  scenario: ScenarioType,
): PlayerPosition[] => {
  const pos = rotation.scenarioPositions?.[scenario];
  if (pos && pos.length > 0) return pos;
  return rotation.scenarioPositions?.base || [];
};

export const useTactics = create<TacticsStore>()(
  persist(
    (set, get) => ({
      projectName: "新戰術專案",
      teamName: "",
      roster: [],
      players: emptyCourtPlayers,
      liberoSubstitution: null,
      scenario: "base",
      currentRotation: 0,
      rotations: emptyRotations,
      circleLabel: "name",
      labelToggles: { zone: false },

      activeTool: "select",
      selectedObjectId: null,
      projects: [],

      history: [],
      historyIndex: -1,

      setActiveTool: (tool) => set({ activeTool: tool, selectedObjectId: null }),
      setSelectedObjectId: (id) => set({ selectedObjectId: id }),

      setProjectName: (name) => set({ projectName: name }),
      setTeamName: (name) => set({ teamName: name }),
      setRoster: (roster) => set({ roster, players: deriveCourtPlayers(roster) }),
      setCircleLabel: (label) => set({ circleLabel: label }),
      setLiberoSubstitution: (sub) => set({ liberoSubstitution: sub }),
      setScenario: (scenario) =>
        set((state) => {
          const r = state.currentRotation;
          return {
            scenario,
            history: [state.rotations[r]],
            historyIndex: 0,
            selectedObjectId: null,
          };
        }),

      setCurrentRotation: (index) =>
        set((state) => ({
          currentRotation: index,
          history: [state.rotations[index]],
          historyIndex: 0,
          selectedObjectId: null,
        })),

      generateRotations: () =>
        set((state) => {
          const newRotations = Array(6)
            .fill(null)
            .map((_, i) => {
              const defaultPos = getDefaultPositions(state.players, i);
              const scenarioPositions = SCENARIOS.reduce(
                (acc, sc) => {
                  acc[sc] = defaultPos.map((p) => ({ ...p }));
                  return acc;
                },
                {} as Record<ScenarioType, PlayerPosition[]>,
              );
              return {
                scenarioPositions,
                defenseRanges: [],
                markers: [],
              };
            });
          return {
            rotations: newRotations,
            currentRotation: 0,
            history: [newRotations[0]],
            historyIndex: 0,
          };
        }),

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

      updatePlayerPosition: (playerId, x, y) => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const sc = state.scenario;
          const currentPositions = getActivePositions(state.rotations[r], sc);
          const newPositions = currentPositions.map((p) =>
            p.playerId === playerId ? { ...p, x, y } : p,
          );
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            scenarioPositions: {
              ...newRotations[r].scenarioPositions,
              [sc]: newPositions,
            },
          };
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

      resetCurrentRotation: () => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const sc = state.scenario;
          const defaultPos = getDefaultPositions(state.players, r);
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            scenarioPositions: {
              ...newRotations[r].scenarioPositions,
              [sc]: defaultPos.map((p) => ({ ...p })),
            },
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
            data: {
              projectName: state.projectName,
              teamName: state.teamName,
              roster: state.roster,
              players: state.players,
              liberoSubstitution: state.liberoSubstitution,
              scenario: state.scenario,
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
        players: state.players,
        liberoSubstitution: state.liberoSubstitution,
        scenario: state.scenario,
        currentRotation: state.currentRotation,
        rotations: state.rotations,
        circleLabel: state.circleLabel,
        labelToggles: state.labelToggles,
        projects: state.projects,
      }),
    },
  ),
);
