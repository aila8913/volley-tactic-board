import React, { useRef, useState } from "react";
import { useParams } from "wouter";
import { PlayerPosition } from "../types/rotationTable";
import { MatchPlayer } from "../types/match";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
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
  const { id: matchId } = useParams<{ id: string }>();
  // circleLabel 是全域顯示偏好（不隨 match 走），留在 store 頂層直接讀。站位動作則帶 matchId。
  const { placePlayerOnCourt, removePlayerFromCourt, circleLabel } = useRotationTable();
  const {
    placePlayerFree,
    selectedObjectId,
    setSelectedObjectId,
    activeTool,
    isLayoutMode,
    courtView,
    removePlayerFromTacticView,
  } = useTacticsBoard();
  // 輪轉視圖跟戰術視圖的「移除」現在是兩件完全獨立的事：輪轉視圖動的是輪轉表的
  // 即時站位，戰術視圖只動這張快照（tacticPositions），彼此不影響對方。
  const removeFromCourt = (playerId: string) => {
    if (!matchId) return;
    if (courtView === "tactics") {
      removePlayerFromTacticView(matchId, playerId);
    } else {
      removePlayerFromCourt(matchId, playerId);
    }
  };
  const [isDragging, setIsDragging] = useState(false);

  // 格子吸附模式（非 layout mode）：拖曳中暫時吸附到的格子
  const [dragZone, setDragZone] = useState<number | null>(null);
  // 自由移動模式（layout mode）：拖曳中的 SVG 座標（戰術視圖下可以超出 0~100 / 0~200，
  // 讓球員畫得到界外——可拖曳範圍就是當下 SVG 的 viewBox，白板多大就能拖多遠）
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  // 自由球員專用：拖曳中的游標是否已經超出整塊白板（目前 viewBox）的下緣，
  // 放開時視同拖回備位區（不上場）。
  const [isOverBench, setIsOverBench] = useState(false);

  const nodeRef = useRef<SVGGElement>(null);
  const isSelected = selectedObjectId === position.playerId;
  const bgColor = isOverBench
    ? "#999999"
    : isLibero
      ? "#FF6B00"
      : isFrontRow
        ? "#CCFF00"
        : "#FFFFFF";
  const radius = 6;

  // 顯示位置計算：
  // - 戰術視圖：tacticPositions 存的是自由座標，直接換算（拖曳中用游標座標）
  // - 輪轉視圖：positions 存的是格子座標，從格子編號換算確保對齊格子中心
  let x: number, y: number;
  if (courtView === "tactics") {
    if (dragPos) {
      x = dragPos.x;
      y = dragPos.y;
    } else {
      x = position.x * 100;
      y = position.y * 200;
    }
  } else {
    const renderZone = dragZone ?? findNearestZone(position.x, position.y);
    const coords = getZoneCoords(renderZone);
    x = coords.x * 100;
    y = coords.y * 200;
  }

  // 戰術視圖 + 非布置模式：完全唯讀，不接受任何拖曳
  const canDrag = courtView === "rotation" || (courtView === "tactics" && isLayoutMode);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool !== "select") return;
    if (!canDrag) return;
    setSelectedObjectId(position.playerId);
    setIsDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !courtRef.current) return;
    const CTM = courtRef.current.getScreenCTM();
    if (!CTM) return;
    const unclampedX = (e.clientX - CTM.e) / CTM.a;
    const unclampedY = (e.clientY - CTM.f) / CTM.d;

    if (courtView === "tactics") {
      // 戰術視圖的白板大小會依 panel 尺寸即時變動（見 Court.tsx 的 computeTacticsViewBox），
      // 不是寫死的常數，所以直接讀 SVG 當下實際的 viewBox 邊界，永遠跟畫面看到的一致。
      const vb = courtRef.current.viewBox.baseVal;
      const minX = vb.x;
      const maxX = vb.x + vb.width;
      const minY = vb.y;
      const maxY = vb.y + vb.height;

      // 自由球員專用：游標要真的拖出「整塊白板」（不只是球場本身）的下緣，才視同
      // 「拖到備位區」——球場下緣到白板下緣之間那圈空間，是刻意留給「球員跑出界外」
      // 這種戰術註解用的，不能一超過球場邊界就被判定成下場，要判斷未夾範圍前的座標，
      // 不然下面夾完範圍後永遠不會超過白板邊界。
      if (isLibero) {
        setIsOverBench(unclampedY > maxY);
      }
      const rawX = Math.max(minX + radius, Math.min(maxX - radius, unclampedX));
      const rawY = Math.max(minY + radius, Math.min(maxY - radius, unclampedY));
      setDragPos({ x: rawX, y: rawY });
    } else {
      // 輪轉視圖：嚴格限制在球場範圍內，格子吸附一定要對到真正的比賽位置。
      const rawX = Math.max(radius, Math.min(100 - radius, unclampedX));
      const rawY = Math.max(radius, Math.min(200 - radius, unclampedY));
      setDragZone(findNearestZone(rawX / 100, rawY / 200));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (!matchId) return;

    if (courtView === "tactics" && dragPos) {
      if (isLibero && isOverBench) {
        // 拖出球場下緣＝送回備位、不上場，等同右鍵移除，只是換一個拖曳手勢完成。
        removeFromCourt(position.playerId);
      } else {
        // 戰術視圖：自由座標存進 tacticPositions
        placePlayerFree(matchId, position.playerId, dragPos.x / 100, dragPos.y / 200);
      }
      setDragPos(null);
      setIsOverBench(false);
    } else if (courtView === "rotation" && dragZone !== null) {
      // 輪轉視圖：格子吸附並推算全部 6 輪
      placePlayerOnCourt(matchId, position.playerId, dragZone);
      setDragZone(null);
    }
  };

  // 右鍵刪除：L 球員只移除目前輪次並還原被替換的人；一般球員從全部 6 輪移除。
  // 唯讀情境（檢視已存戰術，issue #154 PR B）canDrag 為 false，右鍵也一律不刪——唯讀就是唯讀。
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canDrag) return;
    removeFromCourt(position.playerId);
  };

  return (
    <g
      ref={nodeRef}
      transform={`translate(${x}, ${y})`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={handleContextMenu}
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
