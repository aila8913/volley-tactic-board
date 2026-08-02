import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRotationTable } from "../hooks/useRotationTable";
import { findNearestZone, getZoneLayout, isBackRowPosition } from "../lib/rotationLogic";
import { Side, RegularSub } from "../types/scoresheet";
import type { MatchPlayer } from "../types/match";
import type { PlayerPosition } from "../types/rotationTable";
import { CourtGradientDefs, CourtLines } from "../lib/courtTheme";
import { toSvg, fromScreen, toScreen, rowOf } from "../lib/courtGeometry";
import PlayerMarker from "./PlayerMarker";

export interface TouchedTarget {
  side: Side;
  playerId?: string;
  zone?: number;
  screenX: number;
  screenY: number;
}

// RegularSub 的定義現在搬到 types/scoresheet.ts（store 那邊的 ScoreSheetState 也要用它，
// 不能讓 store 反過來 import 這個元件）。這裡重新 export 一次，讓原本
// `import { RegularSub } from "./ScoreSheetCourt"` 的地方不用跟著改 import 來源。
export type { RegularSub };

interface ScoreSheetCourtProps {
  // 我方這一輪場上 6 人的座標，由外層（pages/ScoreSheet.tsx）從計分表自己的先發快照換算好傳進來
  // （issue #115）——這個元件不再讀那份全域、跨 match 共用的 useRotationTable.rotations，改吃
  // 快照後就跟戰術板/輪轉表解耦、也不會被別場的 id 污染。
  ourPositions: PlayerPosition[];
  // 這場比賽的名單，同樣改由外層（已知自己在看哪個 matchId）當 prop 傳進來，不再讀全域 roster。
  roster: MatchPlayer[];
  opponentRotation: number;
  serving: "us" | "opponent" | null;
  // interactive=false 時手勢與換人拖曳都關閉（RadialMenu 選到一半時用）
  interactive: boolean;
  onPlayerTouch: (target: TouchedTarget) => void;
  onLiberoSubstitute?: (targetPlayerId: string) => void;
  regularSubs?: RegularSub[];
  // 目前場邊被選中、準備換上場的球員 id；設定後球場進入「換人模式」
  selectedBenchPlayer?: string | null;
  onBenchPlayerSelect?: (playerId: string | null) => void;
  // 長按場上我方球員換人（tang 2026-07-31 要求的新入口）：跟 selectedBenchPlayer 那套
  // 「先點場邊、再點場上」的流程並存，順序相反——長按先決定「換誰下場」，接著跳出的清單
  // 才決定「換誰上場」。兩條路徑最後都收斂到同一個動作，所以直接把 handleRegularSub 傳進來，
  // 不用另外設計一套一半的換人狀態機。
  onRegularSub?: (inPlayerId: string, outPlayerId: string) => void;
  // 自由球員即時替補狀態：以前這個元件自己去共用 store 讀，但這個狀態其實是「這一場
  // 比賽」的計分表資料（見 types/scoresheet.ts 的 ScoreSheetState.liberoSubstitution），
  // 不是輪轉表/戰術板共用的東西，所以改由外層（pages/ScoreSheet.tsx，已經知道自己在看
  // 哪個 matchId）當 prop 傳進來，這個元件不用管資料實際存在哪個 store。
  liberoSubstitution: string | null;
  // 名單上可能有 0～2 位自由球員（排球規則允許登錄兩位）。只有一位時鍵直接顯示他，不用選；
  // 兩位時鍵先顯示通用的「L」，長按叫出選單挑其中一位，選完鍵才變成顯示那位、可以拖曳上場
  // ——跟 selectedBenchPlayer 一樣是外層（ScoreSheet.tsx）擁有的狀態，這裡只讀寫，
  // 理由是 tang 要求「重整頁面後仍記得上次選哪位」，外層才知道要存進 localStorage 的 key
  //（scope 到 matchId）。
  selectedLiberoId?: string | null;
  onSelectLibero?: (playerId: string) => void;
}

const HIT_RADIUS = 11;
// 長按判定的等待時間。跟 OS 層級的長按手勢（通常 500ms 上下）抓同一個量級，
// 使用者不用重新學一套「這個 app 的長按比較快/比較慢」的手感。
const LONG_PRESS_MS = 500;

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

export default function ScoreSheetCourt({
  ourPositions,
  roster,
  opponentRotation,
  serving,
  interactive,
  onPlayerTouch,
  onLiberoSubstitute,
  regularSubs = [],
  selectedBenchPlayer = null,
  onBenchPlayerSelect,
  onRegularSub,
  liberoSubstitution,
  selectedLiberoId = null,
  onSelectLibero,
}: ScoreSheetCourtProps) {
  // circleLabel 是「圈圈顯示姓名/背號/位置」的全域顯示偏好（不是某一場的資料），留在全域 store
  // 讀即可——它不參與 issue #115 要解的「先發被跨場污染」問題。
  const circleLabel = useRotationTable((state) => state.circleLabel);

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [draggingLibero, setDraggingLibero] = useState(false);
  const [liberoGhostScreen, setLiberoGhostScreen] = useState<{ x: number; y: number } | null>(null);
  // 長按換人：目前正在跳出換人清單的那顆我方球員（playerId ＋ 清單要浮在哪個螢幕座標）。
  // null＝清單沒開。
  const [longPressTarget, setLongPressTarget] = useState<{
    playerId: string;
    screenX: number;
    screenY: number;
  } | null>(null);
  // 計時器跟「有沒有已經觸發」用 ref 不用 state：這兩個純粹是手勢判斷的中間狀態，
  // 改用 state 只會讓每次 pointermove 都多一次不必要的 re-render（跟 dragStart/dragCurrent
  // 需要驅動畫面上的手勢軌跡線不同，這兩個值本身不需要畫出任何東西）。
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  // 元件卸載時（例如長按計時器還沒觸發、使用者就切到別頁）清掉還在跑的計時器，避免
  // setTimeout 的 callback 之後才觸發，對著已經卸載的元件呼叫 setState。自由球員鈕的長按
  // 計時器（liberoLongPressTimerRef，宣告見下面）是同一種風險，一起清。
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      if (liberoLongPressTimerRef.current !== null)
        window.clearTimeout(liberoLongPressTimerRef.current);
    };
  }, []);

  const opponentZones = getZoneLayout(opponentRotation, true);
  // 名單上登錄的自由球員（0～2 位，排球規則上限兩位）。下面 liberoPlayer 才是「目前這顆鈕
  // 代表的那一位」——只有一位時直接是他；兩位時要看 selectedLiberoId 有沒有選過。兩位都還沒
  // 選時 liberoPlayer 是 undefined，鈕顯示通用「L」，所有原本直接用 liberoPlayer 的渲染/
  // 拖曳邏輯完全不用改，因為它們要的本來就是「目前代表哪一位」而不是「名單上有誰」。
  const liberoCandidates = roster.filter((p) => p.role === "L");
  const liberoPlayer =
    liberoCandidates.length === 1
      ? liberoCandidates[0]
      : liberoCandidates.find((p) => p.id === selectedLiberoId);
  // 兩位候選時才需要選單；叫出選單的手勢是長按，跟球場本身「長按球場上的我方球員換人」
  // 同一套機制（LONG_PRESS_MS 計時器 + 移動就取消長按判定），不是另外發明一套「點一下」
  // 的規則——這顆鈕的長按跟球場的長按用的是各自獨立的一組 ref，因為是兩個不同的手勢區域，
  // 但判定邏輯完全比照，使用者不用為這顆鈕另外學一種「按多久算數」的手感。
  const [liberoPickerOpen, setLiberoPickerOpen] = useState(false);
  const liberoPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const liberoLongPressTimerRef = useRef<number | null>(null);
  const liberoLongPressFiredRef = useRef(false);

  // ── effectiveLiberoSub ──
  // liberoSubstitution 的狀態可能在 useEffect 清除前就已輪轉到前排，
  // 這裡直接用目前場上位置即時判斷「自由球員是否真的還在後排場上」，
  // 讓顯示不依賴 Zustand 更新時序，不會有殘影或消失的問題。
  const effectiveLiberoSub = useMemo(() => {
    if (!liberoSubstitution) return null;
    const pos = ourPositions.find((p) => p.playerId === liberoSubstitution);
    if (!pos) return null;
    // 後排：y > 0.75。目標在後排才視為「自由球員正在替換中」。
    return pos.y > 0.75 ? liberoSubstitution : null;
  }, [liberoSubstitution, ourPositions]);

  // regularSubs 的 outPlayer → inPlayer 對應表
  const regularSubMap = useMemo(
    () => new Map(regularSubs.map((s) => [s.outPlayerId, s.inPlayerId])),
    [regularSubs],
  );

  // ── effectivelyOnCourt ──
  // 「誰目前在場上」的計算。自由球員的邏輯和一般換人分開：
  //
  // 一般換人：outPlayer 的格子歸屬改為 inPlayer，outPlayer 去場邊。
  //
  // 自由球員：L「蓋住」某個後排球員，但那個格子的「主人」不變——主人依然算在場上，
  // L 也算在場上（蓋住中）。兩個人都不在場邊。L 離開（effectiveLiberoSub = null）
  // 時，主人繼續在場上，L 回場邊。
  //
  // 計分表裡 L 的輪轉格子永遠跳過（和戰術板的佔位切開）。
  const effectivelyOnCourt = useMemo(() => {
    const set = new Set<string>();
    for (const pos of ourPositions) {
      // 跳過自由球員自己的輪轉位置（計分表裡 L 永遠從場邊出發）
      if (liberoPlayer && pos.playerId === liberoPlayer.id) continue;
      // 一般換人後，格主是替補進來的球員
      const effectiveId = regularSubMap.get(pos.playerId) ?? pos.playerId;
      // 格主永遠算在場上——即使 L 蓋住他，他的格子還是他的，不去場邊
      set.add(effectiveId);
    }
    // L 正在蓋住某人時，L 也算在場上（不出現在場邊）
    if (effectiveLiberoSub && liberoPlayer) {
      set.add(liberoPlayer.id);
    }
    return set;
  }, [ourPositions, regularSubMap, effectiveLiberoSub, liberoPlayer]);

  const sidelinePlayers = roster.filter((p) => !effectivelyOnCourt.has(p.id));
  // 「鈕該不該出現」不能用 liberoPlayer（目前代表哪一位）來判斷——兩位候選都還沒選定時
  // liberoPlayer 是 undefined，但鈕還是要出現（顯示通用「L」讓使用者點來選）。真正決定
  // 「有沒有可以上場的自由球員」的是候選名單本身、加上目前沒有人正在替補中。
  const liberoOnSideline = liberoCandidates.length > 0 && !effectiveLiberoSub;
  // 場邊欄清單／長按換人清單都只列一般候補球員，自由球員排除在外——見場邊欄跟球場右側
  // 拖曳鈕兩處的說明，兩個地方共用同一份過濾規則，不用各寫一次。
  const regularSidelinePlayers = sidelinePlayers.filter((p) => p.role !== "L");

  // 命中判定清單（我方＋對手）。用一個扁平型別讓 TypeScript 不必分辨聯集。
  type HitTarget = {
    side: Side;
    playerId?: string;
    zone?: number;
    x: number;
    y: number;
    xNorm: number;
    yNorm: number;
  };
  // 「對手(全體)」／「我方(全體)」這兩個「不挑細節、只記哪一方」的簡易記錄入口，
  // 已經搬出球場、改成右欄比分卡本身可以點（見 pages/ScoreSheet.tsx 的
  // handleScoreCardTouch）——球場內只留「畫線連到明確目標」這一種手勢，不用再在球場上
  // 擠出額外的虛線框佔位。這裡的 hitTargets 因此只剩「明確知道是哪個號位/哪個球員」
  // 的目標。
  const hitTargets = useMemo<HitTarget[]>(
    () => [
      ...opponentZones.map((slot) => ({
        side: "opponent" as const,
        zone: slot.zone,
        ...toSvg(slot),
        xNorm: slot.x,
        yNorm: slot.y,
      })),
      ...ourPositions.map((pos) => ({
        side: "us" as const,
        playerId: pos.playerId,
        ...toSvg(pos),
        xNorm: pos.x,
        yNorm: pos.y,
      })),
    ],
    [opponentZones, ourPositions],
  );

  // 座標轉換（收斂到 lib/courtGeometry.ts 的 fromScreen/toScreen，issue #227；這裡
  // 保留 screenToSvg/svgToScreen 這兩個名字，因為下面的手勢/自由球員拖曳邏輯都是照
  // 這兩個名字在呼叫）。
  const screenToSvg = (clientX: number, clientY: number) =>
    fromScreen(clientX, clientY, svgRef.current);
  const svgToScreen = (x: number, y: number) => toScreen(x, y, svgRef.current);

  // 找離某個 SVG 座標最近、且在命中半徑內的目標——finishGesture（放開手指判定記哪一球）
  // 跟長按判定（按住的當下要知道是不是壓在我方球員上）共用同一份「找最近目標」邏輯，
  // 原本只有 finishGesture 內部一份，抽出來才不會兩處各寫一次、之後改命中規則忘記改一邊。
  const findNearestHit = (pt: { x: number; y: number }): (typeof hitTargets)[number] | null => {
    let nearest: (typeof hitTargets)[number] | null = null;
    let nearestD = Infinity;
    for (const t of hitTargets) {
      const d = dist(pt.x, pt.y, t.x, t.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = t;
      }
    }
    return nearest && nearestD <= HIT_RADIUS ? nearest : null;
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // ── 畫線手勢（＋長按換人判定）──
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!interactive || draggingLibero) return;
    const pt = screenToSvg(e.clientX, e.clientY);
    setDragStart(pt);
    setDragCurrent(pt);
    longPressFiredRef.current = false;

    // 長按只在「按下當下就壓在我方球員身上、而且不是已經在走舊版換人模式」時才判定，
    // 換句話說是 selectedBenchPlayer 那套流程的互斥選項，不會同時開兩套換人 UI。
    if (onRegularSub && !subModeActive) {
      const downTarget = findNearestHit(pt);
      if (downTarget?.side === "us" && downTarget.playerId) {
        const targetPlayerId = downTarget.playerId;
        const scr = svgToScreen(downTarget.x, downTarget.y);
        longPressTimerRef.current = window.setTimeout(() => {
          longPressFiredRef.current = true;
          longPressTimerRef.current = null;
          // 長按判定成功＝這次手勢不是在畫線/記錄一球，把畫線軌跡狀態收掉，避免放開手指時
          // handlePointerUp 又跑一次 finishGesture、把長按之後的放手誤判成另一次記錄手勢。
          setDragStart(null);
          setDragCurrent(null);
          setLongPressTarget({ playerId: targetPlayerId, screenX: scr.x, screenY: scr.y });
        }, LONG_PRESS_MS);
      }
    }
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const pt = screenToSvg(e.clientX, e.clientY);
    setDragCurrent(pt);
    // 手指移動超過一點點就不算「按住不動」，取消長按判定——這樣畫線手勢（本來就要移動）
    // 不會被長按邏輯誤判打斷；閾值故意抓比 HIT_RADIUS 小很多，一點點手抖不該取消長按。
    if (longPressTimerRef.current !== null && dist(dragStart.x, dragStart.y, pt.x, pt.y) > 3) {
      clearLongPressTimer();
    }
  };
  const finishGesture = (pt: { x: number; y: number } | null) => {
    setDragStart(null);
    setDragCurrent(null);
    if (!pt) return;
    const nearest = findNearestHit(pt);
    if (!nearest) return;
    const scr = svgToScreen(nearest.x, nearest.y);
    // L 蓋住的格子：動作歸屬為 L（L 才是實際打球的人），
    // 但 hitTargets 的 playerId 保留格主 id（供自由球員拖曳邏輯使用），
    // 所以在這裡才做轉換，不動 hitTargets。
    let playerId = nearest.playerId;
    // effectiveLiberoSub 記的是「被 L 蓋住的格子」的原始格主 id（跟 hitTargets／ourPositions 同一個
    // id 空間）。所以這裡要拿原始 playerId 比對，不能先套一般換人的 effectiveId——否則這個後排格
    // 先被一般換人換過人時（原格主 A、換上 B），A≠B 會讓比對失敗、漏判成「沒被 L 蓋住」，
    // 觸球就不會歸給 L。
    if (nearest.side === "us" && playerId && liberoPlayer && playerId === effectiveLiberoSub) {
      playerId = liberoPlayer.id;
    }
    onPlayerTouch({
      side: nearest.side,
      playerId,
      zone: nearest.zone,
      screenX: scr.x,
      screenY: scr.y,
    });
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    clearLongPressTimer();
    // 長按已經在計時器裡觸發、跳出換人清單了——這次放開手指是「結束長按」，不是「放開手指
    // 記一球」，不能再跑 finishGesture，不然會把長按之後鬆手的動作誤判成又記了一次觸球。
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (dragStart) finishGesture(screenToSvg(e.clientX, e.clientY));
  };
  const handlePointerLeave = () => {
    clearLongPressTimer();
    longPressFiredRef.current = false;
    finishGesture(null);
  };

  // ── 自由球員拖曳 ──
  const isValidLiberoTarget = (t: (typeof hitTargets)[number]): boolean => {
    if (t.side !== "us" || !t.playerId) return false;
    // 後排才合法。用共用的 isBackRowPosition（＝輪轉表也在用的 BACK_ROW_ZONES 判定）而不是
    // 自己寫死 y 門檻，這樣「後排」的定義只有一份，輪轉表改規則計分表會跟著改（issue #43）。
    if (!isBackRowPosition(t.xNorm, t.yNorm)) return false;
    if (liberoPlayer && t.playerId === liberoPlayer.id) return false;
    if (t.playerId === effectiveLiberoSub) return false; // 已在替換中
    // 一般換人後，這個位置的「有效球員」也不能是自由球員
    const effective = regularSubMap.get(t.playerId) ?? t.playerId;
    if (liberoPlayer && effective === liberoPlayer.id) return false;
    if (serving === "us") {
      if (findNearestZone(t.xNorm, t.yNorm) === 1) return false; // 發球員不換
    }
    return true;
  };

  const clearLiberoLongPressTimer = () => {
    if (liberoLongPressTimerRef.current !== null) {
      window.clearTimeout(liberoLongPressTimerRef.current);
      liberoLongPressTimerRef.current = null;
    }
  };

  const handleLiberoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !onLiberoSubstitute) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    liberoPointerStartRef.current = { x: e.clientX, y: e.clientY };
    liberoLongPressFiredRef.current = false;
    setDraggingLibero(true);
    setLiberoGhostScreen({ x: e.clientX, y: e.clientY });

    // 只有兩位候選時長按才有意義（一位的話沒什麼好選）。跟球場本身的長按判定同一套
    // LONG_PRESS_MS 計時器，見 handlePointerDown 的長按分支。
    if (liberoCandidates.length === 2) {
      liberoLongPressTimerRef.current = window.setTimeout(() => {
        liberoLongPressFiredRef.current = true;
        liberoLongPressTimerRef.current = null;
        // 長按判定成功＝這次手勢是「叫出選單」，不是拖曳換人，把拖曳中的 ghost 收掉，
        // 避免放開手指時又被當成一次拖曳結算。
        setDraggingLibero(false);
        setLiberoGhostScreen(null);
        setLiberoPickerOpen(true);
      }, LONG_PRESS_MS);
    }
  };
  const handleLiberoPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingLibero) setLiberoGhostScreen({ x: e.clientX, y: e.clientY });
    // 手指移動超過一點點就不算「按住不動」，取消長按判定——讓手勢自然變成拖曳換人，
    // 跟球場本身 handlePointerMove 取消長按的理由一樣。
    const start = liberoPointerStartRef.current;
    if (
      liberoLongPressTimerRef.current !== null &&
      start &&
      dist(start.x, start.y, e.clientX, e.clientY) > 3
    ) {
      clearLiberoLongPressTimer();
    }
  };
  const handleLiberoPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    clearLiberoLongPressTimer();
    liberoPointerStartRef.current = null;
    // 長按已經在計時器裡處理過、選單也開了——這次放開手指是「結束長按」，不能再往下走
    // 拖曳換人的結算邏輯，不然會把長按之後鬆手誤判成一次拖曳。
    if (liberoLongPressFiredRef.current) {
      liberoLongPressFiredRef.current = false;
      return;
    }
    if (!draggingLibero) return;
    setDraggingLibero(false);
    setLiberoGhostScreen(null);
    if (!liberoPlayer) return; // 兩位都還沒選定時沒有「誰」可以拖上場

    const svgPt = screenToSvg(e.clientX, e.clientY);
    let nearest: (typeof hitTargets)[number] | null = null;
    let nearestD = Infinity;
    for (const t of hitTargets) {
      const d = dist(svgPt.x, svgPt.y, t.x, t.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = t;
      }
    }
    if (!nearest || nearestD > HIT_RADIUS * 1.8) return;
    if (!isValidLiberoTarget(nearest)) return;
    onLiberoSubstitute?.(nearest.playerId!);
  };

  // 是否為自由球員合法拖曳目標（SVG 高亮用）
  const isLiberoDropHighlight = (pos: { playerId: string; x: number; y: number }) =>
    draggingLibero &&
    isValidLiberoTarget({
      side: "us",
      playerId: pos.playerId,
      ...toSvg(pos),
      xNorm: pos.x,
      yNorm: pos.y,
    });

  // 換人模式：有選中場邊球員時，場上所有我方球員都顯示藍色提示環
  const subModeActive = !!selectedBenchPlayer;

  const SIDELINE_W = 48;

  // 球員圓圈顯示名字/背號/位置
  const playerLabel = (p: { name: string; number: number; role: string }) =>
    circleLabel === "name"
      ? p.name.slice(0, 2) || p.role
      : circleLabel === "number"
        ? `${p.number}`
        : p.role;

  return (
    <div className="mx-auto flex h-full w-full max-w-[480px] items-center justify-center gap-2">
      {/* 球場 SVG。court-glass（毛玻璃地板）＋ court-edge-light（邊緣繞行光）跟戰術板
          Court.tsx 用同一組 index.css class，材質完全一致；改那兩個 class 兩邊一起變。 */}
      <div
        className="court-glass relative flex-shrink-0 shadow-lg shadow-black/30"
        style={{ height: "100%", aspectRatio: "1/2" }}
      >
        <div className="court-edge-light" />
        <svg
          ref={svgRef}
          viewBox="0 0 100 200"
          preserveAspectRatio="none"
          className="h-full w-full touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          {/* 底色漸層、線條顏色都從 lib/courtTheme 讀，跟戰術板同一個來源（改那邊兩邊動）。 */}
          <CourtGradientDefs id="ss-court-gradient" />
          <rect x="0" y="0" width="100" height="200" fill="url(#ss-court-gradient)" />
          {/* 中線＋3 米攻擊線：跟戰術板球場（Court.tsx）共用同一份 <CourtLines/>
              （lib/courtTheme.tsx，issue #227），改一邊兩邊一起變。 */}
          <CourtLines />

          {/* 對手號位圈：跟我方球員圈共用 PlayerMarker（深色玻璃底＋實色邊框＋圈內數字），
              不再用虛線外框——使用者覺得虛線太醜、要求跟我方同款只是換色。對手沒有名單，
              沒有背號/姓名可顯示，圈裡放的是號位數字，姓名那一行留空；邊框色底色是
              design-spec.md 第 2 節定的「對方球隊色：珊瑚紅 #EF4444」（中途繞了一圈試過
              #FF8A5C，那個色碼其實沒有出現在 design-spec 裡，是 #199 issue 討論串誤寫的，
              已在該 issue 留言修正，見 07-27 comment），但實機看純色滿飽和度在球場的深青綠
              背景上太搶眼、跟綠色互補衝突明顯，改成 70% 不透明度柔和一點（用 Artifact 排了
              幾個透明度/色相方案給使用者比較過，這個是選定的版本）。
              發球時的光暈模糊半徑也單獨調過：PlayerMarker 預設 3（原始值，白色/萊姆綠/橘色
              套這個數字一直都好看），但紅色在同一個數字下太誇張，這裡用 glowBlur 覆寫成
              0.75——只影響對手，我方球員（含 PlayerNode.tsx 戰術板的選取態）維持預設不變。 */}
          {opponentZones.map((slot) => {
            const isServer = serving === "opponent" && slot.currentZone === 1;
            const { x, y } = toSvg(slot);
            return (
              <g key={`opp-${slot.zone}`} transform={`translate(${x},${y})`}>
                <PlayerMarker
                  number={slot.zone}
                  name=""
                  color="rgba(239, 68, 68, 0.7)"
                  radius={isServer ? 7.5 : 6}
                  emphasized={isServer}
                  glowBlur={0.75}
                />
                {isServer && (
                  <text y="-9" fontSize="6" textAnchor="middle">
                    🏐
                  </text>
                )}
              </g>
            );
          })}

          {/* 我方球員圈 */}
          {ourPositions.map((pos) => {
            // 計分表裡 L 的輪轉格子永遠跳過（和戰術板佔位切開；L 從場邊出發）
            if (liberoPlayer && pos.playerId === liberoPlayer.id) return null;

            // 套用一般換人，取得格子的「有效主人」
            const effectiveId = regularSubMap.get(pos.playerId) ?? pos.playerId;
            const slotPlayer = roster.find((p) => p.id === effectiveId);
            if (!slotPlayer) return null;

            // L 是否正在「蓋住」此格（蓋住 ≠ 換人；格主不離場）。用原始 pos.playerId 比對
            // effectiveLiberoSub（同一個 id 空間），不是一般換人後的 effectiveId——否則這個後排格
            // 先被一般換人換過人時，兩邊 id 對不上，orange L 疊圖不會出現（「自由換被換上場的人不
            // 顯示」的 bug）。slotPlayer 仍用 effectiveId 找，好在下方顯示「L／被蓋格主的號碼」。
            const isLiberoOverlay = pos.playerId === effectiveLiberoSub && !!liberoPlayer;

            const isFrontRow = rowOf(pos.y) === "front";
            const isServer = serving === "us" && pos.x > 0.7 && pos.y > 0.75;
            const isDropTarget = isLiberoDropHighlight(pos);
            const isSubTarget = subModeActive && !isFrontRow;
            // 邊框色＝狀態指示：拖曳提示 > 換人提示 > L 蓋住(橘) > 前排(黃綠) > 後排(白)。
            // 圓圈本身（深色玻璃底＋背號在圈裡、姓名在圈下）跟戰術板 PlayerNode.tsx 共用
            // components/PlayerMarker.tsx——這裡只算「這個位置現在該用什麼顏色」。
            const color = isDropTarget
              ? "#FF6B00"
              : isSubTarget
                ? "#3B82F6"
                : isLiberoOverlay
                  ? "#FF6B00"
                  : isFrontRow
                    ? "#CCFF00"
                    : "#FFFFFF";
            const { x, y } = toSvg(pos);
            // L 蓋住此格時，顯示的是 L 本人的背號/姓名，姓名後面加註被蓋格主的背號
            // （原本是圈裡第二行小字，PlayerMarker 只有「背號＋姓名」兩格，改成併進姓名
            // 那一行，資訊沒有少，只是排版跟著共用元件走）。
            const displayPlayer = isLiberoOverlay && liberoPlayer ? liberoPlayer : slotPlayer;
            const displayName =
              isLiberoOverlay && liberoPlayer
                ? `${liberoPlayer.name || liberoPlayer.role} /${slotPlayer.number}`
                : slotPlayer.name || slotPlayer.role;

            return (
              <g key={pos.playerId} transform={`translate(${x},${y})`}>
                {/* 拖曳自由球員時的目標提示環 */}
                {isDropTarget && (
                  <circle r="10" fill="none" stroke="#FF6B00" strokeWidth="2" opacity="0.6" />
                )}
                {/* 換人模式的可選提示環 */}
                {subModeActive && (
                  <circle
                    r="10"
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="1.5"
                    opacity="0.5"
                    strokeDasharray="3 2"
                  />
                )}
                <PlayerMarker
                  number={displayPlayer.number}
                  name={displayName}
                  color={color}
                  radius={isServer ? 7.5 : 6}
                  emphasized={isServer}
                />
                {isServer && (
                  <text y="-9" fontSize="6" textAnchor="middle">
                    🏐
                  </text>
                )}
              </g>
            );
          })}

          {/* 手勢軌跡線：黑色在深色球場上會看不見，改用米白（跟球場線條同一色） */}
          {dragStart && dragCurrent && (
            <line
              x1={dragStart.x}
              y1={dragStart.y}
              x2={dragCurrent.x}
              y2={dragCurrent.y}
              stroke="#F5F5F0"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              className="pointer-events-none"
            />
          )}
        </svg>

        {/* 自由球員拖曳鈕（tang 2026-07-31 要求搬出場邊欄，貼在球場右側、跟我方底線同高）：
            以前跟一般候補球員混在同一直欄清單裡，容易讓人以為它也是「點一下進換人模式」的
            那種按鈕——但它其實是拖曳操作，跟長按/點擊都不同掛。獨立浮在球場右側、絕對定位
            相對 court-glass（這個 div 本來就是 position:relative），bottom:0 讓圓圈底端
            貼齊球場最底那條線的高度——我方在球場下半場，這條線就是我方底線。拖曳判定邏輯
            （handleLiberoPointerDown 等）完全沒變，那套邏輯本來就只認 clientX/clientY，
            跟這顆按鈕實際擺在哪裡無關，搬家不用碰任何手勢程式碼。
            兩位候選、還沒選定時（liberoPlayer undefined）鈕顯示通用「L」；長按（跟球場長按
            換人同一套手感）打開下面那個選單，選完才變成顯示那位球員的名字/背號，可以拖曳，
            理由見 handleLiberoPointerDown 的說明。 */}
        {liberoOnSideline && (
          <div
            onPointerDown={handleLiberoPointerDown}
            onPointerMove={handleLiberoPointerMove}
            onPointerUp={handleLiberoPointerUp}
            className="absolute flex cursor-grab flex-col items-center justify-center rounded-full border-2 border-orange-500 bg-orange-400 font-bold text-white touch-none select-none active:scale-95"
            style={{
              left: "100%",
              marginLeft: 8,
              bottom: 0,
              width: SIDELINE_W,
              height: SIDELINE_W,
              touchAction: "none",
              userSelect: "none",
            }}
            title={
              liberoPlayer
                ? `拖曳自由球員 #${liberoPlayer.number} 到後排球員；長按可改選另一位`
                : "長按選擇自由球員"
            }
          >
            {liberoPlayer ? (
              <>
                <span className="text-[10px] leading-none">L</span>
                <span className="text-[10px] leading-none">#{liberoPlayer.number}</span>
              </>
            ) : (
              <span className="text-xs leading-none">L</span>
            )}
          </div>
        )}

        {/* 自由球員選單：只有兩位候選時才會用到（一位的話沒什麼好選，鈕直接代表他）。
            浮在拖曳鈕正上方，同樣絕對定位相對 court-glass。跟長按換人清單同一套「透明背景點
            外面＝取消」的關閉手勢（見下面長按選單那段），不用另外做一顆取消鈕。 */}
        {liberoPickerOpen && liberoCandidates.length === 2 && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setLiberoPickerOpen(false)}
              data-testid="libero-picker-backdrop"
            />
            <div
              className="absolute z-50 flex flex-col gap-1 rounded-lg border border-white/[0.18] bg-[#12140f]/97 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-lg"
              style={{ left: "100%", marginLeft: 8, bottom: SIDELINE_W + 8 }}
            >
              <p className="px-1 text-[9px] font-bold text-[#a9b096]">選自由球員</p>
              {liberoCandidates.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectLibero?.(p.id);
                    setLiberoPickerOpen(false);
                  }}
                  className="whitespace-nowrap rounded-md border border-white/[0.14] bg-white/[0.05] px-2 py-1 text-left text-[10px] font-bold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]"
                >
                  #{p.number} {p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── 場邊欄：現在只放一般候補球員（點擊進舊版換人模式）──
          自由球員不再出現在這份清單裡：它是拖曳操作、不是點擊操作，混在同一直欄容易讓人
          誤以為兩者操作方式一樣（tang 2026-07-31）。它的按鈕搬到球場右側單獨浮著，見上面
          court-glass 內的說明；這裡改用 regularSidelinePlayers（排除 role==="L"）。 */}
      <div
        className="flex h-full flex-shrink-0 flex-col items-center gap-2 overflow-y-auto py-1"
        style={{ width: SIDELINE_W + 8 }}
      >
        {regularSidelinePlayers.length === 0 && (
          <p className="mt-4 text-center text-[9px] text-[#a9b096]">場邊</p>
        )}

        {regularSidelinePlayers.map((player) => {
          const isSelected = player.id === selectedBenchPlayer;
          // 是否為「一般換人後被換下場的球員」，顯示「換」小標籤
          const isSubbedOut = regularSubs.some((s) => s.outPlayerId === player.id);
          const label = playerLabel(player);

          return (
            <button
              key={player.id}
              onClick={() => onBenchPlayerSelect?.(isSelected ? null : player.id)}
              className={[
                "relative flex flex-col items-center justify-center rounded-full border-2 font-bold text-xs transition-all",
                isSelected
                  ? "border-[#3b82f6] bg-[#3b82f6]/20 text-[#93c5fd] shadow-md scale-110"
                  : "border-white/[0.26] bg-white/[0.05] text-[#f5f5f0] active:scale-95",
              ].join(" ")}
              style={{ width: SIDELINE_W, height: SIDELINE_W }}
            >
              <span className="leading-none text-[10px]">{label}</span>
              <span className="leading-none text-[9px] opacity-70">#{player.number}</span>
              {/* 換下場標記 */}
              {isSubbedOut && (
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-amber-400 px-0.5 text-[7px] font-bold text-white leading-tight">
                  換
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 自由球員拖曳殘影 */}
      {draggingLibero && liberoGhostScreen && liberoPlayer && (
        <div
          style={{
            position: "fixed",
            left: liberoGhostScreen.x - SIDELINE_W / 2,
            top: liberoGhostScreen.y - SIDELINE_W / 2,
            width: SIDELINE_W,
            height: SIDELINE_W,
            borderRadius: "50%",
            backgroundColor: "#FF6B00",
            border: "2px solid #111",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: "bold",
            color: "white",
            pointerEvents: "none",
            zIndex: 9999,
            opacity: 0.85,
          }}
        >
          <span>L</span>
          <span>#{liberoPlayer.number}</span>
        </div>
      )}

      {/* 長按換人清單：浮在被長按的那顆球員上方，列出場邊可以換上場的人（自由球員不列——
          自由球員有自己專屬的拖曳流程，見球場右側那顆拖曳鈕的說明，混進這裡會讓同一個人
          有兩種互相打架的換人方式）。跟場邊欄共用 regularSidelinePlayers 這份過濾好的清單。 */}
      {longPressTarget &&
        (() => {
          const outPlayer = roster.find((p) => p.id === longPressTarget.playerId);
          const candidates = regularSidelinePlayers;
          return (
            <>
              {/* 全螢幕透明背景：點清單以外的地方＝取消，不用另外做一顆「取消」鈕。 */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setLongPressTarget(null)}
                data-testid="long-press-sub-backdrop"
              />
              <div
                className="fixed z-50 w-40 -translate-x-1/2 rounded-xl border border-white/[0.14]
                  bg-[#12140f]/97 p-2 shadow-2xl shadow-black/50 backdrop-blur-lg"
                style={{ left: longPressTarget.screenX, top: longPressTarget.screenY + 16 }}
                data-testid="long-press-sub-menu"
              >
                <p className="mb-1.5 px-1 text-[11px] font-bold text-[#a9b096]">
                  換下 {outPlayer ? `#${outPlayer.number} ${outPlayer.name}` : ""}
                </p>
                {candidates.length === 0 ? (
                  <p className="px-1 py-1 text-[11px] text-[#a9b096]">場邊沒有人可以換上</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {candidates.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onRegularSub?.(p.id, longPressTarget.playerId);
                          setLongPressTarget(null);
                        }}
                        className="flex items-center gap-2 rounded-lg border border-white/[0.12]
                          bg-white/[0.03] px-2 py-1.5 text-left text-xs text-[#f5f5f0] transition
                          hover:border-[#c6f135] hover:text-[#c6f135]"
                      >
                        <span className="font-bold tabular-nums">#{p.number}</span>
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          );
        })()}
    </div>
  );
}
