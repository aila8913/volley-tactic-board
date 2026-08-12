import React, { useRef, useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { findNearestZone, deriveRotation } from "../lib/rotationLogic";
import type { MatchPlayer } from "../types/match";
import type { LineupZones } from "../types/scoresheet";
import type { SnapshotPlayer } from "../types/courtSnapshot";
import PlayerNode from "./PlayerNode";
import Markers from "./Markers";
import DefenseRange from "./DefenseRange";
import { CourtGradientDefs, CourtSurface, CourtBorder, CourtLines } from "../lib/courtTheme";
import { COURT_W, COURT_H, fromScreen, toNorm, rowOf } from "../lib/courtGeometry";

// 這一場還沒有分片資料時用的空白預設值（模組層、參照穩定，避免每 render 換新陣列造成重繪）。
const EMPTY_ROSTER: MatchPlayer[] = [];
const EMPTY_LINEUP: LineupZones = {};

// 球場「真正比賽用」的座標範圍，永遠固定 0~100 / 0~200——格子吸附、界外判斷、
// 6 個站位格全部都認這組數字，不會因為旁邊要多留 L 備位空間就跟著變動。
// （這兩個常數本體收斂到 lib/courtGeometry.ts，跟 ScoreSheetCourt.tsx／PlayerNode.tsx
// 共用同一份定義，這裡只是 import 進來繼續用同樣的名字，下面 COURT_CANVAS_* 等
// 衍生常數不用跟著改。）

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
  const lineup = rotationData?.lineup ?? EMPTY_LINEUP;
  const liberoReplacesPlayerId = rotationData?.liberoReplacesPlayerId ?? null;
  const currentRotation = rotationData?.currentRotation ?? 0;
  const roster = rotationData?.roster ?? EMPTY_ROSTER;
  const startingLiberoId = rotationData?.startingLiberoId ?? null;
  const setStartingLiberoId = useRotationTable((s) => s.setStartingLiberoId);
  const placePlayerOnCourt = useRotationTable((s) => s.placePlayerOnCourt);

  // 戰術白板改成單景 session 後（issue #154 PR C），畫筆/防守範圍/場上球員都住在
  // session 裡（可編輯）或 viewingScene 裡（唯讀檢視已存戰術）。isLayoutMode 這個常駐布林
  // 拿掉了，改用「session !== null」直接推導：有 session＝正在即時布置。
  const session = useTacticsBoard((s) => s.session);
  const viewingScene = useTacticsBoard((s) => s.viewingScene);
  const isLayoutMode = session !== null;
  const activeTool = useTacticsBoard((s) => s.activeTool);
  const courtView = useTacticsBoard((s) => s.courtView);
  const setActiveTool = useTacticsBoard((s) => s.setActiveTool);
  const setSelectedObjectId = useTacticsBoard((s) => s.setSelectedObjectId);
  const addMarker = useTacticsBoard((s) => s.addMarker);
  const updateMarker = useTacticsBoard((s) => s.updateMarker);
  const pushHistory = useTacticsBoard((s) => s.pushHistory);
  const addDefenseRange = useTacticsBoard((s) => s.addDefenseRange);
  const undo = useTacticsBoard((s) => s.undo);
  const redo = useTacticsBoard((s) => s.redo);
  const placeSessionPlayer = useTacticsBoard((s) => s.placeSessionPlayer);

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
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [matchId, undo, redo]);

  // 這一輪誰站哪：#231 PR3 之後不再從 store 撈現成的座標陣列，而是從「一份先發 + L 頂替誰」
  // 現算（deriveRotation）。用 useMemo 包起來是因為下面 map 出來的 PlayerNode 會吃這些物件，
  // 每次 render 重算會產生一批新物件、讓整排球員白白重繪；依賴項都是 store 裡參照穩定的
  // slice，只有真的改了站位才會重算。
  const rotationPositions = useMemo(
    () => deriveRotation(lineup, startingLiberoId, liberoReplacesPlayerId, currentRotation),
    [lineup, startingLiberoId, liberoReplacesPlayerId, currentRotation],
  );

  // 螢幕座標→SVG 座標的換算（issue #227 收斂到 lib/courtGeometry.ts 的 fromScreen，
  // 這裡只是把目前這個 SVG 元素的 ref 帶進去）。
  const getSvgPoint = (e: React.PointerEvent) => fromScreen(e.clientX, e.clientY, courtRef.current);

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
        addMarker(
          {
            // Array.includes() 不會幫 TS 自動收窄型別（TS 只看得懂 === 比較），
            // 上面的 includes 已經保證只剩這三種，這裡用明確的字面量聯集斷言取代 any——
            // 好處是若未來 Marker 的 type 聯集改了，這行會直接編譯錯誤，any 則會默默放行。
            type: activeTool as "arrow" | "dashed" | "attack",
            points: [
              { x: pt.x, y: pt.y },
              { x: pt.x, y: pt.y },
            ],
          },
          // 拖曳畫線：pointerDown 只放起點，先別記歷史，等 pointerUp 線畫完才記一次完整的線。
          // 否則 undo 只會退回「起點＝終點」的殘缺線頭（#147 殘留的畫線分支）。
          { skipHistory: true },
        );
        // We will set a flag so pointerMove knows we are drawing
        setDrawingMarkerId("drawing");
      } else if (isLayoutMode && (activeTool === "text" || activeTool === "volleyball")) {
        addMarker({
          // 這裡不用斷言：上面的條件是直接的 === 比較，TS 已把 activeTool
          // 自動收窄成 "text" | "volleyball"。
          type: activeTool,
          x: pt.x,
          y: pt.y,
          text: activeTool === "text" ? "請輸入文字" : undefined,
        });
        setActiveTool("select");
      } else if (isLayoutMode && ["circle", "ellipse", "fan"].includes(activeTool)) {
        addDefenseRange({
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
      // We assume the last marker added is the one being drawn.
      // 畫筆現在住在 session 裡（沒有 session 就不可能在畫線，但仍防呆一下）。
      const markers = session?.markers ?? [];
      if (markers.length > 0) {
        const lastMarker = markers[markers.length - 1];
        if (lastMarker.points && lastMarker.points.length === 2) {
          // updateMarker 現在預設會記歷史（#361-2），這裡一定要傳 skipHistory：這個 branch
          // 每個滑鼠移動 frame 都會跑一次，沒有這個選項就會把畫一條線的過程全部記進歷史。
          // 真正記一次歷史的時機在下面 handlePointerUp（畫完、放開滑鼠才算一步，#147）。
          updateMarker(
            lastMarker.id,
            { points: [lastMarker.points[0], { x: pt.x, y: pt.y }] },
            { skipHistory: true },
          );
        }
      }
    }
  };

  const handlePointerUp = () => {
    if (drawingMarkerId) {
      // 線畫完了（放開滑鼠）：這時終點已被 pointerMove 更新到最終位置，記一次歷史就是
      // 一條完整的線＝一個 undo 步驟。addMarker 當初刻意跳過歷史，就是為了在這裡補記（#147）。
      pushHistory();
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
    const { x: rawX, y: rawY } = fromScreen(e.clientX, e.clientY, courtRef.current);

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
        const norm = toNorm({ x: rawX, y: rawY });
        placePlayerOnCourt(matchId, playerId, findNearestZone(norm.x, norm.y));
      }
    } else if (courtView === "tactics" && session) {
      // 戰術視圖 + 有 session：從名單把一位球員拖進白板。session 的球員是反正規化的
      // SnapshotPlayer（姓名/背號/位置都凍在裡面），所以這裡在「元件層」用輪轉表的 roster
      // 把 id 查成一筆完整身分再傳值進去（placeSessionPlayer 以 sourcePlayerId upsert）——
      // store 本身不碰 roster，維持單向。查不到（幽靈 id）就什麼都不做。
      const p = roster.find((rp) => rp.id === playerId);
      if (p) {
        const norm = toNorm({ x: rawX, y: rawY });
        const sp: SnapshotPlayer = {
          sourcePlayerId: p.id,
          name: p.name,
          number: p.number,
          role: p.role,
          x: norm.x,
          y: norm.y,
          isLibero: p.role === "L",
        };
        placeSessionPlayer(sp);
      }
    }
    // 戰術視圖 + 非布置模式（唯讀檢視）：不接受拖曳
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

  // L 備位圓圈的落點（issue #18，2026-07-15 改成側邊留白；珊瑚色虛線外框已於
  // 2026-08-04 拿掉，見下面 courtView === "rotation" 那段的說明）：落在 1 號位外側——
  // 我方 1 號位 y=185（見 rotationLogic.ts 的 zoneCoords，zone 1: {x:0.83, y:0.85}，
  // 我方半場是 y:100~200，100 + 0.85*100 = 185）。
  const OUR_ZONE1_Y = 185;
  const LIBERO_STRIP_MARGIN = (LIBERO_ZONE_WIDTH - LIBERO_BOX_SIZE) / 2;
  // 落點正中央的百分比位置，給下面可拖曳的 L 備位圓圈疊上去用。
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
              ? "h-full w-full relative drop-shadow-sm court-glass"
              : "h-full w-auto max-w-full relative drop-shadow-sm court-glass"
          }
          style={
            courtView === "tactics"
              ? undefined
              : { aspectRatio: `${COURT_CANVAS_WIDTH} / ${COURT_CANVAS_HEIGHT}` }
          }
        >
          {/* 邊緣繞行光（issue #134）：獨立於 SVG 之外的一層，蓋在整個 wrapper 外框，
              見 index.css 的 .court-edge-light 說明。 */}
          <div className="court-edge-light" />

          {/* 左上／右下對角的半透明玻璃裝飾方塊（issue #176、docs/layout-spec.md §3.2）已於
              2026-08-03 拿掉（tang 實機確認）：這兩個方塊當初是「示意場外區塊——發球位/替補區
              之類」的純裝飾佔位，`pointer-events-none`、從沒接過任何功能。真的要做「場外區塊」
              時再重新設計，不要復原這兩個純裝飾的 div。 */}
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
              {/* 球場材質 v4（lib/courtTheme.tsx，2026-08-07 對齊 Claude Design 的
                  court-material-v4.html）：球場本身沒有底色，這裡的 <defs> 只剩球網網格
                  pattern（CourtGradientDefs，跟計分表球場 ScoreSheetCourt.tsx 共用同一份
                  來源，id 各自取避免同頁互搶）跟畫箭頭用的 marker。 */}
              <CourtGradientDefs id="court-gradient" />
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

            {/* 球場底：透明矩形，只給拖曳/點擊空白處的命中判斷用（lib/courtTheme.tsx
                CourtSurface）——v4 之前這裡是深青漸層，模板球場其實沒有底色，深色是
                透出頁面底色 #050603，不是球場自己塗的。 */}
            <CourtSurface />

            {/* 球場外框（lib/courtTheme.tsx CourtBorder）：兩個視圖都畫在 SVG 裡、貼著
                球場本身（0,0 到 100,200），不會被上下 L 備位留白帶撐大（過去輪轉視圖是
                靠 wrapper 的 CSS border 畫框，但 wrapper 現在比球場高，CSS border 會框住
                整個留白帶，所以統一改成跟戰術視圖一樣畫在 SVG 裡）。vectorEffect=
                "non-scaling-stroke" 的理由見 CourtBorder 本體的註解。 */}
            <CourtBorder />

            {/* L 備位珊瑚色虛線框（issue #18）已於 2026-08-04 拿掉（tang 要求，覺得跟現在
                的畫面風格不搭）——底下留白空間（LIBERO_ZONE_WIDTH 等常數）跟可拖曳的
                L 備位圓圈（下面 courtView === "rotation" 那段）都還在，只是不再額外畫一圈
                虛線框標示這塊區域，圓圈本身已經夠清楚。 */}

            {/* 攻擊線 + 球網：跟計分表球場（ScoreSheetCourt.tsx）共用同一份 <CourtLines/>
                （lib/courtTheme.tsx），改一邊兩邊一起變。id 要跟上面 <CourtGradientDefs/>
                傳的 "court-gradient" 一致，球網的網格帶才找得到 pattern。 */}
            <CourtLines id="court-gradient" />

            {/* 畫筆標記與防守範圍只在「戰術視圖」模式下顯示，
              輪轉視圖只看站位圓圈，避免標記干擾判斷球員站哪裡。 */}
            {courtView === "tactics" &&
              (() => {
                // 即時布置時畫筆/防守範圍來自 session（可編輯），檢視已存戰術時來自 viewingScene
                //（唯讀）——兩者 markers/defenseRanges 欄位形狀相同；都沒有就不畫。
                const drawings = session ?? viewingScene;
                if (!drawings) return null;
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
              戰術視圖：一律渲染「反正規化」的 SnapshotPlayer——即時布置吃 session.snapshot.players
              （可拖曳），檢視已存戰術吃 viewingScene.snapshot.players（唯讀，issue #154 PR B）。
              兩者姓名/背號/位置都凍在快照裡，刻意「不」回 roster 查，所以名單怎麼改都動不到畫面。
              輪轉視圖：用 positions（格子吸附站位，來自輪轉表即時資料）＋ roster join。 */}
            {courtView === "tactics"
              ? (session?.snapshot.players ?? viewingScene?.snapshot.players ?? []).map((sp, i) => {
                  // SnapshotPlayer 沒有現成的 MatchPlayer/PlayerPosition 物件，就地組出 PlayerNode
                  // 需要的兩個 prop。session 的球員 sourcePlayerId 必為非 null（拖曳/移除要靠它當
                  // 識別）；viewingScene 可能有 null（當初就查無此人），唯讀情境用合成 id 當 key 即可。
                  const id = sp.sourcePlayerId ?? `snap-${i}`;
                  // 快照球員（SnapshotPlayer）本來就沒有 personId 這個概念（快照是凍結的姓名/
                  // 背號/位置，不回 roster 查），這裡只是就地組出 PlayerNode 要的形狀，personId
                  // 給 null 即可——不影響任何跨場統計，因為畫面渲染根本不會讀這個欄位。
                  const player = {
                    id,
                    name: sp.name,
                    number: sp.number,
                    role: sp.role,
                    personId: null,
                  };
                  const position = { playerId: id, x: sp.x, y: sp.y };
                  const isFrontRow = rowOf(sp.y) === "front";
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
              : rotationPositions.positions.map((pos) => {
                  const player = roster.find((p) => p.id === pos.playerId);
                  if (!player) return null;
                  const isLibero = player.role === "L";
                  const isFrontRow = rowOf(pos.y) === "front";
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
                  // 2026-08-07 對齊 Claude Design PlayerMarker 元件卡的「自由球員」樣式
                  // （components/PlayerMarker/card.html，跟 components/PlayerMarker.tsx
                  // 那顆 SVG 版本同一套視覺語言，這裡是 HTML 版）：深色玻璃底描邊改成
                  // 「這個顏色實色填滿＋圈角一顆深底 L 徽章」，背號不再加 # 前綴，文字用
                  // 深色墨（DS 的 filled 狀態規則：實色亮綠底上深色字才有足夠對比）。
                  className="relative flex h-7 w-7 cursor-grab select-none items-center justify-center rounded-full font-score text-micro backdrop-blur-sm active:cursor-grabbing"
                  style={{ background: "#CCFF00", color: "#0a0b07" }}
                  title={`${p.name} #${p.number} — 拖到後排（1/5/6）上場；右鍵取消先發`}
                >
                  {p.number}
                  <span
                    className="absolute -bottom-1 -right-1 rounded-full px-1 text-marker-xs font-sans font-bold leading-[1.4]"
                    style={{ background: "#0a0b07", color: "#CCFF00" }}
                  >
                    L
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
