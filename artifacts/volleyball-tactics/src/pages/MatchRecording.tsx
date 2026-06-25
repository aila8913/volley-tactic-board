import { useEffect } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useMatches } from "@/hooks/useMatches";
import { useTactics } from "@/hooks/useTactics";
import { useRecording } from "@/hooks/useRecording";
import RecordingCourt from "@/components/RecordingCourt";

// 紀錄模式：比賽進行中用的快速記分頁面。跟戰術板（TacticsBoard.tsx）不同的地方是球員
// 站位不能手動調整——人已經在場上了，輪轉完全由比分自動算出來（見 hooks/useRecording.ts），
// 教練只需要按「得分」，畫面就會自己更新場上站位跟發球方。
export default function MatchRecording() {
  const { id } = useParams<{ id: string }>();
  const match = useMatches((state) => state.matches.find((m) => m.id === id));

  const setRoster = useTactics((state) => state.setRoster);
  const rotations = useTactics((state) => state.rotations);

  const record = useRecording((state) => (id ? state.recordingsByMatch[id] : undefined));
  const startSet = useRecording((state) => state.startSet);
  const scorePoint = useRecording((state) => state.scorePoint);
  const undoLastPoint = useRecording((state) => state.undoLastPoint);
  const nextSet = useRecording((state) => state.nextSet);

  // 進入記錄頁時把名單同步進戰術板（跟戰術板頁面做法一樣，見 TacticsBoard.tsx），
  // 這樣不管教練是先去戰術板排過站位、還是直接從比賽列表點「比賽紀錄」進來，
  // 場上球員的姓名/背號都會是最新的。
  useEffect(() => {
    if (match) {
      setRoster(match.players);
    }
  }, [match, setRoster]);

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

  // 先發站位是教練在戰術板手動拖上場的（見 TacticsBoard.tsx），紀錄模式自己不會生成
  // 預設站位——沒有任何輪次排過站位時，先請教練去戰術板排好再回來記錄。
  const hasLineup = rotations.some((r) => (r.scenarioPositions?.base?.length ?? 0) > 0);
  if (!hasLineup) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-muted-foreground">請先到戰術板把先發球員拖上場，才能開始記錄。</p>
        <Button asChild variant="outline">
          <Link href={`/matches/${id}/board`}>前往戰術板</Link>
        </Button>
      </div>
    );
  }

  const currentSet = record?.currentSet;
  const completedSets = record?.completedSets ?? [];

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      <header className="flex items-center justify-between border-b-2 border-[#111] px-4 py-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/">← 比賽列表</Link>
        </Button>
        <h1 className="text-lg font-bold">vs {match.opponent}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/matches/${id}/board`}>戰術板</Link>
        </Button>
      </header>

      <main className="flex flex-1 flex-col items-center gap-4 px-4 py-4">
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
            <div className="flex w-full min-h-0 flex-1 items-center justify-center">
              <RecordingCourt
                ourRotation={currentSet.ourRotation}
                opponentRotation={currentSet.opponentRotation}
                serving={currentSet.serving}
              />
            </div>

            <div className="flex w-full max-w-md gap-3">
              <Button className="h-16 flex-1 text-lg" onClick={() => scorePoint(id, "us")}>
                我方得分 +1
              </Button>
              <Button
                className="h-16 flex-1 text-lg"
                variant="outline"
                onClick={() => scorePoint(id, "opponent")}
              >
                對手得分 +1
              </Button>
            </div>

            <div className="flex gap-3 pb-4">
              <Button
                variant="ghost"
                disabled={currentSet.history.length === 0}
                onClick={() => undoLastPoint(id)}
              >
                復原上一球
              </Button>
              <Button variant="ghost" onClick={() => nextSet(id)}>
                下一局
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
