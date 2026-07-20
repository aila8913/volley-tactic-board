// 戰術板右側面板共用的視覺 token（issue #160 C2 把 TacticsBoardPanel 拆成多個檔案後，
// 這兩個 class 字串被 TacticsBrowsePanel / TacticsViewingPanel / TacticsEditPanel /
// NewTacticDialog 好幾個檔案一起用，抽到這裡當唯一真相來源——不然每個檔案各自複製一份，
// 之後要調整深色玻璃風格的按鈕樣式（例如 #c6f135 這個螢光綠強調色）就要找好幾個地方改。

// 次要按鈕（取消/undo-redo/匯出這類不強調的操作）。
export const SECONDARY_BTN_CLASS =
  "rounded-lg border border-white/[0.26] bg-white/[0.05] text-[#f5f5f0] transition " +
  "hover:border-[#c6f135] hover:text-[#c6f135]";

// 主要按鈕（戰術布置/儲存這類最強調的操作），螢光綠底、深色文字。
export const PRIMARY_BTN_CLASS =
  "rounded-lg bg-[#c6f135] text-[#0a0b07] transition hover:brightness-110";
