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

// 球場底色（2026-07-27 改成單一平色，取代原本三段深青漸層——使用者拿 Artifact 比較過
// 平色／保留漸層兩版，都覺得不錯，決定先上平色，漸層版留到 #220 之後再討論要不要換）。
// 三個 stop 顏色相同、只是同一份 <linearGradient> 機制沿用（呼叫端還是走
// CourtGradientDefs），opacity 保留原本三段的些微差異——毛玻璃地板要讓 wrapper 後面被
// 模糊的背景透一點出來，底色全不透明的話毛玻璃等於白做，這個理由色相怎麼換都還成立。
export const COURT_GRADIENT_STOPS = [
  { offset: "0%", color: "#1B6E62", opacity: 0.42 },
  { offset: "50%", color: "#1B6E62", opacity: 0.38 },
  { offset: "100%", color: "#1B6E62", opacity: 0.42 },
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

// 球網中線＋兩條 3 米攻擊線（issue #227）：戰術板（Court.tsx）跟計分表
// （ScoreSheetCourt.tsx）原本各自手刻一份一模一樣的 <line> 標記，數字改一次要
// 兩邊一起改。收斂到這裡之後，兩個球場共用同一份 markup，材質（顏色/透明度）
// 也自然統一走上面的 COURT_LINE_COLOR / COURT_LINE_OPACITY，不會再各自寫死顏色。
//
// 座標數字的來源：viewBox 高 200，代表整片球場（含我方＋對方兩個半場）合起來是
// 18 公尺長，每半場 100 個 SVG 單位＝9 公尺。排球規則的 3 米攻擊線量到球網為止是
// 3 公尺，換算成 SVG 單位就是 100 * (3/9) ≈ 33.3——中線在 y=100，所以兩條攻擊線
// 分別落在 100-33.3=66.7（對方那側）跟 100+33.3=133.3（我方這側）。
export function CourtLines() {
  return (
    <g>
      {/* 中線（球網位置）：x 從 0 到 100 貼齊球場左右邊界。 */}
      <line
        x1="0"
        y1="100"
        x2="100"
        y2="100"
        stroke={COURT_LINE_COLOR}
        strokeOpacity={COURT_LINE_OPACITY}
        strokeWidth="2.5"
      />
      {/* 3 米攻擊線：虛線、比中線細，兩側各一條。 */}
      <line
        x1="0"
        y1="66.7"
        x2="100"
        y2="66.7"
        stroke={COURT_LINE_COLOR}
        strokeOpacity={COURT_LINE_OPACITY}
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <line
        x1="0"
        y1="133.3"
        x2="100"
        y2="133.3"
        stroke={COURT_LINE_COLOR}
        strokeOpacity={COURT_LINE_OPACITY}
        strokeWidth="1"
        strokeDasharray="3 3"
      />
    </g>
  );
}
