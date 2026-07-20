import React, { useEffect } from "react";
import { useParams } from "wouter";
import MatchNavRail, { matchBackHref } from "../components/MatchNavRail";
import RotationTable from "../components/RotationTable";
import TacticsBoardPanel from "../components/TacticsBoardPanel";
import Court from "../components/Court";
import { useMatchWithRoster } from "../hooks/useMatches";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";

export default function TacticsBoard() {
  const { id } = useParams<{ id: string }>();
  // URL 的 id 是字串，後端 match id 是整數，取用前轉成 number。
  const { match } = useMatchWithRoster(Number(id));
  const setRoster = useRotationTable((state) => state.setRoster);
  const resetBoardView = useTacticsBoard((state) => state.resetBoardView);

  // 切換到某一場戰術板時，把全域、暫時性的畫面狀態（undo 歷史、布置模式、視圖）歸零
  //（issue #119）：這些是全域共用、但戰術資料是 per-match，不歸零的話從 A 場帶著歷史
  // 切到 B 場再按 Ctrl+Z 會把 A 的快照還原進 B。
  // 傳入 id 之後，resetBoardView 會分辨「跨場」跟「同一場內的交棒」——只有 matchId 真的
  // 變動（跨場）才會清掉 session；同一場（例如從計分頁的「快速戰術板」按鈕先 startSession()
  // 再導航過來，見 ScoreSheet.tsx）進來時，交棒的 session 會被保留（issue #160 C3）。
  useEffect(() => {
    resetBoardView(id);
  }, [id, resetBoardView]);

  // 進入戰術板時，把這場比賽名單帶進來，這樣球員設定才會跟外面比賽列表輸入的資訊一致。
  // 只在比賽資料本身變動時才重新同步，不然每次 render 都會跑。
  // setRoster 現在要指定 matchId（issue #119）：名單存進「這一場」的分片，不會污染別場。
  useEffect(() => {
    if (match && id) {
      setRoster(id, match.players);
    }
  }, [match, id, setRoster]);

  // tournamentId 存在時返回該資料夾頁，否則返回根列表。
  const backHref = matchBackHref(match?.tournamentId);

  return (
    // 整頁共用一張材質更豐富的背景（兩顆柔光暈疊底層斜切漸層，呼應球場的螢光綠強調色
    // 跟深青球場色，比單純兩色漸層更有層次）。玻璃分兩層、刻意做出不同的「霧面程度」：
    // 外層 chrome（header、左右功能欄）是大片、模糊度低、幾乎透明的「窗格」，只負責
    // 界定區域；裡面的小卡片（球員列、已儲存戰術）是模糊度更高、更明顯的霧面玻璃，
    // 才是真正讀起來「有質感」的物件——呼應參考圖裡小徽章清楚飄浮在背景上的效果。
    <div
      className="relative flex h-screen w-full flex-col overflow-hidden font-dash text-[#f5f5f0]"
      style={{
        background:
          "radial-gradient(ellipse 55% 45% at 18% 12%, rgba(198,241,53,0.10), transparent 70%), " +
          "radial-gradient(ellipse 65% 55% at 88% 92%, rgba(42,110,106,0.30), transparent 70%), " +
          "linear-gradient(160deg, #0a0b07 0%, #16241c 55%, #0a0b07 100%)",
      }}
    >
      {/* issue #134 Track B（材質強化）：低調斜向光影 + 置中放大的字標，破除原本
          「整片平」的單調感。兩個都是 position: absolute，所以下面的 header／三欄
          主體都加了 relative，讓它們有自己的 stacking context 疊在這兩層上面——
          不然沒有明確 stacking context 時，absolute 定位的背景元素預設會蓋到一般
          文件流的前景 UI 上面。VOLLEY / BOARD 是品牌名稱定案前的佔位字。 */}
      <div className="tb-beam" />
      <div className="tb-mark">
        <div className="tb-mark-flourish">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="tb-mark-hero">
          <span className="layer layer-glow">
            VOLLEY
            <br />
            BOARD
          </span>
          <span className="layer layer-core">
            VOLLEY
            <br />
            BOARD
          </span>
        </div>
        <div className="tb-mark-caption">Tactics Board · Est. 2026</div>
      </div>

      <header className="relative z-10 flex shrink-0 items-center justify-center border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
        <h1 className="text-lg font-bold">{match ? `vs ${match.opponent}` : "戰術板"}</h1>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {/* 共用左側導覽軌（issue #160）：以前「回列表」「計分表」是這個 header 自己的
            <BackToMatchListButton> / <Link>，跟另外兩個match-scoped頁面各刻各的、樣式
            不統一。現在三個頁共用同一個 MatchNavRail，導覽只在一個地方定義。 */}
        <MatchNavRail matchId={id ?? ""} backHref={backHref} active="board" />
        <div className="flex w-[260px] flex-shrink-0 flex-col border-r border-white/[0.08] bg-white/[0.02] backdrop-blur-sm">
          <RotationTable />
        </div>
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
            <Court />
          </div>
        </div>
        <div className="flex w-[250px] flex-shrink-0 flex-col border-l border-white/[0.08] bg-white/[0.02] backdrop-blur-sm">
          <TacticsBoardPanel />
        </div>
      </div>
    </div>
  );
}
