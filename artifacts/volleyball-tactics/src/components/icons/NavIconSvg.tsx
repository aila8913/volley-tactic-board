import type { ReactNode } from "react";

// 四個導覽圖示（NavListIcon/NavChartIcon/NavSwordsIcon/NavPeopleIcon）共用的 <svg> 外殼——
// viewBox／線條粗細／顏色來源這些屬性原本各顆圖示一字不差地各寫一次，自我 review 時抓出來的
// 重複。圖示元件只需要提供裡面的 <path> 們（children）。
// #372 改版：左欄從「比/計/數/戰/出」五格砍成「比/數/戰/人」四格，原本的 NavClipboardIcon
// （「計」用）沒有消費者了，直接刪除；NavPeopleIcon（「人」）是這次新增的。NavSaveIcon
// （原「出」用）雖然 NavRail 不再渲染它，但沒有跟著刪——匯出／匯入功能本身沒有消失，只是
// 移到戰術板頁，那邊會重新掛上這顆圖示，見 NavSaveIcon.tsx 的說明。
// stroke="currentColor"：顏色交給呼叫端的文字顏色 class 決定（NavRail.tsx 既有的
// text-white/60／hover:text-[#c6f135]／STRONG_SELECT_CLASS），這裡不自己決定顏色。
export default function NavIconSvg({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
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
      {children}
    </svg>
  );
}
