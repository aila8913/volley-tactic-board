import React, { useRef, useState, useEffect } from "react";
import { useParams } from "wouter";
import { v4 as uuidv4 } from "uuid";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { PLAYER_ROLES, type MatchPlayer, type PlayerRole } from "../types/match";
import type { SnapshotPlayer } from "../types/courtSnapshot";
import { DND_ANON_ROLE } from "../lib/dndProtocols";
import PlayerNode from "./PlayerNode";
import Markers from "./Markers";
import DefenseRange from "./DefenseRange";
import { CourtGradientDefs, CourtSurface, CourtBorder, CourtLines } from "../lib/courtTheme";
import { COURT_W, COURT_H, fromScreen, toNorm, rowOf } from "../lib/courtGeometry";

// ── issue #328：這個檔案只剩一種畫法 ──
//
// 在此之前 Court 一支元件兼兩種畫法，由 useTacticsBoard.courtView 切換：「輪轉視圖」畫
// 輪轉表的先發（球員只能吸附六個號位、旁邊一顆 L 備位圓圈、不能畫筆），「戰術視圖」畫
// 一份戰術快照（自由擺放＋畫筆）。輪轉那半邊已經退役，理由有三層：
//
//   1. **沒有任何按鈕能切換它**——courtView 從來不是使用者按的，只是 startSession /
//      discardSession / 切輪次的副作用，而畫面上也沒有任何地方說明現在是哪一種狀態。
//      PO 實測的回報是「看不懂輪轉視圖是什麼、也從來沒看到過它」。
//   2. **職責已經被搬走**。六格拖曳與輪次切換在 #174／#251 之後由右欄的 RotationRailPanel
//      提供；最後一件獨有的事（指定先發自由球員）在 #327 交給了輪轉表的第七格。它不是被
//      設計出來的畫面，是被剩下來的。
//   3. **它是戰術板僅存的「寫回輪轉表」路徑**（拖球員上場、拖進紅框指定先發 L），跟
//      ADR-0001「戰術板嚴格單向、永遠不寫回輪轉表」直接牴觸。拿掉之後這個檔案只讀 roster
//      查身分，不再有任何一支寫入動作——它接的那兩支 store action 因此連呼叫端都沒了，已在
//      收尾時從 useRotationTable 刪除。
//
// 於是「白板上畫什麼」現在只由一個狀態決定：有 session＝畫可編輯的即時快照，有
// viewingScene＝畫唯讀的已存戰術，兩者皆無＝一塊空白球場。
//
// ⚠️「中央空著很奇怪，把站位畫上去當唯讀參照就好」是這個檔案最容易被改回去的方向——那正是
// 被退役的畫面。決定與「不要重新提議」清單在 docs/adr/0012，行為由 Court.test.tsx 第一條
// 釘住。

// 這一場還沒有分片資料時用的空白預設值（模組層、參照穩定，避免每 render 換新陣列造成重繪）。
const EMPTY_ROSTER: MatchPlayer[] = [];

// 球場「真正比賽用」的座標範圍，永遠固定 0~100 / 0~200——界外判斷、球員座標、快照存的
// 正規化座標全部都認這組數字。（這兩個常數本體收斂到 lib/courtGeometry.ts，跟
// ScoreSheetCourt.tsx／PlayerNode.tsx 共用同一份定義，這裡只是 import 進來繼續用同樣的
// 名字，下面 COURT_CANVAS_* 等衍生常數不用跟著改。）

// 球場左右兩側的留白（單位跟球場座標同一套）。這個數字的來歷是 issue #18 的 L 備位紅框
// （框 18 + 兩側呼吸空間 14），紅框與備位圓圈都已隨 #328 退役，但留白本身保留下來：
// 戰術白板本來就允許把球員拖到界外當註解，球場外緣貼著白板邊緣反而沒地方放。
const COURT_SIDE_MARGIN = 32;

// court-canvas：白板「至少」要畫得下的範圍——比賽場地（0~100/0~200）加左右兩條留白帶。
// 垂直方向不留白，canvas 高度直接等於球場本身的高度。
const COURT_CANVAS_MIN_X = -COURT_SIDE_MARGIN;
const COURT_CANVAS_WIDTH = COURT_W + COURT_SIDE_MARGIN * 2;
const COURT_CANVAS_MIN_Y = 0;
const COURT_CANVAS_HEIGHT = COURT_H;

// 還沒量到 wrapper 尺寸（第一次 render、ResizeObserver 還沒回報）時的保底 viewBox：
// 就是 court-canvas 本身，不多不少。
const VIEWBOX_FALLBACK = `${COURT_CANVAS_MIN_X} ${COURT_CANVAS_MIN_Y} ${COURT_CANVAS_WIDTH} ${COURT_CANVAS_HEIGHT}`;

// 白板要跟外層 panel 一樣大（不是固定留一小圈邊界），court-canvas 置中畫在裡面。用 wrapper
// 實際量到的寬高比決定要往哪個方向多留白，這樣球場才不會被拉伸變形。
function computeTacticsViewBox(size: { width: number; height: number } | null): string {
  if (!size || size.width <= 0 || size.height <= 0) return VIEWBOX_FALLBACK;
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
  // 畫筆/防守範圍/場上球員都來自戰術板 store。輪轉表這邊 #328 之後只剩一個用途：把「從
  // 右欄名單拖進來的 playerId」查成一筆完整身分（姓名/背號/位置），好組出快照要存的
  // SnapshotPlayer——只讀不寫，符合 ADR-0001 的單向規則。
  // 兩個 store 都用 matchId 分片（issue #119），資料一律從 dataByMatch[matchId] 讀。
  // matchId 來自 URL（空板 /board 沒有這一段，會是 undefined）。
  const { id: matchId } = useParams<{ id: string }>();
  const rotationData = useRotationTable((s) => (matchId ? s.dataByMatch[matchId] : undefined));
  const roster = rotationData?.roster ?? EMPTY_ROSTER;

  // 戰術白板改成單景 session 後（issue #154 PR C），畫筆/防守範圍/場上球員都住在
  // session 裡（可編輯）或 viewingScene 裡（唯讀檢視已存戰術）。isLayoutMode 這個常駐布林
  // 拿掉了，改用「session !== null」直接推導：有 session＝正在即時布置。
  const session = useTacticsBoard((s) => s.session);
  const viewingScene = useTacticsBoard((s) => s.viewingScene);
  const isLayoutMode = session !== null;
  const activeTool = useTacticsBoard((s) => s.activeTool);
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
  // 白板要跟著 wrapper 的實際渲染尺寸縮放，這裡用 ResizeObserver 量測，
  // 尺寸一變（拉視窗、側欄開關擠壓版面、B/C/D 換欄）就重算 viewBox。
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
  // #372：這裡原本第一行是 `if (!matchId) return;`。那是「戰術板只存在於 /matches/:id/board」
  // 年代留下來的殘留——undo/redo 動的是白板 session 的歷史堆疊（useTacticsBoard），跟「現在
  // 是哪一場比賽」沒有任何關係。空板（/board，沒有 matchId）進來時那道 guard 會讓整組快捷鍵
  // 安靜地不掛載，使用者畫了東西按 Ctrl+Z 卻毫無反應，而且沒有任何錯誤訊息可以追。
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

  // 螢幕座標→SVG 座標的換算（issue #227 收斂到 lib/courtGeometry.ts 的 fromScreen，
  // 這裡只是把目前這個 SVG 元素的 ref 帶進去）。
  const getSvgPoint = (e: React.PointerEvent) => fromScreen(e.clientX, e.clientY, courtRef.current);

  // #372：這三支指標事件（down/move/up）原本第一行都是 `if (!matchId) return;`，理由跟上面
  // Ctrl+Z 那個 effect 一樣，是「戰術板只能從某一場比賽進去」年代的殘留。它們動到的東西
  // ——選取狀態、畫筆標記、防守範圍——全都住在白板 session 裡，沒有一項需要知道是哪一場
  // 比賽。留著那道 guard 的實際後果是：空板（/board）上所有繪圖工具都點不動，而且是安靜地
  // 不動（沒有 toast、沒有錯誤），最難查的那一種。
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
    if (!courtRef.current) return;

    // #372 決策②：位置調色盤（PositionPalette.tsx）拖進來的「匿名角色」，刻意排在
    // **最前面**、在下面「沒有比賽就整段擋掉」的 `!matchId` 判斷之前處理——調色盤本來就是
    // 設計給「還沒選比賽」的空板一個能放球員的入口，如果沿用舊有「先擋 !matchId」的順序，
    // 空板永遠走不到這個分支，調色盤拖上去會被最上面那道關卡直接吃掉、什麼事都不會發生
    // （這正是這一環要修的問題本身，不是理論上的邊角案例）。只在真的有 session（正在
    // 編輯／佈陣中，不是唯讀檢視）時接受——跟下面既有的球員拖曳分支要求的前提一致：
    // 唯讀檢視不接受任何拖曳。
    if (session) {
      const anonRole = e.dataTransfer.getData(DND_ANON_ROLE);
      // (PLAYER_ROLES as readonly string[]).includes(...) 而不是直接斷言：dataTransfer 拿到
      // 的是任意字串（理論上可以被瀏覽器擴充功能之類的東西塞進奇怪的值），先用 includes
      // 縮小範圍再斷言型別，跟這個檔案上面 handlePointerDown 判斷 activeTool 是同一招。
      if (anonRole && (PLAYER_ROLES as readonly string[]).includes(anonRole)) {
        const role = anonRole as PlayerRole;
        const { x: rawX, y: rawY } = fromScreen(e.clientX, e.clientY, courtRef.current);
        const norm = toNorm({ x: rawX, y: rawY });
        const anonPlayer: SnapshotPlayer = {
          // 每次拖曳都鑄一個全新的合成 id，是「拖出去一個、原位還留一個」這個決策唯一
          // 需要動腦筋的地方：placeSessionPlayer 是用 sourcePlayerId **upsert**（同一個 id
          // 再放一次＝原地覆蓋，不是新增一筆），如果整排 OH 共用同一個固定 id（例如都叫
          // "anon-oh"），拖第二個 OH 上場只會把第一個 OH 的位置改掉——場上永遠只有一個
          // OH，跟 PO 要的「無限供應、可以同時有兩個 OH」正好相反。uuidv4() 保證每次都是
          // 獨一無二的身分，兩個 OH 才能真的同時存在、各自能被拖曳/刪除而不影響對方。
          sourcePlayerId: `anon-${role.toLowerCase()}-${uuidv4()}`,
          // 沒有真名字，直接顯示角色代碼——PlayerNode.tsx/PlayerMarker.tsx 會在 number===0
          // 時把圈裡的內容換成 role（見那兩個檔案的說明），所以這裡兩個欄位是一致的。
          name: role,
          number: 0,
          role,
          x: norm.x,
          y: norm.y,
          isLibero: role === "L",
        };
        placeSessionPlayer(anonPlayer);
        return;
      }
    }

    // 以下是「從右欄名單拖球員上場」的路徑，要有 session 才成立（唯讀檢視不接受拖曳），
    // 也要有比賽才有名單可拖。#328 之前這裡還有一條輪轉視圖分支，會把球員吸附到六個號位
    // 並寫回輪轉表、或把 L 拖到球場下緣的留白帶指定成先發自由球員。
    // 兩件事都已經有更好的家：排先發去計分頁的輪轉表，指定先發 L
    // 去右欄第七格（#327）——而且它們是戰術板僅存的兩支「寫回輪轉表」動作，跟 ADR-0001
    // 牴觸，退役之後這個 handler 只會寫進自己的 session。
    if (!matchId || !session) return;
    const playerId = e.dataTransfer.getData("text/plain");
    if (!playerId || !courtRef.current) return;
    const { x: rawX, y: rawY } = fromScreen(e.clientX, e.clientY, courtRef.current);

    // session 的球員是反正規化的 SnapshotPlayer（姓名/背號/位置都凍在裡面），所以這裡在
    // 「元件層」用輪轉表的 roster 把 id 查成一筆完整身分再傳值進去（placeSessionPlayer 以
    // sourcePlayerId upsert）——store 本身不碰 roster，維持單向。查不到（幽靈 id）就什麼
    // 都不做。
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
  };

  const currentViewBox = computeTacticsViewBox(wrapperSize);

  // 白板上要畫哪一份內容：即時 session（可編輯）優先，其次是唯讀檢視的已存戰術，
  // 兩者皆無就是 null＝空白球場。#328 之前這個判斷還要先過 courtView 那一關。
  const drawings = session ?? viewingScene;

  return (
    <div className="h-full w-full flex flex-col justify-center items-center relative">
      {/* 白板＝這個 div 本身，直接貼齊中間 panel 邊緣（0px 間距、不需要灰底跟 panel
          做區分）。原本這裡有 10px 留白＋灰底是為了讓人看出白板比球場大（issue #49），
          現在留白責任整個下放給下面的「場地元件」，白板跟 panel 完全重疊本來就是
          刻意的設計選擇，不需要再額外畫出來強調。 */}
      <div className="flex-1 w-full flex items-center justify-center min-h-0 py-[5px] px-[10px]">
        {/* 場地元件：白板到球場真正外框之間的留白，上下 5px、左右 10px（上面那層 padding）。
            白板吃滿整個中央欄（h-full w-full），球場本身則靠 viewBox 置中畫在裡面——
            #328 之前這裡要依 courtView 在「吃滿」跟「鎖住球場長寬比」兩種 class/style 之間
            二選一，退役後只剩前者。 */}
        <div
          id="court-wrapper"
          ref={wrapperRef}
          className="h-full w-full relative drop-shadow-sm court-glass"
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

            {/* 球場外框（lib/courtTheme.tsx CourtBorder）：畫在 SVG 裡、貼著球場本身
                （0,0 到 100,200），不會被左右留白帶撐大——wrapper 比球場大，用 CSS border
                畫的話會框住整塊白板而不是球場。vectorEffect="non-scaling-stroke" 的理由
                見 CourtBorder 本體的註解。 */}
            <CourtBorder />

            {/* 攻擊線 + 球網：跟計分表球場（ScoreSheetCourt.tsx）共用同一份 <CourtLines/>
                （lib/courtTheme.tsx），改一邊兩邊一起變。id 要跟上面 <CourtGradientDefs/>
                傳的 "court-gradient" 一致，球網的網格帶才找得到 pattern。 */}
            <CourtLines id="court-gradient" />

            {/* 畫筆標記與防守範圍：即時布置時來自 session（可編輯），檢視已存戰術時來自
                viewingScene（唯讀）——兩者 markers/defenseRanges 欄位形狀相同；都沒有
                （drawings === null，例如剛進頁面還沒選任何戰術）就整段不畫。 */}
            {drawings && (
              <>
                {drawings.defenseRanges.map((dr) => (
                  <DefenseRange key={dr.id} range={dr} />
                ))}
                {drawings.markers.map((m) => (
                  <Markers key={m.id} marker={m} />
                ))}
              </>
            )}

            {/* Render Players
              一律渲染「反正規化」的 SnapshotPlayer——即時布置吃 session.snapshot.players
              （可拖曳），檢視已存戰術吃 viewingScene.snapshot.players（唯讀，issue #154 PR B）。
              兩者姓名/背號/位置都凍在快照裡，刻意「不」回 roster 查，所以名單怎麼改都動不到畫面。 */}
            {(drawings?.snapshot.players ?? []).map((sp, i) => {
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
            })}
          </svg>

          {/* 這裡原本疊著一顆「L 備位圓圈」（issue #18）：先發自由球員還沒上場時，用一般
              HTML 絕對定位畫在球場 1 號位外側的留白帶上，可以拖進場、右鍵取消。#328 把它
              刪掉，因為「指定先發自由球員」這個職責在 #327 已經整個交給右欄輪轉表的第七格
              ——而且那一格存的是 #326 的模型「L 頂替誰」，不是「L 站在哪個座標」，所以這顆
              圓圈沒有東西要搬過去，是純刪除（見 docs/adr/0012）。 */}
        </div>
      </div>
    </div>
  );
}
