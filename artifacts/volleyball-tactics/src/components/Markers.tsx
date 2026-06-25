import React, { useState } from "react";
import { Marker as MarkerType } from "../types/tactics";
import { useTactics } from "../hooks/useTactics";

export default function Markers({ marker }: { marker: MarkerType }) {
  const { selectedObjectId, setSelectedObjectId, activeTool, updateMarker, isLayoutMode } =
    useTactics();
  const [isEditingText, setIsEditingText] = useState(false);
  const [tempText, setTempText] = useState(marker.text || "");

  const isSelected = selectedObjectId === marker.id;

  const handleClick = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool === "select" && isLayoutMode) {
      setSelectedObjectId(marker.id);
    }
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
        onPointerDown={handleClick}
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
        onPointerDown={handleClick}
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
        onPointerDown={handleClick}
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
        onPointerDown={handleClick}
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
        onPointerDown={handleClick}
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
