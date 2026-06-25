import React, { useRef, useState } from "react";
import { PlayerPosition } from "../types/tactics";
import { MatchPlayer } from "../types/match";
import { useTactics } from "../hooks/useTactics";
import { findNearestZone, getZoneCoords } from "../lib/rotationLogic";

interface PlayerNodeProps {
  player: MatchPlayer;
  position: PlayerPosition;
  isFrontRow: boolean;
  isLibero: boolean;
  courtRef: React.RefObject<SVGSVGElement | null>;
}

export default function PlayerNode({
  player,
  position,
  isFrontRow,
  isLibero,
  courtRef,
}: PlayerNodeProps) {
  const { placePlayerOnCourt, selectedObjectId, setSelectedObjectId, activeTool, circleLabel } =
    useTactics();
  const [isDragging, setIsDragging] = useState(false);
  // 拖曳中暫時吸附到的格子（1~6 號位）；放開滑鼠時才真正寫進 store，拖曳過程只是預覽，
  // 這樣球員在場上只會在 6 個固定格子之間跳，不會出現格子以外的中間位置。
  const [dragZone, setDragZone] = useState<number | null>(null);
  const nodeRef = useRef<SVGGElement>(null);

  const isSelected = selectedObjectId === position.playerId;
  const bgColor = isLibero ? "#FF6B00" : isFrontRow ? "#CCFF00" : "#FFFFFF";
  const radius = 6;

  // 拖曳中顯示吸附預覽的格子，沒在拖曳就顯示目前實際站的格子（用最近格反推，
  // 避免 x/y 浮點數誤差讓圈圈看起來沒有完全對齊格子中心）。
  const renderZone = dragZone ?? findNearestZone(position.x, position.y);
  const coords = getZoneCoords(renderZone);
  const x = coords.x * 100;
  const y = coords.y * 200;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool !== "select") return;

    setSelectedObjectId(position.playerId);
    setIsDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !courtRef.current) return;

    const CTM = courtRef.current.getScreenCTM();
    if (!CTM) return;

    let rawX = (e.clientX - CTM.e) / CTM.a;
    let rawY = (e.clientY - CTM.f) / CTM.d;
    rawX = Math.max(radius, Math.min(100 - radius, rawX));
    rawY = Math.max(radius, Math.min(200 - radius, rawY));

    setDragZone(findNearestZone(rawX / 100, rawY / 200));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (dragZone !== null) {
      placePlayerOnCourt(position.playerId, dragZone);
    }
    setDragZone(null);
  };

  return (
    <g
      ref={nodeRef}
      transform={`translate(${x}, ${y})`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`cursor-grab touch-none ${isDragging ? "cursor-grabbing" : ""}`}
      style={{ transition: isDragging ? "none" : "transform 0.1s ease-out" }}
    >
      <circle
        r={isSelected ? radius + 1.5 : radius}
        fill={bgColor}
        stroke={isSelected ? "#111111" : "#111111"}
        strokeWidth={isSelected ? "1.5" : "1"}
      />

      {/* circleLabel 三選一，所以圈圈裡固定只畫一行文字；名字比較長，字級調小一點才塞得進去。 */}
      <text
        y="2"
        fontSize={circleLabel === "name" ? "3" : "4"}
        fontWeight="bold"
        fill="#111"
        textAnchor="middle"
        className="font-sans pointer-events-none"
      >
        {circleLabel === "name"
          ? player.name || player.role
          : circleLabel === "number"
            ? player.number
            : player.role}
      </text>
    </g>
  );
}
