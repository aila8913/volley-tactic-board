import { describe, it, expect } from "vitest";
import { toSvg, toNorm, fromScreen, toScreen, rowOf } from "./courtGeometry";

// toSvg/toNorm 互為反向操作，這是這個模組最基本的不變條件：球場座標系換過去、再換
// 回來，一定要拿回原本的數字，不然任何一邊的呼叫端都可能悄悄累積誤差。
describe("toSvg / toNorm", () => {
  it("互為反向操作：任何 normalized 點換成 SVG 座標再換回來都應該一樣", () => {
    // 挑幾個代表性的點：正中央、邊角，再加上 rotationLogic.ts 實際在用的兩個真實
    // 站位（zone 1 的 {0.83, 0.85}、zone 3 的 {0.5, 0.6}）——這兩個數字不是隨便挑的，
    // 直接對照 zoneCoords，確保這個共用模組跟輪轉表實際使用的座標系是同一套基準。
    const samples = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.5, y: 0.5 },
      { x: 0.83, y: 0.85 }, // zone 1
      { x: 0.5, y: 0.6 }, // zone 3
    ];
    for (const p of samples) {
      expect(toNorm(toSvg(p))).toEqual(p);
    }
  });

  it("toSvg 把 0~1 的 normalized 座標放大成 0~100 / 0~200 的 SVG 座標", () => {
    expect(toSvg({ x: 0.83, y: 0.85 })).toEqual({ x: 83, y: 170 });
  });

  it("toNorm 把 SVG 座標縮回 0~1 的 normalized 座標", () => {
    expect(toNorm({ x: 50, y: 100 })).toEqual({ x: 0.5, y: 0.5 });
  });
});

// rowOf 是純視覺判斷（球員圈該不該套用前排配色），跟 rotationLogic.ts 的
// isBackRowPosition（自由球員站位合法性的規則判斷）是兩回事——這裡只釘視覺門檻本身。
describe("rowOf", () => {
  it("前排格子的 y 值（0.6）判為 front", () => {
    // 0.6 是 zoneCoords 裡前排三個號位（2/3/4）共用的 y 值。
    expect(rowOf(0.6)).toBe("front");
  });

  it("後排格子的 y 值（0.85）判為 back", () => {
    // 0.85 是 zoneCoords 裡後排三個號位（1/5/6）共用的 y 值。
    expect(rowOf(0.85)).toBe("back");
  });

  it("恰好等於門檻 0.75 時判為 front（因為用 <=，不是 <）", () => {
    // 這條邊界在真實資料裡永遠不會被踩到（實際 y 值只會是 0.6 或 0.85），
    // 但既然行為是 `<=`，測試就該把這個行為明確釘住，而不是留給之後的人猜。
    expect(rowOf(0.75)).toBe("front");
  });

  it("y=0.5 這一條線本身算 back（門檻是嚴格大於 0.5 才算 front）", () => {
    expect(rowOf(0.5)).toBe("back");
  });
});

// fromScreen/toScreen 需要 SVGSVGElement.getScreenCTM()，但 jsdom（vitest 預設的 DOM
// 模擬環境）並沒有真的實作 SVG 幾何運算，getScreenCTM 在 jsdom 裡永遠回 undefined/報錯。
// 所以這裡不用真的 SVG DOM 節點，而是自己造一個「形狀像 SVGSVGElement、只有
// getScreenCTM 這個方法」的假物件，直接測換算公式本身對不對，跟 DOM 環境脫鉤。
describe("fromScreen / toScreen", () => {
  // 造一個假的 CTM：a/d 是 x/y 各自的縮放倍率，e/f 是位移量。
  // b/c（旋轉分量）在這裡故意不給有意義的值，因為 preserveAspectRatio="none" 的球場
  // SVG 不會有旋轉，公式本來就只用得到 a/d/e/f。
  const fakeSvg = (ctm: { a: number; d: number; e: number; f: number } | null) =>
    ({
      getScreenCTM: () => (ctm ? { a: ctm.a, b: 0, c: 0, d: ctm.d, e: ctm.e, f: ctm.f } : null),
    }) as unknown as SVGSVGElement;

  it("fromScreen：螢幕座標換算成 SVG 座標，套用縮放與位移", () => {
    // 假設球場被放大 3 倍（a=d=3），左上角在螢幕上的位置是 (10, 20)（e=10, f=20）。
    // 螢幕座標 (100, 200) 對應的 SVG 座標應該是 ((100-10)/3, (200-20)/3)。
    const svg = fakeSvg({ a: 3, d: 3, e: 10, f: 20 });
    expect(fromScreen(100, 200, svg)).toEqual({ x: 30, y: 60 });
  });

  it("toScreen：SVG 座標換算回螢幕座標，是 fromScreen 的反向操作", () => {
    const svg = fakeSvg({ a: 3, d: 3, e: 10, f: 20 });
    // fromScreen 换出来的 SVG 座標，丟回 toScreen 應該拿回原本的螢幕座標。
    const svgPoint = fromScreen(100, 200, svg);
    expect(toScreen(svgPoint.x, svgPoint.y, svg)).toEqual({ x: 100, y: 200 });
  });

  it("x、y 兩個方向可以有不同的縮放倍率（preserveAspectRatio=none 允許非等比例縮放）", () => {
    const svg = fakeSvg({ a: 2, d: 5, e: 0, f: 0 });
    expect(fromScreen(20, 50, svg)).toEqual({ x: 10, y: 10 });
  });

  it("getScreenCTM() 回 null 時（SVG 還沒 mount）退回 {x:0, y:0}，不會噴例外", () => {
    const svg = fakeSvg(null);
    expect(fromScreen(999, 999, svg)).toEqual({ x: 0, y: 0 });
    expect(toScreen(999, 999, svg)).toEqual({ x: 0, y: 0 });
  });

  it("svg 參數本身傳 null（ref 還沒接上）也一樣退回 {x:0, y:0}", () => {
    expect(fromScreen(999, 999, null)).toEqual({ x: 0, y: 0 });
    expect(toScreen(999, 999, null)).toEqual({ x: 0, y: 0 });
  });
});
