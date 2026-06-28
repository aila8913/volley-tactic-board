import React, { useRef, useState } from "react";
import { useTactics } from "../hooks/useTactics";
import { getZoneLayout } from "../lib/rotationLogic";
import { Side } from "../types/recording";

export interface TouchedTarget {
  side: Side;
  // 我方球員才有 playerId；對手沒有名單，只有號位（見下面 opponentZones 的渲染）。
  playerId?: string;
  zone?: number;
  // 命中目標在螢幕上的座標（clientX/clientY），給 RadialMenu 用來定位彈出選單，
  // 跟球場 SVG 座標系統無關。
  screenX: number;
  screenY: number;
}

interface RecordingCourtProps {
  ourRotation: number;
  opponentRotation: number;
  // 哪一邊正在發球，畫面上用排球符號標在發球員（1 號位）旁邊。
  serving: "us" | "opponent" | null;
  // 快速操作手勢進行中（選單還沒選完）時關掉，避免使用者在選單跳出來之前又畫了一條新的線。
  interactive: boolean;
  onPlayerTouch: (target: TouchedTarget) => void;
}

// 球場座標系統固定是 viewBox 0~100 (x) / 0~200 (y)，跟戰術板 Court.tsx 共用同一套，
// 球員圈圈半徑是 6（發球員放大成 7.5）——命中判定的容許範圍要比圈圈本身再大一點，
// 不然手指/滑鼠要點得很精準才會命中，比賽現場快速操作時不現實。
const HIT_RADIUS = 11;

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

// 紀錄模式專用的球場畫面：跟戰術板的 Court.tsx 共用同一套球場座標系統，但這裡是唯讀的——
// 比賽進行中球員站位不能隨意拖曳調整，只能靠比分變化自動算輪轉。額外多了「畫線連到球員」
// 的手勢偵測：從球場任何一點按下、拖到某個球員/號位上放開，就算是連到那個目標
// （直接點在球員身上也算，因為起點跟終點是同一個點）。
export default function RecordingCourt({
  ourRotation,
  opponentRotation,
  serving,
  interactive,
  onPlayerTouch,
}: RecordingCourtProps) {
  const roster = useTactics((state) => state.roster);
  const rotations = useTactics((state) => state.rotations);
  const liberoSubstitution = useTactics((state) => state.liberoSubstitution);
  const circleLabel = useTactics((state) => state.circleLabel);

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  const ourPositions = (rotations[ourRotation] ?? rotations[0]).positions;
  // 對手沒有球員名單，只畫號位（見 lib/rotationLogic.ts 的 getZoneLayout），mirrored=true
  // 把座標翻到球場另一邊，跟 Court.tsx 畫「對手號位」標籤時的鏡射方式一致。
  const opponentZones = getZoneLayout(opponentRotation, true);

  // 場上目前所有「可以被連到」的目標，命中判定時統一從這份清單找最近的一個。
  const hitTargets: { side: Side; playerId?: string; zone?: number; x: number; y: number }[] = [
    ...opponentZones.map((slot) => ({
      side: "opponent" as const,
      zone: slot.zone,
      x: slot.x * 100,
      y: slot.y * 200,
    })),
    ...ourPositions.map((pos) => ({
      side: "us" as const,
      playerId: pos.playerId,
      x: pos.x * 100,
      y: pos.y * 200,
    })),
  ];

  const getSvgPoint = (e: React.PointerEvent) => {
    const CTM = svgRef.current?.getScreenCTM();
    if (!CTM) return { x: 50, y: 100 };
    return { x: (e.clientX - CTM.e) / CTM.a, y: (e.clientY - CTM.f) / CTM.d };
  };

  const svgToScreen = (x: number, y: number) => {
    const CTM = svgRef.current?.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    return { x: CTM.e + x * CTM.a, y: CTM.f + y * CTM.d };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    const pt = getSvgPoint(e);
    setDragStart(pt);
    setDragCurrent(pt);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    setDragCurrent(getSvgPoint(e));
  };

  const finishGesture = (releasePoint: { x: number; y: number } | null) => {
    setDragStart(null);
    setDragCurrent(null);
    if (!releasePoint) return;

    let nearest: (typeof hitTargets)[number] | null = null;
    let nearestDistance = Infinity;
    for (const target of hitTargets) {
      const d = distance(releasePoint.x, releasePoint.y, target.x, target.y);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = target;
      }
    }
    if (!nearest || nearestDistance > HIT_RADIUS) return;

    const screen = svgToScreen(nearest.x, nearest.y);
    onPlayerTouch({
      side: nearest.side,
      playerId: nearest.playerId,
      zone: nearest.zone,
      screenX: screen.x,
      screenY: screen.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStart) return;
    finishGesture(getSvgPoint(e));
  };

  const handlePointerLeave = () => {
    // 滑出球場範圍視為取消這次手勢，不命中任何目標。
    finishGesture(null);
  };

  return (
    <div className="h-full w-full max-w-[420px] mx-auto flex flex-col justify-center items-center">
      {/* 同 Court.tsx：以高度為主，寬度由 aspect-ratio 1/2 推算，避免球場長出視窗 */}
      <div
        className="h-full w-auto max-w-full relative bg-white border-4 border-[#111111] rounded-lg shadow-sm"
        style={{ aspectRatio: "1/2" }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 100 200"
          preserveAspectRatio="none"
          className="w-full h-full touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          <rect x="0" y="0" width="100" height="200" fill="#fff" />
          {/* 外框由 div 的 border-4 負責，SVG 只畫球場內部線條 */}
          <line x1="0" y1="100" x2="100" y2="100" stroke="#111" strokeWidth="2.5" />
          <line
            x1="0"
            y1="66.7"
            x2="100"
            y2="66.7"
            stroke="#111"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <line
            x1="0"
            y1="133.3"
            x2="100"
            y2="133.3"
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

          {/* 畫線連到球員：拖曳中的視覺回饋，純粹是手勢的提示線，不會被存下來。 */}
          {dragStart && dragCurrent && (
            <line
              x1={dragStart.x}
              y1={dragStart.y}
              x2={dragCurrent.x}
              y2={dragCurrent.y}
              stroke="#111"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              className="pointer-events-none"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
