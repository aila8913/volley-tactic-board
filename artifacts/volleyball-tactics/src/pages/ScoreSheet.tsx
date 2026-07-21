import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import BackToMatchListButton from "@/components/BackToMatchListButton";
import MatchNavRail, { matchBackHref } from "@/components/MatchNavRail";
import TacticsRailMenu from "@/components/TacticsRailMenu";
import { useMatchWithRoster } from "@/hooks/useMatches";
import { useRotationTable } from "@/hooks/useRotationTable";
import { useScoreSheet, useScoreSheetController } from "@/hooks/useScoreSheet";
import ScoreSheetCourt, { TouchedTarget } from "@/components/ScoreSheetCourt";
import RadialMenu, { RadialMenuOption } from "@/components/RadialMenu";
import ScoreSheetStats from "@/components/ScoreSheetStats";
import RotationRailPanel from "@/components/RotationRailPanel";
import { PlayAction } from "@/types/scoresheet";
import { isSetComplete, disabledActions } from "@/lib/scoreSheetMapping";
import { captureLineupFromRotations, lineupToPositions } from "@/lib/rotationLogic";
import { captureFromScoreSheet, captureBlank } from "@/lib/courtSnapshot";

// 6 大類跟 lib/db/src/schema/events.ts 的 eventActionEnum 對齊（見
// types/scoresheet.ts 的說明）。陣列順序就是 RadialMenu 從正上方順時針排列的順序，
// 跟現在用哪個字沒關係，純粹排版用。
const ACTION_OPTIONS: RadialMenuOption<PlayAction>[] = [
  { value: "serve", label: "發球" },
  { value: "receive", label: "接發" },
  { value: "set", label: "舉球" },
  { value: "attack", label: "攻擊" },
  { value: "block", label: "攔網" },
  { value: "dig", label: "防守" },
];

type Outcome = "win" | "lose";
// 順序維持 [lose, win]：RadialMenu 用 startAngle=180 時，2 個選項會落在
// 180°（左）／0°（右），跟以前寫死 position="left"/"right" 的畫面完全一樣。
//
// 標籤維持單純的「得分／失分」，不寫死「我方／對方」——這兩個字是相對於
// 「這一球的動作方」來看的（見 handleOutcomeSelect），動作方是誰由前一步
// （點我方球員 / 對手(全體)）決定，「得分／失分」本身不用跟著切換文字。
const OUTCOME_OPTIONS: RadialMenuOption<Outcome>[] = [
  { value: "lose", label: "失分" },
  { value: "win", label: "得分" },
];

// 排球規則（issue #44）：每隊每局最多 2 次暫停。跟一般換人（顯示上限但不擋）不同，這裡
// 達到上限就直接把該方的暫停鈕反灰——2 次是沒有任何合法例外的硬規則，按第 3 次一定是誤觸、
// 會寫進去變成髒資料，所以擋掉比較安全（換人的 6 次上限有邊界情境，才選擇只提醒不擋）。
const MAX_TIMEOUTS_PER_SET = 2;

// 快速記一球的手勢流程：點球員/對手(全體) → 選「動作」→ 選「得/失分」。
type Gesture =
  | { step: "action"; target: TouchedTarget }
  | { step: "outcome"; target: TouchedTarget; action: PlayAction }
  // 「沒看到」：只知道螢幕上點下去的位置（給 RadialMenu 當中心點），沒有 target 也沒有
  // action——直接跳去選得/失分，不記錄是誰、做了什麼動作。
  | { step: "outcome-only"; screenX: number; screenY: number };

export default function ScoreSheet() {
  const { id } = useParams<{ id: string }>();
  const { match, isLoading: isMatchLoading } = useMatchWithRoster(Number(id));

  // 只讀輪轉表這一場的 rotations，用來「擷取」計分表自己的先發快照——擷取一次之後，計分表就
  // 完全讀自己的快照、不再碰輪轉表（issue #115）。輪轉表現在用 matchId 分片（issue #119），所以
  // 讀 dataByMatch[id] 這一場自己的站位；那場還沒排就 undefined，capturableLineup 會算成 null。
  // 這其實比以前讀全域 state.rotations 更正確——舊寫法會讀到「最後開的那場」的站位（#119 的污染源）。
  const rotations = useRotationTable((state) =>
    id ? state.dataByMatch[id]?.rotations : undefined,
  );
  // 開局前，右欄的先發編輯就是直接改這份共用真相（PO 決策：輪轉/先發是跨頁共用的一份，
  // 不是計分頁自己再存一份副本）——教練在計分頁排先發，戰術板也要立刻看到同一份結果。
  const setLineupFromSnapshot = useRotationTable((state) => state.setLineupFromSnapshot);

  const record = useScoreSheet((state) => (id ? state.recordingsByMatch[id] : undefined));
  const setLiberoSubstitution = useScoreSheet((state) => state.setLiberoSubstitution);
  // 「復原」堆疊的深度：>0 才有東西可退（issue #41）。手動 libero 上/下場沒有對應的
  // 後端動作，也要能被復原，所以按鈕的可用與否看這個深度，而不是只看記了幾顆球。
  const undoDepth = useScoreSheet((state) => (id ? (state.undoStacksByMatch[id]?.length ?? 0) : 0));
  // 手動 libero 上/下場前，要先自己存一份復原快照（記分/一般換人是走 controller 的
  // score()/substitute() 幫忙存，libero 是元件直接改 store，所以在這裡自己叫）。
  const snapshotForUndo = useScoreSheet((state) => state.snapshotForUndo);
  // 記分/開局/復原/下一局改走 controller：本地即時更新畫面，同時在背景寫進後端
  // sets/rallies/events；進頁時也由它從 API 重建這場的記錄。setLiberoSubstitution 仍留在
  // store（純前端、不進 API，reload 後歸零——真正的自由球員持久化是 #43 的範圍）。
  const { isHydrating, start, score, undo, goNextSet, substitute, callTimeout } =
    useScoreSheetController(id ?? "");
  // 這場比賽目前的自由球員替補狀態——現在跟著 matchId 存在 useScoreSheet 裡（見
  // types/scoresheet.ts 的說明），不會再跟別場比賽的計分表互相污染。
  const liberoSubstitution = record?.liberoSubstitution ?? null;
  // 一般換人（issue #42 Phase B）：以前是這個元件自己的 useState，reload 就整包歸零；
  // 現在跟 liberoSubstitution 一樣搬進 useScoreSheet store，跟著 matchId 走、由
  // useScoreSheetController 從後端 /sets/:setId/substitutions 重建，reload 後不會消失。
  const regularSubs = record?.regularSubs ?? [];
  const subCountsHistory = record?.subCountsHistory ?? [];
  // 暫停清單/歷史（issue #44），跟換人一樣從 record 衍生、由 controller 從後端重建，reload 不消失。
  const timeouts = record?.timeouts ?? [];
  const timeoutCountsHistory = record?.timeoutCountsHistory ?? [];

  const [gesture, setGesture] = useState<Gesture | null>(null);

  // ── 自由球員替換記憶 ──
  // useRef 讓 useEffect 讀到最新值，避免陳舊閉包（stale closure）。
  const [previousLiberoTarget, setPreviousLiberoTarget] = useState<string | null>(null);
  const liberoSubRef = useRef(liberoSubstitution);
  liberoSubRef.current = liberoSubstitution;
  const prevLiberoRef = useRef(previousLiberoTarget);
  prevLiberoRef.current = previousLiberoTarget;

  // ── 一般換人 ──
  // regularSubs/subCountsHistory 已搬到上面從 record 衍生；這裡只留「換人模式選中哪個場邊
  // 球員」這個純 UI 互動狀態（跟後端無關，不用持久化）。
  const [selectedBenchPlayer, setSelectedBenchPlayer] = useState<string | null>(null);

  // ── 計分表的先發快照（issue #115）──
  // lineup：這場已凍結的先發（開賽時擷取、reload 讀回）。capturableLineup：還沒凍結前，從輪轉表
  // 當下站位「能不能擷取出一份完整先發」（只收屬於這場、湊滿 6 個號位才算數，否則 null）。
  // activeLineup：優先用已凍結的，其次用可擷取的——球場渲染、開賽擷取都以它為準。
  const lineup = record?.lineup ?? null;
  const capturableLineup = useMemo(
    () => (match ? captureLineupFromRotations(rotations ?? [], match.players) : null),
    [match, rotations],
  );
  const activeLineup = lineup ?? capturableLineup;

  // ── 自由球員自動輪轉接替 ──
  // 每次我方輪轉（ourRotation 變動）檢查被替換的球員是否已輪到前排。
  const currentSet = record?.currentSet;
  useEffect(() => {
    const libSub = liberoSubRef.current;
    if (!currentSet || currentSet.serving === null || !libSub || !id || !activeLineup) return;

    // 從計分表自己的先發快照算出「這一輪」場上 6 人的座標（不再讀全域 rotations）。
    const positions = lineupToPositions(activeLineup, currentSet.ourRotation);
    const targetPos = positions.find((p) => p.playerId === libSub);

    const isFrontRow = targetPos && targetPos.y > 0.5 && targetPos.y <= 0.75;
    if (!isFrontRow) return;

    const prev = prevLiberoRef.current;
    if (prev && prev !== libSub) {
      const prevPos = positions.find((p) => p.playerId === prev);
      if (prevPos && prevPos.y > 0.75) {
        setPreviousLiberoTarget(libSub);
        setLiberoSubstitution(id, prev);
        return;
      }
    }

    setPreviousLiberoTarget(libSub);
    setLiberoSubstitution(id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSet?.ourRotation]);

  // 比賽本體或計分記錄還在載入/重建時，先顯示載入狀態，避免在資料到位前閃現「誰先發球？」。
  if (id && (isMatchLoading || isHydrating)) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-muted-foreground">載入計分記錄中…</p>
      </div>
    );
  }

  if (!match || !id) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-muted-foreground">找不到這場比賽。</p>
        <BackToMatchListButton />
      </div>
    );
  }

  // 開始記錄前要求先發已排好。改讀計分表自己的快照（issue #115）：已凍結的先發，或還沒凍結前
  // 「輪轉表當下能擷取出一份完整先發」（activeLineup 非 null）就放行。門檻仍是「滿 6 個號位」
  // （captureLineupFromRotations 內建，跟舊的 isLineupComplete 同一條規則，見 issue #37）。
  const hasLineup = activeLineup !== null;
  // 先發只有在「這一局還沒開打」時能改（開局凍結，見 hooks/useScoreSheet.ts 的 start()）：
  // 開賽前右欄顯示的是共用真相（capturableLineup），可以直接編輯、每一次改動都即時生效
  // （setLineupFromSnapshot 直接寫回 useRotationTable）；開賽後已經記進去的球是綁著
  // record.lineup 這份凍結快照的，這時候改站位會讓歷史對不上，所以只能看不能改，
  // 要動陣容得走換人。
  const canEditLineup = !currentSet || currentSet.serving === null;
  // 球場要畫的「這一輪我方 6 人座標」，從快照即時換算（不再讀全域 rotations）。
  const ourPositions =
    activeLineup && currentSet ? lineupToPositions(activeLineup, currentSet.ourRotation) : [];
  const completedSets = record?.completedSets ?? [];
  const currentSubCount = regularSubs.length;
  const totalSubCount = subCountsHistory.reduce((a, b) => a + b, 0) + currentSubCount;
  // 暫停計數（issue #44）：本局每一方各用了幾次（排球規則每隊每局上限 2 次），加全場累計。
  const ourTimeoutCount = timeouts.filter((t) => t.side === "us").length;
  const opponentTimeoutCount = timeouts.filter((t) => t.side === "opponent").length;
  const currentTimeoutCount = timeouts.length;
  const totalTimeoutCount = timeoutCountsHistory.reduce((a, b) => a + b, 0) + currentTimeoutCount;
  const ourSetsWon = completedSets.filter((s) => s.ourScore > s.opponentScore).length;
  const opponentSetsWon = completedSets.filter((s) => s.opponentScore > s.ourScore).length;

  // 統計欄目前只顯示「本場」。跨場統計需要「列出本使用者所有有記錄的場」的 API 策略，
  // 留到 Phase 3b-ii（連同 events 讀回、球員矩陣重建）一起做。
  const statsMatches = [match];

  // 左側導覽軌（issue #160）的「比」按鈕要導回去的頁面。規則本身寫在 matchBackHref
  // 裡，三個 match-scoped 頁面共用同一個函式，「回列表」的行為才不會各頁飄掉。
  const backHref = matchBackHref(match.tournamentId);

  const handlePlayerTouch = (target: TouchedTarget) => {
    if (selectedBenchPlayer && target.side === "us" && target.playerId) {
      handleRegularSub(selectedBenchPlayer, target.playerId);
      return;
    }
    setGesture({ step: "action", target });
  };

  const handleActionSelect = (action: PlayAction) => {
    if (!gesture || gesture.step !== "action") return;
    setGesture({ step: "outcome", target: gesture.target, action });
  };

  const handleOutcomeSelect = (outcome: Outcome) => {
    if (!gesture) return;
    if (gesture.step === "outcome") {
      // 「得分／失分」是相對於這一球的動作方（target.side）來看，不是永遠對應
      // 我方：對手(全體)做了這個動作時，「得分」代表對手拿到這一分，得加的是
      // 對手的分數；「失分」代表對手沒拿到這一分（我方拿到）。動作方是我方球員
      // 時邏輯相反過來，一樣是「這個動作方自己得分還是失分」。
      const actorSide = gesture.target.side;
      const side = outcome === "win" ? actorSide : actorSide === "us" ? "opponent" : "us";
      score(side, {
        action: gesture.action,
        touchedBy: {
          side: gesture.target.side,
          playerId: gesture.target.playerId,
          zone: gesture.target.zone,
        },
      });
    } else if (gesture.step === "outcome-only") {
      // 「沒看到」沒有動作方可以參照，固定用我方視角（得分=我方加分）。
      // 不帶 meta，score 本來就支援（見 useScoreSheet.ts 的
      // meta?: Pick<PointRecord, "action" | "touchedBy">），只更新比分/輪轉，
      // 不會生出任何動作/球員的紀錄。
      score(outcome === "win" ? "us" : "opponent");
    }
    setGesture(null);
  };

  // 「沒看到」按鈕：跳過選動作，直接用按鈕本身的螢幕座標當 RadialMenu 中心，
  // 彈出得/失分選單。
  const handleNoSight = (e: ReactPointerEvent) => {
    setGesture({ step: "outcome-only", screenX: e.clientX, screenY: e.clientY });
  };

  const handleLiberoSubstitute = (targetPlayerId: string) => {
    // 手動把自由球員換上場是一個「使用者動作」，先存快照才能被「復原」退掉（issue #41）。
    // backendKind null：libero 替補是純前端狀態、沒寫後端（見 controller 說明），復原只還原畫面。
    snapshotForUndo(id, null);
    if (liberoSubstitution !== null) {
      setPreviousLiberoTarget(liberoSubstitution);
    }
    setLiberoSubstitution(id, targetPlayerId);
    setSelectedBenchPlayer(null);
  };

  const handleRegularSub = (inPlayerId: string, outPlayerId: string) => {
    // 換人動作（本地即時更新 + 背景寫進後端）現在都收在 controller 的 substitute() 裡，
    // 跟 score() 是同一套「本地優先、背景持久化」的分工，這裡只管畫面互動（清掉自由球員
    // 替補殘留狀態、關掉換人模式）。
    substitute(outPlayerId, inPlayerId);
    if (outPlayerId === liberoSubstitution) {
      setLiberoSubstitution(id, null);
    }
    setSelectedBenchPlayer(null);
  };

  const handleUndo = () => {
    undo();
    // previousLiberoTarget 是「自動回位」用的啟發式記憶，存在 component state、不在復原快照裡。
    // 復原可能把 liberoSubstitution 一起退回去，這裡順手清掉這份記憶，避免它跟還原後的替補
    // 狀態對不上（清成 null 是安全的：頂多讓之後的自動回位走預設行為，不會出錯）。
    setPreviousLiberoTarget(null);
  };

  const handleNextSet = () => {
    // 勝局條件檢查（issue #45）：一般局 25 分、決勝局 15 分，且都要領先 2 分以上才算贏。
    // 這裡不強制擋下（教練可能有特殊情況想提早結束），但比分沒達標就先跳確認，
    // 避免 0:0 之類的空局被誤按成一局封存。
    if (
      currentSet &&
      !isSetComplete(currentSet.setNumber, currentSet.ourScore, currentSet.opponentScore)
    ) {
      const target = currentSet.setNumber >= 5 ? 15 : 25;
      const ok = window.confirm(
        `目前比分 ${currentSet.ourScore}:${currentSet.opponentScore}，還沒達到勝局條件（${target} 分且領先 2 分以上）。\n確定要結束這一局、進入下一局嗎？`,
      );
      if (!ok) return;
    }
    // goNextSet() 底層的 nextSet 動作已經會把 record.lineup 清成 null（見
    // hooks/useScoreSheet.ts 的 nextSet 註解——先發是「每局可不同」，換新的一局要先清空
    // 舊局的快照），清空之後 activeLineup 自然改讀 capturableLineup（共用真相現在長什麼樣），
    // 右欄也就自動變回「開賽前、可編輯」的樣子——不需要另外一套「right rail 進編輯模式」
    // 的狀態機來銜接這一步。
    goNextSet();
    setPreviousLiberoTarget(null);
    setSelectedBenchPlayer(null);
  };

  // 左側導覽軌「戰」按鈕的飛出選單（issue #160 C3）：TacticsRailMenu 自己管開關/清單/彈窗，
  // 這裡只需要告訴它「計分頁的『現在站位』要怎麼查」——見 NewTacticDialog.tsx 開頭那段
  // 「為什麼擷取來源要由呼叫端注入」的說明。計分頁的現在站位＝activeLineup（計分表自己的
  // 逐局先發快照），不是全域輪轉表 store，理由跟以前 handleQuickTacticsBoard 一樣：
  // 計分表的站位真相本來就在自己這份快照裡（issue #115 把這條耦合解掉），從這裡抓才是
  // 「單一真相來源」；如果改讀全域 rotation store 會把 #115 好不容易解掉的耦合又接回來。
  const captureCurrentForBoard = () => {
    if (!activeLineup || !currentSet) {
      // 理論上不會被呼叫到——TacticsRailMenu 在 captureDisabled 為真時，會把「擷取
      // 目前站位」這個選項停用，使用者按不到這裡。但 captureCurrent 的型別要求永遠回傳一張
      // CourtSnapshot（不能是 null/undefined），所以保底給一張空站位，純粹滿足型別、不會
      // 真的被用到。
      return captureBlank({ matchId: id });
    }
    return captureFromScoreSheet(activeLineup, currentSet.ourRotation, match.players, {
      matchId: id,
    });
  };

  return (
    // 外層改成 flex h-screen（橫向排），把共用導覽軌 MatchNavRail 放在最左邊，右側
    // 才是這一頁原本的內容（flex-1 min-w-0 撐滿剩下的寬度）。以前的「回列表」
    // 「戰術板」連結是這個頁面 header 自己刻的，現在統一交給 MatchNavRail（issue #160）。
    <div className="flex h-screen w-full">
      <MatchNavRail
        matchId={id}
        backHref={backHref}
        active="record"
        // issue #160 C3：計分頁的「戰」按鈕改成飛出選單（列出已存戰術＋新增戰術），取代原本
        // 右欄底部單獨一顆「快速戰術板」按鈕——兩者是同一個功能，收進選單的「+」之後那顆
        // 按鈕就沒有存在必要了（見下面右欄，那個區塊已整段移除）。
        boardSlot={
          <TacticsRailMenu
            matchId={id}
            captureCurrent={captureCurrentForBoard}
            captureLabel="擷取目前計分站位"
            captureDisabled={!activeLineup || !currentSet}
          />
        }
      />
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="flex items-center justify-center border-b-2 border-[#111] px-4 py-3 shrink-0">
          <h1 className="text-lg font-bold">vs {match.opponent}</h1>
        </header>

        <div className="flex flex-1 min-h-0">
          {/* ── 左欄：計分表 ── */}
          <div className="flex flex-1 flex-col min-h-0 border-r-2 border-[#111]">
            {!hasLineup ? (
              // 這場還沒有先發。以前這裡是一顆「前往戰術板」把使用者踢出計分頁，現在右欄的
              // 站位面板在開賽前本來就是可編輯的（不用另外切換模式），所以這裡只留一句指路，
              // 不再提供離開這一頁的入口（PO 指示），也不連去戰術板——戰術板現在是唯讀的白板，
              // 不是排先發的地方（issue #154）。
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                <p className="text-muted-foreground">還沒排先發。</p>
                <p className="text-sm text-muted-foreground">
                  在右邊的「場上站位」點號位、再點球員，湊滿 6 人就能開始記錄。
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center gap-2 px-4 py-3 overflow-y-auto">
                {/* 局數 label + 局分小計（有結束的局才顯示） */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-700">
                    第 {currentSet?.setNumber ?? 1} 局
                  </span>
                  {completedSets.length > 0 && (
                    <span className="text-xs text-gray-400">
                      局數&nbsp;
                      <span
                        className={ourSetsWon > opponentSetsWon ? "font-bold text-green-600" : ""}
                      >
                        {ourSetsWon}
                      </span>
                      :
                      <span
                        className={opponentSetsWon > ourSetsWon ? "font-bold text-red-500" : ""}
                      >
                        {opponentSetsWon}
                      </span>
                    </span>
                  )}
                </div>

                {/* 大分數 */}
                <div className="flex items-center gap-6 text-5xl font-bold tabular-nums">
                  <span className="flex items-center gap-1">
                    {currentSet?.serving === "us" && <span className="text-2xl">🏐</span>}
                    {currentSet?.ourScore ?? 0}
                  </span>
                  <span className="text-gray-300">:</span>
                  <span className="flex items-center gap-1">
                    {currentSet?.opponentScore ?? 0}
                    {currentSet?.serving === "opponent" && <span className="text-2xl">🏐</span>}
                  </span>
                </div>
                <div className="flex gap-12 text-xs font-semibold text-gray-400">
                  <span>我方</span>
                  <span>對手</span>
                </div>

                {!currentSet || currentSet.serving === null ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3">
                    <p className="text-sm font-bold">這局由誰先發球？</p>
                    <div className="flex gap-3">
                      <Button onClick={() => start("us", activeLineup)}>我方先發</Button>
                      <Button variant="outline" onClick={() => start("opponent", activeLineup)}>
                        對手先發
                      </Button>
                    </div>
                    {/* 先發是「每局可不同」的（issue #115）：選先發方那一刻，會把當下的站位凍結成
                      這一局的先發（開局凍結）。開賽前右欄的站位面板本來就是可以直接編輯的——
                      不用另外按「改」切換模式，改了立刻生效。 */}
                    <p className="mt-1 text-center text-xs text-gray-400">
                      這一局會用右欄目前的站位，隨時可以直接在右欄改。
                    </p>
                  </div>
                ) : (
                  <>
                    {selectedBenchPlayer ? (
                      <div className="flex w-full items-center justify-between rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm">
                        <span className="font-semibold text-blue-700">
                          換人模式：點球場上的球員換下
                        </span>
                        <button
                          onClick={() => setSelectedBenchPlayer(null)}
                          className="text-xs text-blue-500 underline"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">在球場上畫線連到球員，記錄這一球</p>
                    )}

                    <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                      <ScoreSheetCourt
                        ourPositions={ourPositions}
                        roster={match.players}
                        opponentRotation={currentSet.opponentRotation}
                        serving={currentSet.serving}
                        interactive={gesture === null}
                        onPlayerTouch={handlePlayerTouch}
                        onLiberoSubstitute={handleLiberoSubstitute}
                        regularSubs={regularSubs}
                        selectedBenchPlayer={selectedBenchPlayer}
                        onBenchPlayerSelect={setSelectedBenchPlayer}
                        liberoSubstitution={liberoSubstitution}
                      />
                    </div>

                    {/* 暫停（issue #44）：每一方一顆鈕，標籤帶「已用/上限」，達到 2 次就反灰
                      （MAX_TIMEOUTS_PER_SET，理由見常數註解）。叫暫停跟得分/換人一樣走
                      controller 的 callTimeout：本地即時記一筆、背景寫進後端、可被「復原」退掉。 */}
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={ourTimeoutCount >= MAX_TIMEOUTS_PER_SET}
                        onClick={() => callTimeout("us")}
                      >
                        我方暫停 {ourTimeoutCount}/{MAX_TIMEOUTS_PER_SET}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={opponentTimeoutCount >= MAX_TIMEOUTS_PER_SET}
                        onClick={() => callTimeout("opponent")}
                      >
                        對手暫停 {opponentTimeoutCount}/{MAX_TIMEOUTS_PER_SET}
                      </Button>
                    </div>

                    <div className="flex gap-3 pb-2">
                      {/* 一顆「復原」鈕，一次退最近一個動作（得分／一般換人／手動 libero／暫停），
                        連按就一路往回（issue #41）。可用與否看復原堆疊深度，不是只看記了幾顆球
                        ——這樣剛換完人、還沒記下一球時也退得掉那次換人。 */}
                      <Button variant="ghost" disabled={undoDepth === 0} onClick={handleUndo}>
                        復原
                      </Button>
                      <Button variant="ghost" onPointerDown={handleNoSight}>
                        沒看到
                      </Button>
                      <Button variant="ghost" onClick={handleNextSet}>
                        下一局
                      </Button>
                      {/* 結束比賽（issue #20）：不是「刪除/封存」動作，只是導去賽後統計頁
                        （MatchAnalytics，路由已存在），所以用 asChild + Link 而不是 onClick，
                        跟上面「前往戰術板」是同一種寫法。 */}
                      <Button asChild variant="ghost">
                        <Link href={`/matches/${id}/analytics`}>結束比賽</Link>
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── 右欄：站位／統計／快速戰術板（深色玻璃，跟中間白底計分區切開） ──
            這輪（issue #120 第一階段）只把這整條 w-72 換成深色玻璃，色票照
            docs/design-spec.md 第 2 節；中間計分區維持白底不動（整頁改版是另外的
            design 工作）。border-l 收在這一側，交界只留一條邊框，不會有突兀的白邊。 */}
          <div className="w-72 flex-none flex flex-col min-h-0 border-l border-white/[0.10] bg-[#121310] font-dash text-[#F5F5F0]">
            {/* ── 站位面板（issue #120，共用真相版）──
              開賽前（canEditLineup）：lineup 讀的是 activeLineup，此時等於
              capturableLineup——輪轉表當下的共用真相，可以直接編輯；onLineupChange
              呼叫 setLineupFromSnapshot 把改動寫回 useRotationTable，跟戰術板讀的是
              同一份資料，改這裡戰術板也會立刻看到。
              開賽後：record.lineup 已經凍結（開局凍結，見 hooks/useScoreSheet.ts 的
              start()），這時 activeLineup 讀到的就是那份凍結快照，readOnly 鎖住不給改——
              已經記進去的球是綁著這份站位算的，中途改會讓歷史跟站位對不上。 */}
            <RotationRailPanel
              lineup={activeLineup}
              roster={match.players}
              rotation={currentSet?.ourRotation ?? 0}
              readOnly={!canEditLineup}
              onLineupChange={canEditLineup ? (next) => setLineupFromSnapshot(id, next) : undefined}
            />

            <div className="px-3 py-2 border-b border-white/[0.10] text-xs font-bold text-[#9AA08C] flex items-center justify-between shrink-0">
              <span>比賽統計</span>
              {statsMatches.length > 1 && (
                <span className="text-[#9AA08C]/70 font-normal">← 滑動看其他場</span>
              )}
            </div>

            {/* 每個 snap pane 是一場比賽的統計；CSS scroll-snap 不需要任何 JS */}
            <div className="flex-1 flex overflow-x-auto snap-x snap-mandatory min-h-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {statsMatches.map((m, i) => (
                <div key={m.id} className="w-72 flex-none snap-center flex flex-col min-h-0">
                  <div className="shrink-0 bg-white/[0.03] border-b border-white/[0.10] px-3 py-1.5 flex items-center gap-2">
                    <span className="text-xs font-bold truncate">vs {m.opponent}</span>
                    {m.id === id && (
                      <span className="text-[10px] bg-[#C6F135]/15 text-[#C6F135] px-1 rounded shrink-0">
                        本場
                      </span>
                    )}
                    <span className="text-[10px] text-[#9AA08C] ml-auto shrink-0">
                      {i + 1}/{statsMatches.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <ScoreSheetStats
                      players={m.players}
                      record={m.id === id ? record : undefined}
                      currentSetSubCount={m.id === id ? currentSubCount : undefined}
                      totalSubCount={m.id === id ? totalSubCount : undefined}
                      currentSetTimeoutCount={m.id === id ? currentTimeoutCount : undefined}
                      totalTimeoutCount={m.id === id ? totalTimeoutCount : undefined}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {gesture?.step === "action" && (
          <RadialMenu
            center={{ x: gesture.target.screenX, y: gesture.target.screenY }}
            // #50：六顆動作永遠留在固定方位（肌肉記憶），只把當下不可能的那顆「反灰」（不是
            // 拿掉）。disabledActions 依 發球方/動作方 算出要反灰的動作（規則#1 發球/接發互斥，
            // 恰好一顆）。選項數固定 6 個，RadialMenu 的環狀角度不會因為反灰而跑掉。
            options={ACTION_OPTIONS.map((o) => ({
              ...o,
              disabled: disabledActions(currentSet?.serving ?? null, gesture.target.side).includes(
                o.value,
              ),
            }))}
            onSelect={handleActionSelect}
            onCancel={() => setGesture(null)}
          />
        )}
        {gesture?.step === "outcome" && (
          <RadialMenu
            center={{ x: gesture.target.screenX, y: gesture.target.screenY }}
            options={OUTCOME_OPTIONS}
            onSelect={handleOutcomeSelect}
            onCancel={() => setGesture(null)}
            startAngle={180}
          />
        )}
        {gesture?.step === "outcome-only" && (
          <RadialMenu
            center={{ x: gesture.screenX, y: gesture.screenY }}
            options={OUTCOME_OPTIONS}
            onSelect={handleOutcomeSelect}
            onCancel={() => setGesture(null)}
            startAngle={180}
          />
        )}
      </div>
    </div>
  );
}
