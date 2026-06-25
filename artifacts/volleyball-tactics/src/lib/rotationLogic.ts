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
  zone: number;
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
      x: mirrored ? 1 - coords.x : coords.x,
      y: mirrored ? 1 - coords.y : coords.y,
    };
  });
}
