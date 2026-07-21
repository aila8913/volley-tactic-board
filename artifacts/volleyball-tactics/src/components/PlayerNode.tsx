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
  // circleLabel（名字/背號/角色三選一）目前沒有任何 UI 能切換它，永遠停在預設值，
  // 是個實質上的死開關（見 issue #134 調查）。玻璃圓片改版直接固定「背號在圈裡、
  // 名字在圈下方小字」的雙行顯示，不再讀這個欄位——但 store 本身先不動它，
  // 避免影響 ScoreSheetCourt.tsx 那邊還在用同一個欄位的顯示邏輯。
  const { placePlayerOnCourt, removePlayerFromCourt } = useRotationTable();
  const {
    session,
    moveSessionPlayer,
    removeSessionPlayer,
    selectedObjectId,
    setSelectedObjectId,
    activeTool,
    courtView,
  } = useTacticsBoard();
  // 戰術白板改成 session 後（issue #154 PR C），isLayoutMode 這個常駐布林拿掉了，
  // 改由「session !== null」推導：有 session＝正在即時布置、可編輯。
  const isLayoutMode = session !== null;
  // 輪轉視圖跟戰術視圖的「移除」是兩件完全獨立的事：輪轉視圖動的是輪轉表的即時站位，
  // 戰術視圖只動這張 session 快照裡的球員，彼此互不影響。
  const removeFromCourt = (playerId: string) => {
    if (courtView === "tactics") {
      removeSessionPlayer(playerId);
    } else {
      if (!matchId) return;
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
  // 前排/後排/Libero/備位（over-bench）這套判斷邏輯完全不動——只是把原本「整顆圓實色
  // 填滿」的配色，改成「深色玻璃圓片 + 這個顏色當邊框」（issue #134 材質改版），
  // 顏色本身仍是唯一的狀態指示，邏輯不變。
  const stateColor = isOverBench
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
        // 戰術視圖：自由座標更新這位球員在 session 快照裡的位置（position.playerId 就是
        // SnapshotPlayer 的 sourcePlayerId）。
        moveSessionPlayer(position.playerId, dragPos.x / 100, dragPos.y / 200);
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
      {/* 玻璃圓片（issue #134）：深色半透明底 + 狀態色細邊框，呼應球場毛玻璃地板/
          外層面板同一套材質語言，取代原本「整顆實色圓」的樣式。選取時邊框加粗
          （原本 1.5 太粗，改成 2，仍比未選取的 1.2 明顯）並加一圈跟狀態色同色的
          發光，作為選取態的視覺回饋。 */}
      <circle
        r={isSelected ? radius + 1.5 : radius}
        fill="rgba(10, 11, 7, 0.62)"
        stroke={stateColor}
        strokeWidth={isSelected ? "2" : "1.2"}
        style={isSelected ? { filter: `drop-shadow(0 0 3px ${stateColor})` } : undefined}
      />
      {/* 圈裡固定顯示背號（辨識度最高、字數最少最不擠），圈下方小字顯示姓名——
          使用者明確要求的雙行格式，不再套用 circleLabel 三選一。 */}
      <text
        y="1.6"
        fontSize="4.5"
        fontWeight="bold"
        fill="#F5F5F0"
        textAnchor="middle"
        className="font-sans pointer-events-none"
      >
        {player.number}
      </text>
      <text
        y={radius + 5.5}
        fontSize="3.2"
        fill="#F5F5F0"
        fillOpacity="0.75"
        textAnchor="middle"
        className="font-sans pointer-events-none"
      >
        {player.name || player.role}
      </text>
    </g>
  );
}
