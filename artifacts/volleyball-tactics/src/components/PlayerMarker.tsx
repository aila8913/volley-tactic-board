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
}

export default function PlayerMarker({
  number,
  name,
  color,
  radius = 6,
  emphasized = false,
}: PlayerMarkerProps) {
  const r = emphasized ? radius + 1.5 : radius;
  return (
    <>
      <circle
        r={r}
        fill="rgba(10, 11, 7, 0.62)"
        stroke={color}
        strokeWidth={emphasized ? 2 : 1.2}
        style={emphasized ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined}
      />
      <text
        y="1.6"
        fontSize="4.5"
        fontWeight="bold"
        fill="#F5F5F0"
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
