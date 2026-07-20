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
    // 這個元件現在被放進 pages/ScoreSheet.tsx 右欄的深色玻璃容器裡（issue #120），
    // 原本淺色主題（text-gray-*／bg-white／border-gray-* 等）在深底上會糊成一片看不清楚，
    // 這裡整批換成 docs/design-spec.md 第 2 節的色票：主文字 #F5F5F0、次文字/邊框
    // 用半透明白（跟其他右欄元件如 RotationTable.tsx 的玻璃卡片同一套語言）。
    <div className="flex flex-col gap-5 px-4 py-4">
      {/* ── 比分總覽：每局一張 pill 卡片 ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-[#F5F5F0]">比分總覽</h2>

        {setRows.length === 0 ? (
          <p className="text-xs text-[#9AA08C]">尚未開始記分。</p>
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
                      // 「進行中」是中性狀態，design-spec 的三色系統（萊姆綠=成功／珊瑚紅=錯誤／
                      // 琥珀=警示）裡沒有對應色，這裡沿用藍色系但調成適合深底的透明度，
                      // 跟下面「贏＝萊姆綠／輸＝珊瑚紅」的語意色分開，不會混淆成勝負判斷。
                      inProgress
                        ? "border-sky-400/30 bg-sky-400/10"
                        : weWon
                          ? "border-[#C6F135]/30 bg-[#C6F135]/10"
                          : "border-[#EF4444]/30 bg-[#EF4444]/10"
                    }`}
                  >
                    <span className="text-[10px] leading-none text-[#9AA08C]">{s.setNumber}</span>
                    <span
                      className={`text-xs font-bold tabular-nums leading-none mt-0.5 ${
                        inProgress ? "text-sky-300" : weWon ? "text-[#C6F135]" : "text-[#EF4444]"
                      }`}
                    >
                      {s.ourScore}:{s.opponentScore}
                    </span>
                  </div>
                );
              })}
            </div>

            {completedSets.length > 0 && (
              <div className="text-xs text-[#9AA08C]">
                局數{" "}
                <span className={ourSetsWon > opponentSetsWon ? "font-bold text-[#C6F135]" : ""}>
                  {ourSetsWon}
                </span>
                :
                <span className={opponentSetsWon > ourSetsWon ? "font-bold text-[#EF4444]" : ""}>
                  {opponentSetsWon}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 換人紀錄 ── */}
      <section>
        <h2 className="mb-1.5 text-sm font-bold text-[#F5F5F0]">換人紀錄</h2>
        <div className="flex gap-5 text-sm">
          <div className="flex flex-col items-center gap-0.5">
            {/* 本局才有上限（MAX_SUBS_PER_SET），所以顯示成「已用 / 上限」；達到上限時
                變成警示色提醒教練——排球規則到這裡就不能再換人了（自由球員例外，不算在這個
                數字裡）。用琥珀（Warning，見 design-spec 色票）而不是珊瑚紅：這只是「到頂了」
                的提醒，不是像失分那樣的負面結果，跟下面比分卡片的「輸」用色要分開語意。
                全場累計是跨局總和，本來就沒有上限對象，維持原本純數字。 */}
            <span
              className={`text-xl font-bold tabular-nums ${
                currentSetSubCount >= MAX_SUBS_PER_SET ? "text-[#F5A623]" : "text-[#F5F5F0]"
              }`}
            >
              {currentSetSubCount} / {MAX_SUBS_PER_SET}
            </span>
            <span className="text-xs text-[#9AA08C]">本局</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xl font-bold tabular-nums text-[#F5F5F0]">{totalSubCount}</span>
            <span className="text-xs text-[#9AA08C]">全場累計</span>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-[#9AA08C]">僅計入一般換人（不含自由球員）。</p>
      </section>

      {/* ── 暫停紀錄（issue #44）── */}
      <section>
        <h2 className="mb-1.5 text-sm font-bold text-[#F5F5F0]">暫停紀錄</h2>
        <div className="flex gap-5 text-sm">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xl font-bold tabular-nums text-[#F5F5F0]">
              {currentSetTimeoutCount}
            </span>
            <span className="text-xs text-[#9AA08C]">本局（雙方）</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xl font-bold tabular-nums text-[#F5F5F0]">
              {totalTimeoutCount}
            </span>
            <span className="text-xs text-[#9AA08C]">全場累計</span>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-[#9AA08C]">每隊每局上限 2 次；分隊次數見計分區。</p>
      </section>

      {/* ── 球員動作統計表 ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-[#F5F5F0]">球員統計</h2>

        {playerRows.length === 0 ? (
          <p className="text-xs text-[#9AA08C]">尚無記錄。在球場上畫線選動作後，這裡會顯示統計。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-white/[0.10]">
                  <th className="pb-1 text-left text-[#9AA08C] font-normal w-6">#</th>
                  {ACTIONS.map((a) => (
                    <th
                      key={a}
                      colSpan={2}
                      className="pb-1 text-center font-semibold text-[#F5F5F0] border-l border-white/[0.10] px-1"
                    >
                      {ACTION_LABELS[a]}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-white/[0.10]">
                  <th className="pb-0.5" />
                  {ACTIONS.flatMap((a) => [
                    <th
                      key={`${a}-won`}
                      className="pb-0.5 text-right font-medium text-[#C6F135] border-l border-white/[0.10] px-1"
                    >
                      得
                    </th>,
                    <th
                      key={`${a}-lost`}
                      className="pb-0.5 text-right font-medium text-[#EF4444] px-1"
                    >
                      失
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {playerRows.map((row) => (
                  <tr key={row.playerId} className="border-b border-white/[0.06]">
                    <td className="py-1 font-semibold text-[#F5F5F0]">{row.number}</td>
                    {ACTIONS.flatMap((a) => {
                      const s = row.stats[a];
                      const hasData = s.won + s.lost > 0;
                      return [
                        <td
                          key={`${a}-won`}
                          className={`py-1 text-right tabular-nums border-l border-white/[0.10] px-1 ${
                            hasData ? "text-[#C6F135]" : "text-white/20"
                          }`}
                        >
                          {hasData ? s.won : "—"}
                        </td>,
                        <td
                          key={`${a}-lost`}
                          className={`py-1 text-right tabular-nums px-1 ${
                            hasData ? "text-[#EF4444]" : "text-white/20"
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
