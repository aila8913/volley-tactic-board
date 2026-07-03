import React, { useRef, useState, useEffect } from "react";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard, ToolType } from "../hooks/useTacticsBoard";
import { findNearestZone } from "../lib/rotationLogic";
import PlayerNode from "./PlayerNode";
import Markers from "./Markers";
import DefenseRange from "./DefenseRange";

// 輪轉視圖：viewBox 剛好等於球場本身（0~100 / 0~200），球員只能吸附在 6 個格子裡，
// 嚴格對應真實比賽規則，不需要、也不應該讓人跑到界外。
const VIEWBOX_ROTATION = "0 0 100 200";

// 戰術視圖：白板要跟外層 panel 一樣大（不是固定留一小圈邊界），球場（100x200，
// 1:2 比例）置中畫在裡面。用 wrapper 實際量到的寬高比決定要往哪個方向多留白，
// 這樣球場才不會被拉伸變形——量不到尺寸（還沒 mount）就先退回跟球場一樣大。
function computeTacticsViewBox(size: { width: number; height: number } | null): string {
  if (!size || size.width <= 0 || size.height <= 0) return VIEWBOX_ROTATION;
  const containerRatio = size.width / size.height;
  let vw: number, vh: number;
  if (containerRatio > 0.5) {
    // panel 比球場（1:2）「寬」：高度吃滿球場的 200，寬度依 panel 比例往外撐開
    vh = 200;
    vw = vh * containerRatio;
  } else {
    // panel 比球場「窄／高」：寬度吃滿球場的 100，高度依 panel 比例往外撐開
    vw = 100;
    vh = vw / containerRatio;
  }
  const minX = -(vw - 100) / 2;
  const minY = -(vh - 200) / 2;
  return `${minX} ${minY} ${vw} ${vh}`;
}

export default function Court() {
  // 站位資料（誰在場上哪個位置）來自輪轉表；畫筆/防守範圍/戰術視圖自由站位來自戰術板。
  // Court 是兩邊資料實際「合流顯示」的地方——戰術板要疊圖畫在球員身上，天生就要同時
  // 讀兩個 store，這跟我們說好的「戰術板依賴輪轉表」並不衝突：這裡只是元件同時訂閱
  // 兩個 store，不是其中一個 store 內部互相呼叫。
  const { rotations, currentRotation, roster, startingLiberoId, setStartingLiberoId } =
    useRotationTable();
  const {
    tacticsByRotation,
    labelToggles,
    activeTool,
    setActiveTool,
    addMarker,
    updateMarker,
    selectedObjectId,
    setSelectedObjectId,
    addDefenseRange,
    updateDefenseRange,
    undo,
    redo,
    isLayoutMode,
    courtView,
  } = useTacticsBoard();
  const placePlayerOnCourt = useRotationTable((state) => state.placePlayerOnCourt);
  const placePlayerFree = useTacticsBoard((state) => state.placePlayerFree);

  const courtRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [drawingMarkerId, setDrawingMarkerId] = useState<string | null>(null);
  // 戰術視圖白板要跟著 wrapper 的實際渲染尺寸縮放，這裡用 ResizeObserver 量測，
  // 尺寸一變（切視圖、拉視窗、側欄開關擠壓版面）就重算 viewBox。
  const [wrapperSize, setWrapperSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWrapperSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rotationPositions = rotations[currentRotation];
  const rotationTactics = tacticsByRotation[currentRotation];
  if (!rotationPositions || !rotationTactics) return null;

  const getSvgPoint = (e: React.PointerEvent) => {
    if (!courtRef.current) return { x: 50, y: 100 };
    const CTM = courtRef.current.getScreenCTM();
    if (!CTM) return { x: 50, y: 100 };
    return {
      x: (e.clientX - CTM.e) / CTM.a,
      y: (e.clientY - CTM.f) / CTM.d,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only process if clicking on the court background/svg directly
    // （球場外圍那圈白板空間沒有畫任何形狀，點在那裡會直接落在 svg 根元素上，
    // 跟點在 court-bg 上一樣都算「點空白處」）
    const target = e.target as Element;
    if (target.tagName === "svg" || target.id === "court-bg") {
      setSelectedObjectId(null);
      const pt = getSvgPoint(e);

      // 畫筆/防守範圍工具只能在「戰術布置」模式裡新增——理論上不在這個模式時
      // TacticsBoardPanel 不會顯示這些工具按鈕，activeTool 也就不會被設成它們，
      // 這裡是再多一層防呆。
      if (isLayoutMode && ["arrow", "dashed", "attack"].includes(activeTool)) {
        // Zustand doesn't return the ID, so we need to rely on the fact that it pushes to the end.
        // But since we can't synchronously get the ID easily without modifying addMarker,
        // we'll just set a drawing mode and update the *last* marker.
        // Actually, we can just dispatch addMarker, then in pointerMove we update the last marker.
        addMarker({
          type: activeTool as any,
          points: [
            { x: pt.x, y: pt.y },
            { x: pt.x, y: pt.y },
          ],
        });
        // We will set a flag so pointerMove knows we are drawing
        setDrawingMarkerId("drawing");
      } else if (isLayoutMode && (activeTool === "text" || activeTool === "volleyball")) {
        addMarker({
          type: activeTool as any,
          x: pt.x,
          y: pt.y,
          text: activeTool === "text" ? "請輸入文字" : undefined,
        });
        setActiveTool("select");
      } else if (isLayoutMode && ["circle", "ellipse", "fan"].includes(activeTool)) {
        addDefenseRange({
          playerId: "",
          type: activeTool as any,
          x: pt.x,
          y: pt.y,
          radius: 15,
          rx: 15,
          ry: 10,
          startAngle: -45,
          endAngle: 45,
          color: "#CCFF00",
          opacity: 0.3,
          visible: true,
        });
        setActiveTool("select");
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (drawingMarkerId === "drawing") {
      const pt = getSvgPoint(e);
      // We assume the last marker added is the one being drawn
      const markers = rotationTactics.markers;
      if (markers.length > 0) {
        const lastMarker = markers[markers.length - 1];
        if (lastMarker.points && lastMarker.points.length === 2) {
          updateMarker(lastMarker.id, {
            points: [lastMarker.points[0], { x: pt.x, y: pt.y }],
          });
        }
      }
    }
  };

  const handlePointerUp = () => {
    if (drawingMarkerId) {
      setDrawingMarkerId(null);
      setActiveTool("select");
    }
  };

  // 從左側「球員設定」名單把球員拖到球場上，用的是瀏覽器原生的 drag-and-drop
  // （跟 PlayerNode 場上重新拖曳用的 pointer events 是兩套不同機制——名單在 SVG
  // 外面，要跨元件拖曳，原生 drag-and-drop 比自己用 pointer 算「拖到哪個 DOM 元素上」簡單）。
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const playerId = e.dataTransfer.getData("text/plain");
    if (!playerId || !courtRef.current) return;
    const CTM = courtRef.current.getScreenCTM();
    if (!CTM) return;
    const rawX = (e.clientX - CTM.e) / CTM.a;
    const rawY = (e.clientY - CTM.f) / CTM.d;

    if (courtView === "rotation") {
      // 輪轉視圖：吸附到最近格子，自動推算全部 6 個輪次
      placePlayerOnCourt(playerId, findNearestZone(rawX / 100, rawY / 200));
    } else if (courtView === "tactics" && isLayoutMode) {
      // 戰術視圖 + 布置模式：自由座標放置，只影響目前輪次的 tacticPositions
      placePlayerFree(playerId, rawX / 100, rawY / 200);
    }
    // 戰術視圖 + 非布置模式：不接受拖曳（唯讀）
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // 輪轉視圖中，指定先發的 L 球員不在場上時顯示在備位區。
  // startingLiberoId === null 代表目前沒指定先發 L（備位區空白）。
  const startingLibero = startingLiberoId
    ? (roster.find((p) => p.id === startingLiberoId && p.role === "L") ?? null)
    : null;
  const liberoInSpot =
    startingLibero && !rotationPositions.positions.some((pos) => pos.playerId === startingLiberoId)
      ? [startingLibero]
      : [];

  // 戰術視圖不套用 max-w-[500px]：白板要撐滿整個中間 panel，不是固定寬度的球場卡片。
  const tacticsViewBox = computeTacticsViewBox(wrapperSize);

  return (
    <div
      className={`h-full w-full flex flex-col justify-center items-center relative pt-4 pb-14 ${
        courtView === "tactics" ? "" : "max-w-[500px] mx-auto"
      }`}
    >
      {/* 輪轉視圖：以高度為主、寬度自動縮，h-full 讓球場撐滿可用垂直空間，
          aspect-ratio 1/2 表示 width:height = 1:2，所以 width = height / 2；粗框、圓角、
          陰影直接用 CSS 畫在 wrapper 上，因為這個視圖下 wrapper 跟球場永遠一樣大。
          戰術視圖：wrapper 改成撐滿整個 panel（h-full w-full，不吃 aspect-ratio），
          球場本身縮小成裡面的一塊，所以粗框改成畫在 SVG 裡、貼著球場的那個矩形上
          （見下面 court-border 那個 <rect>），不會跟著白板一起被拉大。 */}
      <div
        id="court-wrapper"
        ref={wrapperRef}
        className={
          courtView === "tactics"
            ? "h-full w-full relative"
            : "h-full w-auto max-w-full relative bg-white border-4 border-[#111111] rounded-lg shadow-sm"
        }
        style={courtView === "tactics" ? undefined : { aspectRatio: "1/2" }}
      >
        <svg
          id="court-svg"
          ref={courtRef}
          width="100%"
          height="100%"
          viewBox={courtView === "tactics" ? tacticsViewBox : VIEWBOX_ROTATION}
          preserveAspectRatio="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="touch-none select-none"
        >
          <defs>
            <filter id="wobbly-filter">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.05"
                numOctaves="2"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="1.5"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <polygon points="0 0, 6 3, 0 6" fill="#111111" />
            </marker>
            <marker
              id="attack-arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <polygon points="0 0, 8 4, 0 8" fill="#111111" />
            </marker>
          </defs>

          {/* Court Background */}
          <rect id="court-bg" x="0" y="0" width="100" height="200" fill="#fff" />

          {/* 戰術視圖的球場粗框：輪轉視圖靠 wrapper 的 CSS border 畫框，戰術視圖 wrapper
              撐滿整個 panel、跟球場不再一樣大，所以框要改成畫在 SVG 裡、貼著球場本身
              （0,0 到 100,200），才會一直牢牢框住球場、不會被白板一起撐大。
              要畫在 court-bg 之後（DOM 順序在它後面）才會蓋在球場的白色矩形上面顯示出來。 */}
          {courtView === "tactics" && (
            <rect
              id="court-border"
              x="0"
              y="0"
              width="100"
              height="200"
              fill="none"
              stroke="#111111"
              strokeWidth="2"
              rx="3"
            />
          )}

          <g className="wobbly-svg">
            {/* Center Line (Net) — x 從 0 到 100 貼齊 div 邊框 */}
            <line x1="0" y1="100" x2="100" y2="100" stroke="#111" strokeWidth="2.5" />

            {/* Attack Lines (3m)
                viewBox 高 200，每半場 100 個單位代表 9m，3m = 100/3 ≈ 33.3
                → 三米線：y=100-33.3=66.7 / y=100+33.3=133.3 */}
            <line
              x1="0"
              y1="66.7"
              x2="100"
              y2="66.7"
              stroke="#111"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <line
              x1="0"
              y1="133.3"
              x2="100"
              y2="133.3"
              stroke="#111"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          </g>

          {/* Zone Labels */}
          {labelToggles.zone && (
            <g className="opacity-10 font-sans text-4xl" fill="#111">
              {/* Bottom half (Our team) */}
              <text x="80" y="180" textAnchor="middle">
                1
              </text>
              <text x="80" y="120" textAnchor="middle">
                2
              </text>
              <text x="50" y="120" textAnchor="middle">
                3
              </text>
              <text x="20" y="120" textAnchor="middle">
                4
              </text>
              <text x="20" y="180" textAnchor="middle">
                5
              </text>
              <text x="50" y="180" textAnchor="middle">
                6
              </text>

              {/* Top half (Opponent) */}
              <text x="20" y="30" textAnchor="middle">
                1
              </text>
              <text x="20" y="90" textAnchor="middle">
                2
              </text>
              <text x="50" y="90" textAnchor="middle">
                3
              </text>
              <text x="80" y="90" textAnchor="middle">
                4
              </text>
              <text x="80" y="30" textAnchor="middle">
                5
              </text>
              <text x="50" y="30" textAnchor="middle">
                6
              </text>
            </g>
          )}

          <text x="50" y="15" fontSize="6" fill="#111" textAnchor="middle" className="font-sans">
            對手
          </text>
          <text x="50" y="192" fontSize="6" fill="#111" textAnchor="middle" className="font-sans">
            我方
          </text>

          {/* 畫筆標記與防守範圍只在「戰術視圖」模式下顯示，
              輪轉視圖只看站位圓圈，避免標記干擾判斷球員站哪裡。 */}
          {courtView === "tactics" && (
            <>
              {rotationTactics.defenseRanges.map((dr) => (
                <DefenseRange key={dr.id} range={dr} />
              ))}
              {rotationTactics.markers.map((m) => (
                <Markers key={m.id} marker={m} />
              ))}
            </>
          )}

          {/* Render Players
              輪轉視圖：用 positions（格子吸附站位，來自輪轉表，即時資料）。
              戰術視圖：用 tacticPositions（進入戰術布置那一刻從輪轉表拍的快照，之後
              完全獨立編輯，見 useTacticsBoard.ts 的 enterTacticsLayout）——不需要
              再跟輪轉表的即時站位合併，快照本身就是完整的一份。 */}
          {(() => {
            const displayPositions =
              courtView === "rotation"
                ? rotationPositions.positions
                : rotationTactics.tacticPositions;

            return displayPositions.map((pos) => {
              const player = roster.find((p) => p.id === pos.playerId);
              if (!player) return null;
              const isLibero = player.role === "L";
              const isFrontRow = pos.y > 0.5 && pos.y < 0.75;
              return (
                <PlayerNode
                  key={pos.playerId}
                  player={player}
                  position={pos}
                  isFrontRow={isFrontRow}
                  isLibero={isLibero}
                  courtRef={courtRef}
                />
              );
            });
          })()}
        </svg>
      </div>

      {/* 自由球員備位區：只在輪轉視圖顯示——這是「先發 L 還沒上場」這個輪轉表自己的
          概念，戰術布置是獨立的快照畫布，沒有「備位」這回事（快照裡有誰就是有誰）。 */}
      {courtView === "rotation" && liberoInSpot.length > 0 && (
        <div className="absolute bottom-3 left-0 right-0 flex flex-col items-center gap-1">
          <span className="text-[9px] text-gray-400 tracking-wide">L 備位 — 拖到後排上場</span>
          <div className="flex gap-2 justify-center">
            {liberoInSpot.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // 右鍵點備位區 L = 取消先發設定，備位區變空白
                  setStartingLiberoId(null);
                }}
                className="w-10 h-10 rounded-full bg-[#FF6B00] border-2 border-[#111] flex items-center justify-center text-[11px] font-bold cursor-grab active:cursor-grabbing select-none"
                title={`${p.name} #${p.number} — 拖到後排（1/5/6）上場；右鍵取消先發`}
              >
                #{p.number}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
