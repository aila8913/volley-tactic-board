// PO 2026-08-09「右欄的兩份球員名單合併成一份」的回歸測試。
//
// 測得動的原因跟 MatchDetailView.test.tsx 一樣：RotationRailPanel 刻意不 import 任何 store，
// 資料全由 props 決定（見該檔開頭 issue #117 的錨點決議），所以 renderToStaticMarkup 直接
// 餵假資料就渲染得出來。這個專案還沒有 @testing-library/react（issue #168），所以這裡只驗
// 「一次性的初始渲染長什麼樣」，不驗點擊/拖曳之後的行為。
//
// 守的是合併之後那份清單的三條規格：
//   1. 它同時是「這場比賽的名單」→ 位置（S/OH/MB/OP/L）要看得到。
//   2. includeLibero 時自由球員也要列出來，但**不能**是可點的 button（怎麼排 L 的先發是
//      #326/#327 的題目，這裡偷跑會做出一個之後要打掉的入口）。
//   3. rosterList="hidden" 時整塊清單不畫——編輯模式下名單由 MatchDetailForm 接手，
//      同一份東西不能同時畫兩次（那正是這輪要消滅的重複）。
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RotationRailPanel from "./RotationRailPanel";
import type { MatchPlayer } from "@/types/match";

const ROSTER: MatchPlayer[] = [
  { id: "p1", name: "日向翔陽", number: 10, role: "MB", personId: null },
  { id: "p2", name: "影山飛雄", number: 9, role: "S", personId: null },
  { id: "p3", name: "西谷夕", number: 4, role: "L", personId: null },
];

describe("RotationRailPanel 的球員清單", () => {
  it("列出每個人的背號、姓名與位置", () => {
    const html = renderToStaticMarkup(
      <RotationRailPanel lineup={null} roster={ROSTER} rotation={0} />,
    );

    expect(html).toContain("日向翔陽");
    expect(html).toContain("影山飛雄");
    expect(html).toContain(">MB<");
    expect(html).toContain(">S<");
  });

  it("預設不列自由球員（維持計分頁/戰術板既有行為）", () => {
    const html = renderToStaticMarkup(
      <RotationRailPanel lineup={null} roster={ROSTER} rotation={0} />,
    );

    expect(html).not.toContain("西谷夕");
  });

  it("includeLibero：自由球員列得出來，但不是可點的按鈕", () => {
    const html = renderToStaticMarkup(
      <RotationRailPanel lineup={null} roster={ROSTER} rotation={0} includeLibero />,
    );

    expect(html).toContain("西谷夕");
    // 可指派的球員在非唯讀模式下是 <button>；自由球員那一列必須是純資訊的 <div>。
    // 用「按鈕數量」當判準：六個號位格子 + 兩個可指派球員 = 8 顆，多一顆就代表
    // 自由球員被做成可點的了。
    const buttonCount = html.split("<button").length - 1;
    expect(buttonCount).toBe(8);
  });

  it('rosterList="hidden"：清單跟操作提示都不渲染', () => {
    const html = renderToStaticMarkup(
      <RotationRailPanel lineup={null} roster={ROSTER} rotation={0} rosterList="hidden" />,
    );

    expect(html).not.toContain("日向翔陽");
    expect(html).not.toContain("把球員拖進號位");
    // 六個號位格子仍然要在——隱藏的只有清單那一塊。
    expect(html.split("<button").length - 1).toBe(6);
  });
});
