import NavIconSvg from "./NavIconSvg";

// 「切換號位標示」開關圖示：# 符號，直接對應功能本身（顯示/隱藏球場上的號位數字），
// 不用另外設計球場圖示這種間接表達。
export default function ToolZoneLabelIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <path d="M9 4 L7 20 M15 4 L13 20 M5 9 L19 9 M5 15 L19 15" />
    </NavIconSvg>
  );
}
