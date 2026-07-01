import React, { useRef, useState, useEffect } from "react";
import { useTactics, ToolType } from "../hooks/useTactics";
import { findNearestZone } from "../lib/rotationLogic";
import PlayerNode from "./PlayerNode";
import Markers from "./Markers";
import DefenseRange from "./DefenseRange";

export default function Court() {
  const {
    rotations,
    currentRotation,
    roster,
    labelToggles,
    activeTool,
    setActiveTool,
    addMarker,
    updateMarker,
    selectedObjectId,
    setSelectedObjectId,
    addDefenseRange,
    updateDefenseRange,
    placePlayerOnCourt,
    placePlayerFree,
    undo,
    redo,
    isLayoutMode,
    courtView,
    setCourtView,
    startingLiberoId,
    setStartingLiberoId,
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
      y: (e.clientY - CTM.f) / CTM.d,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only process if clicking on the court background/svg directly
    const target = e.target as Element;
    if (target.tagName === "svg" || target.id === "court-bg") {
      setSelectedObjectId(null);
      const pt = getSvgPoint(e);

      // 畫筆/防守範圍工具只能在「戰術布置」模式裡新增——理論上不在這個模式時 RightPanel
      // 不會顯示這些工具按鈕，activeTool 也就不會被設成它們，這裡是再多一層防呆。
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
      const currentRotState = rotations[currentRotation];
      const markers = currentRotState.markers;
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
    startingLibero && !rotation.positions.some((pos) => pos.playerId === startingLiberoId)
      ? [startingLibero]
      : [];

  return (
    <div className="h-full w-full max-w-[500px] mx-auto flex flex-col justify-center items-center relative pt-4 pb-14">
      {/* 視圖切換：輪轉視圖只顯示站位圓圈，戰術視圖疊加顯示畫筆標記跟防守範圍 */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setCourtView("rotation")}
          className={`px-3 py-1 wobbly-border text-xs font-bold transition-colors ${
            courtView === "rotation"
              ? "bg-[#CCFF00] shadow-[2px_2px_0_0_#111]"
              : "bg-white hover:bg-gray-100"
          }`}
        >
          輪轉視圖
        </button>
        <button
          onClick={() => setCourtView("tactics")}
          className={`px-3 py-1 wobbly-border text-xs font-bold transition-colors ${
            courtView === "tactics"
              ? "bg-[#CCFF00] shadow-[2px_2px_0_0_#111]"
              : "bg-white hover:bg-gray-100"
          }`}
        >
          戰術視圖
        </button>
      </div>

      {/* 以高度為主、寬度自動縮：h-full 讓球場撐滿可用垂直空間，
          aspect-ratio 1/2 表示 width:height = 1:2，所以 width = height / 2。
          如果改成 w-full + aspectRatio，則 height = 2 * width，在寬螢幕上會讓球場長出視窗。 */}
      <div
        id="court-wrapper"
        className="h-full w-auto max-w-full relative bg-white border-4 border-[#111111] rounded-lg shadow-sm"
        style={{ aspectRatio: "1/2" }}
      >
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
              {rotation.defenseRanges.map((dr) => (
                <DefenseRange key={dr.id} range={dr} />
              ))}
              {rotation.markers.map((m) => (
                <Markers key={m.id} marker={m} />
              ))}
            </>
          )}

          {/* Render Players
              輪轉視圖：用 positions（格子吸附站位）
              戰術視圖：用 tacticPositions（自由布置站位）；若尚未客製化（空陣列），
                       用 positions 作為 fallback，並合併（tacticPositions 的人優先）。 */}
          {(() => {
            const tacticIds = new Set((rotation.tacticPositions ?? []).map((p) => p.playerId));
            const displayPositions =
              courtView === "rotation"
                ? rotation.positions
                : [
                    ...rotation.positions.filter((p) => !tacticIds.has(p.playerId)),
                    ...(rotation.tacticPositions ?? []),
                  ];

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

      {/* 自由球員備位區：只在輪轉視圖且有 L 未上場時顯示。
          橘色圓圈坐在球場正下方，跟場上的 PlayerNode 視覺一致。
          直接用 HTML drag-and-drop（跟左側名單同一套），拖到球場後排就會觸發 handleDrop → placePlayerOnCourt。 */}
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
