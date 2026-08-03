import NavIconSvg from "./NavIconSvg";

// 「圓形防守範圍」工具圖示。虛線外框——跟 ToolVolleyballIcon 的實心圓刻意做出區別：
// 排球是「放一顆球」的具體物件，防守範圍是「圈一塊概略區域」，虛線是通用的「這是估計
// 範圍、不是精確邊界」視覺語彙，圓／橢／扇三顆範圍工具圖示統一用這個語彙。
export default function ToolCircleIcon({ className }: { className?: string }) {
  return (
    <NavIconSvg className={className}>
      <circle cx="12" cy="12" r="7.5" strokeDasharray="3 2.6" />
    </NavIconSvg>
  );
}
