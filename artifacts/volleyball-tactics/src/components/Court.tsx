import React, { useRef, useState, useEffect } from 'react';
import { useTactics, ToolType } from '../hooks/useTactics';
import PlayerNode from './PlayerNode';
import Markers from './Markers';
import DefenseRange from './DefenseRange';

export default function Court() {
  const { 
    rotations, currentRotation, players, labelToggles, activeTool, setActiveTool,
    addMarker, updateMarker, selectedObjectId, setSelectedObjectId,
    addDefenseRange, updateDefenseRange, liberoSubstitution,
    undo, redo
  } = useTactics();
  
  const courtRef = useRef<SVGSVGElement>(null);
  const [drawingMarkerId, setDrawingMarkerId] = useState<string | null>(null);

  const rotation = rotations[currentRotation];
  if (!rotation) return null;

  const getSvgPoint = (e: React.PointerEvent) => {
    if (!courtRef.current) return { x: 50, y: 100 };
    const CTM = courtRef.current.getScreenCTM();
    if (!CTM) return { x: 50, y: 100 };
    return {
      x: (e.clientX - CTM.e) / CTM.a,
      y: (e.clientY - CTM.f) / CTM.d
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only process if clicking on the court background/svg directly
    const target = e.target as Element;
    if (target.tagName === 'svg' || target.id === 'court-bg') {
      setSelectedObjectId(null);
      const pt = getSvgPoint(e);

      if (['arrow', 'dashed', 'attack'].includes(activeTool)) {
        // Zustand doesn't return the ID, so we need to rely on the fact that it pushes to the end.
        // But since we can't synchronously get the ID easily without modifying addMarker, 
        // we'll just set a drawing mode and update the *last* marker. 
        // Actually, we can just dispatch addMarker, then in pointerMove we update the last marker.
        addMarker({
          type: activeTool as any,
          points: [{ x: pt.x, y: pt.y }, { x: pt.x, y: pt.y }]
        });
        // We will set a flag so pointerMove knows we are drawing
        setDrawingMarkerId('drawing');
      } else if (activeTool === 'text' || activeTool === 'volleyball') {
        addMarker({
          type: activeTool as any,
          x: pt.x,
          y: pt.y,
          text: activeTool === 'text' ? '請輸入文字' : undefined
        });
        setActiveTool('select');
      } else if (['circle', 'ellipse', 'fan'].includes(activeTool)) {
        addDefenseRange({
          playerId: '',
          type: activeTool as any,
          x: pt.x,
          y: pt.y,
          radius: 15,
          rx: 15, ry: 10,
          startAngle: -45, endAngle: 45,
          color: '#CCFF00',
          opacity: 0.3,
          visible: true
        });
        setActiveTool('select');
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (drawingMarkerId === 'drawing') {
      const pt = getSvgPoint(e);
      // We assume the last marker added is the one being drawn
      const currentRotState = rotations[currentRotation];
      const markers = currentRotState.markers;
      if (markers.length > 0) {
        const lastMarker = markers[markers.length - 1];
        if (lastMarker.points && lastMarker.points.length === 2) {
          updateMarker(lastMarker.id, {
            points: [lastMarker.points[0], { x: pt.x, y: pt.y }]
          });
        }
      }
    }
  };

  const handlePointerUp = () => {
    if (drawingMarkerId) {
      setDrawingMarkerId(null);
      setActiveTool('select');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="h-full w-full max-w-[500px] mx-auto flex flex-col justify-center items-center relative py-4">
      <div id="court-wrapper" className="w-full relative bg-white border-4 border-[#111111] rounded-lg shadow-sm" style={{ aspectRatio: '1/2' }}>
        <svg 
          id="court-svg"
          ref={courtRef}
          width="100%" 
          height="100%" 
          viewBox="0 0 100 200" 
          preserveAspectRatio="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="touch-none select-none"
        >
          <defs>
            <filter id="wobbly-filter">
              <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <polygon points="0 0, 6 3, 0 6" fill="#111111" />
            </marker>
            <marker id="attack-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <polygon points="0 0, 8 4, 0 8" fill="#111111" />
            </marker>
          </defs>

          {/* Court Background */}
          <rect id="court-bg" x="0" y="0" width="100" height="200" fill="#fff" />
          
          <g className="wobbly-svg">
            {/* Outer Boundary */}
            <rect x="5" y="5" width="90" height="190" fill="none" stroke="#111" strokeWidth="1.5" />
            
            {/* Center Line (Net) */}
            <line x1="5" y1="100" x2="95" y2="100" stroke="#111" strokeWidth="2.5" />
            
            {/* Attack Lines (3m) */}
            <line x1="5" y1="68.3" x2="95" y2="68.3" stroke="#111" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="5" y1="131.7" x2="95" y2="131.7" stroke="#111" strokeWidth="1" strokeDasharray="3 3" />
          </g>

          {/* Zone Labels */}
          {labelToggles.zone && (
            <g className="opacity-10 font-sans text-4xl" fill="#111">
              {/* Bottom half (Our team) */}
              <text x="80" y="180" textAnchor="middle">1</text>
              <text x="80" y="120" textAnchor="middle">2</text>
              <text x="50" y="120" textAnchor="middle">3</text>
              <text x="20" y="120" textAnchor="middle">4</text>
              <text x="20" y="180" textAnchor="middle">5</text>
              <text x="50" y="180" textAnchor="middle">6</text>

              {/* Top half (Opponent) */}
              <text x="20" y="30" textAnchor="middle">1</text>
              <text x="20" y="90" textAnchor="middle">2</text>
              <text x="50" y="90" textAnchor="middle">3</text>
              <text x="80" y="90" textAnchor="middle">4</text>
              <text x="80" y="30" textAnchor="middle">5</text>
              <text x="50" y="30" textAnchor="middle">6</text>
            </g>
          )}

          <text x="50" y="15" fontSize="6" fill="#111" textAnchor="middle" className="font-sans">對手</text>
          <text x="50" y="192" fontSize="6" fill="#111" textAnchor="middle" className="font-sans">我方</text>

          {/* Render Defense Ranges */}
          {rotation.defenseRanges.map(dr => (
            <DefenseRange key={dr.id} range={dr} />
          ))}

          {/* Render Markers */}
          {rotation.markers.map(m => (
            <Markers key={m.id} marker={m} />
          ))}

          {/* Render Players */}
          {rotation.positions.map(pos => {
            const player = players.find(p => p.id === pos.playerId);
            if (!player) return null;
            
            let isLibero = false;
            let displayPlayer = player;
            
            if (liberoSubstitution && player.role === liberoSubstitution) {
              const libero = players.find(p => p.role === 'L');
              if (libero) {
                isLibero = true;
                displayPlayer = libero;
              }
            }

            const isFrontRow = pos.y > 0.5 && pos.y < 0.75; 

            return (
              <PlayerNode 
                key={pos.playerId} 
                player={displayPlayer}
                position={pos}
                isFrontRow={isFrontRow}
                isLibero={isLibero}
                showName={labelToggles.name}
                showRole={labelToggles.role}
                courtRef={courtRef}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
