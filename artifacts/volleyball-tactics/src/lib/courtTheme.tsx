// 球場材質共用來源 — v4（2026-08-07，對齊 Claude Design 的
// explorations/court-material-v4.html，該檔案是直接翻譯 templates/tactics-board 模板
// TacticsBoard.dc.html 裡球場那一塊，不是重新發明一套配色）。
//
// 戰術板（components/Court.tsx）跟計分表（components/ScoreSheetCourt.tsx）是兩個「結構不同、
// 但外觀要一致」的球場——戰術板的 SVG 有 L 備位側欄、自由站位、動態 viewBox；計分表是固定
// 100×200 的簡化版。結構沒辦法整個共用，但「材質」（線條顏色、球網）可以：兩邊都從這個檔案讀
// 同一組值，改這裡兩邊自動一起變，不會再發生「一邊調了顏色、另一邊忘了跟」的漂移。
// 座標系跟 lib/courtGeometry.ts 一樣完全沒動：viewBox 0 0 100 200，網在 y=100，我方在下半場。
//
// v4 跟 v2/v3 最大的差異，是模板球場的三個關鍵事實（之前都是憑印象猜配色，猜錯過）：
//   1. 球場本身「沒有底色」。只是一條 1.5px、55% 不透明度的白框（COURT_BORDER_WIDTH／
//      COURT_BORDER_OPACITY）。畫面看起來深，是因為透出頁面底色 #050603，不是球場自己塗黑
//      的——原本 v2 的深青漸層、v3 的近黑漸層（COURT_GRADIENT_STOPS）整組拿掉，CourtSurface
//      只留一顆透明矩形給拖曳/點擊空白處的命中判斷用。
//   2. 所有「材質感」（漸層卡片、模糊、光暈）都在外層玻璃卡上（.court-glass、
//      .court-edge-light，見 index.css 與 design-spec.md 第 4／5 節），不在球場 SVG 裡——
//      這個檔案只管線條，不管卡片本身。
//   3. 網＝白色網格帶＋中間一條 lime 發光線（三層 <line> 疊出來的柔光）。網帶維持 v2 定案的
//      厚度（11 單位、4 單位一格網紋），發光線是模板加上去的。網帶跟發光線左右各溢出 4 單位
//      （NET_OVERHANG）壓過球場外框，對應模板的 top:-14px / bottom:-14px。
// 攻擊線也從虛線改成實線——模板本身沒有虛線這回事，v2/v3 的虛線是自己加的，這次拿掉。

export const COURT_LINE_COLOR = "#F5F5F0";
// 外框：1.5px、55% 不透明度。
export const COURT_BORDER_OPACITY = 0.55;
export const COURT_BORDER_WIDTH = 1.5;
// 攻擊線：1px、34% 不透明度。
export const COURT_ATTACK_LINE_OPACITY = 0.34;

export const COURT_NET_COLOR = "#C6F135";
// 網帶（沿用 v2 定案的厚度，未變）：y 94.5~105.5，對 y=100（球網位置）對稱。
const NET_TOP = 94.5;
const NET_H = 11;
// 網帶與發光線左右溢出量，對應模板的 -14px。
const NET_OVERHANG = 4;

// 網面網格 pattern（<defs> 裡的 <pattern>）。id 由呼叫端傳入——同一頁如果兩個球場都掛，
// 用同一個 id 會互搶，所以「長什麼樣」共用，id 各自取。要跟 <CourtLines id=.../> 傳的
// id 一致，網面 pattern 是從這裡定義、那邊引用。
export function CourtGradientDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-net-mesh`} width="4" height="4" patternUnits="userSpaceOnUse">
        <path
          d="M0 0H4M0 0V4"
          stroke={COURT_LINE_COLOR}
          strokeOpacity="0.5"
          strokeWidth="0.55"
          fill="none"
        />
      </pattern>
    </defs>
  );
}

// 球場底：只有一顆透明矩形，不畫任何填色。id="court-bg" 保留給拖曳/點擊空白處的命中判斷用
// （fill="transparent" 仍會收到 pointer events，fill="none" 不會——不要改成 none）。
export function CourtSurface() {
  return <rect id="court-bg" x="0" y="0" width="100" height="200" fill="transparent" />;
}

// 球場外框。vectorEffect="non-scaling-stroke"：戰術板的 SVG 用 preserveAspectRatio="none"，
// viewBox 寬高會依 panel/wrapper 形狀各自獨立縮放，框線粗細不加這個屬性會被非等比壓扁
// ——尤其面板偏窄長時，垂直方向縮放比例較小，下緣那條水平線會顯得特別細。
export function CourtBorder() {
  return (
    <rect
      id="court-border"
      x="0"
      y="0"
      width="100"
      height="200"
      fill="none"
      stroke={COURT_LINE_COLOR}
      strokeOpacity={COURT_BORDER_OPACITY}
      strokeWidth={COURT_BORDER_WIDTH}
      vectorEffect="non-scaling-stroke"
      rx="3"
    />
  );
}

// 兩條 3 米攻擊線 ＋ 球網（網格帶 + 發光線）。id 要跟 <CourtGradientDefs id=.../> 一致，
// 網面 pattern 從那裡來。
//
// 座標數字的來源：viewBox 高 200，代表整片球場（含我方＋對方兩個半場）合起來是 18 公尺
// 長，每半場 100 個 SVG 單位＝9 公尺。排球規則的 3 米攻擊線量到球網為止是 3 公尺，換算成
// SVG 單位就是 100 * (3/9) ≈ 33.3——中線在 y=100，所以兩條攻擊線分別落在
// 100-33.3=66.7（對方那側）跟 100+33.3=133.3（我方這側）。
export function CourtLines({ id = "court-gradient" }: { id?: string }) {
  const x1 = -NET_OVERHANG;
  const x2 = 100 + NET_OVERHANG;
  return (
    <g>
      <line
        x1="0"
        y1="66.7"
        x2="100"
        y2="66.7"
        stroke={COURT_LINE_COLOR}
        strokeOpacity={COURT_ATTACK_LINE_OPACITY}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="0"
        y1="133.3"
        x2="100"
        y2="133.3"
        stroke={COURT_LINE_COLOR}
        strokeOpacity={COURT_ATTACK_LINE_OPACITY}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {/* 球網：網格帶（用上面 CourtGradientDefs 定義的 mesh pattern）＋三層疊起來的
          發光線——最寬那層負責外圍柔光，中間層加強核心亮度，最細那層是實線的網頂。 */}
      <g id="court-net">
        <rect
          x={x1}
          y={NET_TOP}
          width={x2 - x1}
          height={NET_H}
          fill={`url(#${id}-net-mesh)`}
          opacity={0.5}
        />
        <line
          x1={x1}
          y1="100"
          x2={x2}
          y2="100"
          stroke={COURT_NET_COLOR}
          strokeOpacity={0.1}
          strokeWidth="11"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={x1}
          y1="100"
          x2={x2}
          y2="100"
          stroke={COURT_NET_COLOR}
          strokeOpacity={0.22}
          strokeWidth="5"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={x1}
          y1="100"
          x2={x2}
          y2="100"
          stroke={COURT_NET_COLOR}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </g>
  );
}
