import NavIconSvg from "./NavIconSvg";

// 「虛線路徑」工具圖示：對應 Markers.tsx 的 type === "dashed"（strokeDasharray "3 3"、
// 沒有箭頭）。圖示直接用 strokeDasharray 畫成真的虛線，不是畫一條實線再靠形狀暗示——
// 圖示長什麼樣，畫出來的線就長什麼樣，使用者不用另外記圖示跟結果的對應關係。
export default function ToolDashedIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <path d="M5 19 L19 5" strokeDasharray="3 2.6" />
    </NavIconSvg>
  );
}
