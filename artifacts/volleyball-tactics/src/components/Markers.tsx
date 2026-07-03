import React, { useRef, useState } from "react";
import { Marker as MarkerType } from "../types/tacticsBoard";
import { useTacticsBoard } from "../hooks/useTacticsBoard";

export default function Markers({ marker }: { marker: MarkerType }) {
  const { selectedObjectId, setSelectedObjectId, activeTool, updateMarker, isLayoutMode } =
    useTacticsBoard();
  const [isEditingText, setIsEditingText] = useState(false);
  const [tempText, setTempText] = useState(marker.text || "");

  // 拖曳整個標記（線的兩個端點一起移動，文字/排球只有一個點）：記住手指剛按下時的
  // SVG 座標，跟這個標記原本的座標，拖曳中用兩者的差值（dx, dy）算出新座標，
  // 邏輯跟 DefenseRange.tsx 拖防守範圍是同一套。
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef<{ points?: { x: number; y: number }[]; x?: number; y?: number }>({});

  const isSelected = selectedObjectId === marker.id;

  const getSvgPoint = (e: React.PointerEvent, svg: Element) => {
    const CTM = (svg as SVGSVGElement).getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    return { x: (e.clientX - CTM.e) / CTM.a, y: (e.clientY - CTM.f) / CTM.d };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool !== "select" || !isLayoutMode) return;
    setSelectedObjectId(marker.id);
    const target = e.target as Element;
    const svg = target.closest("svg");
    if (!svg) return;
    isDragging.current = true;
    target.setPointerCapture(e.pointerId);
    dragStart.current = getSvgPoint(e, svg);
    dragOrigin.current = marker.points
      ? { points: marker.points.map((p) => ({ ...p })) }
      : { x: marker.x, y: marker.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const target = e.target as Element;
    const svg = target.closest("svg");
    if (!svg) return;
    const current = getSvgPoint(e, svg);
    const dx = current.x - dragStart.current.x;
    const dy = current.y - dragStart.current.y;

    if (dragOrigin.current.points) {
      updateMarker(marker.id, {
        points: dragOrigin.current.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      });
    } else if (dragOrigin.current.x !== undefined && dragOrigin.current.y !== undefined) {
      updateMarker(marker.id, {
        x: dragOrigin.current.x + dx,
        y: dragOrigin.current.y + dy,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTool === "select" && isLayoutMode && marker.type === "text") {
      setIsEditingText(true);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempText(e.target.value);
  };

  const handleTextBlur = () => {
    setIsEditingText(false);
    if (tempText.trim() !== marker.text) {
      updateMarker(marker.id, { text: tempText });
    }
  };

  const strokeColor = isSelected ? "#CCFF00" : "#111111";

  if (marker.type === "arrow" && marker.points && marker.points.length >= 2) {
    const [p1, p2] = marker.points;
    return (
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={strokeColor}
        strokeWidth="1.5"
        markerEnd="url(#arrowhead)"
        className={`cursor-pointer ${isSelected ? "drop-shadow-md" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    );
  }

  if (marker.type === "dashed" && marker.points && marker.points.length >= 2) {
    const [p1, p2] = marker.points;
    return (
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeDasharray="3 3"
        className={`cursor-pointer ${isSelected ? "drop-shadow-md" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    );
  }

  if (marker.type === "attack" && marker.points && marker.points.length >= 2) {
    const [p1, p2] = marker.points;
    return (
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={strokeColor}
        strokeWidth="2.5"
        markerEnd="url(#attack-arrowhead)"
        className={`cursor-pointer ${isSelected ? "drop-shadow-md" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    );
  }

  if (marker.type === "text" && marker.x && marker.y) {
    if (isEditingText) {
      return (
        <foreignObject
          x={marker.x - 20}
          y={marker.y - 5}
          width="40"
          height="10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            value={tempText}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            onKeyDown={(e) => e.key === "Enter" && handleTextBlur()}
            className="w-full h-full text-[5px] bg-transparent outline-none border-b border-[#111] text-center font-sans text-[#111]"
            style={{ fontSize: "5px" }}
          />
        </foreignObject>
      );
    }

    return (
      <text
        x={marker.x}
        y={marker.y}
        fill={strokeColor}
        fontSize="5"
        fontWeight="bold"
        textAnchor="middle"
        className="font-sans cursor-pointer select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {marker.text}
      </text>
    );
  }

  if (marker.type === "volleyball" && marker.x && marker.y) {
    return (
      <g
        transform={`translate(${marker.x}, ${marker.y})`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="cursor-pointer"
      >
        <circle r="3" fill="#fff" stroke={strokeColor} strokeWidth="1" />
        <path
          d="M -3 0 Q 0 3 3 0 M 0 -3 Q 0 0 0 3"
          stroke={strokeColor}
          fill="none"
          strokeWidth="0.5"
        />
      </g>
    );
  }

  return null;
}
