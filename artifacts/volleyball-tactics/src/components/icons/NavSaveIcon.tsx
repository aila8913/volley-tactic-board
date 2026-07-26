import { navIconLen } from "@/lib/navIconStyle";

// 「計分」導覽圖示：存檔片（save/floppy）造型——外框＋底部口袋＋左上角折角，三條路徑。
// 動畫機制跟其他導覽圖示同一套（見 index.css 的 .nav-icon-draw 說明），長度是圖示來源
// 工具量出來的真實路徑長。
export default function NavSaveIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        className="nav-icon-draw"
        style={navIconLen(66.325)}
        d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
      />
      <path
        className="nav-icon-draw"
        style={navIconLen(25.142)}
        d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"
      />
      <path className="nav-icon-draw" style={navIconLen(12.571)} d="M7 3v4a1 1 0 0 0 1 1h7" />
    </svg>
  );
}
