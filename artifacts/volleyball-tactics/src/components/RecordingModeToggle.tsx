// 記錄模式的膠囊切換：簡易 ↔ 進階（#391，拆自 #21）。
//
// 用詞照 CONTEXT.md 的官方詞彙：賽中即時記錄叫**簡易版**（不是「基礎版」），賽後對著影片
// 補填叫**進階版**。#391 的票名寫「基礎/進階」，但 CONTEXT.md 把「基礎版」列在 _Avoid_，
// 這裡以詞彙表為準——這正是詞彙表存在的理由（同一件事在這個 repo 漂過好幾個名字）。
//
// 為什麼是同一頁的兩張臉、不是另開一頁：兩者都是「計分」，只是一個賽中一個賽後，
// PO 決定「一場比賽只有一個計分入口」。模式差異於是變成同一頁翻面（沿用「輪轉表↔戰術板
// 翻頁」的既有語彙），而不是兩條會各自長出重複 UI 的路由。

export type RecordingMode = "simple" | "advanced";

const OPTIONS: { value: RecordingMode; label: string; hint: string }[] = [
  { value: "simple", label: "簡易", hint: "賽中即時記錄" },
  { value: "advanced", label: "進階", hint: "賽後對影片補填" },
];

type Props = {
  mode: RecordingMode;
  onChange: (mode: RecordingMode) => void;
};

export default function RecordingModeToggle({ mode, onChange }: Props) {
  return (
    // role="tablist" 而不是一組普通按鈕：螢幕閱讀器唸到這裡會說「兩個分頁、目前在第一個」，
    // 而不是兩顆彼此無關的按鈕。aria-selected 讓「現在是哪一個」這件事不只用顏色表達
    //（顏色對讀屏軟體不存在）。
    <div
      role="tablist"
      aria-label="記錄模式"
      className="inline-flex items-center gap-1 rounded-full border border-white/[0.14] bg-black/30 p-1"
    >
      {OPTIONS.map((option) => {
        const isActive = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={option.hint}
            onClick={() => onChange(option.value)}
            // 選中＝萊姆綠實心（跟這一頁的 PRIMARY 按鈕同一個「這是現在生效的東西」語彙），
            // 未選中只有文字顏色，hover 才亮起來——膠囊本身要低調，它不是這一頁的主角。
            className={`rounded-full px-4 py-1 text-xs font-bold transition ${
              isActive ? "bg-[#c6f135] text-[#0a0b07]" : "text-[#a9b096] hover:text-[#c6f135]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
