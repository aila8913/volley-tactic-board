import { useRotationTable } from "./useRotationTable";
import { useTacticsBoard, isSessionDirty } from "./useTacticsBoard";

// 「切輪次」的邏輯，issue #251 從 RotationSwitcher.tsx 抽出來的理由：
// RotationSwitcher 原本自己畫兩顆按鈕＋中間數字，但 RotationRailPanel 已經內建一份一模一樣
// 外觀的 stepper（onStep prop，見該檔案），兩邊維持兩份 UI 就是重複。這個 hook 只留下
// 「按了上/下該做什麼副作用」這一半，UI 交給 RotationRailPanel 畫，呼叫端只要把
// currentRotation/onStep 傳進去就好。
//
// matchId 用參數傳進來（不是 hook 自己 useParams）：這個 hook 兩個呼叫端
// （RotationTable.tsx / TacticsRosterPanel.tsx）拿到 matchId 的方式不一樣——前者自己
// useParams，後者是外面傳進來的 prop——讓 hook 只認參數，呼叫端各自决定怎麼拿，hook 不用
// 假設自己一定活在某個路由底下。
export function useRotationStepper(matchId: string | undefined) {
  const currentRotation = useRotationTable((state) =>
    matchId ? (state.dataByMatch[matchId]?.currentRotation ?? 0) : 0,
  );
  const setCurrentRotation = useRotationTable((state) => state.setCurrentRotation);
  const session = useTacticsBoard((state) => state.session);
  const discardSession = useTacticsBoard((state) => state.discardSession);
  const setCourtView = useTacticsBoard((state) => state.setCourtView);

  // 切輪次（issue #154 PR C）：戰術白板改成單景 session 後，白板跟輪次已脫鉤——一個 session
  // 是「某一刻擷取的一張獨立照片」，不再是「第 N 輪的畫」。所以切輪次時：
  //   - 正在編一個有未存內容的 session → 先確認捨棄（唯一還會弄丟東西的動作）。
  //   - 確認後結束 session、切回輪轉視圖，再改輪轉表的 currentRotation。
  const onStep = (delta: -1 | 1) => {
    if (!matchId) return;
    const dirty = isSessionDirty(session);
    if (dirty && !window.confirm("未儲存的戰術內容將會捨棄，確定要切換輪次嗎？")) return;
    // 丟掉 session / 清掉唯讀檢視、回到輪轉視圖，再切輪次——避免帶著白板狀態切到別輪。
    if (session) discardSession();
    else setCourtView("rotation");
    // 排球的 6 個輪次是「環狀」的，位移要取模 6。往前一格用 +5 而不是 -1，是因為 JS 的
    // % 對負數會回傳負值（例如 -1 % 6 === -1），+5 mod 6 在 0~5 範圍內結果相同、又不會出現
    // 負索引（沿用 RotationSwitcher 原本的寫法）。
    const nextIndex = (currentRotation + (delta === 1 ? 1 : 5)) % 6;
    setCurrentRotation(matchId, nextIndex);
  };

  return { currentRotation, onStep };
}
