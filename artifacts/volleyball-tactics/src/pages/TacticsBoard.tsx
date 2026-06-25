import React, { useEffect } from "react";
import { useParams } from "wouter";
import LeftPanel from "../components/LeftPanel";
import RightPanel from "../components/RightPanel";
import Court from "../components/Court";
import { useMatches } from "../hooks/useMatches";
import { useTactics } from "../hooks/useTactics";

export default function TacticsBoard() {
  const { id } = useParams<{ id: string }>();
  const match = useMatches((state) => state.matches.find((m) => m.id === id));
  const setRoster = useTactics((state) => state.setRoster);

  // 進入戰術板時，把這場比賽名單帶進來，這樣球員設定才會跟外面比賽列表輸入的資訊一致。
  // 只在比賽資料本身變動時才重新同步，不然每次 render 都會跑。
  useEffect(() => {
    if (match) {
      setRoster(match.players);
    }
  }, [match, setRoster]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-[#111111] font-sans">
      <div className="w-[260px] border-r-2 border-[#111111] flex-shrink-0 flex flex-col">
        <LeftPanel />
      </div>
      <div className="flex-1 flex flex-col relative overflow-hidden bg-white">
        <div className="flex-1 p-4 flex items-center justify-center relative min-h-0">
          <Court />
        </div>
      </div>
      <div className="w-[250px] border-l-2 border-[#111111] flex-shrink-0 flex flex-col">
        <RightPanel />
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
