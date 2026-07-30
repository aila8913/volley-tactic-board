import { MatchPlayer } from "@/types/match";
import { ScoreSheetState, PointRecord } from "@/types/scoresheet";
import { ACTIONS, ACTION_LABELS, buildPlayerMatrix } from "@/lib/statsMapping";
import { countSetWins, setWinner } from "@/lib/matchOutcome";

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

  // 局比數走 matchOutcome.countSetWins（#226 PR2）——這裡原本是一對手寫的 .filter().length，
  // 跟另外五處逐字相同。
  const { ourWins: ourSetsWon, opponentWins: opponentSetsWon } = countSetWins(completedSets);

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
        <h2 className="mb-2 text-center text-sm font-bold text-[#F5F5F0]">比分總覽</h2>

        {setRows.length === 0 ? (
          <p className="text-center text-xs text-[#9AA08C]">尚未開始記分。</p>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-wrap justify-center gap-2">
              {setRows.map((s) => {
                const weWon = setWinner(s) === "us";
                const inProgress = s.status === "in-progress";
                return (
                  <div
                    key={s.setNumber}
                    // 使用者要求放大：px-2.5/py-1/min-w-40px → px-4/py-2/min-w-16（跟下面
                    // 字級一起放大，維持框跟字的比例，不是只把字放大讓框顯得太擠）。
                    className={`flex min-w-16 flex-col items-center rounded border px-4 py-2 text-center ${
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
                    <span className="text-xs leading-none text-[#9AA08C]">{s.setNumber}</span>
                    {/* 字體跟計分板大比分同一套 font-score（Anton，見 index.css /
                      docs/design-spec.md 第 3 節的例外）——比分總覽也是「數字為主的展示」，
                      用同一套字體讓整頁的「這是比分」語彙一致。Anton 本身已經是視覺上的
                      粗體量感，不再疊 font-bold（疊了在只有一個字重的字體上是合成假粗體，
                      瀏覽器算圖比較糊）。 */}
                    <span
                      className={`font-score mt-1 text-lg leading-none tabular-nums ${
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
              <div className="text-center text-xs text-[#9AA08C]">
                局數{" "}
                <span className={ourSetsWon > opponentSetsWon ? "font-bold text-[#C6F135]" : ""}>
                  {ourSetsWon}
                </span>
                <span className="mx-1">:</span>
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
        <h2 className="mb-1.5 text-center text-sm font-bold text-[#F5F5F0]">換人紀錄</h2>
        {/* 中間一條分隔線：本局／全場累計原本只靠 gap 隔開，數字本身大而醒目、標籤小而不
          顯眼，一眼看過去容易誤讀成同一組數字的兩個部分而不是兩個獨立類別。加一條線是分隔
          兩組統計最直接的視覺手法，比純粹拉大間距更明確。
          （原本想用 Tailwind 的 divide-x 工具 class，實機量測發現這個專案的建置設定下它沒
          真的產生 border——別處也從沒人用過這個 class，不深究原因，直接改用整個專案到處
          驗證過能動的寫法：border-l 直接放在第二塊上。） */}
        <div className="flex justify-center text-sm">
          <div className="flex flex-col items-center gap-0.5 px-5">
            {/* 本局才有上限（MAX_SUBS_PER_SET），所以顯示成「已用 / 上限」；達到上限時
                變成警示色提醒教練——排球規則到這裡就不能再換人了（自由球員例外，不算在這個
                數字裡）。用琥珀（Warning，見 design-spec 色票）而不是珊瑚紅：這只是「到頂了」
                的提醒，不是像失分那樣的負面結果，跟下面比分卡片的「輸」用色要分開語意。
                全場累計是跨局總和，本來就沒有上限對象，維持原本純數字。
                字體改用 font-score（Anton，跟計分板大比分、上面比分總覽同一套「數字展示」
                語彙），不再疊 font-bold——理由同上面比分總覽的說明。 */}
            <span
              className={`font-score text-xl tabular-nums ${
                currentSetSubCount >= MAX_SUBS_PER_SET ? "text-[#F5A623]" : "text-[#F5F5F0]"
              }`}
            >
              {currentSetSubCount} / {MAX_SUBS_PER_SET}
            </span>
            <span className="text-xs text-[#9AA08C]">本局</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 border-l border-white/[0.10] px-5">
            <span className="font-score text-xl tabular-nums text-[#F5F5F0]">{totalSubCount}</span>
            <span className="text-xs text-[#9AA08C]">全場累計</span>
          </div>
        </div>
      </section>

      {/* ── 暫停紀錄（issue #44）── */}
      <section>
        <h2 className="mb-1.5 text-center text-sm font-bold text-[#F5F5F0]">暫停紀錄</h2>
        {/* 同換人紀錄：border-l 加分隔線＋ font-score，理由見上面那段說明。 */}
        <div className="flex justify-center text-sm">
          <div className="flex flex-col items-center gap-0.5 px-5">
            <span className="font-score text-xl tabular-nums text-[#F5F5F0]">
              {currentSetTimeoutCount}
            </span>
            <span className="text-xs text-[#9AA08C]">本局（雙方）</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 border-l border-white/[0.10] px-5">
            <span className="font-score text-xl tabular-nums text-[#F5F5F0]">
              {totalTimeoutCount}
            </span>
            <span className="text-xs text-[#9AA08C]">全場累計</span>
          </div>
        </div>
      </section>

      {/* ── 球員動作統計表 ── */}
      <section>
        <h2 className="mb-2 text-center text-sm font-bold text-[#F5F5F0]">球員統計</h2>

        {playerRows.length === 0 ? (
          <p className="text-center text-xs text-[#9AA08C]">
            尚無記錄。在球場上畫線選動作後，這裡會顯示統計。
          </p>
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
