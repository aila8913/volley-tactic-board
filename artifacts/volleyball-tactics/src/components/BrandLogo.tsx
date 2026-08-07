// 品牌文字標「VOL.02」。2026-08-07 對齊 Claude Design 的 tokens/logo.html，取代原本
// TacticsBoard.tsx 背景那組「VOLLEY / BOARD」佔位字——那組文字是 issue #134 材質強化
// 時先頂著用的，品牌名稱定案前不用做視覺；這次 DS 把正式文字標設計好了，兩處用到品牌
// 字標的地方（左側導覽軌頂端、戰術板背景大字標）都改吃這個共用元件，不再各自維護一份。
//
// 樣式（切斷結構、漸層、發光）全部收在 index.css 的 `.brand-logo` 系列 class；這個
// 元件只負責組出 DS 規定的 DOM 結構（top/bot 兩段文字 + tail 尾刀）跟三種底色變體。
// 字級大小刻意不內建在元件裡、一律由呼叫端用 style.fontSize 決定——DS 文件標明 22px
// 是漸層版（mark/ink）可讀下限，14px 以下要換用 flat 單色版，兩個呼叫端（導覽軌 22px、
// 戰術板背景 clamp(48px,9vw,92px)）差異很大，沒有一個「預設值」對兩邊都合理。
interface BrandLogoProps {
  variant?: "mark" | "ink" | "flat";
  className?: string;
  style?: React.CSSProperties;
}

export default function BrandLogo({ variant = "mark", className = "", style }: BrandLogoProps) {
  return (
    <span className={`brand-logo ${variant} ${className}`} style={style} aria-label="VOL.02">
      <span className="top">VOL.02</span>
      <span className="bot">VOL.02</span>
      <span className="tail" />
    </span>
  );
}
