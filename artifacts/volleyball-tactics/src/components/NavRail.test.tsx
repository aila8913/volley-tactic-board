import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import NavRail from "./NavRail";

// issue #168：這個檔案是從 renderToStaticMarkup（一次性 HTML 字串比對）整支搬過來的第一批
// 互動測試。搬的原因不是「新玩具比較好玩」，是舊寫法**測不到 NavRail 的主要行為**——這個元件
// 幾乎所有的戲都發生在第一次 render 之後（hover 展開側欄）。靜態序列化只看得到「初始長什麼
// 樣」。testing-library 能表達的是舊寫法的超集（初始渲染的斷言照樣寫得出來，只是改成查 DOM
// 而不是查字串），所以沒有留下兩套寫法的理由。
//
// #372 大幅精簡了這個檔案：舊版 NavRail 吃 matchId，「戰」「出」兩格底下各有子清單（已存
// 戰術／匯出匯入）、還有整組停用態（沒選比賽時「計/戰/出」灰掉、點下去跳「先選一場比賽」
// toast）。這一版 NavRail 完全不吃 matchId，四格（比/數/戰/人）全部是固定目的地的連結，
// 上面那些行為對應的測試案例（子清單展開/互斥/選戰術/新增戰術彈窗、停用態 toast）全部
// 隨著被刪除的機制一起刪除，不是漏寫——見 NavRail.tsx 開頭「為什麼整組砍掉重練」的說明。

// ⚠️ hover 展開側欄的 jsdom 坑（#168 第一次踩到，#372 之後這顆元件仍然有 hover-expand，
// 坑還在，寫在這裡是為了讓下一個要測 hover 型 UI 的人不用再花一小時查）：
//
// 成因：jsdom **沒有排版引擎**，所有元素的 getBoundingClientRect() 都是 0×0、
// elementFromPoint 也回不出東西。userEvent 的 pointer 系統會維護「游標現在停在哪個元素上」，
// 換目標時先在舊目標發 mouseout、再在新目標發 mouseover；但因為它在 jsdom 裡算不出新目標的
// 位置，那個 mouseout 的 relatedTarget 是 **null**。React 收到「離開了、而且不知道去哪」就
// 合成一個 mouseLeave 給 <nav>，NavRail 的 closeByHover 於是把整條側欄收掉——如果一次互動裡
// 連續對側欄內兩個元素做 userEvent 操作，中間那次遊標移動就會把側欄關掉，第二個動作打在
// 已經卸載的節點上。真實瀏覽器不會這樣：relatedTarget 會是新的那顆元素，它在 <nav> 裡面，
// nav 收不到 leave。這份測試目前不需要「連續點展開態裡兩個不同元素」這種案例，用不到繞過
// 方法，但坑本身沒有消失，留著給下一個人。

function renderNavRail(active: "list" | "analytics" | "board" | "people" | "none" = "list") {
  return renderWithProviders(<NavRail backHref="/" active={active} />);
}

describe("NavRail 的初始渲染", () => {
  it("收合態四個入口都是連結，href 各自正確，展開浮層初始不存在", () => {
    renderNavRail();

    expect(screen.getByTestId("link-nav-rail-collapsed-比")).toHaveAttribute("href", "/");
    expect(screen.getByTestId("link-nav-rail-collapsed-數")).toHaveAttribute("href", "/analytics");
    expect(screen.getByTestId("link-nav-rail-collapsed-戰")).toHaveAttribute("href", "/board");
    expect(screen.getByTestId("link-nav-rail-collapsed-人")).toHaveAttribute(
      "href",
      "/analytics/people/manage",
    );
    // 展開是 hover/focus 才發生的暫時態，初始一定是收合的。
    expect(screen.queryByTestId("nav-rail-expanded-panel")).not.toBeInTheDocument();
  });

  it("backHref 由呼叫端決定（例如資料夾內頁要回自己的資料夾，不是根列表）", () => {
    renderWithProviders(<NavRail backHref="/tournaments/t1" active="list" />);

    expect(screen.getByTestId("link-nav-rail-collapsed-比")).toHaveAttribute(
      "href",
      "/tournaments/t1",
    );
  });

  it("active 那格套用強階選取態（#134 環 0 的色票）", () => {
    renderNavRail("board");

    // 只確認「這一格拿到了強階選取態的視覺 token」，不逐一比對整串 class——
    // class 字串會因為排版工具或樣式微調而變動，釘死整串只是製造假警報。
    const active = screen.getByTestId("link-nav-rail-collapsed-戰");
    expect(active.className).toContain("bg-[#c6f135]/15");
    expect(active.className).toContain("ring-[#c6f135]");

    // 其他三格不該套用強階選取態，只是簡單抽查一格。
    const inactive = screen.getByTestId("link-nav-rail-collapsed-比");
    expect(inactive.className).not.toContain("ring-[#c6f135]");
  });

  it('active="none" 時四格都沒有 aria-current="page"（計分頁等在左欄沒有格子的頁面用這個值，見 ScoreSheet.tsx）', () => {
    renderNavRail("none");

    for (const glyph of ["比", "數", "戰", "人"]) {
      expect(screen.getByTestId(`link-nav-rail-collapsed-${glyph}`)).not.toHaveAttribute(
        "aria-current",
      );
    }
  });

  // #372 的直接回歸守則：四格判準改成「不需要先選比賽」，所以不該再有任何一格是停用的，
  // 也不該有任何一格點下去跳「先選一場比賽」toast——那整套機制（連同 matchId prop）已經
  // 隨 #173 那一版的設計一起拆除。用「找不到這個 toast 文字」加上「四格都是 <a> 不是
  // <button>」雙重確認，避免將來有人不小心把停用態加回來。
  it("沒有任何格子是停用的／不會跳「先選一場比賽」toast（#372 回歸守則）", async () => {
    const user = userEvent.setup();
    renderNavRail();

    for (const glyph of ["比", "數", "戰", "人"]) {
      const entry = screen.getByTestId(`link-nav-rail-collapsed-${glyph}`);
      expect(entry.tagName).toBe("A");
      expect(entry).not.toHaveAttribute("aria-disabled");
      await user.click(entry);
    }

    expect(screen.queryByText("先選一場比賽")).not.toBeInTheDocument();
  });
});

describe("NavRail 的展開與收合", () => {
  it("hover 進側欄就展開、移開就收合", async () => {
    const user = userEvent.setup();
    renderNavRail();

    await user.hover(screen.getByRole("navigation"));
    expect(screen.getByTestId("nav-rail-expanded-panel")).toBeInTheDocument();

    await user.unhover(screen.getByRole("navigation"));
    expect(screen.queryByTestId("nav-rail-expanded-panel")).not.toBeInTheDocument();
  });

  it("展開態四格的 href 跟收合態一致，active 一樣套用強階選取態", async () => {
    const user = userEvent.setup();
    renderNavRail("people");

    await user.hover(screen.getByRole("navigation"));

    expect(screen.getByTestId("link-nav-rail-expanded-人").className).toContain("bg-[#c6f135]/15");
    expect(screen.getByTestId("link-nav-rail-expanded-戰")).toHaveAttribute("href", "/board");
  });
});
