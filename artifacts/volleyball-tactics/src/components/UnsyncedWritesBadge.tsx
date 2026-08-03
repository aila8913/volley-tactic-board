import { CloudOff } from "lucide-react";

// 計分頁的「還有幾筆沒同步到後端」指示器（issue #64 PR4）。
//
// 為什麼需要它：write log 在 PR3 之後是「本地優先」的——記一分先改畫面、背景才送後端，
// 送不出去就留在 IndexedDB 裡慢慢重試。這對使用體驗是對的（球場上不能等網路），但代價是
// 畫面看起來永遠成功，使用者無從得知「我這半局的資料其實還在手機裡」。這顆徽章就是那個
// 唯一的誠實訊號：平常完全不出現（count 為 0 時回 null），有東西沒送出去才亮起來。
//
// 刻意**不做**的事：不擋操作、不跳 modal、不把畫面變成錯誤狀態。沒送出去不等於出錯，
// 資料是安全的（見 writeLog.ts 的「至少送一次」），只是還沒到雲端而已——用一個角落的
// 小標記表達「正在處理中」，比一個嚇人的紅色警告更貼近實際風險。
export default function UnsyncedWritesBadge({
  count,
  onRetry,
}: {
  count: number;
  onRetry: () => void;
}) {
  if (count <= 0) return null;

  return (
    <button
      type="button"
      onClick={onRetry}
      // title 而不是可見的說明文字：標題列空間有限，而這顆徽章的完整語意
      //（「資料沒掉、只是還沒上傳」）比它能佔的寬度長得多。
      title="這些記錄已經安全存在這台裝置上，還沒送到雲端。點一下立刻重試。"
      className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-400/20"
    >
      <CloudOff className="h-3.5 w-3.5" />
      {count} 筆未同步
    </button>
  );
}
