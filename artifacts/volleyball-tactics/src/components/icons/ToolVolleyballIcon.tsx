import NavIconSvg from "./NavIconSvg";

// 「排球」工具圖示。原本刻意跟 Markers.tsx 畫布上的實際渲染（圓形＋兩道弧線）用同一種
// 畫法，理由是「圖示等於畫出來的縮圖」——但 tang 實際看過之後覺得那樣在 20px 小尺寸下
// 不太看得出是排球，所以這裡改成 3 道弧線縫線（比較接近排球實際的曲面拼接紋路），優先
// 讓圖示本身好認，跟畫布渲染不要求逐筆對應。如果之後也想讓球場上的排球標記更好看，
// Markers.tsx 的 volleyball 分支可以照這裡的縫線畫法一起換，但這次沒有動那邊。
export default function ToolVolleyballIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4 Q7 12 18 17" />
      <path d="M4 10 Q12 6 16 19" />
      <path d="M20 10 Q14 18 6 14" />
    </NavIconSvg>
  );
}
