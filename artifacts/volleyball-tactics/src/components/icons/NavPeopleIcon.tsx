import { navIconLen } from "@/lib/navIconStyle";
import NavIconSvg from "./NavIconSvg";

// 「人員名單」導覽圖示（#372 新增，取代原本「計分」用的 NavClipboardIcon，見 NavIconSvg.tsx
// 開頭的說明）：兩個人形——前面一個較大（頭＋肩膀弧線），後面一個較小、稍微錯開，畫出
// 「一份名單／一群人」的意象。動畫機制跟其他導覽圖示同一套（見 index.css 的 .nav-icon-draw
// 說明），長度是圖示來源工具量出來的真實路徑長，不要憑感覺改數字。
export default function NavPeopleIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <path
        className="nav-icon-draw"
        style={navIconLen(15.71)}
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
      />
      <path
        className="nav-icon-draw"
        style={navIconLen(12.566)}
        d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"
      />
      <path className="nav-icon-draw" style={navIconLen(9.5)} d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path className="nav-icon-draw" style={navIconLen(7.5)} d="M16 3.13a4 4 0 0 1 0 7.75" />
    </NavIconSvg>
  );
}
