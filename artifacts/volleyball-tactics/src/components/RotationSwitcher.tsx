import { useParams } from "wouter";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";

// 輪次切換：原本是 6 個輪次的球場小縮圖（舊的 RotationThumbnails），視覺較雜亂，
// 改成「上一輪 / 下一輪」兩個按鈕 + 中間顯示目前第幾輪（呼應 issue #17 想簡化輪次選擇）。
//
// 為什麼用 (r + 1) % 6 / (r + 5) % 6：排球的 6 個輪次是「環狀」的（第 6 輪的下一輪
// 就回到第 1 輪），所以位移要取模 6。往前一格用 +5 而不是 -1，是因為 JS 的 % 對負數
// 會回傳負值（例如 -1 % 6 === -1），+5 mod 6 跟 -1 mod 6 在 0~5 範圍內結果相同、又不會出現負索引。
export default function RotationSwitcher() {
  const { id: matchId } = useParams<{ id: string }>();
  const currentRotation = useRotationTable((state) =>
    matchId ? (state.dataByMatch[matchId]?.currentRotation ?? 0) : 0,
  );
  const setCurrentRotation = useRotationTable((state) => state.setCurrentRotation);
  const syncRotationChange = useTacticsBoard((state) => state.syncRotationChange);

  // 切輪次是「先改輪轉表的 currentRotation、再叫戰術板同步一次」兩步：以前第二步靠一個全域
  // subscribe 自動觸發，但 currentRotation 現在存在 per-match 分片裡，全域 subscribe 分不清是
  // 哪一場變了，所以改成在這裡明確呼叫（issue #119）。matchId 理論上一定存在（這個元件只在
  // /matches/:id/board 底下渲染），防呆一下不動作。
  const go = (index: number) => {
    if (!matchId) return;
    setCurrentRotation(matchId, index);
    syncRotationChange(matchId);
  };

  const goPrev = () => go((currentRotation + 5) % 6);
  const goNext = () => go((currentRotation + 1) % 6);

  return (
    <div className="flex items-center gap-2 px-1 pt-2 pb-1">
      <button
        onClick={goPrev}
        data-testid="rotation-prev"
        className="flex-1 rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1.5 text-xs
          font-bold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]"
      >
        ‹ 上一輪
      </button>
      <span data-testid="rotation-current" className="w-14 text-center text-sm font-bold">
        第 {currentRotation + 1} 輪
      </span>
      <button
        onClick={goNext}
        data-testid="rotation-next"
        className="flex-1 rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1.5 text-xs
          font-bold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]"
      >
        下一輪 ›
      </button>
    </div>
  );
}
