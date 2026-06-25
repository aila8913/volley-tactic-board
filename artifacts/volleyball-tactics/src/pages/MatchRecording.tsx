import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useMatches } from "@/hooks/useMatches";
import { useTactics } from "@/hooks/useTactics";
import { useRecording } from "@/hooks/useRecording";
import RecordingCourt, { TouchedTarget } from "@/components/RecordingCourt";
import RadialMenu, { RadialMenuOption } from "@/components/RadialMenu";
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

// 快速操作手勢分兩步：先選「這球是誰做了什麼動作」，再選「結果我方得分還是失分」。
// 兩步驟共用同一個畫面位置（命中的球員/號位旁邊），所以用一個 state 帶著走，
// step 決定目前在哪一步、該彈哪一組選項。
type Gesture =
  | { step: "action"; target: TouchedTarget }
  | { step: "outcome"; target: TouchedTarget; action: PlayAction };

// 紀錄模式：比賽進行中用的快速記分頁面。跟戰術板（TacticsBoard.tsx）不同的地方是球員
// 站位不能手動調整——人已經在場上了，輪轉完全由比分自動算出來（見 hooks/useRecording.ts）。
// 記分的主要操作是「畫線連到球場上的球員→選動作→選得失分」的手勢（見 RecordingCourt.tsx
// 的命中偵測、RadialMenu.tsx 的彈出選單），比起單純按「+1」按鈕，能順手多記一筆「誰做了
// 什麼動作」，之後想做數據分析（見 docs/product-spec.md）才有素材。
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

  const [gesture, setGesture] = useState<Gesture | null>(null);

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

  const handlePlayerTouch = (target: TouchedTarget) => {
    setGesture({ step: "action", target });
  };

  const handleActionSelect = (action: PlayAction) => {
    if (!gesture) return;
    setGesture({ step: "outcome", target: gesture.target, action });
  };

  const handleOutcomeSelect = (outcome: Outcome) => {
    if (!gesture || gesture.step !== "outcome") return;
    // 「得分/失分」永遠是站在我方角度——不管動作是我方球員還是對手做的，教練只要判斷
    // 這一球最後結果是我方贏還是輸，直接對應到 scorePoint 既有的 'us'/'opponent'。
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
            <p className="text-xs text-gray-500">在球場上畫線連到球員，記錄這一球</p>
            <div className="flex w-full min-h-0 flex-1 items-center justify-center">
              <RecordingCourt
                ourRotation={currentSet.ourRotation}
                opponentRotation={currentSet.opponentRotation}
                serving={currentSet.serving}
                interactive={gesture === null}
                onPlayerTouch={handlePlayerTouch}
              />
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
