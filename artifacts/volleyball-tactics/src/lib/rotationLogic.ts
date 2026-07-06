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
