import NavIconSvg from "./NavIconSvg";

// 「刪除選取標記」圖示：垃圾桶，通用到不用解釋。
export default function ToolDeleteIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <path d="M5 7 L19 7" />
      <path d="M9 7 L9 4.5 C9 3.7 9.7 3 10.5 3 L13.5 3 C14.3 3 15 3.7 15 4.5 L15 7" />
      <path d="M7.5 7 L8.3 20 C8.3 20.6 8.8 21 9.4 21 L14.6 21 C15.2 21 15.7 20.6 15.7 20 L16.5 7" />
      <path d="M10.3 11 L10.3 17 M13.7 11 L13.7 17" />
    </NavIconSvg>
  );
}
