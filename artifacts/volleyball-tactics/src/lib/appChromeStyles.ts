import type { CSSProperties } from "react";

// 「App 外殼」的共用視覺 token：整頁背景，跟右側資訊欄（aside）的外殼樣式。
//
// 為什麼要有這個檔案：這兩串樣式原本在每個頁面／每個右欄各複製一份，字面完全相同。
// 複製的成本不在寫的當下，在改的時候——這個專案已經吃過兩次虧：
//
//   1. 背景漸層在 #131 那次改版只改到戰術板／計分表兩頁，比賽列表／數據分析／跨場總匯／
//      球員分析／資料夾內頁五個頁面停在更早的斜線網格版本，畫面分裂成兩代，直到
//      2026-07-30 tang 一頁一頁看才發現。
//   2. 右欄外殼的 class 字串複製在三個檔案裡，其中一個檔案的註解還特地寫「抄一份字串比
//      特地拉一個共用檔案划算」——結果 tang 要把實色改成半透明玻璃時，就得同時記得改三處。
//
// 同一種「外殼材質」只該有一個家。之後要調整整頁氛圍，改這個檔案，全站一起變。

// 整頁背景：兩顆柔光暈（左上萊姆綠、右下深青）疊一層底層斜切漸層。比單純兩色漸層更有層次，
// 也讓卡片/球場的 backdrop-blur 有東西可以模糊——純色背景會讓毛玻璃白忙一場（模糊純色還是
// 同一個純色，玻璃感其實沒有真的產生）。搭配 backdrop 插槽的 .tb-beam 斜向光影一起用。
export const APP_BACKGROUND_STYLE: CSSProperties = {
  background:
    "radial-gradient(ellipse 55% 45% at 18% 12%, rgba(198,241,53,0.10), transparent 70%), " +
    "radial-gradient(ellipse 65% 55% at 88% 92%, rgba(42,110,106,0.30), transparent 70%), " +
    "linear-gradient(160deg, #0a0b07 0%, #16241c 55%, #0a0b07 100%)",
};

// 整頁最外層容器的 class（跟 APP_BACKGROUND_STYLE 成對使用）。relative 是給 backdrop 的
// .tb-beam（position:absolute）當定位基準。
export const APP_SHELL_CLASS = "relative font-dash text-[#f5f5f0]";

// 右側資訊欄（aside）的外殼：MatchInfoRail／AnalyticsRotationRail／ScoreSheet 右欄共用。
//
// 材質決定（tang 2026-07-30）：原本是實色 `bg-[#121310]`，在漸層背景上會變成一塊跟背景
// 完全無關的純黑板子，右欄空狀態時特別明顯（一大片死黑）。改成半透明＋backdrop-blur 之後，
// 底下的漸層光暈跟 .tb-beam 會透一點上來被模糊掉，右欄就跟背景「有銜接」而不是貼上去的
// ——這也跟 design-spec.md 第 4 節的 Glassmorphism 語彙一致（外層 chrome 是大片、低模糊度
// 的窗格；戰術板的 aside 早就是這樣做的，只有這三個右欄還停在實色）。
//
// 透明度用 /75 而不是任意值（例如 /72）：Tailwind 內建的 opacity scale 就有 75，能落在
// 既有級距上就別自己造一個——這正是 design-spec.md 第 3 節「字級現況掃描」記下的那類問題
//（憑手感選數字、跳出既有級距，最後全站累積出 16 種字級）。
//
// 寬度刻意不寫在這裡：AppShell 的 ASIDE_WIDTH 已經是唯一寬度來源（見 AppShell.tsx 開頭
// 「為什麼三欄骨架要收斂到一個檔案」的說明），這裡只管「材質」。
export const INFO_RAIL_BASE_CLASS =
  "flex h-full flex-col border-l border-white/[0.10] bg-[#121310]/75 font-dash " +
  "text-[#F5F5F0] backdrop-blur-md";
