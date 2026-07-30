import NavIconSvg from "./NavIconSvg";

// 「文字」工具圖示：字母 T——設計軟體（Photoshop／Illustrator／Figma）文字工具的
// 通用符號，不用另外發明。
export default function ToolTextIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <path d="M6 6 L18 6" />
      <path d="M12 6 L12 19" />
    </NavIconSvg>
  );
}
