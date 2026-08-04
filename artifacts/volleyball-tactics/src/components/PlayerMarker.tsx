// 球場上球員圈的共用視覺（issue #134 玻璃圓片格式）：深色半透明底 + 狀態色細邊框，
// 圈裡固定顯示背號、圈下方小字顯示姓名。原本這份 SVG 標記各寫一份在 PlayerNode.tsx
// （戰術板）跟 ScoreSheetCourt.tsx（計分表）——兩邊視覺一樣但程式碼各自維護，改一邊
// 忘記改另一邊就會不同步。抽成這個純展示元件後，兩邊只負責「算出這個人現在該用
// 什麼顏色/要不要放大強調」，圓圈本身長什麼樣只有這裡一份。
//
// 只管畫，不管互動——拖曳、點擊、右鍵這些行為留在呼叫端的 <g onPointerDown=...> 包起來，
// 這裡只回傳要放進那個 <g> 裡的 SVG 內容（circle + 兩行 text），呼叫端自己決定要不要再疊加
// 選取環、發球圖示、換人提示這類「這個情境才有」的裝飾。
interface PlayerMarkerProps {
  number: number;
  name: string;
  // 邊框色＝目前唯一的狀態指示（前排/後排/自由球員/備位…），語意由呼叫端決定，
  // 這裡只負責畫出來。
  color: string;
  radius?: number;
  // 強調態（戰術板：被選取；計分表：目前發球）共用同一套放大＋加粗邊框＋發光的處理，
  // 讓兩邊「這個人現在特別重要」的視覺語言一致。
  emphasized?: boolean;
  // 發光的模糊半徑，只有 emphasized 時有意義。預設 3（原始值）——白色/萊姆綠/橘色這些
  // 有色相的顏色在這個模糊半徑下讀起來是柔光，效果一直都好；但同樣的數字套在紅色上
  // （計分頁對手發球圈）反而太誇張，紅色改用 0.75。不同顏色需要不同模糊半徑才「看起來
  // 舒服」是實機比較出來的結論，不是同一個數字打天下，所以開一個 prop 讓呼叫端各自決定，
  // 不在這裡用 color 硬猜該套多少（那樣以後多一種顏色又要回來改這個元件）。
  glowBlur?: number;
  // 自由球員定案配色（2026-08-04）：其他狀態都是「深色玻璃底＋這個顏色描邊」，但自由
  // 球員要反過來——「這個顏色實色填滿＋深色描邊」，跟計分表 ScoreSheetCourt.tsx 自由球員鈕
  // 最後定案的樣式一致（見那邊的配色說明）。true 時 fill/stroke 對調；預設 false 維持
  // 其他狀態原本的樣子，不影響既有呼叫端。
  solidFill?: boolean;
}

export default function PlayerMarker({
  number,
  name,
  color,
  radius = 6,
  emphasized = false,
  glowBlur = 3,
  solidFill = false,
}: PlayerMarkerProps) {
  const r = emphasized ? radius + 1.5 : radius;
  // 背號在圈「裡面」，solidFill 時圈是飽和實色，背號要跟著換深色才有對比；
  // 姓名畫在圈「下方」，不管圈本身是深底描邊還是實色填滿，姓名底下永遠是深色球場
  // 背景（不是圈的填色），所以姓名一律用米白，不跟著 solidFill 換色
  // （tang 2026-08-04：換成自由球員綠底黑框之後姓名變黑字，蓋在深色球場上看不見）。
  const numberColor = solidFill ? "#0a0b07" : "#F5F5F0";
  return (
    <>
      <circle
        r={r}
        fill={solidFill ? color : "rgba(10, 11, 7, 0.62)"}
        stroke={solidFill ? "#0a0b07" : color}
        strokeWidth={emphasized ? 2 : 1.2}
        style={emphasized ? { filter: `drop-shadow(0 0 ${glowBlur}px ${color})` } : undefined}
      />
      <text
        y="1.6"
        fontSize="4.5"
        fontWeight="bold"
        fill={numberColor}
        textAnchor="middle"
        className="font-sans pointer-events-none"
      >
        {number}
      </text>
      <text
        y={r + 5.5}
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
