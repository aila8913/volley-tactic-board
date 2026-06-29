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
  const {
    placePlayerOnCourt,
    placePlayerFree,
    selectedObjectId,
    setSelectedObjectId,
    activeTool,
    circleLabel,
    isLayoutMode,
  } = useTactics();
  const [isDragging, setIsDragging] = useState(false);

  // 格子吸附模式（非 layout mode）：拖曳中暫時吸附到的格子
  const [dragZone, setDragZone] = useState<number | null>(null);
  // 自由移動模式（layout mode）：拖曳中的 SVG 座標（0~100 / 0~200 範圍）
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const nodeRef = useRef<SVGGElement>(null);
  const isSelected = selectedObjectId === position.playerId;
  const bgColor = isLibero ? "#FF6B00" : isFrontRow ? "#CCFF00" : "#FFFFFF";
  const radius = 6;

  // 顯示位置計算：
  // - layout mode 拖曳中 → 直接用游標座標
  // - layout mode 靜止 → 用 position.x/y 直接換算（自由座標，不反推格子）
  // - 非 layout mode → 從格子編號換算（確保完全對齊格子中心）
  let x: number, y: number;
  if (isLayoutMode && dragPos) {
    x = dragPos.x;
    y = dragPos.y;
  } else if (isLayoutMode) {
    x = position.x * 100;
    y = position.y * 200;
  } else {
    const renderZone = dragZone ?? findNearestZone(position.x, position.y);
    const coords = getZoneCoords(renderZone);
    x = coords.x * 100;
    y = coords.y * 200;
  }

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

    if (isLayoutMode) {
      setDragPos({ x: rawX, y: rawY });
    } else {
      setDragZone(findNearestZone(rawX / 100, rawY / 200));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);

    if (isLayoutMode && dragPos) {
      // 正規化到 0~1 範圍再存進 store
      placePlayerFree(position.playerId, dragPos.x / 100, dragPos.y / 200);
      setDragPos(null);
    } else if (dragZone !== null) {
      placePlayerOnCourt(position.playerId, dragZone);
      setDragZone(null);
    }
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
        stroke="#111111"
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
