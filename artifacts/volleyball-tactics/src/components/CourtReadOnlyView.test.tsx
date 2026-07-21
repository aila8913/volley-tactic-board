import { describe, it, expect } from "vitest";
// 專案目前沒裝 @testing-library/react，元件測試改用 react-dom/server 的
// renderToStaticMarkup 把元件轉成 HTML 字串，再用字串比對斷言——不需要真的掛進
// jsdom DOM 樹，對這種「純展示、沒有互動」的元件來說最省事，也不用新增測試依賴。
// vitest.config.ts 已掛 @vitejs/plugin-react（見該檔案註解），JSX 走 automatic
// runtime，不需要手動 import React。
import { renderToStaticMarkup } from "react-dom/server";
import CourtReadOnlyView from "./CourtReadOnlyView";
import type { MatchPlayer } from "@/types/match";
import type { PlayerPosition } from "@/types/rotationTable";

// 6 個號位的座標，抄自 rotationLogic.ts 的 zoneCoords（前排 y=0.6、後排 y=0.85），
// 這裡不 import 那個常數，是為了讓這份測試不會因為 rotationLogic 內部改了座標系
// 而跟著誤判——這個元件唯一該關心的是「收到 positions/roster 就照著畫」，跟站位
// 座標從哪套公式算出來的無關（呼應元件本身「純展示、不碰業務邏輯」的定位）。
const SIX_POSITIONS: PlayerPosition[] = [
  { playerId: "p1", x: 0.83, y: 0.85 },
  { playerId: "p2", x: 0.83, y: 0.6 },
  { playerId: "p3", x: 0.5, y: 0.6 },
  { playerId: "p4", x: 0.17, y: 0.6 },
  { playerId: "p5", x: 0.17, y: 0.85 },
  { playerId: "libero", x: 0.5, y: 0.85 },
];

const ROSTER: MatchPlayer[] = [
  { id: "p1", name: "王小明", number: 1, role: "S" },
  { id: "p2", name: "陳大文", number: 2, role: "OH" },
  { id: "p3", name: "李四", number: 3, role: "MB" },
  { id: "p4", name: "張三", number: 4, role: "OH" },
  { id: "p5", name: "林五", number: 5, role: "OPP" },
  { id: "libero", name: "自由人", number: 9, role: "L" },
];

describe("CourtReadOnlyView", () => {
  it("六人都渲染出來，各自帶對應背號", () => {
    const html = renderToStaticMarkup(
      <CourtReadOnlyView positions={SIX_POSITIONS} roster={ROSTER} />,
    );
    for (const player of ROSTER) {
      expect(html).toContain(`data-testid="court-readonly-player-${player.id}"`);
      expect(html).toContain(`>${player.number}<`);
    }
  });

  it("positions 為空時顯示 placeholder，不會丟出任何球員圈圈", () => {
    const html = renderToStaticMarkup(<CourtReadOnlyView positions={[]} roster={ROSTER} />);
    expect(html).toContain("尚未排先發");
    expect(html).not.toContain("court-readonly-player-");
  });

  it("自由球員套用珊瑚紅、一般球員套用萊姆綠，兩者顏色不同", () => {
    const html = renderToStaticMarkup(
      <CourtReadOnlyView positions={SIX_POSITIONS} roster={ROSTER} />,
    );
    // 自由球員（role "L"）的圓圈要出現珊瑚紅 fill；一般球員要出現萊姆綠 fill。
    // 用「兩種顏色都存在於輸出裡」而不是精算每個 circle 的 fill 屬性順序，避免測試
    // 綁死在 SVG 屬性的字串排列方式（React 渲染屬性順序可能因版本調整）。
    expect(html).toContain("#EF4444");
    expect(html).toContain("#C6F135");
  });

  it("roster 裡找不到對應球員的站位（幽靈站位）直接跳過，不會丟出例外", () => {
    const positionsWithGhost: PlayerPosition[] = [
      ...SIX_POSITIONS,
      { playerId: "ghost", x: 0.5, y: 0.6 },
    ];
    expect(() =>
      renderToStaticMarkup(<CourtReadOnlyView positions={positionsWithGhost} roster={ROSTER} />),
    ).not.toThrow();
  });
});
