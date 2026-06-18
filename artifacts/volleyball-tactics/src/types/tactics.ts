export type ScenarioType = 'base' | 'serve-receive' | 'defense' | 'attack' | 'cover';

export interface Player {
  id: string;
  name: string;
  role: 'S' | 'OH1' | 'OH2' | 'MB1' | 'MB2' | 'OPP' | 'L';
}

export interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

export interface DefenseRange {
  id: string;
  playerId: string;
  type: 'circle' | 'ellipse' | 'fan';
  x: number;
  y: number;
  radius?: number;
  rx?: number;
  ry?: number;
  startAngle?: number;
  endAngle?: number;
  rotation?: number;
  color: string;
  opacity: number;
  visible: boolean;
}

export interface Marker {
  id: string;
  type: 'arrow' | 'dashed' | 'attack' | 'text' | 'volleyball';
  points?: {x: number; y: number}[];
  x?: number;
  y?: number;
  text?: string;
}

export interface RotationState {
  scenarioPositions: Record<ScenarioType, PlayerPosition[]>;
  defenseRanges: DefenseRange[];
  markers: Marker[];
}

export interface TacticsState {
  projectName: string;
  teamName: string;
  players: Player[];
  liberoSubstitution: 'MB1' | 'MB2' | null;
  scenario: ScenarioType;
  currentRotation: number;
  rotations: RotationState[];
  labelToggles: { name: boolean; role: boolean; zone: boolean };
}
