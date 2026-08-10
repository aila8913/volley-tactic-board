import React, { useRef, useState } from "react";
import { useParams } from "wouter";
import { Marker as MarkerType } from "../types/tacticsBoard";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { fromScreen } from "../lib/courtGeometry";

export default function Markers({ marker }: { marker: MarkerType }) {
  const { id: matchId } = useParams<{ id: string }>();
  const { selectedObjectId, setSelectedObjectId, activeTool, updateMarker, pushHistory, session } =
    useTacticsBoard();
  // 有 session＝正在即時布置、可拖曳編輯（取代舊的 isLayoutMode，issue #154 PR C）。
  const isLayoutMode = session !== null;
  const [isEditingText, setIsEditingText] = useState(false);
  const [tempText, setTempText] = useState(marker.text || "");

  // 拖曳整個標記（線的兩個端點一起移動，文字/排球只有一個點）：記住手指剛按下時的
  // SVG 座標，跟這個標記原本的座標，拖曳中用兩者的差值（dx, dy）算出新座標，
  // 邏輯跟 DefenseRange.tsx 拖防守範圍是同一套。
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef<{ points?: { x: number; y: number }[]; x?: number; y?: number }>({});
  // 「這次按下去之後，到底有沒有真的移動過？」isDragging 在 pointerDown 就會被設成 true
  //（因為那時還不知道使用者接下來是要拖還是只是點一下選取），所以它**不能**拿來判斷該不該
  // 記歷史——單純點一下選取也會走完 down→up。少了這個旗標，點一下就會記進一格「跟現在
  // 一模一樣」的歷史，症狀就是 #361-4 那種「第一次 Ctrl+Z 按了沒反應」，而且會讓
  // isSessionDirty 變成 true，什麼都沒改卻被問「未儲存的內容要捨棄嗎」。
  // 只有 pointerMove 真的改過座標時才會被設成 true。
  const didMove = useRef(false);

  const isSelected = selectedObjectId === marker.id;

  const getSvgPoint = (e: React.PointerEvent, svg: Element) =>
    fromScreen(e.clientX, e.clientY, svg as SVGSVGElement);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool !== "select" || !isLayoutMode) return;
    setSelectedObjectId(marker.id);
    const target = e.target as Element;
    const svg = target.closest("svg");
    if (!svg) return;
    isDragging.current = true;
    didMove.current = false;
    target.setPointerCapture(e.pointerId);
    dragStart.current = getSvgPoint(e, svg);
    dragOrigin.current = marker.points
      ? { points: marker.points.map((p) => ({ ...p })) }
      : { x: marker.x, y: marker.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !matchId) return;
    const target = e.target as Element;
    const svg = target.closest("svg");
    if (!svg) return;
    const current = getSvgPoint(e, svg);
    const dx = current.x - dragStart.current.x;
    const dy = current.y - dragStart.current.y;

    didMove.current = true;
    if (dragOrigin.current.points) {
      updateMarker(
        marker.id,
        { points: dragOrigin.current.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) },
        { skipHistory: true },
      );
    } else if (dragOrigin.current.x !== undefined && dragOrigin.current.y !== undefined) {
      updateMarker(
        marker.id,
        { x: dragOrigin.current.x + dx, y: dragOrigin.current.y + dy },
        { skipHistory: true },
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);
    // #361-1：拖曳中的每個 pointerMove 都傳 skipHistory 跳過歷史，放開才在這裡補記一次——
    // 這樣一整次拖曳（起點到終點）算「一步」，跟畫線工具（arrow/dashed/attack）在
    // Court.tsx 的「拖曳中不記、放開才記」是同一套模式（#147）。
    // 要用 didMove 而不是 isDragging 當條件，理由見上面 didMove 宣告處的說明。
    if (didMove.current) {
      didMove.current = false;
      pushHistory();
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
    if (matchId && tempText.trim() !== marker.text) {
      // updateMarker 現在預設就會記歷史（#361-2 的修法），這裡不用再額外做什麼——
      // 改文字本來就該是一步可 undo 的動作，只是舊版漏記了。
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
            /* 這個 input 包在 <foreignObject> 裡，x/y/width/height 都是 SVG 使用者座標系
               （由外層 <svg> 的 viewBox 決定，會隨球場縮放整個跟著縮放），跟螢幕上的實體
               px 不是同一個單位系統——這裡的 5px 是「viewBox 座標系裡的 5」，不是「螢幕上
               的 5px」，所以不能跟正文字級 token（--text-micro 等）混在一起收斂，此處保留
               text-[5px] 任意值，不套用 #310 的語意 token。 */
            /* eslint-disable-next-line no-restricted-syntax -- SVG viewBox 座標系的 5px，非螢幕字級，見上方註解 */
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
