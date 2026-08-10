// 右欄站位面板的渲染規格。
//
// 測得動的原因跟 MatchDetailView.test.tsx 一樣：RotationRailPanel 刻意不 import 任何 store，
// 資料全由 props 決定（見該檔開頭 issue #117 的錨點決議），所以 renderToStaticMarkup 直接
// 餵假資料就渲染得出來。這個專案還沒有 @testing-library/react（issue #168），所以這裡只驗
// 「一次性的初始渲染長什麼樣」，不驗點擊/拖曳之後的行為——這也是為什麼第七格的**推導規則**
// （被頂替者在前排 → L 在場外）值得在這裡釘一次：它是純渲染的產物，剛好測得到。
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RotationRailPanel from "./RotationRailPanel";
import type { MatchPlayer } from "@/types/match";
import type { LineupSnapshot } from "@/types/scoresheet";

const ROSTER: MatchPlayer[] = [
  { id: "p1", name: "日向翔陽", number: 10, role: "MB", personId: null },
  { id: "p2", name: "影山飛雄", number: 9, role: "S", personId: null },
  { id: "p3", name: "西谷夕", number: 4, role: "L", personId: null },
];

// p1 在 1 號位（後排）、p2 在 4 號位（前排）——兩種位置各一個，第七格的兩種狀態才驗得到。
const LINEUP: LineupSnapshot = { 1: "p1", 4: "p2" };

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
    // 格子顯示的是**場上實際站著的人**（L），被蓋住的格主縮小標在旁邊。這是教練唯一
    // 能確認「我剛剛設的頂替有沒有生效」的視覺回饋。
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
