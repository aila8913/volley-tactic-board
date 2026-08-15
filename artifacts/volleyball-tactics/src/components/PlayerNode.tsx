import React, { useRef, useState } from "react";
import { PlayerPosition } from "../types/rotationTable";
import { MatchPlayer } from "../types/match";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { toSvg, fromScreen } from "../lib/courtGeometry";
import PlayerMarker from "./PlayerMarker";

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
  // #328：這個元件過去也是「一支元件兩種行為」——輪轉視圖時吸附六個號位並寫回輪轉表，
  // 戰術視圖時自由拖曳只動 session 快照。
  // 輪轉那半邊隨 Court.tsx 的輪轉畫法一起退役（見該檔開頭的說明），所以這裡不再 import
  // useRotationTable，也不再需要知道自己活在哪一場比賽底下：它動到的東西全都住在
  // session 裡，跟 matchId 無關。
  const {
    session,
    moveSessionPlayer,
    removeSessionPlayer,
    selectedObjectId,
    setSelectedObjectId,
    activeTool,
  } = useTacticsBoard();
  // 戰術白板改成 session 後（issue #154 PR C），isLayoutMode 這個常駐布林拿掉了，
  // 改由「session !== null」推導：有 session＝正在即時布置、可編輯。
  const isLayoutMode = session !== null;
  const [isDragging, setIsDragging] = useState(false);

  // 拖曳中的 SVG 座標。可以超出 0~100 / 0~200，讓球員畫得到界外——可拖曳範圍就是當下
  // SVG 的 viewBox，白板多大就能拖多遠。
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  // 自由球員專用：拖曳中的游標是否已經超出整塊白板（目前 viewBox）的下緣，
  // 放開時視同拖回備位區（不上場）。
  const [isOverBench, setIsOverBench] = useState(false);

  const nodeRef = useRef<SVGGElement>(null);
  const isSelected = selectedObjectId === position.playerId;
  // 前排/後排/Libero/備位（over-bench）這套判斷邏輯完全不動——只是把原本「整顆圓實色
  // 填滿」的配色，改成「深色玻璃圓片 + 這個顏色當邊框」（issue #134 材質改版），
  // 顏色本身仍是唯一的狀態指示，邏輯不變。
  // Libero 跟前排現在同色（#CCFF00，2026-08-04 自由球員配色定案，見
  // ScoreSheetCourt.tsx 自由球員鈕的配色說明）——排球規則自由球員只能站後排，
  // isLibero 為真時 isFrontRow 必為假，兩個分支不會同時命中，共用同一個顏色值
  // 不會造成球場上真的分不清楚是誰。
  const stateColor = isOverBench
    ? "#999999"
    : isLibero
      ? "#CCFF00"
      : isFrontRow
        ? "#CCFF00"
        : "#FFFFFF";
  const radius = 6;

  // 顯示位置：快照存的是自由座標，直接換算（拖曳中改用游標座標，放開才寫回 store）。
  const { x, y } = dragPos ?? toSvg(position);

  // 沒有 session＝唯讀檢視一張已存戰術：完全唯讀，不接受任何拖曳。
  const canDrag = isLayoutMode;

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
    const { x: unclampedX, y: unclampedY } = fromScreen(e.clientX, e.clientY, courtRef.current);

    // 白板大小會依 panel 尺寸即時變動（見 Court.tsx 的 computeTacticsViewBox），不是寫死的
    // 常數，所以直接讀 SVG 當下實際的 viewBox 邊界，永遠跟畫面看到的一致。
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
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);

    if (!dragPos) return;
    if (isLibero && isOverBench) {
      // 拖出球場下緣＝送回備位、不上場，等同右鍵移除，只是換一個拖曳手勢完成。
      removeSessionPlayer(position.playerId);
    } else {
      // 自由座標更新這位球員在 session 快照裡的位置（position.playerId 就是 SnapshotPlayer
      // 的 sourcePlayerId）。#328 之前這裡的分支還要看 courtView，而且輪轉那一支需要
      // matchId——現在整支 handler 都只動 session，跟哪一場比賽無關（#372 就是為了這件事
      // 把一道 `if (!matchId) return;` 從最前面下移到分支裡，現在那個分支本身也不在了）。
      moveSessionPlayer(position.playerId, dragPos.x / 100, dragPos.y / 200);
    }
    setDragPos(null);
    setIsOverBench(false);
  };

  // 右鍵＝把這位球員從快照上移除。唯讀情境（檢視已存戰術，issue #154 PR B）canDrag 為
  // false，右鍵也一律不刪——唯讀就是唯讀。
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canDrag) return;
    removeSessionPlayer(position.playerId);
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
      {/* 玻璃圓片（issue #134，視覺共用抽成 components/PlayerMarker.tsx——計分表的
          ScoreSheetCourt.tsx 也吃同一顆，改一邊兩邊會一起變）：深色半透明底 + 狀態色
          細邊框，圈裡固定背號、圈下姓名，不再套用 circleLabel 三選一。 */}
      <PlayerMarker
        number={player.number}
        // #372 決策②：位置調色盤拖出來的匿名球員 number 固定是 0（見 Court.tsx
        // handleDrop），這裡用「背號是不是 0」當判準，把圈裡要印的內容換成角色代碼——
        // 判準寫在這裡（呼叫端）而不是 PlayerMarker 內部，是因為「0 代表匿名」是這個
        // 資料模型（SnapshotPlayer/MatchPlayer）自己的規則，PlayerMarker 只管畫圖，不該
        // 替呼叫端猜測 0 是什麼意思（見 circleText 的說明）。
        circleText={player.number === 0 ? player.role : undefined}
        name={player.name || player.role}
        color={stateColor}
        radius={radius}
        emphasized={isSelected}
        solidFill={isLibero}
      />
    </g>
  );
}
