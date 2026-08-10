import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTacticsBoard, type WhiteboardSession } from "../hooks/useTacticsBoard";
import { Toaster } from "@/components/ui/toaster";
import NavRail from "./NavRail";
import type { CourtSnapshot } from "../types/courtSnapshot";

// issue #168：這個檔案是從 renderToStaticMarkup（一次性 HTML 字串比對）整支搬過來的第一批
// 互動測試。搬的原因不是「新玩具比較好玩」，是舊寫法**測不到 NavRail 的主要行為**：這個元件
// 幾乎所有的戲都發生在第一次 render 之後——hover 展開側欄、點「戰」掀開子清單、選一筆戰術
// 觸發 loadProject + 換頁、開「新增戰術」彈窗再取消。靜態序列化只看得到「初始長什麼樣」。
//
// 為什麼是整支改寫而不是「舊的留著、互動另開一檔」：那會讓同一顆元件有兩種測試寫法，
// 之後每個人都得先想「我這條該寫在哪一邊」。testing-library 能表達的是舊寫法的超集
//（初始渲染的斷言照樣寫得出來，只是改成查 DOM 而不是查字串），所以沒有留下兩套的理由。
//
// 附帶收穫，也是 #168 issue body 點名的那一項：Radix 的 Dialog 內容是 render 到
// document.body 的 portal，靜態序列化永遠拿不到——底下「開了彈窗、按 Esc 取消」那條測試
// 之所以現在寫得出來，就是因為有了真的 DOM。

const STUB_SNAPSHOT: CourtSnapshot = {
  source: "blank",
  matchId: "1",
  rotation: 0,
  capturedAt: "2026-01-01T00:00:00.000Z",
  players: [],
};

// vi.mock 的工廠函式會被提升（hoist）到 import 之前執行，所以它不能直接參照下面用 const
// 宣告的變數（會踩到 TDZ）。vi.hoisted 就是為了這件事：把「要被 mock 工廠讀到的資料」
// 一起提到那個時間點，測試裡再改它的欄位，工廠回傳的 hook 每次被呼叫時都讀得到最新值。
const mocks = vi.hoisted(() => ({
  tactics: [] as { id: string; name: string; data: unknown }[],
}));

// 只換掉 useListTactics 這一支（其餘用 importOriginal 原封不動帶回來）——這裡要測的是
// 「拿到清單之後 NavRail 怎麼表現」，不是 orval 產生的 fetch 包裝對不對。整包 mock 掉會
// 連 getListTacticsQueryKey 都變成 undefined，NavRail 一 render 就爆。
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return { ...actual, useListTactics: () => ({ data: mocks.tactics }) };
});

// zustand 的 store 是模組層級的單例：同一個測試檔裡的每個 it 共用同一份 state，前一個測試
// 塞進去的 session 會漏到下一個。開跑前先把「原廠設定」整份記下來，每個測試前用
// setState(..., true)（第二個參數 true＝整份取代而不是淺層合併）還原，測試之間才真的獨立。
const PRISTINE_STATE = useTacticsBoard.getState();

beforeEach(() => {
  useTacticsBoard.setState(PRISTINE_STATE, true);
  mocks.tactics = [];
});

// isSessionDirty 的判準是 history.length > 1（見 useTacticsBoard.ts）。這裡只需要「髒的」
// 這個性質，不需要一份語意完整的 session，所以用最小物件轉型塞進去——真要生一份完整的
// WhiteboardSession，測試就得跟著白板的內部資料結構一起演化，而這幾條測試根本不在乎那些。
function makeDirtySession(): WhiteboardSession {
  return { history: [{}, {}] } as unknown as WhiteboardSession;
}

// ⚠️ 掀開子清單一律走 fireEvent.click，不用 userEvent——這不是偷懶，是繞過 jsdom 的一個
// 硬限制，寫在這裡是為了讓下一個測 hover 型 UI 的人不用再花一小時查（#168 第一次踩到）。
//
// 成因：jsdom **沒有排版引擎**，所有元素的 getBoundingClientRect() 都是 0×0、
// elementFromPoint 也回不出東西。userEvent 的 pointer 系統會維護「游標現在停在哪個元素上」，
// 換目標時先在舊目標發 mouseout、再在新目標發 mouseover；但因為它在 jsdom 裡算不出新目標的
// 位置，那個 mouseout 的 relatedTarget 是 **null**。React 收到「離開了、而且不知道去哪」就
// 合成一個 mouseLeave 給 <nav>，NavRail 的 closeByHover 於是把整條側欄收掉——展開浮層連同
// 我們要點的那顆按鈕在點擊真正送達前就被卸載了，click 打在一個已經脫離 DOM 的節點上。
// 真實瀏覽器不會這樣：relatedTarget 會是新的那顆按鈕，它在 <nav> 裡面，nav 收不到 leave。
//
// 所以流程固定成：**用 fireEvent 把面板打開**（fireEvent 只派發那一顆 click，完全不碰
// 游標狀態），**再用 userEvent 做真正要驗的那一下互動**（那是這一串裡的第一次指標動作，
// 只會發 mouseover，不會誤觸 leave）。這樣既避開了限制，又保留 userEvent 在關鍵那一步的
// 真實性（focus、disabled/pointer-events 檢查、事件順序）。
function openSubmenu(which: "戰" | "出") {
  fireEvent.click(screen.getByTestId(`button-nav-rail-collapsed-${which}`));
}

function renderNavRail(props: Partial<{ active: "board" | "record" | "list" }> = {}) {
  return renderWithProviders(
    <>
      <NavRail
        matchId="1"
        backHref="/"
        active={props.active ?? "record"}
        captureCurrent={() => STUB_SNAPSHOT}
        captureLabel="測試用擷取說明"
      />
      {/* toast 是全域佇列 + 一個掛在 App 根部的 <Toaster /> 負責畫出來。要驗「點停用的格子
          會不會跳提示」，就得把那個出口也一起 render，不然 toast() 只是把訊息丟進佇列，
          畫面上什麼都不會出現、測試也就什麼都斷言不到。 */}
      <Toaster />
    </>,
  );
}

describe("NavRail 的初始渲染", () => {
  it("有 matchId 時：收合態五個入口都可互動，展開浮層還不存在", () => {
    renderNavRail();

    expect(screen.getByTestId("link-nav-rail-collapsed-比")).toBeInTheDocument();
    expect(screen.getByTestId("link-nav-rail-collapsed-計")).toBeInTheDocument();
    expect(screen.getByTestId("link-nav-rail-collapsed-數")).toBeInTheDocument();
    expect(screen.getByTestId("button-nav-rail-collapsed-戰")).toBeInTheDocument();
    expect(screen.getByTestId("button-nav-rail-collapsed-出")).toBeInTheDocument();
    // 展開是 hover/focus 才發生的暫時態，初始一定是收合的。
    expect(screen.queryByTestId("nav-rail-expanded-panel")).not.toBeInTheDocument();
  });

  it("active 入口套用強階選取態（#134 環 0 的色票）", () => {
    renderNavRail({ active: "record" });

    // 只確認「這一格拿到了強階選取態的視覺 token」，不逐一比對整串 class——
    // class 字串會因為排版工具或樣式微調而變動，釘死整串只是製造假警報。
    const active = screen.getByTestId("link-nav-rail-collapsed-計");
    expect(active.className).toContain("bg-[#c6f135]/15");
    expect(active.className).toContain("ring-[#c6f135]");
  });

  it("渲染當下不會呼叫 captureCurrent——擷取要等使用者走到「新增戰術」那一步才發生", () => {
    const captureCurrent = vi.fn(() => STUB_SNAPSHOT);
    renderWithProviders(
      <NavRail
        matchId="1"
        backHref="/"
        active="board"
        captureCurrent={captureCurrent}
        captureLabel="測試用擷取說明"
      />,
    );

    expect(captureCurrent).not.toHaveBeenCalled();
  });
});

describe("NavRail 沒有 matchId 時的停用態", () => {
  it("計/戰/出 灰掉但仍可點，點下去跳提示；數是常駐連結通往跨場紀錄本", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <NavRail backHref="/" active="list" />
        <Toaster />
      </>,
    );

    const record = screen.getByTestId("button-nav-rail-collapsed-計");
    expect(record).toHaveAttribute("aria-disabled", "true");
    // ⚠️ 這條是 #173 真正要守的那一行：停用態刻意**不能**用 HTML 的 disabled 屬性。
    // 瀏覽器對 disabled 的元素根本不派發滑鼠事件，onClick 永遠不會跑，也就跳不出下面那個
    // 提示——使用者只會看到一格點不動又不說為什麼的按鈕。舊寫法只能用 regex 去 HTML 字串裡
    // 撈有沒有 `disabled` 字樣，現在可以直接問這顆真實的 DOM 節點。
    expect(record).not.toBeDisabled();

    await user.click(record);
    expect(await screen.findByText("先選一場比賽")).toBeInTheDocument();

    // 「數」是唯一不套停用態的例外（PO 定案：數據分析＝隨時翻得開的紀錄本）。
    expect(screen.getByTestId("link-nav-rail-collapsed-數")).toHaveAttribute("href", "/analytics");
  });
});

describe("NavRail 的展開與子清單", () => {
  it("hover 進側欄就展開、移開就收合", async () => {
    const user = userEvent.setup();
    renderNavRail();

    await user.hover(screen.getByRole("navigation"));
    expect(screen.getByTestId("nav-rail-expanded-panel")).toBeInTheDocument();

    await user.unhover(screen.getByRole("navigation"));
    expect(screen.queryByTestId("nav-rail-expanded-panel")).not.toBeInTheDocument();
  });

  it("點「戰」展開側欄並掀開子清單，再點一次收起子清單（側欄仍開著）", () => {
    renderNavRail();

    // 這是觸控裝置唯一的路徑：平板沒有 hover，「戰」如果只靠滑鼠移過去才打開，
    // 在真實使用情境裡等於永遠打不開（TacticsRailMenu 退役前記下的教訓）。
    openSubmenu("戰");
    expect(screen.getByTestId("nav-rail-expanded-panel")).toBeInTheDocument();
    expect(screen.getByTestId("nav-rail-board-submenu")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-nav-rail-expanded-戰"));
    expect(screen.queryByTestId("nav-rail-board-submenu")).not.toBeInTheDocument();
    // 收的是子清單，不是整條側欄——toggleSubmenu 只碰 openSubmenu，expanded 由 hover/focus 管。
    expect(screen.getByTestId("nav-rail-expanded-panel")).toBeInTheDocument();
  });

  it("「戰」「出」的子清單互斥，同一時間只會掀開一個", () => {
    renderNavRail();

    openSubmenu("戰");
    expect(screen.getByTestId("nav-rail-board-submenu")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-nav-rail-expanded-出"));
    // SubmenuKey 這個「一次只有一個」的型別設計，實際跑起來就該是這個樣子。
    expect(screen.getByTestId("nav-rail-export-submenu")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-rail-board-submenu")).not.toBeInTheDocument();
  });

  it("這場還沒有已存戰術時，子清單顯示空狀態文字", () => {
    renderNavRail();

    openSubmenu("戰");
    expect(screen.getByText("尚無已儲存戰術")).toBeInTheDocument();
  });
});

describe("NavRail 選一筆已存戰術", () => {
  it("呼叫 loadProject 並導去戰術板頁", async () => {
    const user = userEvent.setup();
    mocks.tactics = [{ id: "t1", name: "接發球陣型", data: { foo: 1 } }];
    const loadProject = vi.fn();
    useTacticsBoard.setState({ loadProject });

    const { location } = renderNavRail();

    openSubmenu("戰");
    await user.click(screen.getByTestId("button-nav-rail-tactic-t1"));

    expect(loadProject).toHaveBeenCalledWith({ foo: 1 }, "t1", "接發球陣型");
    expect(location()).toBe("/matches/1/board");
  });

  it("戰術資料壞掉（loadProject 丟例外）時顯示載入失敗，而且不換頁", async () => {
    const user = userEvent.setup();
    mocks.tactics = [{ id: "t1", name: "壞掉的戰術", data: { nope: true } }];
    useTacticsBoard.setState({
      loadProject: () => {
        // 真實情況是 parseSavedTactic 的 zod 驗證失敗會 throw。
        throw new Error("bad payload");
      },
    });

    const { history } = renderNavRail();

    openSubmenu("戰");
    await user.click(screen.getByTestId("button-nav-rail-tactic-t1"));

    expect(await screen.findByText("載入失敗")).toBeInTheDocument();
    // 一筆壞資料不該把使用者丟到一個什麼都沒載到的戰術板頁——留在原地才對。
    expect(history).toEqual(["/"]);
  });

  it("有未儲存的 session 時先問過使用者，按取消就什麼都不做", async () => {
    const user = userEvent.setup();
    mocks.tactics = [{ id: "t1", name: "接發球陣型", data: { foo: 1 } }];
    const loadProject = vi.fn();
    useTacticsBoard.setState({ loadProject, session: makeDirtySession() });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const { history } = renderNavRail();

    openSubmenu("戰");
    await user.click(screen.getByTestId("button-nav-rail-tactic-t1"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(loadProject).not.toHaveBeenCalled();
    expect(history).toEqual(["/"]);
    confirmSpy.mockRestore();
  });
});

describe("NavRail 的「＋ 新增戰術」", () => {
  it("非戰術板頁：開全螢幕彈窗（Radix portal 的內容現在測得到了）", async () => {
    const user = userEvent.setup();
    renderNavRail({ active: "record" });

    openSubmenu("戰");
    await user.click(screen.getByTestId("button-nav-rail-new-tactic"));

    // 彈窗內容是 render 到 document.body 的 portal——screen 查的就是整個 document，
    // 所以查得到。這正是 #168 issue body 說「shadcn/ui 的彈窗類元件全部無法測試」的那一項。
    expect(screen.getByTestId("button-new-tactic-from-rotation")).toBeInTheDocument();
    expect(screen.getByText("測試用擷取說明")).toBeInTheDocument();
  });

  it("⚠️ 回歸測試（#120 的原始 bug）：這場本來就有未存 session，開彈窗再按 Esc 取消，不該被拉去戰術頁", async () => {
    const user = userEvent.setup();
    // 這正是當年出錯的前置狀態：使用者手上有一份編到一半的戰術。
    useTacticsBoard.setState({ session: makeDirtySession() });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const { history } = renderNavRail({ active: "record" });

    openSubmenu("戰");
    await user.click(screen.getByTestId("button-nav-rail-new-tactic"));
    expect(screen.getByTestId("button-new-tactic-blank")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    // 舊版的 bug：關閉彈窗時用「store 裡有沒有 session」反推使用者意圖，於是「按 Esc 取消」
    // 在這個前置狀態下被誤判成「剛開了新戰術」，人就被硬拉去戰術板頁。修法是讓彈窗用
    // onStarted 明確回報「我真的開了 session」——明確事件勝過從狀態反推意圖。
    expect(history).toEqual(["/"]);
    confirmSpy.mockRestore();
  });

  it("在戰術板頁：不開全螢幕彈窗，改掀 store 管的中央浮層（#177）", async () => {
    const user = userEvent.setup();
    renderNavRail({ active: "board" });

    openSubmenu("戰");
    await user.click(screen.getByTestId("button-nav-rail-new-tactic"));

    // 戰術板頁中央就有球場欄可以蓋，走的是另一條路：只翻旗標、彈窗由 TacticsBoard.tsx 畫。
    expect(useTacticsBoard.getState().newTacticOpen).toBe(true);
    expect(screen.queryByTestId("button-new-tactic-blank")).not.toBeInTheDocument();
  });
});
