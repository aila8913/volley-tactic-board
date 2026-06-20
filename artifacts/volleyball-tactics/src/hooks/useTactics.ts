import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { TacticsState, Player, RotationState, DefenseRange, Marker, PlayerPosition, ScenarioType } from '../types/tactics';
import { getDefaultPositions } from '../lib/rotationLogic';

export type ToolType = 'select' | 'arrow' | 'dashed' | 'attack' | 'text' | 'volleyball' | 'circle' | 'ellipse' | 'fan';

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
  updatePlayer: (id: string, name: string, role?: Player['role']) => void;
  setLiberoSubstitution: (sub: 'MB1' | 'MB2' | null) => void;
  setScenario: (scenario: ScenarioType) => void;
  setCurrentRotation: (index: number) => void;
  generateRotations: () => void;
  
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  updatePlayerPosition: (playerId: string, x: number, y: number) => void;
  addDefenseRange: (range: Omit<DefenseRange, 'id'>) => void;
  updateDefenseRange: (id: string, updates: Partial<DefenseRange>) => void;
  removeDefenseRange: (id: string) => void;
  addMarker: (marker: Omit<Marker, 'id'>) => void;
  updateMarker: (id: string, updates: Partial<Marker>) => void;
  removeMarker: (id: string) => void;
  clearMarkers: () => void;
  resetCurrentRotation: () => void;
  copyRotation: () => void;
  
  toggleLabel: (key: keyof TacticsState['labelToggles']) => void;

  saveProject: () => void;
  loadProject: (id: string) => void;
  deleteProject: (id: string) => void;
  importState: (data: TacticsState) => void;
}

const defaultPlayers: Player[] = [
  { id: 'p1', name: '', role: 'S' },
  { id: 'p2', name: '', role: 'OH1' },
  { id: 'p3', name: '', role: 'OH2' },
  { id: 'p4', name: '', role: 'MB1' },
  { id: 'p5', name: '', role: 'MB2' },
  { id: 'p6', name: '', role: 'OPP' },
  { id: 'p7', name: '', role: 'L' }
];

const SCENARIOS: ScenarioType[] = ['base', 'serve-receive', 'defense', 'attack', 'cover'];

const makeEmptyScenarioPositions = (): Record<ScenarioType, PlayerPosition[]> => ({
  base: [],
  'serve-receive': [],
  defense: [],
  attack: [],
  cover: []
});

const emptyRotations: RotationState[] = Array(6).fill(null).map(() => ({
  scenarioPositions: makeEmptyScenarioPositions(),
  defenseRanges: [],
  markers: []
}));

export const getActivePositions = (rotation: RotationState, scenario: ScenarioType): PlayerPosition[] => {
  const pos = rotation.scenarioPositions?.[scenario];
  if (pos && pos.length > 0) return pos;
  return rotation.scenarioPositions?.base || [];
};

export const useTactics = create<TacticsStore>()(
  persist(
    (set, get) => ({
      projectName: '新戰術專案',
      teamName: '',
      players: defaultPlayers,
      liberoSubstitution: null,
      scenario: 'base',
      currentRotation: 0,
      rotations: emptyRotations,
      labelToggles: { name: true, role: true, zone: false },
      
      activeTool: 'select',
      selectedObjectId: null,
      projects: [],
      
      history: [],
      historyIndex: -1,

      setActiveTool: (tool) => set({ activeTool: tool, selectedObjectId: null }),
      setSelectedObjectId: (id) => set({ selectedObjectId: id }),
      
      setProjectName: (name) => set({ projectName: name }),
      setTeamName: (name) => set({ teamName: name }),
      updatePlayer: (id, name, role) => set((state) => ({
        players: state.players.map(p => p.id === id ? { ...p, name, ...(role ? {role} : {}) } : p)
      })),
      setLiberoSubstitution: (sub) => set({ liberoSubstitution: sub }),
      setScenario: (scenario) => set((state) => {
        const r = state.currentRotation;
        return { 
          scenario,
          history: [state.rotations[r]],
          historyIndex: 0,
          selectedObjectId: null
        };
      }),
      
      setCurrentRotation: (index) => set((state) => ({ 
        currentRotation: index,
        history: [state.rotations[index]],
        historyIndex: 0,
        selectedObjectId: null
      })),
      
      generateRotations: () => set((state) => {
        const newRotations = Array(6).fill(null).map((_, i) => {
          const defaultPos = getDefaultPositions(state.players, i);
          const scenarioPositions = SCENARIOS.reduce((acc, sc) => {
            acc[sc] = defaultPos.map(p => ({ ...p }));
            return acc;
          }, {} as Record<ScenarioType, PlayerPosition[]>);
          return {
            scenarioPositions,
            defenseRanges: [],
            markers: []
          };
        });
        return { 
          rotations: newRotations, 
          currentRotation: 0,
          history: [newRotations[0]],
          historyIndex: 0
        };
      }),

      pushHistory: () => set((state) => {
        const r = state.currentRotation;
        const currentRotState = state.rotations[r];
        const newHistory = state.history.slice(0, state.historyIndex + 1);
        newHistory.push(JSON.parse(JSON.stringify(currentRotState)));
        if (newHistory.length > 30) newHistory.shift();
        return { history: newHistory, historyIndex: newHistory.length - 1 };
      }),

      undo: () => set((state) => {
        if (state.historyIndex > 0) {
          const newIndex = state.historyIndex - 1;
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          newRotations[r] = state.history[newIndex];
          return { historyIndex: newIndex, rotations: newRotations, selectedObjectId: null };
        }
        return state;
      }),

      redo: () => set((state) => {
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
          const newPositions = currentPositions.map(p =>
            p.playerId === playerId ? { ...p, x, y } : p
          );
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            scenarioPositions: {
              ...newRotations[r].scenarioPositions,
              [sc]: newPositions
            }
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
            defenseRanges: [...newRotations[r].defenseRanges, { ...range, id: uuidv4() }]
          };
          return { rotations: newRotations, activeTool: 'select' };
        });
      },

      updateDefenseRange: (id, updates) => {
        get().pushHistory();
        set((state) => {
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          newRotations[r] = {
            ...newRotations[r],
            defenseRanges: newRotations[r].defenseRanges.map(dr => dr.id === id ? { ...dr, ...updates } : dr)
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
            defenseRanges: newRotations[r].defenseRanges.filter(dr => dr.id !== id)
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
            markers: [...newRotations[r].markers, { ...marker, id }]
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
            markers: newRotations[r].markers.map(m => m.id === id ? { ...m, ...updates } : m)
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
            markers: newRotations[r].markers.filter(m => m.id !== id)
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
            defenseRanges: []
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
              [sc]: defaultPos.map(p => ({ ...p }))
            },
            markers: [],
            defenseRanges: []
          };
          return { rotations: newRotations, selectedObjectId: null };
        });
      },

      copyRotation: () => {
        get().pushHistory();
        set((state) => state);
      },

      toggleLabel: (key) => set((state) => ({
        labelToggles: { ...state.labelToggles, [key]: !state.labelToggles[key] }
      })),

      saveProject: () => set((state) => {
        const id = uuidv4();
        const newProject: ProjectInfo = {
          id,
          name: state.projectName || '未命名',
          team: state.teamName || '無',
          date: new Date().toISOString(),
          data: {
            projectName: state.projectName,
            teamName: state.teamName,
            players: state.players,
            liberoSubstitution: state.liberoSubstitution,
            scenario: state.scenario,
            currentRotation: state.currentRotation,
            rotations: state.rotations,
            labelToggles: state.labelToggles,
          }
        };
        return { projects: [...state.projects, newProject] };
      }),

      loadProject: (id) => set((state) => {
        const proj = state.projects.find(p => p.id === id);
        if (proj && proj.data) {
          return { ...proj.data, history: [proj.data.rotations[proj.data.currentRotation]], historyIndex: 0 };
        }
        return state;
      }),

      deleteProject: (id) => set((state) => ({
        projects: state.projects.filter(p => p.id !== id)
      })),

      importState: (data) => set((state) => ({
        ...state,
        ...data,
        history: [data.rotations[data.currentRotation || 0]],
        historyIndex: 0
      }))
    }),
    {
      name: 'volleyboard_current',
      partialize: (state) => ({ 
        projectName: state.projectName,
        teamName: state.teamName,
        players: state.players,
        liberoSubstitution: state.liberoSubstitution,
        scenario: state.scenario,
        currentRotation: state.currentRotation,
        rotations: state.rotations,
        labelToggles: state.labelToggles,
        projects: state.projects 
      }),
    }
  )
);
