import React, { useEffect } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-white text-[#111111] font-sans">
      <header className="flex items-center justify-between border-b-2 border-[#111] px-4 py-3 shrink-0">
        <BackToMatchListButton href={backHref} />
        <h1 className="text-lg font-bold">{match ? `vs ${match.opponent}` : "戰術板"}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/matches/${id}/record`}>計分表</Link>
        </Button>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-[260px] border-r-2 border-[#111111] flex-shrink-0 flex flex-col">
          <RotationTable />
        </div>
        <div className="flex-1 flex flex-col relative overflow-hidden bg-white">
          <div className="flex-1 p-4 flex items-center justify-center relative min-h-0">
            <Court />
          </div>
        </div>
        <div className="w-[250px] border-l-2 border-[#111111] flex-shrink-0 flex flex-col">
          <TacticsBoardPanel />
        </div>
      </div>
      <svg className="hidden">
        <filter id="wobbly-filter">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="3"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
    </div>
  );
}
