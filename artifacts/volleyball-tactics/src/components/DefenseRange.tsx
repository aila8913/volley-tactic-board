import React, { useRef } from 'react';
import { DefenseRange as DefenseRangeType } from '../types/tactics';
import { useTactics } from '../hooks/useTactics';

export default function DefenseRange({ range }: { range: DefenseRangeType }) {
  const { selectedObjectId, setSelectedObjectId, activeTool, updateDefenseRange } = useTactics();
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });

  if (!range.visible) return null;

  const isSelected = selectedObjectId === range.id;
  const strokeColor = isSelected ? '#111' : 'none';
  const strokeWidth = isSelected ? "1" : "0";
  const dashArray = isSelected ? "2 2" : "none";

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool === 'select') {
      setSelectedObjectId(range.id);
      isDragging.current = true;
      const target = e.target as Element;
      target.setPointerCapture(e.pointerId);
      
      const svg = target.closest('svg');
      if (svg) {
        const CTM = svg.getScreenCTM();
        if (CTM) {
          dragStart.current = {
            x: (e.clientX - CTM.e) / CTM.a,
            y: (e.clientY - CTM.f) / CTM.d,
            initialX: range.x,
            initialY: range.y
          };
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const target = e.target as Element;
    const svg = target.closest('svg');
    if (svg) {
      const CTM = svg.getScreenCTM();
      if (CTM) {
        const currentX = (e.clientX - CTM.e) / CTM.a;
        const currentY = (e.clientY - CTM.f) / CTM.d;
        const dx = currentX - dragStart.current.x;
        const dy = currentY - dragStart.current.y;
        
        updateDefenseRange(range.id, {
          x: dragStart.current.initialX + dx,
          y: dragStart.current.initialY + dy
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      const target = e.target as Element;
      target.releasePointerCapture(e.pointerId);
    }
  };

  const getCommonProps = () => ({
    fill: range.color,
    fillOpacity: range.opacity,
    stroke: strokeColor,
    strokeWidth,
    strokeDasharray: dashArray,
    className: `cursor-${activeTool === 'select' ? 'grab' : 'pointer'}`,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp
  });

  if (range.type === 'circle') {
    return <circle cx={range.x} cy={range.y} r={range.radius || 15} {...getCommonProps()} />;
  }

  if (range.type === 'ellipse') {
    const rot = range.rotation || 0;
    return (
      <ellipse
        cx={range.x} cy={range.y}
        rx={range.rx || 15} ry={range.ry || 10}
        transform={`rotate(${rot}, ${range.x}, ${range.y})`}
        {...getCommonProps()}
      />
    );
  }

  if (range.type === 'fan') {
    const r = range.radius || 15;
    const baseRotation = range.rotation || 0;
    const halfAngle = ((range.endAngle || 45) - (range.startAngle || -45)) / 2;
    const start = (-halfAngle) * Math.PI / 180;
    const end = (halfAngle) * Math.PI / 180;

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
