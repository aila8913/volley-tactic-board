import { MatchPlayer } from "@/types/match";
import { ScoreSheetState, PointRecord } from "@/types/scoresheet";
import { ACTIONS, ACTION_LABELS, buildPlayerMatrix } from "@/lib/statsMapping";

// 排球規則（issue #20）：一局比賽，每隊最多只能換 6 次「一般換人」（自由球員上下場不算在內，
// 有獨立的規則、不受這個上限限制）。這裡只是「顯示提醒」用，不會真的擋住教練繼續按換人——
// 是否要在達到上限時禁用換人按鈕是更大的行為變更，留給 PO 之後再決定。
const MAX_SUBS_PER_SET = 6;

interface Props {
  players: MatchPlayer[];
  record: ScoreSheetState | undefined;
  currentSetSubCount?: number;
  totalSubCount?: number;
  currentSetTimeoutCount?: number;
  totalTimeoutCount?: number;
}

export default function ScoreSheetStats({
  players,
  record,
  currentSetSubCount = 0,
  totalSubCount = 0,
  currentSetTimeoutCount = 0,
  totalTimeoutCount = 0,
}: Props) {
  const currentSet = record?.currentSet;
  const completedSets = record?.completedSets ?? [];

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

  const allHistory: PointRecord[] = [
    ...completedSets.flatMap((s) => s.history ?? []),
    ...(currentSet?.history ?? []),
  ];

  const playerRows = buildPlayerMatrix(allHistory, players);

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {/* ── 比分總覽：每局一張 pill 卡片 ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-gray-700">比分總覽</h2>

        {setRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">尚未開始記分。</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 flex-wrap">
              {setRows.map((s) => {
                const weWon = s.ourScore > s.opponentScore;
                const inProgress = s.status === "in-progress";
                return (
                  <div
                    key={s.setNumber}
                    className={`flex flex-col items-center rounded border px-2.5 py-1 min-w-[40px] text-center ${
                      inProgress
                        ? "border-blue-200 bg-blue-50"
                        : weWon
                          ? "border-green-200 bg-green-50"
                          : "border-red-200 bg-red-50"
                    }`}
                  >
                    <span className="text-[10px] leading-none text-gray-400">{s.setNumber}</span>
                    <span
                      className={`text-xs font-bold tabular-nums leading-none mt-0.5 ${
                        inProgress ? "text-blue-600" : weWon ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      {s.ourScore}:{s.opponentScore}
                    </span>
                  </div>
                );
              })}
            </div>

            {completedSets.length > 0 && (
              <div className="text-xs text-gray-500">
                局數{" "}
                <span className={ourSetsWon > opponentSetsWon ? "font-bold text-green-700" : ""}>
                  {ourSetsWon}
                </span>
                :
                <span className={opponentSetsWon > ourSetsWon ? "font-bold text-red-600" : ""}>
                  {opponentSetsWon}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 換人紀錄 ── */}
      <section>
        <h2 className="mb-1.5 text-sm font-bold text-gray-700">換人紀錄</h2>
        <div className="flex gap-5 text-sm">
          <div className="flex flex-col items-center gap-0.5">
            {/* 本局才有上限（MAX_SUBS_PER_SET），所以顯示成「已用 / 上限」；達到上限時
                變紅提醒教練——排球規則到這裡就不能再換人了（自由球員例外，不算在這個數字裡）。
                全場累計是跨局總和，本來就沒有上限對象，維持原本純數字。 */}
            <span
              className={`text-xl font-bold tabular-nums ${
                currentSetSubCount >= MAX_SUBS_PER_SET ? "text-red-600" : ""
              }`}
            >
              {currentSetSubCount} / {MAX_SUBS_PER_SET}
            </span>
            <span className="text-xs text-muted-foreground">本局</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xl font-bold tabular-nums">{totalSubCount}</span>
            <span className="text-xs text-muted-foreground">全場累計</span>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">僅計入一般換人（不含自由球員）。</p>
      </section>

      {/* ── 暫停紀錄（issue #44）── */}
      <section>
        <h2 className="mb-1.5 text-sm font-bold text-gray-700">暫停紀錄</h2>
        <div className="flex gap-5 text-sm">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xl font-bold tabular-nums">{currentSetTimeoutCount}</span>
            <span className="text-xs text-muted-foreground">本局（雙方）</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xl font-bold tabular-nums">{totalTimeoutCount}</span>
            <span className="text-xs text-muted-foreground">全場累計</span>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          每隊每局上限 2 次；分隊次數見計分區。
        </p>
      </section>

      {/* ── 球員動作統計表 ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-gray-700">球員統計</h2>

        {playerRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            尚無記錄。在球場上畫線選動作後，這裡會顯示統計。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="pb-1 text-left text-gray-500 font-normal w-6">#</th>
                  {ACTIONS.map((a) => (
                    <th
                      key={a}
                      colSpan={2}
                      className="pb-1 text-center font-semibold text-gray-700 border-l border-gray-200 px-1"
                    >
                      {ACTION_LABELS[a]}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-gray-200">
                  <th className="pb-0.5" />
                  {ACTIONS.flatMap((a) => [
                    <th
                      key={`${a}-won`}
                      className="pb-0.5 text-right font-medium text-green-700 border-l border-gray-200 px-1"
                    >
                      得
                    </th>,
                    <th
                      key={`${a}-lost`}
                      className="pb-0.5 text-right font-medium text-red-600 px-1"
                    >
                      失
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {playerRows.map((row) => (
                  <tr key={row.playerId} className="border-b border-gray-100">
                    <td className="py-1 font-semibold text-gray-700">{row.number}</td>
                    {ACTIONS.flatMap((a) => {
                      const s = row.stats[a];
                      const hasData = s.won + s.lost > 0;
                      return [
                        <td
                          key={`${a}-won`}
                          className={`py-1 text-right tabular-nums border-l border-gray-200 px-1 ${
                            hasData ? "text-green-700" : "text-gray-300"
                          }`}
                        >
                          {hasData ? s.won : "—"}
                        </td>,
                        <td
                          key={`${a}-lost`}
                          className={`py-1 text-right tabular-nums px-1 ${
                            hasData ? "text-red-600" : "text-gray-300"
                          }`}
                        >
                          {hasData ? s.lost : "—"}
                        </td>,
                      ];
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
