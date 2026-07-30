import NavIconSvg from "./NavIconSvg";

// 「攻擊線」工具圖示：對應 Markers.tsx 的 type === "attack"（strokeWidth 2.5＋比一般箭頭
// 大一號的 attack-arrowhead，見 Court.tsx 的 <marker> defs：6x6 vs 8x8）。跟 ToolArrowIcon
// 用同一種「線＋開放 chevron」畫法，差異只在線本身加粗（strokeWidth 覆寫到 2.75）跟
// chevron 開口拉大——粗細差異就是這兩個工具在球場上唯一的視覺區別，圖示照實還原。
export default function ToolAttackIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <path d="M4 20 L17 7" strokeWidth="2.75" />
      <path d="M8.5 7 L17 7 L17 15.5" strokeWidth="2.75" />
    </NavIconSvg>
  );
}
