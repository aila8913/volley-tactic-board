import type { CSSProperties } from "react";

// 導覽軌圖示共用的「畫出來」動畫（index.css 的 .nav-icon-draw／--nav-icon-len，見那邊
// 開頭的說明）需要每個 <path> 各自帶一個 CSS 自訂屬性告訴動畫「這條路徑總長度是多少」。
// TypeScript 的 CSSProperties 型別預設不認識自訂屬性（`--` 開頭的名字），每個圖示檔案
// 都要自己 `as CSSProperties` 轉型一次會很雜；抽成這個小函式，之後新增圖示只要
// `style={navIconLen(38.527)}`，型別轉換只寫一次。
export function navIconLen(length: number): CSSProperties {
  return { "--nav-icon-len": length } as CSSProperties;
}
