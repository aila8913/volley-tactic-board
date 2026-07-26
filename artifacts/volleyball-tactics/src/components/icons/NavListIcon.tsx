import { navIconLen } from "@/lib/navIconStyle";

// 「比賽列表」導覽圖示：兩列「小方塊＋兩條橫線」代表清單項目（縮圖＋兩行文字），
// 線條會畫出來一次然後停住，動畫定義在 index.css 的 .nav-icon-draw（理由跟這個檔案
// 分開的說明見 index.css 那一段）；每個 <path> 用 navIconLen() 告訴共用動畫「這條線
// 多長」——正方形外框（4 邊各 7）總長 28，橫線本身長度就是 7。
// stroke="currentColor"：顏色完全交給呼叫端的文字顏色 class 決定（NavRail.tsx 既有的
// text-white/60／hover:text-[#c6f135]／STRONG_SELECT_CLASS），這個元件不自己決定顏色。
export default function NavListIcon({ className }: { className?: string }) {
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
      <path className="nav-icon-draw" style={navIconLen(28)} d="M 3 3 h 7 v 7 h -7 Z" />
      <path className="nav-icon-draw" style={navIconLen(28)} d="M 3 14 h 7 v 7 h -7 Z" />
      <path className="nav-icon-draw" style={navIconLen(7)} d="M14 4h7" />
      <path className="nav-icon-draw" style={navIconLen(7)} d="M14 9h7" />
      <path className="nav-icon-draw" style={navIconLen(7)} d="M14 15h7" />
      <path className="nav-icon-draw" style={navIconLen(7)} d="M14 20h7" />
    </svg>
  );
}
