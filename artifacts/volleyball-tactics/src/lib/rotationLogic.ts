import type { RotationPositions, PlayerPosition } from "../types/rotationTable";
import type { MatchPlayer } from "../types/match";
import type { LineupSnapshot } from "../types/scoresheet";

// 「先發是否已排好」的共用判定（issue #37）。
// 輪轉表的 hasRotations 與計分表的 hasLineup 原本各自寫一份
// `rotations.some((r) => r.positions.length > 0)`——只要「任何一輪有任何一個人」就放行，
// 連 1~5 人的半套陣容也算排好，而且兩處還各判各的、改一邊會漏另一邊（同一根因、兩份實作）。
// 這裡收斂成單一定義：至少要有一輪站滿 6 個人才算排好。
// 為什麼是 positions.length >= 6 就等於「滿員」、而且不必特別檢查自由球員：
// 自由球員上場是「頂替掉某個人」（被頂替者存到 liberoReplacement，不留在 positions），
// 所以 positions 存的一直是「場上實際幾個人」——滿員永遠是 6，跟有沒有派 L 無關。
// （產品決策：門檻是「至少 6 人」，不強制一定要指定自由球員。）
export function isLineupComplete(rotations: RotationPositions[]): boolean {
  return rotations.some((r) => r.positions.length >= 6);
}

// ── 計分表先發快照（issue #115）──
// 從輪轉表全域 store 的「起始輪次（rotation 0）」擷取一份計分表專用的先發快照
// （號位 1~6 → 球員 id）。這是計分表跟輪轉表/戰術板解耦的第一步：擷取一次之後，計分表就
// 只讀自己這份，不再跟著全域 store 變動（見 types/scoresheet.ts 的 LineupSnapshot 說明）。
//
// 只收「屬於這場比賽（roster）的非自由球員」：
//   - 過濾掉 id 不在 roster 裡的站位——這正是防止「載入別場存檔/切到別場」時，id 對不上的
//     幽靈站位混進來的關鍵（issue #115-A 與跨場導航案例）。
//   - 自由球員（L）不列入六個號位：計分表裡 L 從場邊出發（跟後端 lineups 表一致）。L 若在
//     rotation 0 蓋住了某個後排球員，那個「被蓋住的人」存在 liberoReplacement 裡，要還原回來
//     當作該號位的先發（否則會少一個人）。
//
// 湊不滿 6 個不同號位就回 null（代表先發還沒排好、或已被污染），呼叫端據此顯示「請先排先發」。
export function captureLineupFromRotations(
  rotations: RotationPositions[],
  roster: MatchPlayer[],
): LineupSnapshot | null {
  const rot = rotations[0];
  if (!rot) return null;

  const liberoIds = new Set(roster.filter((p) => p.role === "L").map((p) => p.id));
  const validIds = new Set(roster.map((p) => p.id));

  // 先把 L 的站位拿掉，再把「被 L 蓋住的非自由球員」還原回來——這樣不管 rotation 0 有沒有
  // 派 L 上場，basePositions 都是乾淨的 6 個非自由球員站位（跟 useRotationTable 的
  // placeLiberoOnCourt 內部算 basePositions 是同一套還原邏輯）。
  let basePositions = rot.positions.filter((p) => !liberoIds.has(p.playerId));
  if (rot.liberoReplacement) {
    basePositions = [...basePositions, rot.liberoReplacement.replacedPosition];
  }

  const lineup: LineupSnapshot = {};
  for (const pos of basePositions) {
    if (!validIds.has(pos.playerId)) continue; // 幽靈站位（id 對不上這場球員）直接略過
    lineup[findNearestZone(pos.x, pos.y)] = pos.playerId;
  }

  // 六個號位（1~6）都要各站一個不同球員才算完整；有號位重疊或缺人就視為沒排好。
  const filledZones = Object.keys(lineup).length;
  return filledZones === 6 ? lineup : null;
}

// 把先發快照（rotation 0 的號位→球員）換算成「第 rotation 輪」時場上 6 個人的座標，
// 給計分表球場渲染用。排球輪轉：起始號位 z 的人，轉了 rotation 次後落在 rotateZone(z, rotation)，
// 取那個號位的座標。這跟 useRotationTable.placePlayerOnCourt 推算其他輪次是同一條公式，只是這裡
// 的基準固定是 rotation 0（先發那一輪），且資料來源是計分表自己的快照、不是全域 store。
export function lineupToPositions(lineup: LineupSnapshot, rotation: number): PlayerPosition[] {
  return Object.entries(lineup).map(([zoneStr, playerId]) => {
    const startZone = Number(zoneStr);
    const coords = getZoneCoords(rotateZone(startZone, rotation));
    return { playerId, x: coords.x, y: coords.y };
  });
}

// 6 個球場格子的座標基準（0~1 normalized，跟戰術板球場 SVG 的 viewBox 對齊）。
// 編號照排球規則：1 號位是發球輪到的右後場，逆時針 1→6→5→4→3→2→1 依序輪轉。
const zoneCoords = {
  1: { x: 0.83, y: 0.85 }, // Right Back
  2: { x: 0.83, y: 0.6 }, // Right Front
  3: { x: 0.5, y: 0.6 }, // Middle Front
  4: { x: 0.17, y: 0.6 }, // Left Front
  5: { x: 0.17, y: 0.85 }, // Left Back
  6: { x: 0.5, y: 0.85 }, // Middle Back
};

const shiftSequence = [1, 6, 5, 4, 3, 2];

// 排球規則：自由球員只能在後排（1/5/6 號位），不能輪轉到前排。
// 放在這裡（而不是某個 store 檔案裡）是因為輪轉表（格子吸附上場）跟戰術板
// （戰術視圖自由拖曳上場）都要檢查這條規則，兩個 store 各自獨立、不互相 import
// 對方的實作細節，所以共用的規則常數抽到大家都會 import 的 rotationLogic.ts。
export const BACK_ROW_ZONES = new Set([1, 5, 6]);

// 給定一個場上座標（0~1 normalized），判斷它算不算「後排」＝自由球員的合法上場位置。
// 先用 findNearestZone 把座標吸附到最近的號位，再看那個號位在不在 BACK_ROW_ZONES 裡。
//
// 為什麼要有這一支：輪轉表（格子吸附）手上直接有號位，可以 BACK_ROW_ZONES.has(zone)；
// 但計分表（拖曳替換）手上只有 x/y 座標，以前是自己寫一條 `y <= 0.75` 的門檻各判各的——
// 「後排」的定義因此有兩份、日後改了會失同步（issue #43）。把座標版判定收斂到這裡、
// 一樣從 BACK_ROW_ZONES 導出，兩邊就共用同一個真實來源，不會再各寫各的。
export function isBackRowPosition(x: number, y: number): boolean {
  return BACK_ROW_ZONES.has(findNearestZone(x, y));
}

// 給定「輪轉了幾次」，回傳某個起始號位現在實際落在哪個號位。
export function rotateZone(startZone: number, rotation: number): number {
  const currentIndex = shiftSequence.indexOf(startZone);
  const newIndex = (((currentIndex + rotation) % 6) + 6) % 6;
  return shiftSequence[newIndex];
}

export function getZoneCoords(zone: number): { x: number; y: number } {
  return zoneCoords[zone as keyof typeof zoneCoords];
}

// 球員從球員設定拖到球場上、或在場上重新拖曳時，放開滑鼠的座標不會剛好落在 6 個
// 格子的正中心，所以要找「離哪個格子最近」來吸附。x/y 跟 zoneCoords 一樣是 0~1 normalized。
export function findNearestZone(x: number, y: number): number {
  let nearestZone = 1;
  let minDistance = Infinity;
  for (const zone of [1, 2, 3, 4, 5, 6] as const) {
    const coords = zoneCoords[zone];
    const distance = (coords.x - x) ** 2 + (coords.y - y) ** 2;
    if (distance < minDistance) {
      minDistance = distance;
      nearestZone = zone;
    }
  }
  return nearestZone;
}

export interface ZoneSlot {
  // 這個 slot 的原始號位標籤（顯示在圓圈裡）
  zone: number;
  // 輪轉後這個 slot 實際佔據的號位——用來判斷誰現在在 1 號位（發球方）
  currentZone: number;
  x: number;
  y: number;
}

// 紀錄模式用：對手沒有球員名單可以對應，只需要知道「現在 1~6 號位實際排在哪裡」，
// 用來畫沒有姓名、純粹顯示號位的圈圈。mirrored=true 時把座標上下左右都翻過去，
// 對應到球場另一邊（跟 Court.tsx 畫「對手號位」標籤時的鏡射方式一致）。
export function getZoneLayout(rotation: number, mirrored: boolean): ZoneSlot[] {
  return shiftSequence.map((zone) => {
    const newZone = rotateZone(zone, rotation);
    const coords = zoneCoords[newZone as keyof typeof zoneCoords];
    return {
      zone,
      currentZone: newZone,
      x: mirrored ? 1 - coords.x : coords.x,
      y: mirrored ? 1 - coords.y : coords.y,
    };
  });
}
