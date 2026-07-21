import { describe, it, expect } from "vitest";
// 跟 CourtReadOnlyView.test.tsx 同一套做法：專案沒裝 @testing-library/react，用
// react-dom/server 的 renderToStaticMarkup 把元件轉成 HTML 字串比對。
//
// 這裡只能測 open=false 這一種狀態：Dialog（shadcn 包 Radix UI 的 DialogPrimitive）
// open=true 時，內容是透過 ReactDOM Portal 掛到 document.body 底下畫的，不是「正常」
// React tree 的一部分——而 renderToStaticMarkup 是純字串序列化，不會真的把 Portal
// 內容塞進任何 DOM 節點（Portal 需要「已存在的真實 DOM」才有意義，SSR 字串序列化
// 沒有這回事，React 官方文件也明講 server renderer 不支援 portal）。所以 captureLabel
// 文字、captureDisabled 停用按鈕這些「open=true 才看得到」的畫面，沒辦法用這支測試
// 檔涵蓋到——這件事在回報裡會列成「沒被自動測試涵蓋的互動」。
import { renderToStaticMarkup } from "react-dom/server";
import NewTacticDialog from "./NewTacticDialog";
import type { CourtSnapshot } from "../types/courtSnapshot";

const STUB_SNAPSHOT: CourtSnapshot = {
  source: "blank",
  matchId: "1",
  rotation: 0,
  capturedAt: "2026-01-01T00:00:00.000Z",
  players: [],
};

describe("NewTacticDialog", () => {
  it("open=false 時彈窗內容不畫出來，不會意外把 captureLabel/按鈕洩漏到畫面上", () => {
    const html = renderToStaticMarkup(
      <NewTacticDialog
        open={false}
        onOpenChange={() => {}}
        matchId="1"
        captureCurrent={() => STUB_SNAPSHOT}
        captureLabel="測試用擷取說明"
      />,
    );
    expect(html).not.toContain("測試用擷取說明");
    expect(html).not.toContain("button-new-tactic-blank");
    expect(html).not.toContain("button-new-tactic-from-rotation");
  });

  it("captureCurrent 不會在渲染當下被呼叫——擷取要等使用者實際按下按鈕才發生，不是渲染期的副作用", () => {
    let called = false;
    renderToStaticMarkup(
      <NewTacticDialog
        open={false}
        onOpenChange={() => {}}
        matchId="1"
        captureCurrent={() => {
          called = true;
          return STUB_SNAPSHOT;
        }}
        captureLabel="測試用擷取說明"
      />,
    );
    expect(called).toBe(false);
  });
});
