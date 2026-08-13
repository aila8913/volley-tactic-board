import { describe, it, expect } from "vitest";
import {
  radialOptionOffsets,
  radialSelection,
  dist,
  BASE_OFFSET,
  BASE_OPTION_COUNT,
  RADIAL_DEAD_ZONE,
} from "./courtGesture";

describe("radialOptionOffsets", () => {
  it("回傳跟選項數一樣長的陣列", () => {
    expect(radialOptionOffsets(6, -90)).toHaveLength(6);
    expect(radialOptionOffsets(2, 180)).toHaveLength(2);
  });

  it("選項數不超過基準（6）時，半徑維持 BASE_OFFSET，不會縮水", () => {
    // 2 個選項（得/失分那組）：offset 應該還是 56，不是等比例縮小成 56*2/6。
    const offsets = radialOptionOffsets(2, 180);
    const radius = Math.hypot(offsets[0].dx, offsets[0].dy);
    expect(radius).toBeCloseTo(BASE_OFFSET, 5);
  });

  it("選項數超過基準時，半徑等比例放大", () => {
    // 7 顆（動作選單多一顆「沒看到」的情境）：半徑應該是 56 * 7/6。
    const offsets = radialOptionOffsets(7, -90);
    const radius = Math.hypot(offsets[0].dx, offsets[0].dy);
    expect(radius).toBeCloseTo((BASE_OFFSET * 7) / BASE_OPTION_COUNT, 5);
  });

  it("startAngle=180 時，2 個選項落在左（180°）／右（0°）", () => {
    const [left, right] = radialOptionOffsets(2, 180);
    // 180°：cos(180°)=-1, sin(180°)=0 → dx 為負、dy 接近 0。
    expect(left.dx).toBeCloseTo(-BASE_OFFSET, 5);
    expect(left.dy).toBeCloseTo(0, 5);
    // 0°：cos(0°)=1, sin(0°)=0 → dx 為正、dy 接近 0。
    expect(right.dx).toBeCloseTo(BASE_OFFSET, 5);
    expect(right.dy).toBeCloseTo(0, 5);
  });

  it("startAngle=-90 時，第一顆落在正上方（dy 為負）", () => {
    const [first] = radialOptionOffsets(6, -90);
    expect(first.dx).toBeCloseTo(0, 5);
    expect(first.dy).toBeCloseTo(-BASE_OFFSET, 5);
  });

  it("0 個選項回傳空陣列，不會除以零", () => {
    expect(radialOptionOffsets(0, 0)).toEqual([]);
  });
});

describe("radialSelection", () => {
  const center = { x: 200, y: 300 };
  // 「往某個方向滑 r 像素」的釋放點。角度沿用 radialOptionOffsets 那一套（0°=正右、順時針為正）。
  const release = (deg: number, r: number) => ({
    x: center.x + r * Math.cos((deg * Math.PI) / 180),
    y: center.y + r * Math.sin((deg * Math.PI) / 180),
  });

  it("手指沒滑出死區就回 null（＝取消，不選任何東西）", () => {
    // 完全沒動：這正是舊版「離哪顆最近」會亂選一顆的情形。
    expect(radialSelection(center, center, 6, -90)).toBeNull();
    expect(radialSelection(center, release(0, RADIAL_DEAD_ZONE - 1), 6, -90)).toBeNull();
  });

  it("剛好滑出死區就開始選（邊界不會有死角）", () => {
    expect(radialSelection(center, release(-90, RADIAL_DEAD_ZONE), 6, -90)).toBe(0);
  });

  it("startAngle=-90、6 顆時，正上方是第 0 顆、順時針依序往下", () => {
    expect(radialSelection(center, release(-90, 80), 6, -90)).toBe(0);
    expect(radialSelection(center, release(-30, 80), 6, -90)).toBe(1);
    expect(radialSelection(center, release(90, 80), 6, -90)).toBe(3);
    expect(radialSelection(center, release(-150, 80), 6, -90)).toBe(5);
  });

  it("滑過頭也照樣選到同一顆——判定只看方向，不看距離", () => {
    // 這是換成角度扇區（而非「離哪顆鈕最近」）的重點：使用者用力甩出去不會跳選項。
    expect(radialSelection(center, release(-90, 80), 6, -90)).toBe(0);
    expect(radialSelection(center, release(-90, 400), 6, -90)).toBe(0);
  });

  it("落在兩顆中間偏某一側時，選到比較近的那一顆", () => {
    // 6 顆＝每格 60°，第 0 顆在 -90°、第 1 顆在 -30°，分界在 -60°。
    expect(radialSelection(center, release(-61, 80), 6, -90)).toBe(0);
    expect(radialSelection(center, release(-59, 80), 6, -90)).toBe(1);
  });

  it("startAngle=180、2 顆（得/失分）時，左邊是第 0 顆、右邊是第 1 顆", () => {
    expect(radialSelection(center, release(180, 80), 2, 180)).toBe(0);
    expect(radialSelection(center, release(0, 80), 2, 180)).toBe(1);
  });

  it("角度折回 360 附近時不會回傳越界的 index", () => {
    // rel 接近 360 時 Math.round 會得到 count 本身，必須折回 0。
    for (let deg = -180; deg <= 180; deg += 1) {
      const idx = radialSelection(center, release(deg, 80), 6, -90);
      expect(idx).not.toBeNull();
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(6);
    }
  });

  it("7 顆（6 動作＋取消）時，第一顆仍在正上方，取消是最後一格", () => {
    // 進階版的動作選單多開一格放「取消」（PO 2026-08-13：取消不能畫在球員頭上）。
    // 這裡要釘住的是：多這一格之後，第 0 顆（發球）**還是**在正上方——六個動作的方位會
    // 整體重排，但「按正上方＝第一個動作」這條肌肉記憶不能斷。
    expect(radialSelection(center, release(-90, 80), 7, -90)).toBe(0);
    // 每格 360/7 ≈ 51.4°，第 6 顆（取消）落在 -90 + 6×51.4 ≈ 218.6°（等於 -141.4°，左上）。
    expect(radialSelection(center, release(-141, 80), 7, -90)).toBe(6);
  });

  it("0 個選項一律回 null，不會除以零", () => {
    expect(radialSelection(center, release(0, 80), 0, 0)).toBeNull();
  });
});

describe("dist", () => {
  it("算兩點的歐氏距離", () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
    expect(dist(1, 1, 1, 1)).toBe(0);
  });
});
