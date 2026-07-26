import { navIconLen } from "@/lib/navIconStyle";

// 「計分」導覽圖示：寫字板＋筆——比先前借用的降落飛機更貼題（記錄/書寫這件事本身），
// 五條路徑：夾板頂夾、板身外框、右上角、一小段線、筆。動畫機制跟其他導覽圖示同一套
// （見 index.css 的 .nav-icon-draw 說明），長度是圖示來源工具量出來的真實路徑長。
export default function NavClipboardIcon({ className }: { className?: string }) {
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
      <path className="nav-icon-draw" style={navIconLen(24)} d="M 8 2 h 8 v 4 h -8 Z" />
      <path
        className="nav-icon-draw"
        style={navIconLen(37.926)}
        d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5"
      />
      <path className="nav-icon-draw" style={navIconLen(4.092)} d="M16 4h2a2 2 0 0 1 1.73 1" />
      <path className="nav-icon-draw" style={navIconLen(1)} d="M8 18h1" />
      <path
        className="nav-icon-draw"
        style={navIconLen(27.074)}
        d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"
      />
    </svg>
  );
}
