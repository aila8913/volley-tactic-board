import { navIconLen } from "@/lib/navIconStyle";
import NavIconSvg from "./NavIconSvg";

// 「匯出／匯入」導覽圖示：存檔片（save/floppy）造型——外框＋底部口袋＋左上角折角，三條路徑。
// 動畫機制跟其他導覽圖示同一套（見 index.css 的 .nav-icon-draw 說明），長度是圖示來源
// 工具量出來的真實路徑長。
// #372：NavRail 不再渲染這顆圖示——左欄的「出」那一格連同匯出／匯入的子清單整組拆掉了
// （見 NavRail.tsx 開頭的說明）。但匯出／匯入功能本身沒有被砍，只是搬家：移到戰術板頁
// （TacticsBoard.tsx），是另一個 issue 的範圍，這裡先保留這顆圖示等它接手用，不要因為
// 「NavRail 暫時沒有 import」就誤判成死碼刪掉。
export default function NavSaveIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
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
    </NavIconSvg>
  );
}
