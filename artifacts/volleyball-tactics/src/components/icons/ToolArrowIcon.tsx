import NavIconSvg from "./NavIconSvg";

// 「實線箭頭」工具圖示：對應 Markers.tsx 的 type === "arrow" 渲染（細線 strokeWidth 1.5＋
// 一般箭頭）。用開放式 chevron（兩段折線）畫箭頭而不是實心三角形，跟其他圖示的外框風格
// 一致；跟「攻擊線」圖示的差異刻意做在「細＋箭頭小」上，呼應兩者在球場上真正的粗細差異。
export default function ToolArrowIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <path d="M5 19 L18 6" />
      <path d="M11 6 L18 6 L18 13" />
    </NavIconSvg>
  );
}
