import { MatchPlayer } from "@/types/match";
import { MatchRecordingState, PointRecord } from "@/types/recording";

interface Props {
  players: MatchPlayer[];
  record: MatchRecordingState | undefined;
  currentSetSubCount?: number;
  totalSubCount?: number;
}

// 把某局的歷史球序，依防守動作的球員分組，算出次數和得分次數。
// 「得分率」的分子是「我方最終贏得這一分」的次數——沒有 quality 分數，
// 用得分結果當代理指標，可以大致反映防守效果。
function buildDefenseStats(
  history: PointRecord[],
  players: MatchPlayer[],
): { playerId: string; name: string; number: number; total: number; won: number }[] {
  // 只看有手勢記錄的防守動作，且是我方球員（有 playerId 的才是我方）。
  const defenseRecords = history.filter((p) => p.action === "defense" && p.touchedBy?.playerId);

  // Map<playerId, { total, won }>
  const statsMap = new Map<string, { total: number; won: number }>();
  for (const point of defenseRecords) {
    const pid = point.touchedBy!.playerId!;
    const entry = statsMap.get(pid) ?? { total: 0, won: 0 };
    statsMap.set(pid, {
      total: entry.total + 1,
      won: entry.won + (point.side === "us" ? 1 : 0),
    });
  }

  return [...statsMap.entries()]
    .map(([playerId, stats]) => {
      const player = players.find((p) => p.id === playerId);
      return { playerId, name: player?.name ?? "?", number: player?.number ?? 0, ...stats };
    })
    .sort((a, b) => b.total - a.total);
}

export default function MatchResult({
  players,
  record,
  currentSetSubCount = 0,
  totalSubCount = 0,
}: Props) {
  const currentSet = record?.currentSet;
  const completedSets = record?.completedSets ?? [];

  // 比分總覽：已結束的局 + 進行中的局（要已選發球方才算「開始了」）
  type SetRow = {
    setNumber: number;
    ourScore: number;
    opponentScore: number;
    status: "completed" | "in-progress";
  };
  const setRows: SetRow[] = [
    ...completedSets.map((s) => ({
      setNumber: s.setNumber,
      ourScore: s.ourScore,
      opponentScore: s.opponentScore,
      status: "completed" as const,
    })),
    ...(currentSet && currentSet.serving !== null
      ? [
          {
            setNumber: currentSet.setNumber,
            ourScore: currentSet.ourScore,
            opponentScore: currentSet.opponentScore,
            status: "in-progress" as const,
          },
        ]
      : []),
  ];

  const ourSetsWon = completedSets.filter((s) => s.ourScore > s.opponentScore).length;
  const opponentSetsWon = completedSets.filter((s) => s.opponentScore > s.ourScore).length;

  // 合併所有局的球序，用來計算跨全場的防守統計。
  // completedSets 的 history 在舊資料可能是 undefined，用 ?? [] 補空。
  const allHistory: PointRecord[] = [
    ...completedSets.flatMap((s) => s.history ?? []),
    ...(currentSet?.history ?? []),
  ];

  const defenseStats = buildDefenseStats(allHistory, players);

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      {/* ── 比分總覽 ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-gray-700">比分總覽</h2>

        {setRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">尚未開始記分。</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {setRows.map((s) => {
                const weWon = s.ourScore > s.opponentScore;
                return (
                  <div key={s.setNumber} className="flex items-center gap-3 text-sm">
                    <span className="w-14 text-xs text-gray-400">第 {s.setNumber} 局</span>
                    {/* 贏的那一方分數加粗，輸的那方顏色變淡，視覺上一眼看出勝負 */}
                    <span
                      className={`w-6 text-right font-bold tabular-nums ${
                        weWon ? "text-black" : "text-gray-400"
                      }`}
                    >
                      {s.ourScore}
                    </span>
                    <span className="text-gray-300">:</span>
                    <span
                      className={`w-6 font-bold tabular-nums ${
                        !weWon ? "text-black" : "text-gray-400"
                      }`}
                    >
                      {s.opponentScore}
                    </span>
                    {s.status === "in-progress" ? (
                      <span className="text-xs text-blue-500">進行中</span>
                    ) : (
                      <span className={`text-xs ${weWon ? "text-green-600" : "text-red-500"}`}>
                        {weWon ? "我方" : "對手"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 只有至少一局結束才顯示局數小計 */}
            {completedSets.length > 0 && (
              <div className="mt-3 border-t pt-2 text-xs text-gray-500">
                局數 {ourSetsWon} : {opponentSetsWon}
                {ourSetsWon > opponentSetsWon
                  ? "　我方領先"
                  : ourSetsWon < opponentSetsWon
                    ? "　對手領先"
                    : "　平手"}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── 換人統計 ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-gray-700">換人紀錄</h2>
        <div className="flex gap-6 text-sm">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-2xl font-bold tabular-nums">{currentSetSubCount}</span>
            <span className="text-xs text-muted-foreground">本局換人</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-2xl font-bold tabular-nums">{totalSubCount}</span>
            <span className="text-xs text-muted-foreground">全場累計</span>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">僅計入一般換人（不含自由球員）。</p>
      </section>

      {/* ── 防守統計 ── */}
      <section>
        <h2 className="mb-0.5 text-sm font-bold text-gray-700">防守統計</h2>
        {/* 說明這個數字的來源，讓教練知道為什麼次數可能比實際少 */}
        <p className="mb-3 text-xs text-muted-foreground">
          僅計入有畫線手勢記錄的防守動作。得分率 = 防守後我方得分次數 ÷ 防守總次數。
        </p>

        {defenseStats.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            尚無防守記錄。在球場上畫線選「防守」動作後，這裡會顯示各球員的防守統計。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-400">
                  <th className="pb-1 font-normal">球員</th>
                  <th className="pb-1 text-right font-normal">次數</th>
                  <th className="pb-1 text-right font-normal">得分次數</th>
                  <th className="pb-1 text-right font-normal">得分率</th>
                </tr>
              </thead>
              <tbody>
                {defenseStats.map((stat) => {
                  const rate = Math.round((stat.won / stat.total) * 100);
                  return (
                    <tr key={stat.playerId} className="border-b border-gray-100">
                      <td className="py-1.5">
                        <span className="mr-1 text-xs text-gray-400">#{stat.number}</span>
                        {stat.name}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{stat.total}</td>
                      <td className="py-1.5 text-right tabular-nums">{stat.won}</td>
                      <td className="py-1.5 text-right tabular-nums">{rate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
