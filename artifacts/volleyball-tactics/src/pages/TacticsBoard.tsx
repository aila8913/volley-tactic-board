import React, { useEffect } from "react";
import { useParams, Link } from "wouter";
import BackToMatchListButton from "../components/BackToMatchListButton";
import RotationTable from "../components/RotationTable";
import TacticsBoardPanel from "../components/TacticsBoardPanel";
import Court from "../components/Court";
import { useMatchWithRoster } from "../hooks/useMatches";
import { useRotationTable } from "../hooks/useRotationTable";

export default function TacticsBoard() {
  const { id } = useParams<{ id: string }>();
  // URL 的 id 是字串，後端 match id 是整數，取用前轉成 number。
  const { match } = useMatchWithRoster(Number(id));
  const setRoster = useRotationTable((state) => state.setRoster);

  // 進入戰術板時，把這場比賽名單帶進來，這樣球員設定才會跟外面比賽列表輸入的資訊一致。
  // 只在比賽資料本身變動時才重新同步，不然每次 render 都會跑。
  useEffect(() => {
    if (match) {
      setRoster(match.players);
    }
  }, [match, setRoster]);

  // tournamentId 存在時返回該資料夾頁，否則返回根列表。
  const backHref = match?.tournamentId ? `/tournaments/${match.tournamentId}` : "/";

  return (
    // 整頁共用一張材質更豐富的背景（兩顆柔光暈疊底層斜切漸層，呼應球場的螢光綠強調色
    // 跟深青球場色，比單純兩色漸層更有層次）。玻璃分兩層、刻意做出不同的「霧面程度」：
    // 外層 chrome（header、左右功能欄）是大片、模糊度低、幾乎透明的「窗格」，只負責
    // 界定區域；裡面的小卡片（球員列、已儲存戰術）是模糊度更高、更明顯的霧面玻璃，
    // 才是真正讀起來「有質感」的物件——呼應參考圖裡小徽章清楚飄浮在背景上的效果。
    <div
      className="flex h-screen w-full flex-col overflow-hidden font-dash text-[#f5f5f0]"
      style={{
        background:
          "radial-gradient(ellipse 55% 45% at 18% 12%, rgba(198,241,53,0.10), transparent 70%), " +
          "radial-gradient(ellipse 65% 55% at 88% 92%, rgba(42,110,106,0.30), transparent 70%), " +
          "linear-gradient(160deg, #0a0b07 0%, #16241c 55%, #0a0b07 100%)",
      }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
        <BackToMatchListButton href={backHref} />
        <h1 className="text-lg font-bold">{match ? `vs ${match.opponent}` : "戰術板"}</h1>
        <Link
          href={`/matches/${id}/record`}
          className="inline-flex h-9 items-center rounded-full border border-white/[0.26] px-4
            text-[13px] font-semibold text-[#f5f5f0] transition hover:border-[#c6f135]
            hover:text-[#c6f135]"
        >
          計分表
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
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
