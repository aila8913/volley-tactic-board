import { describe, it, expect } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// 跟其他元件測試同一套做法：沒裝 @testing-library/react，用 renderToStaticMarkup
// 把元件轉成 HTML 字串比對。這個元件大部分的「戲」都是互動行為——點按鈕展開選單、
// click-outside/Esc 關閉、選一筆已存戰術觸發 loadProject + 換頁、開 NewTacticDialog——
// 這些全部需要真的觸發 DOM 事件、讓 useState 重新渲染，renderToStaticMarkup 是一次性
// 的靜態序列化，做不到。這支測試只能涵蓋「初始渲染長什麼樣子」這個切面，互動行為沒有
// 自動測試涵蓋，回報裡會列出來。
import { renderToStaticMarkup } from "react-dom/server";
import TacticsRailMenu from "./TacticsRailMenu";
import type { CourtSnapshot } from "../types/courtSnapshot";

const STUB_SNAPSHOT: CourtSnapshot = {
  source: "blank",
  matchId: "1",
  rotation: 0,
  capturedAt: "2026-01-01T00:00:00.000Z",
  players: [],
};

// useListTactics 底層是 react-query 的 useQuery，需要 QueryClientProvider 才能呼叫，
// 不然會直接丟「No QueryClient set」的錯誤——跟 App.tsx 掛的方式一樣，每個測試自己包一層。
function renderWithProviders(children: React.ReactNode) {
  const queryClient = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

describe("TacticsRailMenu", () => {
  it("初始渲染是關閉狀態：只有觸發按鈕、選單面板不存在，aria-expanded=false", () => {
    const html = renderWithProviders(
      <TacticsRailMenu
        matchId="1"
        captureCurrent={() => STUB_SNAPSHOT}
        captureLabel="測試用擷取說明"
      />,
    );
    expect(html).toContain('data-testid="button-tactics-rail-menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="tactics-rail-menu-panel"');
    expect(html).not.toContain("+ 新增戰術");
  });

  it("觸發按鈕顯示「戰」這個字，跟 MatchNavRail 其他導覽項目一致", () => {
    const html = renderWithProviders(
      <TacticsRailMenu
        matchId="1"
        captureCurrent={() => STUB_SNAPSHOT}
        captureLabel="測試用擷取說明"
      />,
    );
    expect(html).toContain(">戰<");
  });

  it("渲染當下不會呼叫 captureCurrent——擷取要等使用者實際走到「新增戰術」那一步才發生", () => {
    let called = false;
    renderWithProviders(
      <TacticsRailMenu
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
