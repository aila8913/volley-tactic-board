// 球場上球員圈的共用視覺。原本這份 SVG 標記各寫一份在 PlayerNode.tsx（戰術板）跟
// ScoreSheetCourt.tsx（計分表）——兩邊視覺一樣但程式碼各自維護，改一邊忘記改另一邊
// 就會不同步。抽成這個純展示元件後，兩邊只負責「算出這個人現在該用什麼顏色/要不要
// 強調」，圓圈本身長什麼樣只有這裡一份。
//
// 2026-08-07：對齊 Claude Design 的 PlayerMarker 元件卡（components/PlayerMarker/card.html），
// 這次是視覺準則本身換了，不是照抄那張卡的 HTML/CSS——那張卡是 div+span 的一般 DOM 元件，
// 這裡仍是畫進球場 <svg> 的 circle+text，兩者渲染技術不同，但下面這幾個決定改成跟卡片一致：
//   - 邊框寬度固定 1.5（不再依 emphasized 從 1.2 長到 2）、圈本身也不再因為 emphasized 放大
//     半徑——「這個人現在特別重要」現在純靠發光表達，呼叫端如果真的要連圓圈一起放大
//     （例如發球中的球員），自己傳更大的 radius，元件不再暗自疊加。
//   - 背號字體從 font-sans 粗體換成 font-numeric（跟 --font-score 一樣是「數字展示」
//     語彙，而不是一般內文字重），非實色填滿時背號顏色也跟著邊框色走（不再永遠白色）。
//   - 自由球員除了原本「反轉填色」，圈角再疊一顆深底小圓「L」徽章——之前只靠填色區分，
//     卡片版本明確加了文字徽章，辨識度更高。
//   - 姓名改用 --sage（卡片裡「meta 資訊」慣用的顏色），不再是半透明米白。
//
// 只管畫，不管互動——拖曳、點擊、右鍵這些行為留在呼叫端的 <g onPointerDown=...> 包起來，
// 這裡只回傳要放進那個 <g> 裡的 SVG 內容，呼叫端自己決定要不要再疊加選取環、發球圖示、
// 換人提示這類「這個情境才有」的裝飾。
interface PlayerMarkerProps {
  number: number;
  name: string;
  // 邊框色＝目前唯一的狀態指示（前排/後排/自由球員/備位…），語意由呼叫端決定，
  // 這裡只負責畫出來。
  color: string;
  radius?: number;
  // 強調態（戰術板：被選取；計分表：目前發球）共用同一套發光處理，讓兩邊「這個人
  // 現在特別重要」的視覺語言一致。
  emphasized?: boolean;
  // 發光的模糊半徑，只有 emphasized 時有意義。預設 3（原始值）——白色/萊姆綠/橘色這些
  // 有色相的顏色在這個模糊半徑下讀起來是柔光，效果一直都好；但同樣的數字套在紅色上
  // （計分頁對手發球圈）反而太誇張，紅色改用 0.75。不同顏色需要不同模糊半徑才「看起來
  // 舒服」是實機比較出來的結論，不是同一個數字打天下，所以開一個 prop 讓呼叫端各自決定，
  // 不在這裡用 color 硬猜該套多少（那樣以後多一種顏色又要回來改這個元件）。
  glowBlur?: number;
  // 自由球員定案配色（2026-08-04）：其他狀態都是「深色玻璃底＋這個顏色描邊」，但自由
  // 球員要反過來——「這個顏色實色填滿＋深色描邊」，跟計分表 ScoreSheetCourt.tsx 自由球員鈕
  // 最後定案的樣式一致（見那邊的配色說明）。true 時 fill/stroke 對調、圈角再加「L」徽章；
  // 預設 false 維持其他狀態原本的樣子，不影響既有呼叫端。
  solidFill?: boolean;
  // #372 決策②：位置調色盤拖出來的「匿名球員」沒有真背號，SnapshotPlayer.number 固定填 0
  // （見 Court.tsx handleDrop）。圈裡如果照舊印 `number`，畫面上會是一個看起來煞有介事的
  // 「0 號」，容易被誤讀成「這是背號 0 的球員」而不是「這是一個位置代表」。circleText
  // 存在時整顆蓋過 number 的顯示（呼叫端會傳角色代碼，例如 "OH"），不傳就是原本行為——
  // 真球員完全不受影響。刻意不新增/更動 `number` 欄位本身的型別（它仍然乘載「真的背號
  // 是幾號」這個語意，只是顯示層可以選擇不畫出來），這樣任何拿 number 做計算/比對的既有
  // 邏輯都不用改，改動收斂在渲染層。
  circleText?: string;
}

export default function PlayerMarker({
  number,
  name,
  color,
  radius = 6,
  emphasized = false,
  glowBlur = 3,
  solidFill = false,
  circleText,
}: PlayerMarkerProps) {
  // 背號在圈「裡面」，solidFill 時圈是飽和實色，背號要跟著換深色才有對比；非實色時
  // 背號直接用邊框色（卡片版本的決定：不再永遠白色，讓數字也是狀態指示的一部分）。
  const numberColor = solidFill ? "#0a0b07" : color;
  // 邊框寬度：DS 卡片是固定 1.5 CSS px 套在 34px（半徑 17）的圓上，等於「邊框:半徑」
  // 8.8% 這個比例——上一版直接把 1.5 當成 SVG 單位寫死，結果套在我們半徑 6 的球場座標
  // 系（court viewBox 是 100x200，實際畫面上會被放大好幾倍）上看起來遠比 DS 卡片粗。
  // 改成照 DS 的比例算，半徑變（例如發球中放大到 7.5）邊框跟著等比變、不會突然變粗。
  const strokeWidth = radius * (1.5 / 17);
  // 發光：DS 卡片用 box-shadow「blur=glowBlur*7、spread=glowBlur*2」兩個數字疊出來，
  // 一樣是 CSS px 套在半徑 17 的圓上，一樣要按上面 strokeWidth 的邏輯換算成我們的
  // SVG 座標比例，不能直接拿 21px/6px 這種數字用（會變成整片糊掉的巨大光暈）。
  // SVG 的 drop-shadow 沒有「spread」這個參數（只有模糊半徑），這裡疊兩層 drop-shadow
  // 逼近 box-shadow 的效果：小模糊那層負責「spread 撐出來的實心光圈」，大模糊那層
  // 負責外圍的柔光暈開，兩層顏色相同、疊加起來視覺上接近 DS 那種「核心亮、外圍散」的光。
  const glowSpread = radius * ((glowBlur * 2) / 17);
  const glowBlurPx = radius * ((glowBlur * 7) / 17);
  return (
    <>
      <circle
        r={radius}
        fill={solidFill ? color : "rgba(10, 11, 7, 0.55)"}
        stroke={solidFill ? "#0a0b07" : color}
        strokeWidth={strokeWidth}
        style={
          emphasized
            ? {
                filter: `drop-shadow(0 0 ${glowSpread}px ${color}) drop-shadow(0 0 ${glowBlurPx}px ${color})`,
              }
            : undefined
        }
      />
      <text
        y={radius * 0.27}
        // circleText（角色代碼，例如 "OPP"）比背號多到 3 個字元，字級照舊會擠出圈外——
        // 縮小到 0.55 那個係數是實機比對過的結果：兩個字元的代碼（OH/MB/OPP 這幾個裡最長
        // 的是 3 碼）在半徑 6 的圈裡還讀得清楚，又不會貼到邊框。
        fontSize={circleText ? radius * 0.55 : radius * 0.84}
        fontWeight="400"
        fill={numberColor}
        textAnchor="middle"
        className="font-score pointer-events-none"
        style={{ letterSpacing: "0.02em" }}
      >
        {circleText ?? number}
      </text>
      {solidFill && (
        <g
          transform={`translate(${radius * 0.72}, ${radius * 0.72})`}
          className="pointer-events-none"
        >
          <circle r="2.3" fill="#0a0b07" />
          <text
            y="1"
            fontSize="3.2"
            fontWeight="700"
            fill={color}
            textAnchor="middle"
            className="font-sans"
          >
            L
          </text>
        </g>
      )}
      {/* 2026-08-07：這裡原本先後試過 var(--sage)、var(--off)，兩次都「看起來沒變」，
          真正原因抓到了——這兩個 CSS 變數是 Claude Design 那邊 styles.css 的命名，我們
          app 的 index.css 從來沒有定義過 --sage / --off，var() 找不到值時 SVG fill
          退回預設的黑色，所以怎麼換名字畫面都一樣黑。改成直接寫死米白色碼（跟
          COURT_LINE_COLOR 用的是同一個色號），不依賴任何未定義的 CSS 變數。 */}
      <text
        y={radius + 5.5}
        fontSize="3.2"
        fill="#F5F5F0"
        fillOpacity="0.75"
        textAnchor="middle"
        className="font-sans pointer-events-none"
      >
        {name}
      </text>
    </>
  );
}
