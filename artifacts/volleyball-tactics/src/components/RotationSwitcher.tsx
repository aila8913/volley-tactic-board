import { useParams } from "wouter";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard, isSessionDirty } from "../hooks/useTacticsBoard";

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
  const session = useTacticsBoard((state) => state.session);
  const discardSession = useTacticsBoard((state) => state.discardSession);
  const setCourtView = useTacticsBoard((state) => state.setCourtView);

  // 切輪次（issue #154 PR C）：戰術白板改成單景 session 後，白板跟輪次已脫鉤——一個 session
  // 是「某一刻擷取的一張獨立照片」，不再是「第 N 輪的畫」。所以切輪次時：
  //   - 正在編一個有未存內容的 session → 先確認捨棄（唯一還會弄丟東西的動作，§4）。
  //   - 確認後結束 session、切回輪轉視圖，再改輪轉表的 currentRotation。
  // matchId 理論上一定存在（這個元件只在 /matches/:id/board 底下渲染），防呆一下不動作。
  const go = (index: number) => {
    if (!matchId) return;
    const dirty = isSessionDirty(session);
    if (dirty && !window.confirm("未儲存的戰術內容將會捨棄，確定要切換輪次嗎？")) return;
    // 丟掉 session / 清掉唯讀檢視、回到輪轉視圖，再切輪次——避免帶著白板狀態切到別輪。
    if (session) discardSession();
    else setCourtView("rotation");
    setCurrentRotation(matchId, index);
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
