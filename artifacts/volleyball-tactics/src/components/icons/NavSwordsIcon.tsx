import { navIconLen } from "@/lib/navIconStyle";

// 「戰術」導覽圖示：一對交叉的劍（八條路徑：兩把劍身各一條長折線＋各自劍柄三筆短線）。
// 動畫機制跟 NavListIcon 同一套（見 index.css 的 .nav-icon-draw 說明），只是這顆圖示的
// 路徑是多段折線，每條的實際長度（navIconLen 的參數）不是隨便湊的整數，是圖示來源工具
// 量出來的真實路徑長，抄錯數字動畫收尾會對不齊終點。
export default function NavSwordsIcon({ className }: { className?: string }) {
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
      {/* 左劍：劍身（長折線）＋劍柄兩筆 */}
      <path
        className="nav-icon-draw"
        style={navIconLen(38.527)}
        d="M 14.5 17.5 L 3 6 L 3 3 L 6 3 L 17.5 14.5"
      />
      <path className="nav-icon-draw" style={navIconLen(8.485)} d="M 13 19 L 19 13" />
      <path className="nav-icon-draw" style={navIconLen(5.657)} d="M 16 16 L 20 20" />
      <path className="nav-icon-draw" style={navIconLen(2.828)} d="M 19 21 L 21 19" />
      {/* 右劍：劍身＋劍柄兩筆，跟左劍鏡射 */}
      <path
        className="nav-icon-draw"
        style={navIconLen(15.899)}
        d="M 14.5 6.5 L 18 3 L 21 3 L 21 6 L 17.5 9.5"
      />
      <path className="nav-icon-draw" style={navIconLen(5.657)} d="M 5 14 L 9 18" />
      <path className="nav-icon-draw" style={navIconLen(4.243)} d="M 7 17 L 4 20" />
      <path className="nav-icon-draw" style={navIconLen(2.828)} d="M 3 19 L 5 21" />
    </svg>
  );
}
