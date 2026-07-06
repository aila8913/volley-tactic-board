import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import BackToMatchListButton from "@/components/BackToMatchListButton";
import { useMatchWithRoster } from "@/hooks/useMatches";
import { useRotationTable } from "@/hooks/useRotationTable";
import { useScoreSheet, useScoreSheetController } from "@/hooks/useScoreSheet";
import ScoreSheetCourt, { TouchedTarget, RegularSub } from "@/components/ScoreSheetCourt";
import RadialMenu, { RadialMenuOption } from "@/components/RadialMenu";
import ScoreSheetStats from "@/components/ScoreSheetStats";
import { PlayAction } from "@/types/scoresheet";

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

type Gesture =
  | { step: "action"; target: TouchedTarget }
  | { step: "outcome"; target: TouchedTarget; action: PlayAction }
  // 「沒看到」：只知道螢幕上點下去的位置（給 RadialMenu 當中心點），
  // 沒有 target 也沒有 action——直接跳去選得/失分，不記錄是誰、做了什麼動作。
  | { step: "outcome-only"; screenX: number; screenY: number };

export default function ScoreSheet() {
  const { id } = useParams<{ id: string }>();
  const { match, isLoading: isMatchLoading } = useMatchWithRoster(Number(id));

  const setRoster = useRotationTable((state) => state.setRoster);
  const rotations = useRotationTable((state) => state.rotations);

  const record = useScoreSheet((state) => (id ? state.recordingsByMatch[id] : undefined));
  const setLiberoSubstitution = useScoreSheet((state) => state.setLiberoSubstitution);
  // 記分/開局/復原/下一局改走 controller：本地即時更新畫面，同時在背景寫進後端
  // sets/rallies/events；進頁時也由它從 API 重建這場的記錄。setLiberoSubstitution 仍留在
  // store（純前端、不進 API，reload 後歸零——真正的自由球員持久化是 #43 的範圍）。
  const { isHydrating, start, score, undo, goNextSet } = useScoreSheetController(id ?? "");
  // 這場比賽目前的自由球員替補狀態——現在跟著 matchId 存在 useScoreSheet 裡（見
  // types/scoresheet.ts 的說明），不會再跟別場比賽的計分表互相污染。
  const liberoSubstitution = record?.liberoSubstitution ?? null;

  const [gesture, setGesture] = useState<Gesture | null>(null);

  // ── 自由球員替換記憶 ──
  // useRef 讓 useEffect 讀到最新值，避免陳舊閉包（stale closure）。
  const [previousLiberoTarget, setPreviousLiberoTarget] = useState<string | null>(null);
  const liberoSubRef = useRef(liberoSubstitution);
  liberoSubRef.current = liberoSubstitution;
  const prevLiberoRef = useRef(previousLiberoTarget);
  prevLiberoRef.current = previousLiberoTarget;

  // ── 一般換人 ──
  const [regularSubs, setRegularSubs] = useState<RegularSub[]>([]);
  const [subCountsHistory, setSubCountsHistory] = useState<number[]>([]);
  const [selectedBenchPlayer, setSelectedBenchPlayer] = useState<string | null>(null);

  useEffect(() => {
    if (match) setRoster(match.players);
  }, [match, setRoster]);

  // ── 自由球員自動輪轉接替 ──
  // 每次我方輪轉（ourRotation 變動）檢查被替換的球員是否已輪到前排。
  const currentSet = record?.currentSet;
  useEffect(() => {
    const libSub = liberoSubRef.current;
    if (!currentSet || currentSet.serving === null || !libSub || !id) return;

    const positions = (rotations[currentSet.ourRotation] ?? rotations[0]).positions;
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

  const hasLineup = rotations.some((r) => r.positions.length > 0);
  const completedSets = record?.completedSets ?? [];
  const currentSubCount = regularSubs.length;
  const totalSubCount = subCountsHistory.reduce((a, b) => a + b, 0) + currentSubCount;
  const ourSetsWon = completedSets.filter((s) => s.ourScore > s.opponentScore).length;
  const opponentSetsWon = completedSets.filter((s) => s.opponentScore > s.ourScore).length;

  // 統計欄目前只顯示「本場」。跨場統計需要「列出本使用者所有有記錄的場」的 API 策略，
  // 留到 Phase 3b-ii（連同 events 讀回、球員矩陣重建）一起做。
  const statsMatches = [match];

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
    if (liberoSubstitution !== null) {
      setPreviousLiberoTarget(liberoSubstitution);
    }
    setLiberoSubstitution(id, targetPlayerId);
    setSelectedBenchPlayer(null);
  };

  const handleRegularSub = (inPlayerId: string, outPlayerId: string) => {
    setRegularSubs((prev) => {
      const cleaned = prev.filter((s) => s.inPlayerId !== outPlayerId);
      return [...cleaned, { outPlayerId, inPlayerId }];
    });
    if (outPlayerId === liberoSubstitution) {
      setLiberoSubstitution(id, null);
    }
    setSelectedBenchPlayer(null);
  };

  const handleNextSet = () => {
    setSubCountsHistory((prev) => [...prev, regularSubs.length]);
    // goNextSet 底層的 nextSet 現在就會把 liberoSubstitution 歸零（見 hooks/useScoreSheet.ts），
    // 這裡不用再另外呼叫一次。
    goNextSet();
    setPreviousLiberoTarget(null);
    setRegularSubs([]);
    setSelectedBenchPlayer(null);
  };

  return (
    <div className="flex h-screen w-full flex-col bg-white">
      <header className="flex items-center justify-between border-b-2 border-[#111] px-4 py-3 shrink-0">
        <BackToMatchListButton />
        <h1 className="text-lg font-bold">vs {match.opponent}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/matches/${id}/board`}>戰術板</Link>
        </Button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── 左欄：計分表 ── */}
        <div className="flex flex-1 flex-col min-h-0 border-r-2 border-[#111]">
          {!hasLineup ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
              <p className="text-muted-foreground">請先到戰術板把先發球員拖上場，才能開始記錄。</p>
              <Button asChild variant="outline">
                <Link href={`/matches/${id}/board`}>前往戰術板</Link>
              </Button>
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
                    <span className={opponentSetsWon > ourSetsWon ? "font-bold text-red-500" : ""}>
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
                    <Button onClick={() => start("us")}>我方先發</Button>
                    <Button variant="outline" onClick={() => start("opponent")}>
                      對手先發
                    </Button>
                  </div>
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
                      ourRotation={currentSet.ourRotation}
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

                  <div className="flex gap-3 pb-2">
                    <Button
                      variant="ghost"
                      disabled={currentSet.history.length === 0}
                      onClick={() => undo()}
                    >
                      復原上一球
                    </Button>
                    <Button variant="ghost" onPointerDown={handleNoSight}>
                      沒看到
                    </Button>
                    <Button variant="ghost" onClick={handleNextSet}>
                      下一局
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── 右欄：統計（水平 snap scroll，可左右滑看其他場） ── */}
        <div className="w-72 flex-none flex flex-col min-h-0">
          <div className="px-3 py-2 border-b text-xs font-bold text-gray-600 flex items-center justify-between shrink-0">
            <span>比賽統計</span>
            {statsMatches.length > 1 && (
              <span className="text-gray-400 font-normal">← 滑動看其他場</span>
            )}
          </div>

          {/* 每個 snap pane 是一場比賽的統計；CSS scroll-snap 不需要任何 JS */}
          <div className="flex-1 flex overflow-x-auto snap-x snap-mandatory min-h-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            {statsMatches.map((m, i) => (
              <div key={m.id} className="w-72 flex-none snap-center flex flex-col min-h-0">
                <div className="shrink-0 bg-white border-b px-3 py-1.5 flex items-center gap-2">
                  <span className="text-xs font-bold truncate">vs {m.opponent}</span>
                  {m.id === id && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1 rounded shrink-0">
                      本場
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                    {i + 1}/{statsMatches.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <ScoreSheetStats
                    players={m.players}
                    record={m.id === id ? record : undefined}
                    currentSetSubCount={m.id === id ? currentSubCount : undefined}
                    totalSubCount={m.id === id ? totalSubCount : undefined}
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
          options={ACTION_OPTIONS}
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
  );
}
