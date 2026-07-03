import React from "react";
import { useRotationTable } from "../hooks/useRotationTable";

export default function RotationThumbnails() {
  const { rotations, currentRotation, setCurrentRotation } = useRotationTable();

  return (
    <div className="flex gap-2 px-1 pt-2 pb-1">
      {rotations.map((r, i) => {
        const positions = r.positions;
        return (
          <div
            key={i}
            onClick={() => setCurrentRotation(i)}
            data-testid={`thumbnail-rotation-${i}`}
            className={`flex-1 h-[52px] wobbly-border cursor-pointer flex flex-col items-center justify-between p-1 transition-transform
              ${currentRotation === i ? "bg-[#CCFF00] scale-105 shadow-[2px_2px_0_0_#111]" : "bg-white hover:bg-gray-100"}
            `}
          >
            <div className="w-full flex-1 border border-[#111] rounded-sm relative opacity-60">
              {positions.map((pos) => (
                <div
                  key={pos.playerId}
                  className="absolute w-1 h-1 bg-[#111] rounded-full"
                  style={{
                    left: `${pos.x * 100}%`,
                    top: `${pos.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}
            </div>
            <span className="text-[9px] font-bold leading-none mt-0.5">{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}
