import React, { useRef } from "react";
import { useParams } from "wouter";
import { DefenseRange as DefenseRangeType } from "../types/tacticsBoard";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { fromScreen } from "../lib/courtGeometry";

export default function DefenseRange({ range }: { range: DefenseRangeType }) {
  const { id: matchId } = useParams<{ id: string }>();
  const {
    selectedObjectId,
    setSelectedObjectId,
    activeTool,
    updateDefenseRange,
    pushHistory,
    session,
  } = useTacticsBoard();
  // 有 session＝正在即時布置、可拖曳編輯（取代舊的 isLayoutMode，issue #154 PR C）。
  const isLayoutMode = session !== null;
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });
  // 「這次按下去之後有沒有真的移動過」——判斷該不該記歷史要看這個，不能看 isDragging。
  // isDragging 在 pointerDown 就被設成 true（那時還分不出使用者是要拖曳還是只是點一下選取），
  // 拿它當條件的話，單純點一下就會記進一格跟現在完全相同的歷史，第一次 Ctrl+Z 會像沒反應
  //（正是 #361-4 的症狀），還會讓 isSessionDirty 誤判成「動過、有未存內容」。
  // 跟 Markers.tsx 的拖曳是同一套處理。
  const didMove = useRef(false);

  if (!range.visible) return null;

  const isSelected = selectedObjectId === range.id;
  const strokeColor = isSelected ? "#111" : "none";
  const strokeWidth = isSelected ? "1" : "0";
  const dashArray = isSelected ? "2 2" : "none";

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool === "select" && isLayoutMode) {
      setSelectedObjectId(range.id);
      isDragging.current = true;
      didMove.current = false;
      const target = e.target as Element;
      target.setPointerCapture(e.pointerId);

      const svg = target.closest("svg");
      if (svg) {
        const pt = fromScreen(e.clientX, e.clientY, svg as SVGSVGElement);
        dragStart.current = { x: pt.x, y: pt.y, initialX: range.x, initialY: range.y };
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !matchId) return;
    const target = e.target as Element;
    const svg = target.closest("svg");
    if (svg) {
      const { x: currentX, y: currentY } = fromScreen(e.clientX, e.clientY, svg as SVGSVGElement);
      const dx = currentX - dragStart.current.x;
      const dy = currentY - dragStart.current.y;

      // #361-3：拖曳中每個 pointerMove 都會呼叫這裡，updateDefenseRange 現在預設會記歷史，
      // 所以必須明確傳 skipHistory，不然一次拖曳會灌爆歷史堆疊（30 格上限一下就滿）。
      // 放開滑鼠時（下面 handlePointerUp）才補記一次，一整次拖曳算「一步」。
      didMove.current = true;
      updateDefenseRange(
        range.id,
        { x: dragStart.current.initialX + dx, y: dragStart.current.initialY + dy },
        { skipHistory: true },
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      const target = e.target as Element;
      target.releasePointerCapture(e.pointerId);
      // 真的拖動過才補記一格歷史：一整次拖曳（按下→移動→放開）算「一步」。單純點一下選取
      // 也會走完 down→up，但那不是一次編輯，記進去只會變成一格跟現在一模一樣的歷史，
      // undo 就會像按了沒反應（理由見上面 didMove 宣告處）。
      if (didMove.current) {
        didMove.current = false;
        pushHistory();
      }
    }
  };

  const getCommonProps = () => ({
    fill: range.color,
    fillOpacity: range.opacity,
    stroke: strokeColor,
    strokeWidth,
    strokeDasharray: dashArray,
    className: `cursor-${activeTool === "select" && isLayoutMode ? "grab" : "default"}`,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
  });

  if (range.type === "circle") {
    return <circle cx={range.x} cy={range.y} r={range.radius || 15} {...getCommonProps()} />;
  }

  if (range.type === "ellipse") {
    const rot = range.rotation || 0;
    return (
      <ellipse
        cx={range.x}
        cy={range.y}
        rx={range.rx || 15}
        ry={range.ry || 10}
        transform={`rotate(${rot}, ${range.x}, ${range.y})`}
        {...getCommonProps()}
      />
    );
  }

  if (range.type === "fan") {
    const r = range.radius || 15;
    const baseRotation = range.rotation || 0;
    const halfAngle = ((range.endAngle || 45) - (range.startAngle || -45)) / 2;
    const start = (-halfAngle * Math.PI) / 180;
    const end = (halfAngle * Math.PI) / 180;

    const x1 = range.x + r * Math.sin(start);
    const y1 = range.y - r * Math.cos(start);
    const x2 = range.x + r * Math.sin(end);
    const y2 = range.y - r * Math.cos(end);
    const largeArc = halfAngle * 2 > 180 ? 1 : 0;

    const d = `M ${range.x} ${range.y} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return (
      <path
        d={d}
        transform={`rotate(${baseRotation}, ${range.x}, ${range.y})`}
        {...getCommonProps()}
      />
    );
  }

  return null;
}
