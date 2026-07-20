import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  PerMatchRotationState,
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

// 一場比賽剛開始（還沒任何站位）的空白狀態。dataByMatch 裡某個 matchId 還不存在時，
// 各 action 先用這個當基底再套上這次的改動——跟 useScoreSheet 的 getOrInitRecord 同一招。
const emptyPerMatch = (): PerMatchRotationState => ({
  roster: [],
  rotations: emptyRotations,
  currentRotation: 0,
  startingLiberoId: null,
});

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

interface RotationTableStore {
  // ── 全域顯示偏好（不隨 match 走）──
  // circleLabel 是「圈圈顯示姓名/背號/位置」的裝置偏好，計分表的 ScoreSheetCourt 也直接讀它。
  // 它不是「某一場比賽」的資料，所以留在 store 頂層當全域欄位、不進 dataByMatch 分片；
  // persist 也只存它一個（見檔尾 partialize）——這正是不變量允許 persist 的例外情況
  //（裝置偏好，而非使用者資料的唯一副本）。
  circleLabel: CircleLabelType;
  setCircleLabel: (label: CircleLabelType) => void;

  // ── per-match 分片（issue #119）──
  // 會跨場污染的狀態（名單、站位、目前輪次、先發 L）全部改用 matchId 當 key 分開存，
  // 一場一份。刻意不用 persist：未存的工作狀態是暫時性的（PO 2026-07-13 決策：只有存成
  // 戰術才算數），重整頁面就回到空白，要保留就存成戰術。這樣「切到別場就看到上一場站位」
  // 的污染從根本上不可能發生——每場各讀自己的 key。
  dataByMatch: Record<string, PerMatchRotationState>;

  // 以下每個 action 第一個參數都收 matchId，指定「要動哪一場的分片」——跟 useScoreSheet
  // 的每個 reducer 收 matchId 是同一套設計，元件用 useParams 拿到 URL 的 id 再傳進來。
  setRoster: (matchId: string, roster: MatchPlayer[]) => void;
  setCurrentRotation: (matchId: string, index: number) => void;
  setStartingLiberoId: (matchId: string, id: string | null) => void;

  // 把球員放到場上某個格子（1~6 號位）——不管是從球員設定名單拖上場的新人，還是把
  // 已經在場上的人拖到別的格子，都是呼叫這個。放開時格子已經有人會直接互換位置；
  // 這個格子排定之後，其他 5 個輪次會依照「輪轉了幾格」自動推算，不用每輪都重新拖。
  placePlayerOnCourt: (
    matchId: string,
    playerId: string,
    zone: number,
    referenceRotation?: number,
  ) => void;
  // 把球員從所有 6 個輪次的站位裡移除（右鍵刪除、3×2 格子的「×」按鈕用這個）。
  removePlayerFromCourt: (matchId: string, playerId: string) => void;
  // 只清空目前輪次的站位（RotationTable「重置站位」按鈕）。註：這顆按鈕以前還會順便呼叫
  // useTacticsBoard 的 resetCurrentRotationTactics 把畫筆也清掉，但那個 action 已隨 #154
  // 刪除——畫筆現在住在用完即丟的白板 session 裡，跟輪轉表站位是兩件事，不需要一起清。
  resetCurrentRotationPositions: (matchId: string) => void;

  // 註：舊的 loadRotationData（整批把存檔覆蓋回輪轉表）已在 #154 PR B 移除。載入已存戰術
  // 改成唯讀檢視、不再反向寫回輪轉表，所以輪轉表不需要、也刻意不提供這個「被別人整包覆蓋」
  // 的入口——反向寫回的能力從型別上就不存在了。
  resetAll: (matchId: string) => void;
}

// 在 set() 裡對「某一場的分片」做 immutable 更新的共用小工具：拿舊分片（沒有就用空白），
// 交給 updater 算出新分片，再包回 dataByMatch。省得每個 action 都重寫一次展開語法。
function updateMatch(
  state: RotationTableStore,
  matchId: string,
  updater: (prev: PerMatchRotationState) => PerMatchRotationState,
): Pick<RotationTableStore, "dataByMatch"> {
  const prev = state.dataByMatch[matchId] ?? emptyPerMatch();
  return { dataByMatch: { ...state.dataByMatch, [matchId]: updater(prev) } };
}

export const useRotationTable = create<RotationTableStore>()(
  persist(
    (set) => ({
      circleLabel: "name",
      dataByMatch: {},

      setCircleLabel: (label) => set({ circleLabel: label }),

      setCurrentRotation: (matchId, index) =>
        set((state) => updateMatch(state, matchId, (m) => ({ ...m, currentRotation: index }))),

      setStartingLiberoId: (matchId, id) =>
        set((state) => updateMatch(state, matchId, (m) => ({ ...m, startingLiberoId: id }))),

      // 更新名單時同步維護 startingLiberoId：
      // 若先發 L 已被移出名單，改選名單裡第一個 L；若名單沒有 L 則清空。
      setRoster: (matchId, roster) =>
        set((state) =>
          updateMatch(state, matchId, (m) => {
            const liberos = roster.filter((p) => p.role === "L");
            const currentStillExists = liberos.some((p) => p.id === m.startingLiberoId);

            // 幽靈站位清理（issue #35）：名單裡被刪掉的球員，如果還卡在某個輪次的
            // 站位（rotations[].positions）或自由球員替補紀錄（liberoReplacement）裡，
            // Court.tsx 找不到球員就不渲染，畫面看起來正常，但那格其實還被佔著、
            // 既看不到也選不到。所以存檔名單時要順手把指向「已不存在球員」的站位掃掉。
            //
            // 關鍵：只有「真的清掉了東西」時才換 rotations 的參照，沒清到就沿用舊陣列。
            // 為什麼重要——TacticsBoard 進頁的 effect 會用 match.players 呼叫 setRoster，而 match
            // 每次 render 都是新物件，所以 setRoster 會被反覆呼叫。若這裡每次都用 .map 產生
            // 新的 rotations 陣列，訂閱 rotations 的元件就會重繪 → effect 又跑 setRoster →
            // 無限迴圈（Maximum update depth exceeded）。用「沒變就回原參照」讓那個 slice
            // 被視為沒變、不觸發重繪，迴圈才不會發生。（見 memory：zustand stable ref in effect actions）
            const validIds = new Set(roster.map((p) => p.id));
            let rotationsChanged = false;
            const rotations = m.rotations.map((rot) => {
              const positions = rot.positions.filter((pos) => validIds.has(pos.playerId));
              // liberoReplacement 記錄「被 L 換下場的人」，若這個 L 本人或被換下的人
              // 已從名單移除，這筆替補紀錄就沒意義了，一併清掉避免殘留。
              const replacement =
                rot.liberoReplacement &&
                validIds.has(rot.liberoReplacement.liberoId) &&
                validIds.has(rot.liberoReplacement.replacedPosition.playerId)
                  ? rot.liberoReplacement
                  : null;
              // filter 只會刪不會加，所以長度沒變＝沒有殘留被清掉；replacement 也還是同一個
              // 參照＝沒被清。兩者都沒動就回傳原本的 rot 物件（保留參照）。
              if (
                positions.length === rot.positions.length &&
                replacement === rot.liberoReplacement
              ) {
                return rot;
              }
              rotationsChanged = true;
              return { ...rot, positions, liberoReplacement: replacement };
            });

            return {
              ...m,
              roster,
              rotations: rotationsChanged ? rotations : m.rotations,
              startingLiberoId: currentStillExists ? m.startingLiberoId : (liberos[0]?.id ?? null),
            };
          }),
        ),

      placePlayerOnCourt: (matchId, playerId, zone, referenceRotation) =>
        set((state) =>
          updateMatch(state, matchId, (m) => {
            const player = m.roster.find((p) => p.id === playerId);
            const isLibero = player?.role === "L";

            // ── 自由球員邏輯 ──────────────────────────────────────────────────────
            // 自由球員不輪轉（每個輪次的位置是獨立記錄的），
            // 只能站後排（1/5/6 號位），一次只能有一個 L 在場上。
            if (isLibero) {
              if (!BACK_ROW_ZONES.has(zone)) return m; // 前排拒絕放置

              const r = m.currentRotation;
              const newRotations = [...m.rotations];
              newRotations[r] = placeLiberoOnCourt(
                newRotations[r],
                m.roster,
                playerId,
                zone,
                getZoneCoords(zone),
              );
              // 不管這個 L 是從備位區拖上場、還是直接從名單拖上場，
              // 都要同步把它設成 startingLiberoId——這樣每場只會追蹤一個「先發」L，
              // 備位區才不會跟場上狀態脫節（這正是 issue #14 bug 1 的根本原因）。
              return { ...m, rotations: newRotations, startingLiberoId: playerId };
            }

            // ── 一般球員邏輯 ──────────────────────────────────────────────────────
            // referenceRotation 讓呼叫方指定「以哪個輪次為基準」來推算其他 5 輪。
            const r = referenceRotation ?? m.currentRotation;

            // 排除 L 球員再建立格子 Map——L 不參與輪轉推算，每輪獨立記錄。
            const liberoIds = new Set(m.roster.filter((p) => p.role === "L").map((p) => p.id));
            const currentPositions = m.rotations[r].positions.filter(
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
            if (sourceZone === zone) return m; // 拖到自己原本站的格子，沒變化

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
            const newRotations = m.rotations.map((rotation, i) => {
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

            return { ...m, rotations: newRotations };
          }),
        ),

      // 右鍵刪除球員：
      // - 自由球員（L）：只移除目前輪次，並還原被替換的人回場上。
      // - 一般球員：從全部 6 個輪次移除（站位整體連動）。
      removePlayerFromCourt: (matchId, playerId) =>
        set((state) =>
          updateMatch(state, matchId, (m) => {
            const player = m.roster.find((p) => p.id === playerId);
            const isLibero = player?.role === "L";

            if (isLibero) {
              const r = m.currentRotation;
              const newRotations = [...m.rotations];
              const rot = newRotations[r];
              const replacement = rot.liberoReplacement;

              let newPositions = rot.positions.filter((p) => p.playerId !== playerId);
              if (replacement) {
                newPositions = [...newPositions, replacement.replacedPosition];
              }
              newRotations[r] = { positions: newPositions, liberoReplacement: null };
              return { ...m, rotations: newRotations };
            }

            // 一般球員：所有輪次都移除
            return {
              ...m,
              rotations: m.rotations.map((rot) => ({
                ...rot,
                positions: rot.positions.filter((p) => p.playerId !== playerId),
              })),
            };
          }),
        ),

      resetCurrentRotationPositions: (matchId) =>
        set((state) =>
          updateMatch(state, matchId, (m) => {
            const r = m.currentRotation;
            const newRotations = [...m.rotations];
            newRotations[r] = { positions: [], liberoReplacement: null };
            return { ...m, rotations: newRotations };
          }),
        ),

      resetAll: (matchId) => set((state) => updateMatch(state, matchId, () => emptyPerMatch())),
    }),
    {
      name: "volleyboard_rotationtable",
      // 只持久化 circleLabel 這個裝置顯示偏好。dataByMatch（各場的名單/站位）刻意不進
      // localStorage——它是「未存的工作狀態」，PO 決策是只有存成戰術才算數；而且不變量規定
      // persist 永不能帶著 match 資料。這兩條合起來，正好只剩 circleLabel 可以留存。
      partialize: (state) => ({ circleLabel: state.circleLabel }),
    },
  ),
);
