import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";

// 小按鈕共用樣式（重置站位/清除畫筆），跟 RotationTable.tsx 原本用的是同一套，
// 抽出來這裡是因為這個檔案本身就是從 RotationTable.tsx 搬出來的。
const PANEL_BUTTON_CLASS =
  "rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1 text-xs " +
  "font-bold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]";

interface RotationControlsFooterProps {
  matchId: string;
}

// 「重置站位／清除畫筆」區塊，issue #251 從 RotationTable.tsx 的 footer 抽出來獨立成元件
// 的理由：mode D（佈陣中）跟 mode B 都需要同一組動作，抽成一個兩邊（mode B 的
// RotationTable、mode D 的 TacticsRosterPanel）都能掛在自己畫面裡的獨立元件，不用複製
// 貼上兩份。
//
// 原本這裡還有一顆 RotationSwitcher（上一輪/下一輪按鈕）——這一輪重構把 RotationRailPanel
// 自己內建的 stepper（onStep prop）接進兩個呼叫端後，兩份「上/下一輪」UI 變成完全重複，
// RotationSwitcher.tsx 已刪除，切輪次的副作用邏輯搬進 hooks/useRotationStepper.ts，
// 由呼叫端直接傳給 RotationRailPanel 的 rotation/onStep props，不再經過這個 footer。
//
// matchId 用 prop 傳進來、不用 useParams 自己抓：這個元件在兩個不同的呼叫端裡都已經有
// 現成的 matchId 可以往下傳，直接吃 prop 比每個用到的地方各自重新從路由讀一次更直接，
// 也方便未來如果哪天要在非路由頁面（例如測試）裡重用。
export default function RotationControlsFooter({ matchId }: RotationControlsFooterProps) {
  const resetCurrentRotationPositions = useRotationTable(
    (state) => state.resetCurrentRotationPositions,
  );
  // 戰術白板改成單景 session 後（issue #154 PR C），沒有「常駐的第 N 輪畫筆」可清了：
  // 畫筆只在編輯中的 session 裡存在，所以「清除畫筆」改成清掉當前 session 的畫筆/防守範圍，
  // 沒在編輯（無 session）時停用。
  //
  // 這個元件在 mode D（TacticsRosterPanel）被呼叫時 session 一定存在（mode D 的定義就是
  // session.arranging），所以那個呼叫點上這顆按鈕永遠不會被 disabled——這是預期行為，
  // 不是漏接：mode D 本來就是在編輯戰術，理當隨時可以清畫筆。
  const session = useTacticsBoard((state) => state.session);
  const clearDrawings = useTacticsBoard((state) => state.clearDrawings);

  // 「重置站位」清空輪轉表這一輪的站位。戰術白板單向化後（issue #154 PR C）已跟輪轉表脫鉤、
  // 也沒有常駐的每輪畫筆，所以這裡只動輪轉表自己的站位真相，不再連帶清白板。
  // 這個動作沒有 undo，點錯會直接清空——用瀏覽器內建的 window.confirm() 擋一下，
  // 跟 MatchList.tsx / TournamentDetail.tsx 刪除比賽/賽事時用的是同一套簡單彈窗模式。
  const handleResetRotation = () => {
    if (!window.confirm("確定要重置目前輪次的站位嗎？此動作無法復原。")) return;
    resetCurrentRotationPositions(matchId);
  };

  return (
    <section>
      <div className="flex gap-2">
        <button onClick={handleResetRotation} className={`flex-1 ${PANEL_BUTTON_CLASS}`}>
          重置站位
        </button>
        <button
          onClick={() => clearDrawings()}
          disabled={!session}
          title={session ? "清除白板上的畫筆與防守範圍" : "沒有正在編輯的戰術"}
          className="flex-1 rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1
            text-xs font-bold text-[#a9b096] transition hover:border-[#ef4444]
            hover:bg-[#ef4444]/10 hover:text-[#ef4444] disabled:opacity-40
            disabled:hover:border-white/[0.26] disabled:hover:bg-white/[0.05]
            disabled:hover:text-[#a9b096]"
        >
          清除畫筆
        </button>
      </div>
    </section>
  );
}
