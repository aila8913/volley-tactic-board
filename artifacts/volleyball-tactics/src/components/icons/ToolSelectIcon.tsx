import NavIconSvg from "./NavIconSvg";

// 「選取移動」工具圖示：經典滑鼠指標形狀。這裡刻意跟其他圖示不同、選擇實心填色
// （fill="currentColor" 蓋掉 NavIconSvg 預設的 stroke-only 外框風格）——指標這種
// 尖角多、線條細碎的形狀，24px 大小下用外框畫反而糊成一團，業界工具（Figma／
// Illustrator）的指標圖示也都是實心，不是特例。
export default function ToolSelectIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <path
        d="M6 3 L6 19 L9.8 15.3 L12.6 20.6 L15.2 19.3 L12.5 14 L18 14 Z"
        fill="currentColor"
        stroke="none"
      />
    </NavIconSvg>
  );
}
