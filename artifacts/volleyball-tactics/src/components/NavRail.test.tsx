import { describe, it, expect } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// 跟退役前的 TacticsRailMenu.test.tsx 同一套做法：這個專案沒有裝 @testing-library/react
// （見 issue #168），只能用 renderToStaticMarkup 把元件轉成 HTML 字串比對一次性的初始渲染。
// NavRail 大部分的「戲」都是互動行為——hover/focus 展開側欄、點「戰」「出」掀開子清單、
// click-outside/Esc 關閉、選一筆已存戰術觸發 loadProject + 換頁、開 NewTacticDialog、
// 匯出/匯入的檔案操作——這些全部需要真的觸發 DOM 事件、讓 useState 重新渲染，
// renderToStaticMarkup 做不到。這支測試只能涵蓋「初始渲染（未展開）長什麼樣子」這個切面，
// 互動行為沒有自動測試涵蓋，回報裡會列出來，等 #168 引進 @testing-library/react 之後
// 應該回來把這些行為補齊。
import { renderToStaticMarkup } from "react-dom/server";
import NavRail from "./NavRail";
import type { CourtSnapshot } from "../types/courtSnapshot";

const STUB_SNAPSHOT: CourtSnapshot = {
  source: "blank",
  matchId: "1",
  rotation: 0,
  capturedAt: "2026-01-01T00:00:00.000Z",
  players: [],
};

// useListTactics 底層是 react-query 的 useQuery，需要 QueryClientProvider 才能呼叫，
// 不然會直接丟「No QueryClient set」的錯誤——每個測試自己包一層，跟 App.tsx 掛的方式一樣。
function renderWithProviders(children: React.ReactNode) {
  const queryClient = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

describe("NavRail", () => {
  it("有 matchId 時：初始渲染是收合狀態，比/計/數/戰/出都可互動，沒有展開浮層", () => {
    const html = renderWithProviders(
      <NavRail
        matchId="1"
        backHref="/"
        active="record"
        captureCurrent={() => STUB_SNAPSHOT}
        captureLabel="測試用擷取說明"
      />,
    );
    // 收合態的五個入口都在（用各自的 testid 確認存在，不是不可互動的停用態）。
    expect(html).toContain('data-testid="link-nav-rail-collapsed-比"');
    expect(html).toContain('data-testid="link-nav-rail-collapsed-計"');
    expect(html).toContain('data-testid="link-nav-rail-collapsed-數"');
    expect(html).toContain('data-testid="button-nav-rail-collapsed-戰"');
    expect(html).toContain('data-testid="button-nav-rail-collapsed-出"');
    // 沒有任何一個渲染成停用態的 aria-disabled 按鈕。
    expect(html).not.toContain('aria-disabled="true"');
    // 展開浮層預設不存在（expanded 初始值是 false）。
    expect(html).not.toContain('data-testid="nav-rail-expanded-panel"');
  });

  it("active 入口套用強階選取態的 class（issue #134 環 0：bg-[#c6f135]/15 + ring-1 ring-[#c6f135]）", () => {
    const html = renderWithProviders(
      <NavRail
        matchId="1"
        backHref="/"
        active="record"
        captureCurrent={() => STUB_SNAPSHOT}
        captureLabel="測試用擷取說明"
      />,
    );
    // 只斷言「這兩個 class token 同時出現在 html 字串裡」，不去抓哪個確切節點——
    // renderToStaticMarkup 產出的是壓平的 HTML 字串，逐節點比對太脆弱；這裡在意的是
    // 「強階選取態的視覺 token 有沒有被引用到」，不是精確位置。
    expect(html).toContain("bg-[#c6f135]/15");
    expect(html).toContain("ring-[#c6f135]");
  });

  it("沒有 matchId 時：計/數/戰/出 四格渲染成停用態（aria-disabled，仍是可點擊的 <button>）", () => {
    const html = renderWithProviders(<NavRail backHref="/" active="list" />);
    // 「比」永遠是普通連結，不受 matchId 影響。
    expect(html).toContain('data-testid="link-nav-rail-collapsed-比"');
    // 計/數/戰/出改成渲染成停用態按鈕（不是舊版 MatchNavRail 的不可互動 <span>）——
    // 型別上必須是 <button>，不然點了不會觸發 onClick、也就跳不出「先選一場比賽」的 toast
    // （HTML 原生 disabled 屬性會讓瀏覽器完全不派發滑鼠事件，這正是這次要修的坑）。
    expect(html).toContain('data-testid="button-nav-rail-collapsed-計"');
    expect(html).toContain('data-testid="button-nav-rail-collapsed-數"');
    expect(html).toContain('data-testid="button-nav-rail-collapsed-戰"');
    expect(html).toContain('data-testid="button-nav-rail-collapsed-出"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("先選一場比賽");
    // 停用態按鈕沒有寫死 disabled 屬性——renderToStaticMarkup 只序列化 React 認得的 props，
    // 這裡簡單確認渲染出來的字串裡沒有裸的 `disabled` 屬性字樣（不是 aria-disabled 的一部分）。
    expect(html).not.toMatch(/[^-]disabled(?!=)/);
  });

  it("渲染當下不會呼叫 captureCurrent——擷取要等使用者實際走到「新增戰術」那一步才發生", () => {
    let called = false;
    renderWithProviders(
      <NavRail
        matchId="1"
        backHref="/"
        active="board"
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
