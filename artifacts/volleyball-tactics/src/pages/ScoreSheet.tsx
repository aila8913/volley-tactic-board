import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useMatches } from "@/hooks/useMatches";
import { useRotationTable } from "@/hooks/useRotationTable";
import { useScoreSheet } from "@/hooks/useScoreSheet";
import ScoreSheetCourt, { TouchedTarget, RegularSub } from "@/components/ScoreSheetCourt";
import RadialMenu, { RadialMenuOption } from "@/components/RadialMenu";
import ScoreSheetStats from "@/components/ScoreSheetStats";
import { PlayAction } from "@/types/scoresheet";

const ACTION_OPTIONS: RadialMenuOption<PlayAction>[] = [
  { value: "serve", label: "發球", position: "top" },
  { value: "defense", label: "防守", position: "left" },
  { value: "attack", label: "攻擊", position: "right" },
  { value: "block", label: "擋網", position: "bottom" },
];

type Outcome = "win" | "lose";
const OUTCOME_OPTIONS: RadialMenuOption<Outcome>[] = [
  { value: "lose", label: "失分", position: "left" },
  { value: "win", label: "得分", position: "right" },
];

type Gesture =
  | { step: "action"; target: TouchedTarget }
  | { step: "outcome"; target: TouchedTarget; action: PlayAction };

export default function ScoreSheet() {
  const { id } = useParams<{ id: string }>();
  const match = useMatches((state) => state.matches.find((m) => m.id === id));

  // 全部比賽清單 + 全部紀錄，用來組右側統計欄的多場列表
  const allMatches = useMatches((state) => state.matches);
  const recordingsByMatch = useScoreSheet((state) => state.recordingsByMatch);

  const setRoster = useRotationTable((state) => state.setRoster);
  const rotations = useRotationTable((state) => state.rotations);

  const record = useScoreSheet((state) => (id ? state.recordingsByMatch[id] : undefined));
  const startSet = useScoreSheet((state) => state.startSet);
  const scorePoint = useScoreSheet((state) => state.scorePoint);
  const undoLastPoint = useScoreSheet((state) => state.undoLastPoint);
  const nextSet = useScoreSheet((state) => state.nextSet);
  const setLiberoSubstitution = useScoreSheet((state) => state.setLiberoSubstitution);
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

  if (!match || !id) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-muted-foreground">找不到這場比賽。</p>
        <Button asChild variant="outline">
          <Link href="/">回到比賽列表</Link>
        </Button>
      </div>
    );
  }

  const hasLineup = rotations.some((r) => r.positions.length > 0);
  const completedSets = record?.completedSets ?? [];
  const currentSubCount = regularSubs.length;
  const totalSubCount = subCountsHistory.reduce((a, b) => a + b, 0) + currentSubCount;
  const ourSetsWon = completedSets.filter((s) => s.ourScore > s.opponentScore).length;
  const opponentSetsWon = completedSets.filter((s) => s.opponentScore > s.ourScore).length;

  // 統計欄的場次列表：本場第一，其他有紀錄的場次依日期由新到舊
  const statsMatches = [
    match,
    ...allMatches
      .filter((m) => m.id !== id && !!recordingsByMatch[m.id])
      .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()),
  ];

  const handlePlayerTouch = (target: TouchedTarget) => {
    if (selectedBenchPlayer && target.side === "us" && target.playerId) {
      handleRegularSub(selectedBenchPlayer, target.playerId);
      return;
    }
    setGesture({ step: "action", target });
  };

  const handleActionSelect = (action: PlayAction) => {
    if (!gesture) return;
    setGesture({ step: "outcome", target: gesture.target, action });
  };

  const handleOutcomeSelect = (outcome: Outcome) => {
    if (!gesture || gesture.step !== "outcome") return;
    scorePoint(id, outcome === "win" ? "us" : "opponent", {
      action: gesture.action,
      touchedBy: {
        side: gesture.target.side,
        playerId: gesture.target.playerId,
        zone: gesture.target.zone,
      },
    });
    setGesture(null);
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
    // nextSet 本身現在就會把 liberoSubstitution 歸零（見 hooks/useScoreSheet.ts），
    // 這裡不用再另外呼叫一次。
    nextSet(id);
    setPreviousLiberoTarget(null);
    setRegularSubs([]);
    setSelectedBenchPlayer(null);
  };

  return (
    <div className="flex h-screen w-full flex-col bg-white">
      <header className="flex items-center justify-between border-b-2 border-[#111] px-4 py-3 shrink-0">
        <Button asChild variant="outline" size="sm">
          <Link href="/">← 比賽列表</Link>
        </Button>
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
                    <Button onClick={() => startSet(id, "us")}>我方先發</Button>
                    <Button variant="outline" onClick={() => startSet(id, "opponent")}>
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
                      onClick={() => undoLastPoint(id)}
                    >
                      復原上一球
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
                    record={recordingsByMatch[m.id]}
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
        />
      )}
    </div>
  );
}
