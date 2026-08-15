import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";

// 小按鈕共用樣式（重置先發/清除畫筆），跟 RotationTable.tsx 原本用的是同一套，
// 抽出來這裡是因為這個檔案本身就是從 RotationTable.tsx 搬出來的。
const PANEL_BUTTON_CLASS =
  "rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1 text-xs " +
  "font-bold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]";

interface RotationControlsFooterProps {
  matchId: string;
}

// 「重置先發／清除畫筆」區塊，issue #251 從 RotationTable.tsx 的 footer 抽出來獨立成元件
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
  const resetPositions = useRotationTable((state) => state.resetPositions);
  // 戰術白板改成單景 session 後（issue #154 PR C），沒有「常駐的第 N 輪畫筆」可清了：
  // 畫筆只在編輯中的 session 裡存在，所以「清除畫筆」改成清掉當前 session 的畫筆/防守範圍，
  // 沒在編輯（無 session）時停用。
  //
  // 這個元件在 mode D（TacticsRosterPanel）被呼叫時 session 一定存在（mode D 的定義就是
  // session.arranging），所以那個呼叫點上這顆按鈕永遠不會被 disabled——這是預期行為，
  // 不是漏接：mode D 本來就是在編輯戰術，理當隨時可以清畫筆。
  const session = useTacticsBoard((state) => state.session);
  const clearDrawings = useTacticsBoard((state) => state.clearDrawings);

  // 這顆鈕清空的是**輪轉表的先發**（`lineup`：六個號位各站誰），不是白板上那張戰術。
  // 這個動作沒有 undo，點錯會直接清空——用瀏覽器內建的 window.confirm() 擋一下，
  // 跟 MatchList.tsx / TournamentDetail.tsx 刪除比賽/賽事時用的是同一套簡單彈窗模式。
  //
  // 文案改過兩次：
  //   #231 PR3：以前寫「重置目前輪次的站位」，但先發只有一份、六輪共用，清掉就是六輪
  //     一起清。舊文案在舊表示法下其實也名不副實——清掉第 3 輪之後只要再拖任何一個人，
  //     六輪就會全部從那一輪重算，「只清一輪」的結果本來就留不住。
  //   #328：「重置站位」→「重置先發」。#324 的 QA 回報是「在佈陣模式按了沒反應」，追下去
  //     不是 resetPositions 壞掉，而是**按鈕名字沒有指出它作用在哪一份資料**：使用者當時在
  //     排白板上的球員，「站位」聽起來就是眼前那些人，但清掉的是右欄那份先發。CONTEXT.md
  //     把這兩件事分成不同的詞——「先發」是一局開賽凍結的六個號位（就是這裡清的東西），
  //     「站位」泛指誰站在哪，白板上自由擺的球員也算——所以改用精確的那個詞。輪轉畫法
  //     退役（#328）之後中央球場不再畫先發，這顆鈕唯一的效果就在它自己所在的這一欄，
  //     名字對上了，回饋也就在眼前。
  const handleResetRotation = () => {
    if (!window.confirm("確定要重置先發嗎？六個輪次的站位會一起清空，此動作無法復原。")) return;
    resetPositions(matchId);
  };

  return (
    <section>
      <div className="flex gap-2">
        <button
          onClick={handleResetRotation}
          title="清空上方輪轉表的先發（六個號位），不會動到白板上的戰術"
          className={`flex-1 ${PANEL_BUTTON_CLASS}`}
        >
          重置先發
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
