import React from "react";
import { useTactics, getActivePositions } from "../hooks/useTactics";
import { getZoneLayout } from "../lib/rotationLogic";

interface RecordingCourtProps {
  ourRotation: number;
  opponentRotation: number;
  // 哪一邊正在發球，畫面上用排球符號標在發球員（1 號位）旁邊。
  serving: "us" | "opponent" | null;
}

// 紀錄模式專用的球場畫面：跟戰術板的 Court.tsx 共用同一套球場座標系統（0~1 normalized，
// 對應 viewBox 0~100 x 0~200），但這裡是唯讀的——比賽進行中球員站位不能隨意拖曳調整，
// 只能靠比分變化自動算輪轉，所以不接 PlayerNode 那套拖曳互動，自己畫簡單的圈圈就好。
export default function RecordingCourt({
  ourRotation,
  opponentRotation,
  serving,
}: RecordingCourtProps) {
  const roster = useTactics((state) => state.roster);
  const rotations = useTactics((state) => state.rotations);
  const liberoSubstitution = useTactics((state) => state.liberoSubstitution);
  const circleLabel = useTactics((state) => state.circleLabel);

  const ourPositions = getActivePositions(rotations[ourRotation] ?? rotations[0], "base");
  // 對手沒有球員名單，只畫號位（見 lib/rotationLogic.ts 的 getZoneLayout），mirrored=true
  // 把座標翻到球場另一邊，跟 Court.tsx 畫「對手號位」標籤時的鏡射方式一致。
  const opponentZones = getZoneLayout(opponentRotation, true);

  return (
    <div className="h-full w-full max-w-[420px] mx-auto flex flex-col justify-center items-center">
      <div
        className="w-full relative bg-white border-4 border-[#111111] rounded-lg shadow-sm"
        style={{ aspectRatio: "1/2" }}
      >
        <svg viewBox="0 0 100 200" preserveAspectRatio="none" className="w-full h-full">
          <rect x="0" y="0" width="100" height="200" fill="#fff" />
          <rect x="5" y="5" width="90" height="190" fill="none" stroke="#111" strokeWidth="1.5" />
          <line x1="5" y1="100" x2="95" y2="100" stroke="#111" strokeWidth="2.5" />
          <line
            x1="5"
            y1="68.3"
            x2="95"
            y2="68.3"
            stroke="#111"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <line
            x1="5"
            y1="131.7"
            x2="95"
            y2="131.7"
            stroke="#111"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          <text x="50" y="15" fontSize="6" fill="#111" textAnchor="middle" className="font-sans">
            對手
          </text>
          <text x="50" y="192" fontSize="6" fill="#111" textAnchor="middle" className="font-sans">
            我方
          </text>

          {/* 對手：沒有名單，只畫號位圈圈，灰底跟我方球員的圈圈做出區分 */}
          {opponentZones.map((slot) => {
            const isFrontRow = slot.y > 0.25 && slot.y < 0.5;
            const isServer = serving === "opponent" && slot.zone === 1;
            const x = slot.x * 100;
            const y = slot.y * 200;
            return (
              <g key={`opp-${slot.zone}`} transform={`translate(${x}, ${y})`}>
                <circle
                  r={isServer ? 7.5 : 6}
                  fill={isFrontRow ? "#E5E5E5" : "#F5F5F5"}
                  stroke="#999"
                  strokeWidth={isServer ? 1.5 : 1}
                  strokeDasharray="2 1"
                />
                <text
                  y="2"
                  fontSize="4"
                  fontWeight="bold"
                  fill="#666"
                  textAnchor="middle"
                  className="font-sans"
                >
                  {slot.zone}
                </text>
                {isServer && (
                  <text y="-9" fontSize="6" textAnchor="middle">
                    🏐
                  </text>
                )}
              </g>
            );
          })}

          {/* 我方：用真實球員名單畫位置，邏輯跟 Court.tsx 的球員渲染一致（自由球員替換、前排標色） */}
          {ourPositions.map((pos) => {
            const player = roster.find((p) => p.id === pos.playerId);
            if (!player) return null;

            let isLibero = false;
            let displayPlayer = player;
            if (liberoSubstitution === player.id) {
              const libero = roster.find((p) => p.role === "L");
              if (libero) {
                isLibero = true;
                displayPlayer = libero;
              }
            }

            const isFrontRow = pos.y > 0.5 && pos.y < 0.75;
            const isServer = serving === "us" && pos.x > 0.7 && pos.y > 0.75;
            const bgColor = isLibero ? "#FF6B00" : isFrontRow ? "#CCFF00" : "#FFFFFF";
            const x = pos.x * 100;
            const y = pos.y * 200;

            return (
              <g key={pos.playerId} transform={`translate(${x}, ${y})`}>
                <circle
                  r={isServer ? 7.5 : 6}
                  fill={bgColor}
                  stroke="#111"
                  strokeWidth={isServer ? 1.5 : 1}
                />
                <text
                  y="2"
                  fontSize={circleLabel === "name" ? 3 : 4}
                  fontWeight="bold"
                  fill="#111"
                  textAnchor="middle"
                  className="font-sans"
                >
                  {circleLabel === "name"
                    ? displayPlayer.name || displayPlayer.role
                    : circleLabel === "number"
                      ? displayPlayer.number
                      : displayPlayer.role}
                </text>
                {isServer && (
                  <text y="-9" fontSize="6" textAnchor="middle">
                    🏐
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
