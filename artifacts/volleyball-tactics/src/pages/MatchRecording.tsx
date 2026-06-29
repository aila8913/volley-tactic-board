import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMatches } from "@/hooks/useMatches";
import { useTactics } from "@/hooks/useTactics";
import { useRecording } from "@/hooks/useRecording";
import RecordingCourt, { TouchedTarget, RegularSub } from "@/components/RecordingCourt";
import RadialMenu, { RadialMenuOption } from "@/components/RadialMenu";
import MatchResult from "@/components/MatchResult";
import { PlayAction } from "@/types/recording";

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

export default function MatchRecording() {
  const { id } = useParams<{ id: string }>();
  const match = useMatches((state) => state.matches.find((m) => m.id === id));

  const setRoster = useTactics((state) => state.setRoster);
  const rotations = useTactics((state) => state.rotations);
  const liberoSubstitution = useTactics((state) => state.liberoSubstitution);
  const setLiberoSubstitution = useTactics((state) => state.setLiberoSubstitution);

  const record = useRecording((state) => (id ? state.recordingsByMatch[id] : undefined));
  const startSet = useRecording((state) => state.startSet);
  const scorePoint = useRecording((state) => state.scorePoint);
  const undoLastPoint = useRecording((state) => state.undoLastPoint);
  const nextSet = useRecording((state) => state.nextSet);

  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [showStats, setShowStats] = useState(false);

  // ── 自由球員替換記憶 ──
  // previousLiberoTarget：上一次被自由球員頂替的球員 id，供自動輪轉接替用。
  // useRef 讓 useEffect 讀到最新值，避免陳舊閉包。
  const [previousLiberoTarget, setPreviousLiberoTarget] = useState<string | null>(null);
  const liberoSubRef = useRef(liberoSubstitution);
  liberoSubRef.current = liberoSubstitution;
  const prevLiberoRef = useRef(previousLiberoTarget);
  prevLiberoRef.current = previousLiberoTarget;

  // ── 一般換人 ──
  // regularSubs：本局已發生的換人清單（進場球員、出場球員）。
  // subCountsHistory：已結束各局的換人次數，累計給統計使用。
  const [regularSubs, setRegularSubs] = useState<RegularSub[]>([]);
  const [subCountsHistory, setSubCountsHistory] = useState<number[]>([]);

  // 換人模式：教練先在場邊選中球員（selectedBenchPlayer），再點場上球員完成換人。
  const [selectedBenchPlayer, setSelectedBenchPlayer] = useState<string | null>(null);

  useEffect(() => {
    if (match) setRoster(match.players);
  }, [match, setRoster]);

  // ── 自由球員自動輪轉接替 ──
  // 每次我方輪轉（ourRotation 變動）檢查被替換的球員是否已輪到前排。
  // 是 → 嘗試把自由球員自動換給「上一位被替換者」（若他現在在後排）；
  //       否則讓自由球員回場邊，並記憶這位剛上前排的球員。
  const currentSet = record?.currentSet;
  useEffect(() => {
    const libSub = liberoSubRef.current;
    if (!currentSet || currentSet.serving === null || !libSub) return;

    const positions = (rotations[currentSet.ourRotation] ?? rotations[0]).positions;
    const targetPos = positions.find((p) => p.playerId === libSub);

    const isFrontRow = targetPos && targetPos.y > 0.5 && targetPos.y <= 0.75;
    if (!isFrontRow) return;

    const prev = prevLiberoRef.current;
    if (prev && prev !== libSub) {
      const prevPos = positions.find((p) => p.playerId === prev);
      if (prevPos && prevPos.y > 0.75) {
        setPreviousLiberoTarget(libSub);
        setLiberoSubstitution(prev);
        return;
      }
    }

    setPreviousLiberoTarget(libSub);
    setLiberoSubstitution(null);
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

  const handlePlayerTouch = (target: TouchedTarget) => {
    // 換人模式：點我方球員 → 執行換人，不開 RadialMenu
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
    setLiberoSubstitution(targetPlayerId);
    setSelectedBenchPlayer(null);
  };

  // inPlayerId：換上場者；outPlayerId：換下場者（輪轉 positions 中原本的球員）。
  // 若換下的是自由球員目前替換的對象，同步清除自由球員替換狀態。
  const handleRegularSub = (inPlayerId: string, outPlayerId: string) => {
    setRegularSubs((prev) => {
      // 若 inPlayer 之前曾是「換上場者」（被換過兩次），先移除舊記錄避免循環
      const cleaned = prev.filter((s) => s.inPlayerId !== outPlayerId);
      return [...cleaned, { outPlayerId, inPlayerId }];
    });
    if (outPlayerId === liberoSubstitution) {
      setLiberoSubstitution(null);
    }
    setSelectedBenchPlayer(null);
  };

  const handleNextSet = () => {
    setSubCountsHistory((prev) => [...prev, regularSubs.length]);
    nextSet(id);
    setLiberoSubstitution(null);
    setPreviousLiberoTarget(null);
    setRegularSubs([]);
    setSelectedBenchPlayer(null);
  };

  const currentSubCount = regularSubs.length;
  const totalSubCount = subCountsHistory.reduce((a, b) => a + b, 0) + currentSubCount;

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      <header className="flex items-center justify-between border-b-2 border-[#111] px-4 py-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/">← 比賽列表</Link>
        </Button>
        <h1 className="text-lg font-bold">vs {match.opponent}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowStats(true)}>
            統計
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/matches/${id}/board`}>戰術板</Link>
          </Button>
        </div>
      </header>

      {!hasLineup ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-muted-foreground">請先到戰術板把先發球員拖上場，才能開始記錄。</p>
          <Button asChild variant="outline">
            <Link href={`/matches/${id}/board`}>前往戰術板</Link>
          </Button>
        </div>
      ) : (
        <main className="flex flex-1 flex-col items-center gap-3 px-4 py-3">
          {completedSets.length > 0 && (
            <div className="flex gap-3 text-xs text-muted-foreground">
              {completedSets.map((s) => (
                <span key={s.setNumber}>
                  第{s.setNumber}局 {s.ourScore}:{s.opponentScore}
                </span>
              ))}
            </div>
          )}

          <div className="text-sm font-bold text-gray-600">第 {currentSet?.setNumber ?? 1} 局</div>

          <div className="flex items-center gap-6 text-4xl font-bold tabular-nums">
            <span className="flex items-center gap-1">
              {currentSet?.serving === "us" && <span>🏐</span>}
              {currentSet?.ourScore ?? 0}
            </span>
            <span className="text-gray-400">:</span>
            <span className="flex items-center gap-1">
              {currentSet?.opponentScore ?? 0}
              {currentSet?.serving === "opponent" && <span>🏐</span>}
            </span>
          </div>
          <div className="flex gap-10 text-xs font-bold text-gray-500">
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
                  <span className="font-semibold text-blue-700">換人模式：點球場上的球員換下</span>
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
                <RecordingCourt
                  ourRotation={currentSet.ourRotation}
                  opponentRotation={currentSet.opponentRotation}
                  serving={currentSet.serving}
                  interactive={gesture === null}
                  onPlayerTouch={handlePlayerTouch}
                  onLiberoSubstitute={handleLiberoSubstitute}
                  regularSubs={regularSubs}
                  selectedBenchPlayer={selectedBenchPlayer}
                  onBenchPlayerSelect={setSelectedBenchPlayer}
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
        </main>
      )}

      <Dialog open={showStats} onOpenChange={setShowStats}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>目前統計 — vs {match.opponent}</DialogTitle>
          </DialogHeader>
          <MatchResult
            players={match.players}
            record={record}
            currentSetSubCount={currentSubCount}
            totalSubCount={totalSubCount}
          />
        </DialogContent>
      </Dialog>

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
