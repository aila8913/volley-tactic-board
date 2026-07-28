import React, { useMemo, useRef, useState } from "react";
import { useRotationTable } from "../hooks/useRotationTable";
import { findNearestZone, getZoneLayout, isBackRowPosition } from "../lib/rotationLogic";
import { Side, RegularSub } from "../types/scoresheet";
import type { MatchPlayer } from "../types/match";
import type { PlayerPosition } from "../types/rotationTable";
import { CourtGradientDefs, COURT_LINE_COLOR, COURT_LINE_OPACITY } from "../lib/courtTheme";
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
  // 自由球員即時替補狀態：以前這個元件自己去共用 store 讀，但這個狀態其實是「這一場
  // 比賽」的計分表資料（見 types/scoresheet.ts 的 ScoreSheetState.liberoSubstitution），
  // 不是輪轉表/戰術板共用的東西，所以改由外層（pages/ScoreSheet.tsx，已經知道自己在看
  // 哪個 matchId）當 prop 傳進來，這個元件不用管資料實際存在哪個 store。
  liberoSubstitution: string | null;
}

const HIT_RADIUS = 11;

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
  liberoSubstitution,
}: ScoreSheetCourtProps) {
  // circleLabel 是「圈圈顯示姓名/背號/位置」的全域顯示偏好（不是某一場的資料），留在全域 store
  // 讀即可——它不參與 issue #115 要解的「先發被跨場污染」問題。
  const circleLabel = useRotationTable((state) => state.circleLabel);

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [draggingLibero, setDraggingLibero] = useState(false);
  const [liberoGhostScreen, setLiberoGhostScreen] = useState<{ x: number; y: number } | null>(null);

  const opponentZones = getZoneLayout(opponentRotation, true);
  const liberoPlayer = roster.find((p) => p.role === "L");

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
  const liberoOnSideline = !effectiveLiberoSub && liberoPlayer;

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
        x: slot.x * 100,
        y: slot.y * 200,
        xNorm: slot.x,
        yNorm: slot.y,
      })),
      ...ourPositions.map((pos) => ({
        side: "us" as const,
        playerId: pos.playerId,
        x: pos.x * 100,
        y: pos.y * 200,
        xNorm: pos.x,
        yNorm: pos.y,
      })),
    ],
    [opponentZones, ourPositions],
  );

  // 座標轉換
  const screenToSvg = (clientX: number, clientY: number) => {
    const CTM = svgRef.current?.getScreenCTM();
    if (!CTM) return { x: 50, y: 100 };
    return { x: (clientX - CTM.e) / CTM.a, y: (clientY - CTM.f) / CTM.d };
  };
  const svgToScreen = (x: number, y: number) => {
    const CTM = svgRef.current?.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    return { x: CTM.e + x * CTM.a, y: CTM.f + y * CTM.d };
  };

  // ── 畫線手勢 ──
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!interactive || draggingLibero) return;
    const pt = screenToSvg(e.clientX, e.clientY);
    setDragStart(pt);
    setDragCurrent(pt);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    setDragCurrent(screenToSvg(e.clientX, e.clientY));
  };
  const finishGesture = (pt: { x: number; y: number } | null) => {
    setDragStart(null);
    setDragCurrent(null);
    if (!pt) return;
    let nearest: (typeof hitTargets)[number] | null = null;
    let nearestD = Infinity;
    for (const t of hitTargets) {
      const d = dist(pt.x, pt.y, t.x, t.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = t;
      }
    }
    if (!nearest || nearestD > HIT_RADIUS) return;
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
    if (dragStart) finishGesture(screenToSvg(e.clientX, e.clientY));
  };
  const handlePointerLeave = () => finishGesture(null);

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

  const handleLiberoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !onLiberoSubstitute) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingLibero(true);
    setLiberoGhostScreen({ x: e.clientX, y: e.clientY });
  };
  const handleLiberoPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingLibero) setLiberoGhostScreen({ x: e.clientX, y: e.clientY });
  };
  const handleLiberoPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingLibero) return;
    setDraggingLibero(false);
    setLiberoGhostScreen(null);
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
      x: pos.x * 100,
      y: pos.y * 200,
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
          <line
            x1="0"
            y1="100"
            x2="100"
            y2="100"
            stroke={COURT_LINE_COLOR}
            strokeOpacity={COURT_LINE_OPACITY}
            strokeWidth="2.5"
          />
          <line
            x1="0"
            y1="66.7"
            x2="100"
            y2="66.7"
            stroke={COURT_LINE_COLOR}
            strokeOpacity={COURT_LINE_OPACITY}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <line
            x1="0"
            y1="133.3"
            x2="100"
            y2="133.3"
            stroke={COURT_LINE_COLOR}
            strokeOpacity={COURT_LINE_OPACITY}
            strokeWidth="1"
            strokeDasharray="3 3"
          />

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
            const x = slot.x * 100;
            const y = slot.y * 200;
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

            const isFrontRow = pos.y > 0.5 && pos.y <= 0.75;
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
            const x = pos.x * 100;
            const y = pos.y * 200;
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
      </div>

      {/* ── 場邊欄 ── */}
      <div
        className="flex h-full flex-shrink-0 flex-col items-center gap-2 overflow-y-auto py-1"
        style={{ width: SIDELINE_W + 8 }}
      >
        {sidelinePlayers.length === 0 && (
          <p className="mt-4 text-center text-[9px] text-[#a9b096]">場邊</p>
        )}

        {sidelinePlayers.map((player) => {
          const isLibero = player.role === "L";
          const isLiberoDraggable = isLibero && !!liberoOnSideline;
          const isSelected = player.id === selectedBenchPlayer;
          // 是否為「一般換人後被換下場的球員」，顯示「換」小標籤
          const isSubbedOut = regularSubs.some((s) => s.outPlayerId === player.id);
          const label = playerLabel(player);

          if (isLiberoDraggable) {
            return (
              <div
                key={player.id}
                onPointerDown={handleLiberoPointerDown}
                onPointerMove={handleLiberoPointerMove}
                onPointerUp={handleLiberoPointerUp}
                className="relative flex cursor-grab flex-col items-center justify-center rounded-full border-2 border-orange-500 bg-orange-400 font-bold text-white touch-none select-none active:scale-95"
                style={{
                  width: SIDELINE_W,
                  height: SIDELINE_W,
                  touchAction: "none",
                  userSelect: "none",
                }}
                title={`拖曳自由球員 #${player.number} 到後排球員`}
              >
                <span className="text-[10px] leading-none">L</span>
                <span className="text-[10px] leading-none">#{player.number}</span>
              </div>
            );
          }

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
    </div>
  );
}
