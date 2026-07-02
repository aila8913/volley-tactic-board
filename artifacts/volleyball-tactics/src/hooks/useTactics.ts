import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import {
  TacticsState,
  RotationState,
  DefenseRange,
  Marker,
  PlayerPosition,
  LiberoReplacement,
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

  // 球場視圖模式：「rotation」只顯示站位圓圈；「tactics」疊加顯示畫筆標記跟防守範圍。
  // ephemeral，不存進 localStorage，切輪次時自動回到 "rotation"。
  courtView: "rotation" | "tactics";

  // 備位區要顯示哪位 L——名單裡可能有多個 L，但場上（備位區）同時只能有一位。
  // null 代表目前沒有指定先發自由球員（備位區不顯示任何人）。
  // 存進 localStorage（看 partialize），重整後維持上次設定。
  startingLiberoId: string | null;
  setStartingLiberoId: (id: string | null) => void;

  history: RotationState[];
  historyIndex: number;

  setActiveTool: (tool: ToolType) => void;
  setSelectedObjectId: (id: string | null) => void;
  setLayoutMode: (value: boolean) => void;
  setCourtView: (v: "rotation" | "tactics") => void;
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
  // referenceRotation：指定以哪個輪次為基準來推算（預設用 currentRotation；
  // 左側 3×2 格子永遠傳 0，確保以 1 號位為基準，不受目前選的輪次影響）。
  placePlayerOnCourt: (playerId: string, zone: number, referenceRotation?: number) => void;
  // 把球員從所有 6 個輪次的站位裡移除（3×2 格子的「×」按鈕用這個，一次清乾淨）。
  removePlayerFromCourt: (playerId: string) => void;
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
    tacticPositions: [],
    liberoReplacement: null,
    defenseRanges: [],
    markers: [],
  }));

// 排球規則：自由球員只能在後排（1/5/6 號位），不能輪轉到前排。
const BACK_ROW_ZONES = new Set([1, 5, 6]);

// 自由球員上場的共用邏輯：不管從輪轉視圖（格子吸附，placePlayerOnCourt）還是
// 戰術視圖（自由座標，placePlayerFree）上場，都要遵守同一套規則——
// 同一時間只能有一位 L 在場上、上場時要頂替掉目標位置原本的人。
// `positions` 是兩個視圖共用的「誰在場上」真正依據，所以這裡永遠寫回 positions，
// 呼叫端各自決定要不要另外把座標疊進 tacticPositions（純視覺覆蓋，不影響「誰在場上」）。
// zone 只用來判斷「這個座標蓋到了哪一格」，藉此找出被換下場的人，跟座標系統無關。
function placeLiberoOnCourt(
  rot: RotationState,
  roster: MatchPlayer[],
  playerId: string,
  zone: number,
  coords: { x: number; y: number },
): RotationState {
  const liberoIds = new Set(roster.filter((p) => p.role === "L").map((p) => p.id));

  // 先把場上的 L 移除，並還原 liberoReplacement 記錄的被替換者，
  // 這樣不管原本場上是哪個 L、有沒有 L，都能從乾淨的一般球員站位重新計算。
  let basePositions = rot.positions.filter((p) => !liberoIds.has(p.playerId));
  if (rot.liberoReplacement) {
    basePositions = [...basePositions, rot.liberoReplacement.replacedPosition];
  }

  // 找目標格子現在站的人（即將被 L 替換的人）
  const replacedPlayer = basePositions.find((p) => findNearestZone(p.x, p.y) === zone);

  const newPositions = [
    ...basePositions.filter((p) => findNearestZone(p.x, p.y) !== zone),
    { playerId, x: coords.x, y: coords.y },
  ];

  return {
    ...rot,
    positions: newPositions,
    liberoReplacement: replacedPlayer
      ? ({ liberoId: playerId, replacedPosition: replacedPlayer } as LiberoReplacement)
      : null,
  };
}

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
      courtView: "rotation" as const,
      startingLiberoId: null,

      history: [],
      historyIndex: -1,

      setActiveTool: (tool) => set({ activeTool: tool, selectedObjectId: null }),
      setSelectedObjectId: (id) => set({ selectedObjectId: id }),
      setLayoutMode: (value) =>
        set({ isLayoutMode: value, activeTool: "select", selectedObjectId: null }),
      setCourtView: (v) => set({ courtView: v }),
      setStartingLiberoId: (id) => set({ startingLiberoId: id }),

      // 更新名單時同步維護 startingLiberoId：
      // 若先發 L 已被移出名單，改選名單裡第一個 L；若名單沒有 L 則清空。
      setRoster: (roster) =>
        set((state) => {
          const liberos = roster.filter((p) => p.role === "L");
          const currentStillExists = liberos.some((p) => p.id === state.startingLiberoId);
          return {
            roster,
            startingLiberoId: currentStillExists
              ? state.startingLiberoId
              : (liberos[0]?.id ?? null),
          };
        }),
      setCircleLabel: (label) => set({ circleLabel: label }),
      setLiberoSubstitution: (sub) => set({ liberoSubstitution: sub }),
      setProjectSituation: (situation) => set({ projectSituation: situation }),

      setCurrentRotation: (index) =>
        set((state) => ({
          currentRotation: index,
          history: [state.rotations[index]],
          historyIndex: 0,
          selectedObjectId: null,
          // 切換輪次時自動回到輪轉視圖，讓教練先看清楚這個輪次的站位
          courtView: "rotation" as const,
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

      placePlayerOnCourt: (playerId, zone, referenceRotation) => {
        get().pushHistory();
        set((state) => {
          const player = state.roster.find((p) => p.id === playerId);
          const isLibero = player?.role === "L";

          // ── 自由球員邏輯 ──────────────────────────────────────────────────────
          // 自由球員不輪轉（每個輪次的位置是獨立記錄的），
          // 只能站後排（1/5/6 號位），一次只能有一個 L 在場上。
          if (isLibero) {
            if (!BACK_ROW_ZONES.has(zone)) return state; // 前排拒絕放置

            const r = state.currentRotation;
            const newRotations = [...state.rotations];
            newRotations[r] = placeLiberoOnCourt(
              newRotations[r],
              state.roster,
              playerId,
              zone,
              getZoneCoords(zone),
            );
            // 不管這個 L 是從備位區拖上場、還是直接從名單拖上場，
            // 都要同步把它設成 startingLiberoId——這樣全域只會追蹤一個「先發」L，
            // 備位區才不會跟場上狀態脫節（這正是 issue #14 bug 1 的根本原因）。
            return { rotations: newRotations, startingLiberoId: playerId };
          }

          // ── 一般球員邏輯 ──────────────────────────────────────────────────────
          // referenceRotation 讓呼叫方指定「以哪個輪次為基準」來推算其他 5 輪。
          const r = referenceRotation ?? state.currentRotation;

          // 排除 L 球員再建立格子 Map——L 不參與輪轉推算，每輪獨立記錄。
          const liberoIds = new Set(state.roster.filter((p) => p.role === "L").map((p) => p.id));
          const currentPositions = state.rotations[r].positions.filter(
            (p) => !liberoIds.has(p.playerId),
          );
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

          // 這個輪次排好之後，其他 5 個輪次依「輪轉了幾格」的公式自動推算；
          // 同時保留每個輪次各自的 L 位置（L 不跟著輪轉）。
          const newRotations = state.rotations.map((rotation, i) => {
            const shiftedMap = new Map<number, string>();
            for (const [z, id] of zoneMap.entries()) {
              shiftedMap.set(rotateZone(z, i - r), id);
            }
            // 把這個輪次的 L 位置疊回去
            const liberoPositions = rotation.positions.filter((p) => liberoIds.has(p.playerId));
            return {
              ...rotation,
              positions: [...zoneMapToPositions(shiftedMap), ...liberoPositions],
            };
          });

          return { rotations: newRotations };
        });
      },

      placePlayerFree: (playerId, x, y) => {
        get().pushHistory();
        set((state) => {
          const player = state.roster.find((p) => p.id === playerId);
          const isLibero = player?.role === "L";
          const r = state.currentRotation;

          // ── 自由球員邏輯 ──────────────────────────────────────────────────────
          // 戰術視圖的自由座標放置也要遵守跟輪轉視圖一樣的規則：同一時間只能有一位 L
          // 在場上、上場時要頂替掉目標位置原本的人。
          // 過去這裡完全沒有 L 的特殊處理，只是把座標塞進 tacticPositions，
          // 導致兩個 L 可以同時疊在場上、被頂替的人也還留在場上（issue #14 戰術視圖遺留 bug）。
          if (isLibero) {
            const zone = findNearestZone(x, y); // 只拿來判斷蓋到了哪個人／哪一格，座標仍用原始 x/y
            if (!BACK_ROW_ZONES.has(zone)) return state; // 前排拒絕放置

            const newRotations = [...state.rotations];
            newRotations[r] = placeLiberoOnCourt(newRotations[r], state.roster, playerId, zone, {
              x,
              y,
            });

            // positions 換完人之後，tacticPositions 裡任何屬於「舊 L」或「剛被換下場那位」的
            // 殘留自由座標都要清掉，不然戰術視圖還是會照著舊資料疊圖，變成幽靈重複站位。
            const liberoIds = new Set(state.roster.filter((p) => p.role === "L").map((p) => p.id));
            const replacedId = newRotations[r].liberoReplacement?.replacedPosition.playerId;
            newRotations[r] = {
              ...newRotations[r],
              tacticPositions: [
                ...newRotations[r].tacticPositions.filter(
                  (p) => !liberoIds.has(p.playerId) && p.playerId !== replacedId,
                ),
                { playerId, x, y },
              ],
            };
            return { rotations: newRotations, startingLiberoId: playerId };
          }

          // ── 一般球員邏輯 ──────────────────────────────────────────────────────
          const newRotations = [...state.rotations];
          // tacticPositions 存的是戰術視圖裡自由拖曳的站位，不影響 positions（格子輪轉）。
          const filtered = newRotations[r].tacticPositions.filter((p) => p.playerId !== playerId);
          newRotations[r] = {
            ...newRotations[r],
            tacticPositions: [...filtered, { playerId, x, y }],
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
            tacticPositions: [],
            liberoReplacement: null,
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

      // 右鍵刪除球員：
      // - 自由球員（L）：只移除目前輪次，並還原被替換的人回場上。
      // - 一般球員：從全部 6 個輪次移除（站位整體連動）。
      removePlayerFromCourt: (playerId) => {
        get().pushHistory();
        set((state) => {
          const player = state.roster.find((p) => p.id === playerId);
          const isLibero = player?.role === "L";

          if (isLibero) {
            const r = state.currentRotation;
            const newRotations = [...state.rotations];
            const rot = newRotations[r];
            const replacement = rot.liberoReplacement;

            let newPositions = rot.positions.filter((p) => p.playerId !== playerId);
            if (replacement) {
              // 還原被替換的人回到原本的格子
              newPositions = [...newPositions, replacement.replacedPosition];
            }
            newRotations[r] = {
              ...rot,
              positions: newPositions,
              // 這位 L 如果是在戰術視圖用自由座標上場的，tacticPositions 裡會留著它的座標；
              // 這裡不清掉的話，positions 雖然移除了，但 tacticPositions 的殘留座標還是會讓
              // 戰術視圖繼續畫出這個人（右鍵刪除在戰術視圖看起來像沒作用）。
              tacticPositions: rot.tacticPositions.filter((p) => p.playerId !== playerId),
              liberoReplacement: null,
            };
            return { rotations: newRotations };
          }

          // 一般球員：所有輪次都移除
          return {
            rotations: state.rotations.map((rot) => ({
              ...rot,
              positions: rot.positions.filter((p) => p.playerId !== playerId),
              tacticPositions: (rot.tacticPositions ?? []).filter((p) => p.playerId !== playerId),
            })),
          };
        });
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
          startingLiberoId: null,
          history: [],
          historyIndex: -1,
          selectedObjectId: null,
          activeTool: "select",
        }),

      // data 來自 API 回傳的 Tactic.data，直接載入編輯器；
      // id 和 name 同步更新 activeProjectId / projectSituation。
      // 舊存檔可能沒有 tacticPositions，加 ?? [] 做向後相容。
      loadProject: (data, id, name) =>
        set({
          ...data,
          rotations: data.rotations.map((r) => ({
            ...r,
            tacticPositions: r.tacticPositions ?? [],
            liberoReplacement: r.liberoReplacement ?? null,
          })),
          projectSituation: name,
          activeProjectId: id,
          // 載入戰術時重新推算先發 L（以名單第一個 L 為預設）
          startingLiberoId: data.roster.find((p) => p.role === "L")?.id ?? null,
          history: [data.rotations[data.currentRotation ?? 0]],
          historyIndex: 0,
        }),

      buildSnapshot: () => buildProjectData(get()),

      importState: (data) =>
        set((state) => ({
          ...state,
          ...data,
          rotations: data.rotations.map((r) => ({
            ...r,
            tacticPositions: r.tacticPositions ?? [],
            liberoReplacement: r.liberoReplacement ?? null,
          })),
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
        startingLiberoId: state.startingLiberoId,
      }),
      // localStorage 的舊資料可能沒有新增的欄位，在這裡補上預設值避免 crash。
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.rotations = state.rotations.map((r) => ({
          ...r,
          tacticPositions: r.tacticPositions ?? [],
          liberoReplacement: r.liberoReplacement ?? null,
        }));
        // 舊版 localStorage 沒有 startingLiberoId：自動選名單裡第一個 L
        if (!state.startingLiberoId) {
          const firstLibero = state.roster.find((p) => p.role === "L");
          if (firstLibero) state.startingLiberoId = firstLibero.id;
        }
      },
    },
  ),
);
