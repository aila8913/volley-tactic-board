import NavIconSvg from "./NavIconSvg";

// 「排球」工具圖示：圓形＋兩道弧線縫線，刻意跟 Markers.tsx 裡 type === "volleyball" 的
// 實際渲染（circle r=3 + path "M -3 0 Q 0 3 3 0 M 0 -3 Q 0 0 0 3"）用同一種畫法只是放大
// 到 24px 網格——圖示等於畫布上會出現的東西的縮圖，不是另外設計一顆通用「球」圖示。
export default function ToolVolleyballIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12 Q12 20 20 12 M12 4 Q12 12 12 20" />
    </NavIconSvg>
  );
}
