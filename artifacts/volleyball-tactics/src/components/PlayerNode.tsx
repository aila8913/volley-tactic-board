import React, { useRef, useState } from 'react';
import { Player, PlayerPosition } from '../types/tactics';
import { useTactics } from '../hooks/useTactics';

interface PlayerNodeProps {
  player: Player;
  position: PlayerPosition;
  isFrontRow: boolean;
  isLibero: boolean;
  showName: boolean;
  showRole: boolean;
  courtRef: React.RefObject<SVGSVGElement | null>;
}

const roleLabel = (role: string): string => {
  const map: Record<string, string> = {
    S: 'S', OH1: '攻1', OH2: '攻2',
    MB1: '中1', MB2: '中2', OPP: '大砲', L: 'L'
  };
  return map[role] ?? role;
};

export default function PlayerNode({ player, position, isFrontRow, isLibero, showName, showRole, courtRef }: PlayerNodeProps) {
  const { updatePlayerPosition, selectedObjectId, setSelectedObjectId, activeTool } = useTactics();
  const [isDragging, setIsDragging] = useState(false);
  const nodeRef = useRef<SVGGElement>(null);

  const isSelected = selectedObjectId === position.playerId;
  const bgColor = isLibero ? '#FF6B00' : isFrontRow ? '#CCFF00' : '#FFFFFF';
  
  // Convert normalized 0-1 coords to SVG 0-100, 0-200 coords
  const x = position.x * 100;
  const y = position.y * 200;
  const radius = 6;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool !== 'select') return;
    
    setSelectedObjectId(position.playerId);
    setIsDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !courtRef.current) return;
    
    const CTM = courtRef.current.getScreenCTM();
    if (!CTM) return;
    
    // Calculate new position
    let newX = (e.clientX - CTM.e) / CTM.a;
    let newY = (e.clientY - CTM.f) / CTM.d;
    
    // Clamp to court boundaries
    newX = Math.max(radius, Math.min(100 - radius, newX));
    newY = Math.max(radius, Math.min(200 - radius, newY));
    
    // Convert back to normalized 0-1
    updatePlayerPosition(position.playerId, newX / 100, newY / 200);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <g 
      ref={nodeRef}
      transform={`translate(${x}, ${y})`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`cursor-grab touch-none ${isDragging ? 'cursor-grabbing' : ''}`}
      style={{ transition: isDragging ? 'none' : 'transform 0.1s ease-out' }}
    >
      <circle 
        r={isSelected ? radius + 1.5 : radius} 
        fill={bgColor} 
        stroke={isSelected ? '#111111' : '#111111'} 
        strokeWidth={isSelected ? "1.5" : "1"} 
      />
      
      {showRole && (
        <text 
          y={showName ? 1 : 2} 
          fontSize="4" 
          fontWeight="bold" 
          fill="#111" 
          textAnchor="middle" 
          className="font-sans pointer-events-none"
        >
          {roleLabel(player.role)}
        </text>
      )}
      
      {showName && player.name && (
        <text 
          y={showRole ? -2.5 : 2} 
          fontSize="2.5" 
          fontWeight="bold" 
          fill="#111" 
          textAnchor="middle" 
          className="pointer-events-none"
        >
          {player.name}
        </text>
      )}
    </g>
  );
}
