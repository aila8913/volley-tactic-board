// 球場材質共用來源（issue #131 收尾／使用者要求「兩個球場外觀連動」）。
//
// 戰術板（components/Court.tsx）跟計分表（components/ScoreSheetCourt.tsx）是兩個「結構不同、
// 但外觀要一致」的球場——戰術板的 SVG 有 L 備位側欄、自由站位、動態 viewBox；計分表是固定
// 100×200 的簡化版。結構沒辦法整個共用，但「材質」（底色漸層、線條顏色）可以：兩邊都從這個
// 檔案讀同一組值，改這裡兩邊自動一起變，不會再發生「一邊調了顏色、另一邊忘了跟」的漂移。
//
// 毛玻璃地板（.court-glass）跟邊緣繞行光（.court-edge-light）是另一半材質，它們住在 index.css
// ——CSS class 天生就是共用的，任何球場只要掛上那兩個 class 就有同樣的效果，不需要再抽一次。
// 見 docs/design-spec.md 第 5 節（球場畫布）＋第 4 節（Glassmorphism）。

// 球場底色深青漸層（design-spec.md 第 5 節，2026-07-15 定案的方案 B）。stopOpacity 不是 100%：
// 毛玻璃地板要讓 wrapper 後面被模糊的背景透一點出來，底色全不透明的話毛玻璃等於白做。
export const COURT_GRADIENT_STOPS = [
  { offset: "0%", color: "#12403f", opacity: 0.42 },
  { offset: "50%", color: "#1c5654", opacity: 0.38 },
  { offset: "100%", color: "#2a6e6a", opacity: 0.42 },
] as const;

// 球場外框線、球網、攻擊線、「對手/我方」字：統一用米白半透明（原本黑色 #111 在深色球場上
// 會看不到，見 design-spec.md 第 5 節「實作決定」）。
export const COURT_LINE_COLOR = "#F5F5F0";
export const COURT_LINE_OPACITY = 0.6;

// 共用的球場底色漸層 <defs>。兩個球場各自有不同的 gradient id（同一頁若兩個 SVG 用同一個 id
// 會互搶），所以 id 由呼叫端傳入，只有「長什麼樣」共用。
export function CourtGradientDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        {COURT_GRADIENT_STOPS.map((stop) => (
          <stop
            key={stop.offset}
            offset={stop.offset}
            stopColor={stop.color}
            stopOpacity={stop.opacity}
          />
        ))}
      </linearGradient>
    </defs>
  );
}
