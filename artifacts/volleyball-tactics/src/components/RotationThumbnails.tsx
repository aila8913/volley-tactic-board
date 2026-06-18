import React from 'react';
import { useTactics } from '../hooks/useTactics';

export default function RotationThumbnails() {
  const { rotations, currentRotation, setCurrentRotation, resetCurrentRotation, clearMarkers } = useTactics();

  return (
    <div className="flex h-full wobbly-svg px-4 items-center justify-between">
      <div className="flex gap-4 overflow-x-auto items-center flex-1 h-full py-2">
        {rotations.map((r, i) => (
          <div 
            key={i} 
            onClick={() => setCurrentRotation(i)}
            className={`w-[70px] h-[80px] wobbly-border cursor-pointer flex flex-col items-center justify-between p-1 transition-transform
              ${currentRotation === i ? 'bg-[#CCFF00] scale-105 shadow-[2px_2px_0_0_#111]' : 'bg-white hover:bg-gray-100'}
            `}
          >
            <div className="w-full flex-1 border-2 border-[#111] rounded-sm relative opacity-60">
              {/* Very minimal dots for players */}
              {r.positions.map((pos) => (
                <div 
                  key={pos.playerId}
                  className="absolute w-1.5 h-1.5 bg-[#111] rounded-full"
                  style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: 'translate(-50%, -50%)' }}
                />
              ))}
            </div>
            <span className="text-[10px] font-bold mt-1 font-display">輪次 {i + 1}</span>
          </div>
        ))}
      </div>
      
      <div className="flex flex-col gap-2 pl-4 border-l-2 border-[#111]">
        <button onClick={resetCurrentRotation} className="wobbly-border bg-white px-3 py-1 text-xs font-bold hover:bg-gray-100">重置站位</button>
        <button onClick={clearMarkers} className="wobbly-border bg-white px-3 py-1 text-xs font-bold hover:bg-red-100 text-red-600">清除畫筆</button>
      </div>
    </div>
  );
}
