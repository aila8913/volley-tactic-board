import React, { useRef, useState, useEffect } from "react";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard, ToolType } from "../hooks/useTacticsBoard";
import { findNearestZone } from "../lib/rotationLogic";
import PlayerNode from "./PlayerNode";
import Markers from "./Markers";
import DefenseRange from "./DefenseRange";

// 球場「真正比賽用」的座標範圍，永遠固定 0~100 / 0~200——格子吸附、界外判斷、
// 6 個站位格全部都認這組數字，不會因為下面要多留 L 備位空間就跟著變動。
const COURT_W = 100;
const COURT_H = 200;

// 一格站位格的寬度（跟 rotationLogic.ts 算 6 個站位格用的是同一顆球場，欄寬概念一致），
// 拿來當「L 備位紅框至少要留多寬」的量尺（issue #18 + 新需求：至少一格 + 10px）。
const GRID_CELL = COURT_W / 3; // ≈ 33.33
// SVG viewBox 用的是抽象座標單位，不是螢幕真正的 px，沒辦法把「10px」精確換算進來；
// 這裡直接借用跟球場同一套座標尺度加 10 個單位當緩衝，不追求 px 級精確，只求「肉眼看
// 起來比一格再寬鬆一些」，兩邊（我方/對方）都用這個深度來留白。
const LIBERO_ZONE_DEPTH = GRID_CELL + 10; // ≈ 43.33

// court-canvas：SVG 實際要畫出來的範圍，比賽場地（0~100/0~200）只是置中畫在裡面的
// 一塊，上下各多留 LIBERO_ZONE_DEPTH 空間給 1 號位後方的 L 紅框備位格（issue #18）。
const COURT_CANVAS_MIN_Y = -LIBERO_ZONE_DEPTH;
const COURT_CANVAS_HEIGHT = COURT_H + LIBERO_ZONE_DEPTH * 2;

// 輪轉視圖：viewBox 固定等於 court-canvas（球場本身 + 上下 L 備位留白），球員只能
// 吸附在 6 個格子裡，嚴格對應真實比賽規則，不需要、也不應該讓人跑到界外。
const VIEWBOX_ROTATION = `0 ${COURT_CANVAS_MIN_Y} ${COURT_W} ${COURT_CANVAS_HEIGHT}`;

// 戰術視圖：白板要跟外層 panel 一樣大（不是固定留一小圈邊界），court-canvas（球場
// +上下 L 備位留白）置中畫在裡面。用 wrapper 實際量到的寬高比決定要往哪個方向多留白，
// 這樣球場才不會被拉伸變形——量不到尺寸（還沒 mount）就先退回跟輪轉視圖一樣的範圍。
function computeTacticsViewBox(size: { width: number; height: number } | null): string {
  if (!size || size.width <= 0 || size.height <= 0) return VIEWBOX_ROTATION;
  const containerRatio = size.width / size.height;
  const courtCanvasRatio = COURT_W / COURT_CANVAS_HEIGHT;
  let vw: number, vh: number;
  if (containerRatio > courtCanvasRatio) {
    // panel 比 court-canvas「寬」：高度吃滿 court-canvas 的高，寬度依 panel 比例往外撐開
    vh = COURT_CANVAS_HEIGHT;
    vw = vh * containerRatio;
  } else {
    // panel 比 court-canvas「窄／高」：寬度吃滿 court-canvas 的寬，高度依 panel 比例往外撐開
    vw = COURT_W;
    vh = vw / containerRatio;
  }
  const minX = -(vw - COURT_W) / 2;
  const minY = COURT_CANVAS_MIN_Y - (vh - COURT_CANVAS_HEIGHT) / 2;
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
      if (rawY > COURT_H) {
        // 拖到球場 baseline 之外、我方 L 備位紅框那塊留白帶：這是「指定/歸還這位
        // 球員為先發自由球員」的動作，不是要把人放上場，所以呼叫
        // setStartingLiberoId，不能呼叫 placePlayerOnCourt——不然座標會被
        // findNearestZone 吸附到最近的 1 號位，變成球員誤上場（這正是原本回報的
        // 「拖不進紅框」問題：不是真的拖不進去，是拖進去後被吸到球場上了）。
        const player = roster.find((p) => p.id === playerId);
        if (player?.role === "L") {
          setStartingLiberoId(playerId);
        }
      } else {
        // 輪轉視圖：吸附到最近格子，自動推算全部 6 個輪次
        placePlayerOnCourt(playerId, findNearestZone(rawX / 100, rawY / 200));
      }
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

  const tacticsViewBox = computeTacticsViewBox(wrapperSize);
  const currentViewBox = courtView === "tactics" ? tacticsViewBox : VIEWBOX_ROTATION;
  // 目前這個 SVG 實際在用的 viewBox 四個數字，拆出來給下面 svgPointToPercent 換算用。
  const [vbX, vbY, vbWidth, vbHeight] = currentViewBox.split(" ").map(Number);

  // 把「球場座標系」（x:0~100 / y:0~200，跟站位格、PlayerNode 同一套基準）換算成
  // 目前這個 viewBox 裡的百分比位置。因為 SVG 用 preserveAspectRatio="none"，viewBox
  // 一定會直接等比例貼滿 wrapper（沒有內部再留白），這個換算才會是線性、精確的——
  // 這也是下面 L 備位圓圈可以用一般 HTML 絕對定位疊在 SVG 上、卻仍能精準對齊 SVG
  // 座標系裡「1 號位後方」那個位置的原因，不需要量測 DOM 或算 CTM。
  const svgPointToPercent = (x: number, y: number) => ({
    leftPercent: ((x - vbX) / vbWidth) * 100,
    topPercent: ((y - vbY) / vbHeight) * 100,
  });

  // L 備位紅框（issue #18 + 新需求）：畫在 1 號位正後方——我方 1 號位 x=83（見
  // rotationLogic.ts 的 zoneCoords），對方鏡射過來 x=17，兩側都留在球場 baseline
  // 之外、留白帶正中央。尺寸抓玩家圓圈（半徑 6）的 1.5 倍左右。
  const LIBERO_BOX_SIZE = 18;
  const ourLiberoBox = {
    x: 83 - LIBERO_BOX_SIZE / 2,
    y: COURT_H + LIBERO_ZONE_DEPTH / 2 - LIBERO_BOX_SIZE / 2,
  };
  const opponentLiberoBox = {
    x: 17 - LIBERO_BOX_SIZE / 2,
    y: -LIBERO_ZONE_DEPTH / 2 - LIBERO_BOX_SIZE / 2,
  };
  // 我方紅框正中央的百分比位置，給下面可拖曳的 L 備位圓圈疊上去用。
  const ourLiberoCenterPercent = svgPointToPercent(83, COURT_H + LIBERO_ZONE_DEPTH / 2);

  return (
    <div className="h-full w-full flex flex-col justify-center items-center relative">
      {/* 白板＝這個 div 本身，直接貼齊中間 panel 邊緣（0px 間距、不需要灰底跟 panel
          做區分）。原本這裡有 10px 留白＋灰底是為了讓人看出白板比球場大（issue #49），
          現在留白責任整個下放給下面的「場地元件」，白板跟 panel 完全重疊本來就是
          刻意的設計選擇，不需要再額外畫出來強調。 */}
      <div
        className={`flex-1 w-full flex items-center justify-center min-h-0 py-[5px] px-[10px] ${
          courtView === "rotation" ? "max-w-[500px] mx-auto" : ""
        }`}
      >
        {/* 場地元件：白板到球場真正外框之間的留白，上下 5px、左右 10px（上面那層
            padding），兩個視圖共用同一組數字。輪轉視圖原本用不對稱的 32/72/16px 是
            為了幫最下面那排「L 備位」列留位置，現在備位改畫進 SVG 自己的留白帶裡
            （見 LIBERO_ZONE_DEPTH），外層就不用再特別留大留白了。 */}
        <div
          id="court-wrapper"
          ref={wrapperRef}
          className={
            courtView === "tactics"
              ? "h-full w-full relative drop-shadow-sm"
              : "h-full w-auto max-w-full relative drop-shadow-sm"
          }
          style={
            courtView === "tactics"
              ? undefined
              : { aspectRatio: `${COURT_W} / ${COURT_CANVAS_HEIGHT}` }
          }
        >
          <svg
            id="court-svg"
            ref={courtRef}
            width="100%"
            height="100%"
            viewBox={currentViewBox}
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
              <marker
                id="arrowhead"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
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
            <rect id="court-bg" x="0" y="0" width={COURT_W} height={COURT_H} fill="#fff" />

            {/* 球場粗框：兩個視圖都畫在 SVG 裡、貼著球場本身（0,0 到 100,200），不會
                被上下 L 備位留白帶撐大（過去輪轉視圖是靠 wrapper 的 CSS border 畫框，
                但 wrapper 現在比球場高，CSS border 會框住整個留白帶，所以統一改成
                跟戰術視圖一樣畫在 SVG 裡）。vectorEffect="non-scaling-stroke"：這個
                svg 用 preserveAspectRatio="none"，viewBox 的寬高會依 panel/wrapper
                形狀各自獨立縮放，框線粗細若不加這個屬性會跟著被壓扁——尤其面板偏
                窄長時，垂直方向縮放比例較小，下緣那條水平線就會顯得特別細。加上這個
                屬性後粗細固定用「螢幕像素」計算，兩個視圖看起來粗細一致。 */}
            <rect
              id="court-border"
              x="0"
              y="0"
              width={COURT_W}
              height={COURT_H}
              fill="none"
              stroke="#111111"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
              rx="3"
            />

            {/* L 備位紅框（issue #18）：畫在 1 號位後方、球場 baseline 之外，兩側都
                畫出框線留出版面空間，但只有我方（下方）那個之後會疊一顆可拖曳的
                球員圓圈——對方（上方）目前沒有球員資料可顯示，純粹保留對稱版面。 */}
            <rect
              x={ourLiberoBox.x}
              y={ourLiberoBox.y}
              width={LIBERO_BOX_SIZE}
              height={LIBERO_BOX_SIZE}
              fill="none"
              stroke="#fca5a5"
              strokeWidth="1.5"
              strokeDasharray="3 2"
              vectorEffect="non-scaling-stroke"
              rx="4"
            />
            <rect
              x={opponentLiberoBox.x}
              y={opponentLiberoBox.y}
              width={LIBERO_BOX_SIZE}
              height={LIBERO_BOX_SIZE}
              fill="none"
              stroke="#fca5a5"
              strokeWidth="1.5"
              strokeDasharray="3 2"
              vectorEffect="non-scaling-stroke"
              rx="4"
            />

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

          {/* L 備位圓圈（issue #18）：只在輪轉視圖顯示——這是「先發 L 還沒上場」這個
              輪轉表自己的概念，戰術布置是獨立的快照畫布，沒有「備位」這回事（快照裡
              有誰就是有誰）。用一般 HTML 絕對定位疊在 SVG 上面（不是畫在 SVG 座標系
              裡的 <g>），因為拖曳上場沿用的是「從左側名單拖到球場」那一套瀏覽器原生
              drag-and-drop（onDragStart 用 e.dataTransfer 存 playerId，Court 的
              handleDrop 接住），這套機制在一般 HTML 元素上最穩定；left/top 用
              svgPointToPercent 換算成百分比，精準疊在上面那個我方紅框正中央，兩個
              視圖縮放時都不會跑位。 */}
          {courtView === "rotation" && liberoInSpot.length > 0 && (
            <div
              className="absolute flex flex-col items-center"
              style={{
                left: `${ourLiberoCenterPercent.leftPercent}%`,
                top: `${ourLiberoCenterPercent.topPercent}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
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
                  className="w-7 h-7 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center text-[10px] font-bold cursor-grab active:cursor-grabbing select-none"
                  title={`${p.name} #${p.number} — 拖到後排（1/5/6）上場；右鍵取消先發`}
                >
                  #{p.number}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
