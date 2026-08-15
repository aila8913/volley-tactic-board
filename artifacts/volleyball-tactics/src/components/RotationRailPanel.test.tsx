// 右欄站位面板的渲染規格。
//
// 測得動的原因跟 MatchDetailView.test.tsx 一樣：RotationRailPanel 刻意不 import 任何 store，
// 資料全由 props 決定（見該檔開頭 issue #117 的錨點決議），所以 renderToStaticMarkup 直接
// 餵假資料就渲染得出來。上半部（這一段）仍用 renderToStaticMarkup 驗「一次性的初始渲染長
// 什麼樣」——第七格的**推導規則**（被頂替者在前排 → L 在場外）就是純渲染的產物，這樣測最直接。
// 檔案下半部是 #168 引進 @testing-library/react 之後補的互動行為（stepper 邊界、點擊指派），
// 那些舊寫法一條都寫不出來；為什麼兩種寫法在同一個檔案裡並存，見下半部開頭的說明。
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RotationRailPanel from "./RotationRailPanel";
import type { MatchPlayer } from "@/types/match";
import type { LineupZones } from "@/types/scoresheet";

const ROSTER: MatchPlayer[] = [
  { id: "p1", name: "日向翔陽", number: 10, role: "MB", personId: null },
  { id: "p2", name: "影山飛雄", number: 9, role: "S", personId: null },
  { id: "p3", name: "西谷夕", number: 4, role: "L", personId: null },
];

// p1 在 1 號位（後排）、p2 在 4 號位（前排）——兩種位置各一個，第七格的兩種狀態才驗得到。
const LINEUP: LineupZones = { 1: "p1", 4: "p2" };

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

  it("⚠️ 自由球員一律列出來（#327）", () => {
    // 舊行為：清單預設濾掉 role "L"，要傳 includeLibero 才列得出來。那個開關把兩件事
    // 綁在一起——「誰排得進六個號位」（L 永遠不行）跟「這場有哪些球員」（L 當然算）。
    // #327 判定後者被前者連坐是 bug：計分頁跟戰術板的右欄清單裡完全看不到自由球員，
    // 教練連隊上有沒有 L 都看不出來。includeLibero 這個 prop 已經移除。
    const html = renderToStaticMarkup(
      <RotationRailPanel lineup={null} roster={ROSTER} rotation={0} />,
    );

    expect(html).toContain("西谷夕");
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

describe("RotationRailPanel 的自由球員先發格（#327）", () => {
  it("沒開 showLiberoCell 就完全不渲染（分析頁/舊呼叫端畫面不變）", () => {
    const html = renderToStaticMarkup(
      <RotationRailPanel lineup={LINEUP} roster={ROSTER} rotation={0} />,
    );

    expect(html).not.toContain("libero-slot");
    expect(html).not.toContain("自由球員先發");
  });

  it("還沒指定先發 L：顯示「未指派」", () => {
    const html = renderToStaticMarkup(
      <RotationRailPanel lineup={LINEUP} roster={ROSTER} rotation={0} showLiberoCell />,
    );

    expect(html).toContain("libero-slot");
    expect(html).toContain("自由球員先發：未指派");
  });

  it("指定了 L 但還沒指定頂替對象：顯示他，並說明還沒上場", () => {
    const html = renderToStaticMarkup(
      <RotationRailPanel
        lineup={LINEUP}
        roster={ROSTER}
        rotation={0}
        showLiberoCell
        liberoId="p3"
      />,
    );

    expect(html).toContain("西谷夕");
    expect(html).toContain("尚未指定頂替對象");
  });

  it("頂替一個站後排的人：第七格說「頂替 10」，那一格也直接顯示成 L", () => {
    const html = renderToStaticMarkup(
      <RotationRailPanel
        lineup={LINEUP}
        roster={ROSTER}
        rotation={0}
        showLiberoCell
        liberoId="p3"
        liberoReplacesPlayerId="p1"
      />,
    );

    expect(html).toContain("頂替 10");
    // 格子顯示的是**場上實際站著的人**（L），被蓋住的格主縮小標在旁邊。
    // ⚠️ #425 之後這個 prop 在**可編輯**狀態下恆為 null（賽前不再指定頂替對象），所以這一節
    // 幾條測的其實是**唯讀**那條路：計分頁看歷史局時，第七格讀的是該局封存快照裡的
    // replacesPlayerId（#359），那份資料可以有值，畫面就必須畫得出來。
    expect(html).toContain("西谷夕".slice(0, 3));
    expect(html).toContain("L 頂 ");
  });

  it("⚠️ 頂替的人站前排 → 第七格說「場外」（#326 的核心規則，這裡是它唯一看得見的樣子）", () => {
    // p2 在 4 號位（前排）。L 頂替他，代表「等他轉到後排我再上」——現在人不在場上。
    // 這不是錯誤狀態，也不需要任何清理邏輯：它就是 lineup + 頂替對象推導出來的結果。
    const html = renderToStaticMarkup(
      <RotationRailPanel
        lineup={LINEUP}
        roster={ROSTER}
        rotation={0}
        showLiberoCell
        liberoId="p3"
        liberoReplacesPlayerId="p2"
      />,
    );

    expect(html).toContain("場外");
    expect(html).toContain("9 號");
    // 前排那一格不能被 L 蓋掉——L 不在場上，格子就還是格主自己的。
    expect(html).not.toContain("L 頂 ");
  });

  it("先發還沒排出來時，「場外」要講對原因（實測抓到的錯誤文案）", () => {
    // 戰術板只在滿 6 人時才把 lineup 傳進來（否則傳 null），所以「有頂替對象、但這份
    // 先發裡找不到他」是天天會發生的狀態。第一版把它跟「他在前排」合成同一句，於是
    // 戰術板右欄會在先發只排了一個人的時候宣稱「1 號在前排」——那句話是憑空捏的。
    const html = renderToStaticMarkup(
      <RotationRailPanel
        lineup={null}
        roster={ROSTER}
        rotation={0}
        showLiberoCell
        liberoId="p3"
        liberoReplacesPlayerId="p1"
      />,
    );

    expect(html).toContain("不在這份先發裡");
    expect(html).not.toContain("在前排");
  });

  it("唯讀（戰術板）：看得到狀態，但沒有任何可以改它的控制項", () => {
    const html = renderToStaticMarkup(
      <RotationRailPanel
        lineup={LINEUP}
        roster={ROSTER}
        rotation={0}
        readOnly
        showLiberoCell
        liberoId="p3"
        liberoReplacesPlayerId="p1"
      />,
    );

    expect(html).toContain("頂替 10");
    // readOnly 時六個號位是 div、第七格也是 div，整個面板一顆 button 都不該有
    // （ADR-0001：戰術板不從右欄改先發，自由球員適用同一條）。
    expect(html.split("<button").length - 1).toBe(0);
  });
});

// ── 互動行為（issue #168 引進 @testing-library/react 之後才寫得出來的部分）──
//
// 上面那些用 renderToStaticMarkup 的測試刻意留著不改寫：它們驗的**就是**純渲染的推導結果
//（給定 lineup + 頂替對象，第七格該說什麼），沒有任何「點下去之後」的成分，換成 RTL 只會
// 讓同樣的斷言變長。下面這一段則是舊寫法一條都寫不出來的：stepper 的邊界、點格子選號位、
// 唯讀時整組互動不存在——全都要等第一次 render 之後、使用者動手才看得到。
describe("RotationRailPanel 的局／輪 stepper", () => {
  it("按上／下回報方向給呼叫端（元件自己不算新的局數）", async () => {
    const user = userEvent.setup();
    const onStep = vi.fn();
    render(
      <RotationRailPanel lineup={LINEUP} roster={ROSTER} rotation={1} axis="set" onStep={onStep} />,
    );

    await user.click(screen.getByRole("button", { name: "上一局" }));
    expect(onStep).toHaveBeenCalledWith(-1);

    await user.click(screen.getByRole("button", { name: "下一局" }));
    expect(onStep).toHaveBeenLastCalledWith(1);
    // 元件只回報方向：「第 2 局往前是第 1 局」這種算術是呼叫端的事（局是線性有邊界的，
    // 輪是環狀的 mod 6，同一顆 stepper 服務兩種軸，內建任何一種都會弄錯另一種）。
    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it("⚠️ 到邊界時那一顆真的按不動（#174 的 stepper 邊界）", async () => {
    const user = userEvent.setup();
    const onStep = vi.fn();
    render(
      <RotationRailPanel
        lineup={LINEUP}
        roster={ROSTER}
        rotation={0}
        axis="set"
        onStep={onStep}
        canStepPrev={false}
        canStepNext
      />,
    );

    const prev = screen.getByRole("button", { name: "上一局" });
    // 這裡用的是 HTML 的 disabled（跟 NavRail 停用態刻意不用 disabled 相反）：那邊需要點得到
    // 才跳得出「先選一場比賽」的提示，這邊沒有話要說，第 1 局往前就是不存在。
    expect(prev).toBeDisabled();
    await user.click(prev);
    expect(onStep).not.toHaveBeenCalled();

    expect(screen.getByRole("button", { name: "下一局" })).toBeEnabled();
  });

  it("沒傳 onStep 就完全不渲染 stepper（純資訊模式）", () => {
    render(<RotationRailPanel lineup={LINEUP} roster={ROSTER} rotation={0} axis="set" />);

    expect(screen.queryByRole("button", { name: "上一局" })).not.toBeInTheDocument();
    // 改用純文字顯示「第 1 局」，看戲的人不會誤以為這裡能點。
    expect(screen.getByText(/第 1/)).toBeInTheDocument();
  });
});

describe("RotationRailPanel 的點擊指派（先選號位、再點球員）", () => {
  it("點空的號位再點球員，整份新快照交回呼叫端", async () => {
    const user = userEvent.setup();
    const onLineupChange = vi.fn();
    // 這個測試需要一個「還沒站上任何號位」的候補。ROSTER 裡唯一沒排進 LINEUP 的是 p3，
    // 但他是自由球員——沒開 showLiberoCell 時他那一列是不可點的 div（L 不佔輪轉序，
    // 不能用點擊指派塞進六個號位裡），所以另外加一個普通球員當候補。
    const roster: MatchPlayer[] = [
      ...ROSTER,
      { id: "p4", name: "月島螢", number: 11, role: "MB", personId: null },
    ];
    render(
      <RotationRailPanel
        lineup={LINEUP}
        roster={roster}
        rotation={0}
        onLineupChange={onLineupChange}
      />,
    );

    await user.click(screen.getByTestId("rotation-zone-2"));
    await user.click(screen.getByRole("button", { name: /月島螢/ }));

    // 交出去的是**整份**快照而不是「2 號位變成 p4」這種增量——呼叫端（右欄/計分頁）
    // 拿到就直接存，不用自己合併，也就不會有人合併錯。
    expect(onLineupChange).toHaveBeenCalledWith({ 1: "p1", 4: "p2", 2: "p4" });
  });

  it("指派一個已經站在別格的人 → 兩人互換，不會有人憑空消失", async () => {
    const user = userEvent.setup();
    const onLineupChange = vi.fn();
    render(
      <RotationRailPanel
        lineup={LINEUP}
        roster={ROSTER}
        rotation={0}
        onLineupChange={onLineupChange}
      />,
    );

    // p2 現在在 4 號位。把他指派到 p1 所在的 1 號位——這種情況只有互換是合理的，
    // 覆蓋掉會讓 p1 無聲無息從先發裡消失（教練排到一半少一個人，還不知道少在哪）。
    await user.click(screen.getByTestId("rotation-zone-1"));
    await user.click(screen.getByRole("button", { name: /影山飛雄/ }));

    expect(onLineupChange).toHaveBeenCalledWith({ 1: "p2", 4: "p1" });
  });

  it("還沒選號位就點球員：什麼都不會發生", async () => {
    const user = userEvent.setup();
    const onLineupChange = vi.fn();
    render(
      <RotationRailPanel
        lineup={LINEUP}
        roster={ROSTER}
        rotation={0}
        onLineupChange={onLineupChange}
      />,
    );

    const row = screen.getByRole("button", { name: /日向翔陽/ });
    // 這一列刻意**不是** disabled，因為「直接把人拖上場」那條路不需要先選號位——
    // disabled 會連 draggable 一起廢掉。所以防呆在 assignToSelectedZone 開頭，不在 DOM 上。
    expect(row).toHaveAttribute("aria-disabled", "true");
    await user.click(row);

    expect(onLineupChange).not.toHaveBeenCalled();
  });

  it("唯讀時號位格子根本不是按鈕（ADR-0001：不從右欄改先發）", () => {
    render(<RotationRailPanel lineup={LINEUP} roster={ROSTER} rotation={0} readOnly />);

    expect(screen.getByTestId("rotation-zone-1").tagName).toBe("DIV");
    // 球員清單那幾列在唯讀模式下也是 div——整個面板一顆 button 都沒有。
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("自由球員的拖曳去處（#425：賽前只記「誰是先發 L」）", () => {
  // jsdom 沒有實作 HTML5 drag-and-drop，所以手刻一個最小的假 DataTransfer：只要 getData
  // 回得出被拖的 playerId 就夠了（跟 Court.test.tsx / PositionPalette.test.tsx 同一招）。
  const dropPlayer = (target: HTMLElement, playerId: string) =>
    fireEvent.drop(target, { dataTransfer: { getData: () => playerId } });

  const renderPanel = (onLineupChange: () => void, onLiberoChange: () => void) =>
    render(
      <RotationRailPanel
        lineup={LINEUP}
        roster={ROSTER}
        rotation={0}
        showLiberoCell
        onLineupChange={onLineupChange}
        onLiberoChange={onLiberoChange}
      />,
    );

  it("⚠️ 行為變更：把 L 拖到六個號位裡的任何一格，什麼都不會發生", () => {
    // 舊行為（#326／#327）：這個手勢＝「L 頂替站在這一格的那個人」，格子只是使用者指到
    // 那個人的方式。PO 2026-08-15 決定賽前不記頂替對象——先發六人本來就不含自由球員，
    // 賽前該回答的只有「先發 L 是誰」；他頂替誰要等比賽中真的換上場才成立（計分頁的
    // liberoSubstitution）。賽前先寫下來的那個值會被凍進該局先發快照，讀起來像紀錄、
    // 其實只是計畫，跟 #326 刪掉「接替啟發式」是同一個理由。
    const onLineupChange = vi.fn();
    const onLiberoChange = vi.fn();
    renderPanel(onLineupChange, onLiberoChange);

    // 1 號位站著 p1（後排），在舊行為下這是最典型的「L 頂替他」手勢。
    dropPlayer(screen.getByTestId("rotation-zone-1"), "p3");

    expect(onLiberoChange).not.toHaveBeenCalled();
    // 也不可以退而求其次把 L 塞進那六格——L 不佔輪轉序，這不是「頂替不成就當成排位」。
    expect(onLineupChange).not.toHaveBeenCalled();
  });

  it("第七格仍然收得到他：拖進去＝指定先發 L", () => {
    const onLineupChange = vi.fn();
    const onLiberoChange = vi.fn();
    renderPanel(onLineupChange, onLiberoChange);

    dropPlayer(screen.getByTestId("libero-slot"), "p3");

    // 只交出一個值。這個回呼以前收兩個參數（誰 ＋ 他頂替誰），#425 之後賽前沒有第二件事
    // 可講，型別上就交不出頂替對象了——那正是「乾淨」的意思：講不出來的東西不留位子。
    expect(onLiberoChange).toHaveBeenCalledWith("p3");
  });
});
