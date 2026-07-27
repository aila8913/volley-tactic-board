import { navIconLen } from "@/lib/navIconStyle";
import NavIconSvg from "./NavIconSvg";

// 「數據分析」導覽圖示：四條長短不一的長條（bar chart）＋一條穿過去的趨勢折線。
// 動畫機制跟 NavListIcon／NavSwordsIcon 同一套（見 index.css 的 .nav-icon-draw 說明），
// 長度一樣是圖示來源工具量出來的真實路徑長，不要憑感覺改數字。
export default function NavChartIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <path className="nav-icon-draw" style={navIconLen(5)} d="M12 16v5" />
      <path className="nav-icon-draw" style={navIconLen(7)} d="M16 14v7" />
      <path className="nav-icon-draw" style={navIconLen(11)} d="M20 10v11" />
      <path
        className="nav-icon-draw"
        style={navIconLen(27.854)}
        d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15"
      />
      <path className="nav-icon-draw" style={navIconLen(3)} d="M4 18v3" />
      <path className="nav-icon-draw" style={navIconLen(7)} d="M8 14v7" />
    </NavIconSvg>
  );
}
