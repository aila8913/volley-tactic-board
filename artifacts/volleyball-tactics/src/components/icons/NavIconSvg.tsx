import type { ReactNode } from "react";

// 五個導覽圖示（NavListIcon/NavSaveIcon/NavChartIcon/NavSwordsIcon/NavClipboardIcon）共用
// 的 <svg> 外殼——viewBox／線條粗細／顏色來源這些屬性五顆圖示原本一字不差地各寫一次，
// 自我 review 時抓出來的重複。圖示元件只需要提供裡面的 <path> 們（children）。
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
