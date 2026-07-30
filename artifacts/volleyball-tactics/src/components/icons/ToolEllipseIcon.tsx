import NavIconSvg from "./NavIconSvg";

// 「橢圓防守範圍」工具圖示，虛線語彙同 ToolCircleIcon 說明。
export default function ToolEllipseIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <ellipse cx="12" cy="12" rx="9" ry="5.5" strokeDasharray="3 2.6" />
    </NavIconSvg>
  );
}
