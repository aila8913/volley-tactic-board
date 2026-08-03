import NavIconSvg from "./NavIconSvg";

// 「球員名單」浮層開關圖示：兩個疊在一起的人形——這顆按鈕打開的是拖曳球員上下場的名單，
// 「多個人」比單一人形更準確傳達「這是名單/名冊」而不是「這是我的帳號」。
export default function ToolRosterIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 20 C4 15.6 6.3 13 9 13 C11.7 13 14 15.6 14 20" />
      <path d="M14.5 20 C14.5 16.3 16.4 14 18.3 14 C19.9 14 21.2 15.7 21.2 18.5" />
      <circle cx="17.3" cy="9" r="2.3" />
    </NavIconSvg>
  );
}
