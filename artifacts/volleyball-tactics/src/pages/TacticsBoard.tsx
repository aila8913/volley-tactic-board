import React from 'react';
import LeftPanel from '../components/LeftPanel';
import RightPanel from '../components/RightPanel';
import Court from '../components/Court';

export default function TacticsBoard() {
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
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </div>
  );
}
