import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  RotationTableData,
  RotationPositions,
  PlayerPosition,
  LiberoReplacement,
  CircleLabelType,
} from "../types/rotationTable";
import { findNearestZone, getZoneCoords, rotateZone, BACK_ROW_ZONES } from "../lib/rotationLogic";
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

const emptyRotations: RotationPositions[] = Array(6)
  .fill(null)
  .map(() => ({ positions: [], liberoReplacement: null }));

// 自由球員上場的共用邏輯（輪轉視圖，格子吸附）：同一時間只能有一位 L 在場上、
// 上場時要頂替掉目標位置原本的人。戰術布置現在是獨立的自由畫布，不會呼叫這裡。
// zone 只用來判斷「這個座標蓋到了哪一格」，藉此找出被換下場的人，跟座標系統無關。
function placeLiberoOnCourt(
  rot: RotationPositions,
  roster: MatchPlayer[],
  playerId: string,
  zone: number,
  coords: { x: number; y: number },
): RotationPositions {
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
    positions: newPositions,
    liberoReplacement: replacedPlayer
      ? ({ liberoId: playerId, replacedPosition: replacedPlayer } as LiberoReplacement)
      : null,
  };
}

interface RotationTableStore extends RotationTableData {
  setRoster: (roster: MatchPlayer[]) => void;
  setCurrentRotation: (index: number) => void;
  setStartingLiberoId: (id: string | null) => void;
  setCircleLabel: (label: CircleLabelType) => void;

  // 把球員放到場上某個格子（1~6 號位）——不管是從球員設定名單拖上場的新人，還是把
  // 已經在場上的人拖到別的格子，都是呼叫這個。放開時格子已經有人會直接互換位置；
  // 這個格子排定之後，其他 5 個輪次會依照「輪轉了幾格」自動推算，不用每輪都重新拖。
  placePlayerOnCourt: (playerId: string, zone: number, referenceRotation?: number) => void;
  // 把球員從所有 6 個輪次的站位裡移除（右鍵刪除、3×2 格子的「×」按鈕用這個）。
  removePlayerFromCourt: (playerId: string) => void;
  // 只清空目前輪次的站位（LeftPanel「重置站位」按鈕的一部分——按鈕還會另外呼叫
  // useTacticsBoard 的 resetCurrentRotationTactics 把畫筆也清掉，兩個 store 各自負責
  // 自己的資料，由畫面上的按鈕一次呼叫兩邊，這就是「資料用傳輸的」實際做法）。
  resetCurrentRotationPositions: () => void;

  // 戰術存檔/讀檔用：整批載入輪轉表資料，不動戰術板自己的畫筆/防守範圍
  // （那份資料由 useTacticsBoard 自己的 loadProject 負責）。
  loadRotationData: (data: RotationTableData) => void;
  resetAll: () => void;
}

export const useRotationTable = create<RotationTableStore>()(
  persist(
    (set) => ({
      roster: [],
      rotations: emptyRotations,
      currentRotation: 0,
      startingLiberoId: null,
      circleLabel: "name",

      setCurrentRotation: (index) => set({ currentRotation: index }),
      setStartingLiberoId: (id) => set({ startingLiberoId: id }),
      setCircleLabel: (label) => set({ circleLabel: label }),

      // 更新名單時同步維護 startingLiberoId：
      // 若先發 L 已被移出名單，改選名單裡第一個 L；若名單沒有 L 則清空。
      setRoster: (roster) =>
        set((state) => {
          const liberos = roster.filter((p) => p.role === "L");
          const currentStillExists = liberos.some((p) => p.id === state.startingLiberoId);

          // 幽靈站位清理（issue #35）：名單裡被刪掉的球員，如果還卡在某個輪次的
          // 站位（rotations[].positions）或自由球員替補紀錄（liberoReplacement）裡，
          // Court.tsx 找不到球員就不渲染，畫面看起來正常，但那格其實還被佔著、
          // 既看不到也選不到。所以存檔名單時要順手把指向「已不存在球員」的站位掃掉。
          const validIds = new Set(roster.map((p) => p.id));
          const rotations = state.rotations.map((rot) => {
            const positions = rot.positions.filter((pos) => validIds.has(pos.playerId));
            // liberoReplacement 記錄「被 L 換下場的人」，若這個 L 本人或被換下的人
            // 已從名單移除，這筆替補紀錄就沒意義了，一併清掉避免殘留。
            const replacement =
              rot.liberoReplacement &&
              validIds.has(rot.liberoReplacement.liberoId) &&
              validIds.has(rot.liberoReplacement.replacedPosition.playerId)
                ? rot.liberoReplacement
                : null;
            return { ...rot, positions, liberoReplacement: replacement };
          });

          return {
            roster,
            rotations,
            startingLiberoId: currentStillExists
              ? state.startingLiberoId
              : (liberos[0]?.id ?? null),
          };
        }),

      placePlayerOnCourt: (playerId, zone, referenceRotation) => {
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
            const liberoPositions = rotation.positions.filter((p) => liberoIds.has(p.playerId));
            return {
              ...rotation,
              positions: [...zoneMapToPositions(shiftedMap), ...liberoPositions],
            };
          });

          return { rotations: newRotations };
        });
      },

      // 右鍵刪除球員：
      // - 自由球員（L）：只移除目前輪次，並還原被替換的人回場上。
      // - 一般球員：從全部 6 個輪次移除（站位整體連動）。
      removePlayerFromCourt: (playerId) => {
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
              newPositions = [...newPositions, replacement.replacedPosition];
            }
            newRotations[r] = { positions: newPositions, liberoReplacement: null };
            return { rotations: newRotations };
          }

          // 一般球員：所有輪次都移除
          return {
            rotations: state.rotations.map((rot) => ({
              ...rot,
              positions: rot.positions.filter((p) => p.playerId !== playerId),
            })),
          };
        });
      },

      resetCurrentRotationPositions: () => {
        set((state) => {
          const r = state.currentRotation;
          const newRotations = [...state.rotations];
          newRotations[r] = { positions: [], liberoReplacement: null };
          return { rotations: newRotations };
        });
      },

      loadRotationData: (data) => set(data),

      resetAll: () =>
        set({
          roster: [],
          rotations: emptyRotations,
          currentRotation: 0,
          startingLiberoId: null,
          circleLabel: "name",
        }),
    }),
    {
      name: "volleyboard_rotationtable",
      // localStorage 的舊資料可能沒有新增的欄位，在這裡補上預設值避免 crash。
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.startingLiberoId) {
          const firstLibero = state.roster.find((p) => p.role === "L");
          if (firstLibero) state.startingLiberoId = firstLibero.id;
        }
      },
    },
  ),
);
