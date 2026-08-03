import NavIconSvg from "./NavIconSvg";

// 「扇形防守範圍」工具圖示：一個扇形切片，虛線語彙同 ToolCircleIcon 說明。跟圓／橢圓
// 不同，扇形本身的形狀（有缺口的切片）已經跟另外兩顆有明顯區別，不用額外加符號。
export default function ToolFanIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <path d="M12 12 L12 4 A8 8 0 0 1 18.9 9.7 Z" strokeDasharray="3 2.6" />
    </NavIconSvg>
  );
}
