import React, { useRef, useState, useEffect } from "react";
import { useParams } from "wouter";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { findNearestZone } from "../lib/rotationLogic";
import type { RotationPositions } from "../types/rotationTable";
import type { RotationTactics } from "../types/tacticsBoard";
import type { MatchPlayer } from "../types/match";
import PlayerNode from "./PlayerNode";
import Markers from "./Markers";
import DefenseRange from "./DefenseRange";

// 這一場還沒有分片資料時用的空白預設值（模組層、參照穩定，避免每 render 換新陣列造成重繪）。
const EMPTY_ROSTER: MatchPlayer[] = [];
const EMPTY_ROTATIONS: RotationPositions[] = Array(6)
  .fill(null)
  .map(() => ({ positions: [], liberoReplacement: null }));
const EMPTY_TACTICS: RotationTactics[] = Array(6)
  .fill(null)
  .map(() => ({ tacticPositions: [], markers: [], defenseRanges: [] }));
const DEFAULT_LABEL_TOGGLES = { zone: false };

// 球場「真正比賽用」的座標範圍，永遠固定 0~100 / 0~200——格子吸附、界外判斷、
// 6 個站位格全部都認這組數字，不會因為旁邊要多留 L 備位空間就跟著變動。
const COURT_W = 100;
const COURT_H = 200;

// L 備位紅框的尺寸（issue #18）。原本連同緩衝一起畫在球場「上下方」，會把球場本體
// 往內壓縮快 30% 高度；2026-07-15 改成畫在球場「左右側」、對齊 1 號位的高度——
// 縱向是排球場比較稀缺的方向（球場本身就是窄長形），橫向留白換來的球場本體反而更大。
const LIBERO_BOX_SIZE = 18;
// 留給備位框的水平寬度：框本身 18 + 兩側各留一點視覺呼吸空間，不追求 px 級精確。
const LIBERO_ZONE_WIDTH = LIBERO_BOX_SIZE + 14; // = 32

// court-canvas：SVG 實際要畫出來的範圍，比賽場地（0~100/0~200）只是置中畫在裡面的
// 一塊，左右各多留 LIBERO_ZONE_WIDTH 空間給 1 號位外側的 L 紅框備位格。垂直方向
// 完全不用再留白，canvas 高度直接等於球場本身的高度。
const COURT_CANVAS_MIN_X = -LIBERO_ZONE_WIDTH;
const COURT_CANVAS_WIDTH = COURT_W + LIBERO_ZONE_WIDTH * 2;
const COURT_CANVAS_MIN_Y = 0;
const COURT_CANVAS_HEIGHT = COURT_H;

// 輪轉視圖：viewBox 固定等於 court-canvas（球場本身 + 左右 L 備位留白），球員只能
// 吸附在 6 個格子裡，嚴格對應真實比賽規則，不需要、也不應該讓人跑到界外。
const VIEWBOX_ROTATION = `${COURT_CANVAS_MIN_X} ${COURT_CANVAS_MIN_Y} ${COURT_CANVAS_WIDTH} ${COURT_CANVAS_HEIGHT}`;

// 戰術視圖：白板要跟外層 panel 一樣大（不是固定留一小圈邊界），court-canvas（球場
// +左右 L 備位留白）置中畫在裡面。用 wrapper 實際量到的寬高比決定要往哪個方向多留白，
// 這樣球場才不會被拉伸變形——量不到尺寸（還沒 mount）就先退回跟輪轉視圖一樣的範圍。
function computeTacticsViewBox(size: { width: number; height: number } | null): string {
  if (!size || size.width <= 0 || size.height <= 0) return VIEWBOX_ROTATION;
  const containerRatio = size.width / size.height;
  const courtCanvasRatio = COURT_CANVAS_WIDTH / COURT_CANVAS_HEIGHT;
  let vw: number, vh: number;
  if (containerRatio > courtCanvasRatio) {
    // panel 比 court-canvas「寬」：高度吃滿 court-canvas 的高，寬度依 panel 比例往外撐開
    vh = COURT_CANVAS_HEIGHT;
    vw = vh * containerRatio;
  } else {
    // panel 比 court-canvas「窄／高」：寬度吃滿 court-canvas 的寬，高度依 panel 比例往外撐開
    vw = COURT_CANVAS_WIDTH;
    vh = vw / containerRatio;
  }
  const minX = COURT_CANVAS_MIN_X - (vw - COURT_CANVAS_WIDTH) / 2;
  const minY = COURT_CANVAS_MIN_Y - (vh - COURT_CANVAS_HEIGHT) / 2;
  return `${minX} ${minY} ${vw} ${vh}`;
}

export default function Court() {
  // 站位資料（誰在場上哪個位置）來自輪轉表；畫筆/防守範圍/戰術視圖自由站位來自戰術板。
  // Court 是兩邊資料實際「合流顯示」的地方——戰術板要疊圖畫在球員身上，天生就要同時
  // 讀兩個 store，這跟我們說好的「戰術板依賴輪轉表」並不衝突：這裡只是元件同時訂閱
  // 兩個 store，不是其中一個 store 內部互相呼叫。
  // 兩個 store 現在都用 matchId 分片（issue #119），資料一律從 dataByMatch[matchId] 讀，
  // 動作則第一參數帶 matchId。matchId 來自 URL（這個元件只在 /matches/:id/board 底下）。
  const { id: matchId } = useParams<{ id: string }>();
  const rotationData = useRotationTable((s) => (matchId ? s.dataByMatch[matchId] : undefined));
  const rotations = rotationData?.rotations ?? EMPTY_ROTATIONS;
  const currentRotation = rotationData?.currentRotation ?? 0;
  const roster = rotationData?.roster ?? EMPTY_ROSTER;
  const startingLiberoId = rotationData?.startingLiberoId ?? null;
  const setStartingLiberoId = useRotationTable((s) => s.setStartingLiberoId);
  const placePlayerOnCourt = useRotationTable((s) => s.placePlayerOnCourt);

  const tacticsData = useTacticsBoard((s) => (matchId ? s.dataByMatch[matchId] : undefined));
  const tacticsByRotation = tacticsData?.tacticsByRotation ?? EMPTY_TACTICS;
  const labelToggles = tacticsData?.labelToggles ?? DEFAULT_LABEL_TOGGLES;
  // 這些是全域、暫時性的畫面狀態（不隨 match 走），個別選取。
  const activeTool = useTacticsBoard((s) => s.activeTool);
  const isLayoutMode = useTacticsBoard((s) => s.isLayoutMode);
  const courtView = useTacticsBoard((s) => s.courtView);
  // 唯讀檢視已存戰術時，畫面完全來自這張凍結快照（issue #154 PR B），不回輪轉表/名單查任何東西。
  const viewingScene = useTacticsBoard((s) => s.viewingScene);
  const setActiveTool = useTacticsBoard((s) => s.setActiveTool);
  const setSelectedObjectId = useTacticsBoard((s) => s.setSelectedObjectId);
  const addMarker = useTacticsBoard((s) => s.addMarker);
  const updateMarker = useTacticsBoard((s) => s.updateMarker);
  const addDefenseRange = useTacticsBoard((s) => s.addDefenseRange);
  const undo = useTacticsBoard((s) => s.undo);
  const redo = useTacticsBoard((s) => s.redo);
  const placePlayerFree = useTacticsBoard((s) => s.placePlayerFree);

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

  // Ctrl/Cmd+Z 復原、Ctrl/Cmd+Shift+Z 或 Ctrl/Cmd+Y 重做。
  // 這個 effect 一定要放在下面那行 early return「之前」——React 的 hooks 規則要求
  // 每次 render 呼叫的 hook 數量與順序都相同，如果 hook 排在條件 return 後面，
  // 某次 render 提早離開時 hook 數量就對不上，React 內部的 hook 對應表會整個錯位
  //（這正是 eslint react-hooks/rules-of-hooks 抓到的錯誤）。
  useEffect(() => {
    if (!matchId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(matchId);
        else undo(matchId);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo(matchId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [matchId, undo, redo]);

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
    if (!matchId) return;
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
        addMarker(matchId, {
          // Array.includes() 不會幫 TS 自動收窄型別（TS 只看得懂 === 比較），
          // 上面的 includes 已經保證只剩這三種，這裡用明確的字面量聯集斷言取代 any——
          // 好處是若未來 Marker 的 type 聯集改了，這行會直接編譯錯誤，any 則會默默放行。
          type: activeTool as "arrow" | "dashed" | "attack",
          points: [
            { x: pt.x, y: pt.y },
            { x: pt.x, y: pt.y },
          ],
        });
        // We will set a flag so pointerMove knows we are drawing
        setDrawingMarkerId("drawing");
      } else if (isLayoutMode && (activeTool === "text" || activeTool === "volleyball")) {
        addMarker(matchId, {
          // 這裡不用斷言：上面的條件是直接的 === 比較，TS 已把 activeTool
          // 自動收窄成 "text" | "volleyball"。
          type: activeTool,
          x: pt.x,
          y: pt.y,
          text: activeTool === "text" ? "請輸入文字" : undefined,
        });
        setActiveTool("select");
      } else if (isLayoutMode && ["circle", "ellipse", "fan"].includes(activeTool)) {
        addDefenseRange(matchId, {
          playerId: "",
          // 同上：includes 保證了範圍，用字面量聯集斷言（對應 DefenseRange 的 type）取代 any。
          type: activeTool as "circle" | "ellipse" | "fan",
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
    if (!matchId) return;
    if (drawingMarkerId === "drawing") {
      const pt = getSvgPoint(e);
      // We assume the last marker added is the one being drawn
      const markers = rotationTactics.markers;
      if (markers.length > 0) {
        const lastMarker = markers[markers.length - 1];
        if (lastMarker.points && lastMarker.points.length === 2) {
          updateMarker(matchId, lastMarker.id, {
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
    if (!matchId) return;
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
          setStartingLiberoId(matchId, playerId);
        }
      } else {
        // 輪轉視圖：吸附到最近格子，自動推算全部 6 個輪次
        placePlayerOnCourt(matchId, playerId, findNearestZone(rawX / 100, rawY / 200));
      }
    } else if (courtView === "tactics" && isLayoutMode) {
      // 戰術視圖 + 布置模式：自由座標放置，只影響目前輪次的 tacticPositions
      placePlayerFree(matchId, playerId, rawX / 100, rawY / 200);
    }
    // 戰術視圖 + 非布置模式：不接受拖曳（唯讀）
  };

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

  // L 備位紅框（issue #18，2026-07-15 改成側邊留白）：畫在 1 號位外側——
  // 我方 1 號位 y=185（見 rotationLogic.ts 的 zoneCoords，zone 1: {x:0.83, y:0.85}，
  // 我方半場是 y:100~200，100 + 0.85*100 = 185），對方鏡射過來 y=15（200-185）。
  // 框在留白帶裡置中，尺寸抓玩家圓圈（半徑 6）的 1.5 倍左右。
  const OUR_ZONE1_Y = 185;
  const OPPONENT_ZONE1_Y = COURT_H - OUR_ZONE1_Y; // = 15
  const LIBERO_STRIP_MARGIN = (LIBERO_ZONE_WIDTH - LIBERO_BOX_SIZE) / 2;
  const ourLiberoBox = {
    x: COURT_W + LIBERO_STRIP_MARGIN,
    y: OUR_ZONE1_Y - LIBERO_BOX_SIZE / 2,
  };
  const opponentLiberoBox = {
    x: -LIBERO_ZONE_WIDTH + LIBERO_STRIP_MARGIN,
    y: OPPONENT_ZONE1_Y - LIBERO_BOX_SIZE / 2,
  };
  // 我方紅框正中央的百分比位置，給下面可拖曳的 L 備位圓圈疊上去用。
  const ourLiberoCenterPercent = svgPointToPercent(
    COURT_W + LIBERO_STRIP_MARGIN + LIBERO_BOX_SIZE / 2,
    OUR_ZONE1_Y,
  );

  return (
    <div className="h-full w-full flex flex-col justify-center items-center relative">
      {/* 白板＝這個 div 本身，直接貼齊中間 panel 邊緣（0px 間距、不需要灰底跟 panel
          做區分）。原本這裡有 10px 留白＋灰底是為了讓人看出白板比球場大（issue #49），
          現在留白責任整個下放給下面的「場地元件」，白板跟 panel 完全重疊本來就是
          刻意的設計選擇，不需要再額外畫出來強調。 */}
      <div className="flex-1 w-full flex items-center justify-center min-h-0 py-[5px] px-[10px]">
        {/* 場地元件：白板到球場真正外框之間的留白，上下 5px、左右 10px（上面那層
            padding），兩個視圖共用同一組數字。輪轉視圖原本用不對稱的 32/72/16px 是
            為了幫最下面那排「L 備位」列留位置，現在備位改畫進 SVG 自己的留白帶裡
            （見 LIBERO_ZONE_WIDTH），外層就不用再特別留大留白了。 */}
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
              : { aspectRatio: `${COURT_CANVAS_WIDTH} / ${COURT_CANVAS_HEIGHT}` }
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
              {/* 球場底色：深青漸層（design-spec.md 第 5 節，2026-07-15 選定的方案 B）——
                  比暖木色更貼近整體深色 UI，冷色調對己方萊姆綠跟對方珊瑚紅球員點都是安全的
                  對比組合。 */}
              <linearGradient id="court-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#12403f" />
                <stop offset="50%" stopColor="#1c5654" />
                <stop offset="100%" stopColor="#2a6e6a" />
              </linearGradient>
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
            <rect
              id="court-bg"
              x="0"
              y="0"
              width={COURT_W}
              height={COURT_H}
              fill="url(#court-gradient)"
            />

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
              stroke="#F5F5F0"
              strokeOpacity="0.6"
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

            <g>
              {/* Center Line (Net) — x 從 0 到 100 貼齊 div 邊框。米白半透明，見
                  docs/design-spec.md 第 5 節「球網/邊線」。 */}
              <line
                x1="0"
                y1="100"
                x2="100"
                y2="100"
                stroke="#F5F5F0"
                strokeOpacity="0.6"
                strokeWidth="2.5"
              />

              {/* Attack Lines (3m)
                viewBox 高 200，每半場 100 個單位代表 9m，3m = 100/3 ≈ 33.3
                → 三米線：y=100-33.3=66.7 / y=100+33.3=133.3 */}
              <line
                x1="0"
                y1="66.7"
                x2="100"
                y2="66.7"
                stroke="#F5F5F0"
                strokeOpacity="0.6"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1="0"
                y1="133.3"
                x2="100"
                y2="133.3"
                stroke="#F5F5F0"
                strokeOpacity="0.6"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </g>

            {/* Zone Labels */}
            {labelToggles.zone && (
              <g className="opacity-10 font-sans text-4xl" fill="#F5F5F0">
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

            <text
              x="50"
              y="15"
              fontSize="6"
              fill="#F5F5F0"
              textAnchor="middle"
              className="font-sans"
            >
              對手
            </text>
            <text
              x="50"
              y="192"
              fontSize="6"
              fill="#F5F5F0"
              textAnchor="middle"
              className="font-sans"
            >
              我方
            </text>

            {/* 畫筆標記與防守範圍只在「戰術視圖」模式下顯示，
              輪轉視圖只看站位圓圈，避免標記干擾判斷球員站哪裡。 */}
            {courtView === "tactics" &&
              (() => {
                // 檢視已存戰術時畫筆/防守範圍來自那張快照（viewingScene），即時布置時來自
                // 當前輪次的 rotationTactics——兩者 markers/defenseRanges 欄位形狀相同。
                const drawings = viewingScene ?? rotationTactics;
                return (
                  <>
                    {drawings.defenseRanges.map((dr) => (
                      <DefenseRange key={dr.id} range={dr} />
                    ))}
                    {drawings.markers.map((m) => (
                      <Markers key={m.id} marker={m} />
                    ))}
                  </>
                );
              })()}

            {/* Render Players
              輪轉視圖：用 positions（格子吸附站位，來自輪轉表，即時資料）。
              戰術視圖 + 即時布置：用 tacticPositions（進入戰術布置那一刻從輪轉表拍的快照）。
              戰術視圖 + 檢視已存戰術：用 viewingScene.snapshot.players（凍結快照，issue #154
              PR B）——這裡是「反正規化」的 SnapshotPlayer，姓名/背號/位置都已凍在快照裡，
              刻意「不」回 roster 查，所以名單怎麼改（刪人/改名）都動不到這張照片。 */}
            {courtView === "tactics" && viewingScene
              ? viewingScene.snapshot.players.map((sp, i) => {
                  // SnapshotPlayer 沒有現成的 MatchPlayer/PlayerPosition 物件，就地組出 PlayerNode
                  // 需要的兩個 prop。sourcePlayerId 可能是 null（當初就查無此人），用合成 id 當 key
                  // 就好——檢視是唯讀，這個 id 不會被拿去寫任何東西。
                  const id = sp.sourcePlayerId ?? `snap-${i}`;
                  const player = { id, name: sp.name, number: sp.number, role: sp.role };
                  const position = { playerId: id, x: sp.x, y: sp.y };
                  const isFrontRow = sp.y > 0.5 && sp.y < 0.75;
                  return (
                    <PlayerNode
                      key={id}
                      player={player}
                      position={position}
                      isFrontRow={isFrontRow}
                      isLibero={sp.isLibero}
                      courtRef={courtRef}
                    />
                  );
                })
              : (courtView === "rotation"
                  ? rotationPositions.positions
                  : rotationTactics.tacticPositions
                ).map((pos) => {
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
                })}
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
                    if (matchId) setStartingLiberoId(matchId, null);
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
