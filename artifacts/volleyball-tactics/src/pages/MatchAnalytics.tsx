// 單場比賽分析頁（#65 分析頁三視圖裡的「視圖一」）。
//
// 架構決策（已定案，寫在這裡讓之後接手的人知道為什麼長這樣）：
//   - 這一步走「Option 3」：完全重用簡易版計分表的既有資料（sets/rallies/events/
//     substitutions），零 schema 變更、幾乎純前端組裝。跟計分表共用同一個純函數
//     reconstructRecording（見 lib/scoreSheetMapping.ts）＋ buildPlayerMatrix
//     （lib/statsMapping.ts），不新寫一套平行統計邏輯——這樣兩個畫面看到的數字
//     保證一致，規則改一次兩邊一起生效。
//   - 這裡是唯讀頁面：用 useMatchRecording（而不是 useScoreSheetController）讀資料，
//     不會意外寫入/污染正在進行中的計分表 optimistic 快取。
//   - 差異化區塊（到位率、球線熱區）目前刻意留「誠實空狀態」：現有的簡易記錄
//     （PointRecord 只記「決定球」，沒有座標/品質這些欄位）算不出這些數字，硬湊
//     假資料只會讓使用者以為系統在唬爛，等進階記錄（賽後補填）真的落地了才點亮。
import { useParams, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import AppShell from "@/components/AppShell";
import MatchNavRail, { matchBackHref } from "@/components/MatchNavRail";
import { useMatchWithRoster } from "@/hooks/useMatches";
import { useMatchRecording } from "@/hooks/useMatchRecording";
import { ACTIONS, ACTION_LABELS, buildPlayerMatrix } from "@/lib/statsMapping";
import { PointRecord } from "@/types/scoresheet";

// 找不到比賽時的「回列表」次要按鈕，跟 ScoreSheet.tsx 同一套語言（見該檔案同名常數的
// 註解：不透過 shadcn Button，因為那套元件的顏色綁在給淺色頁面用的 CSS 變數上）。
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-white/[0.26] " +
  "bg-white/[0.05] px-5 py-2 text-sm font-bold text-[#f5f5f0] transition " +
  "hover:border-[#c6f135] hover:text-[#c6f135]";

// 每個統計區塊共用的玻璃卡片外觀，跟 MatchCard.tsx 的卡片語言一致（rounded-2xl +
// border-white/[0.12] + bg-white/[0.07] + backdrop-blur-md）。
const GLASS_SECTION_CLASS =
  "rounded-2xl border border-white/[0.12] bg-white/[0.07] p-4 shadow-lg shadow-black/35 backdrop-blur-md";

export default function MatchAnalytics() {
  const { id } = useParams<{ id: string }>();
  const { match, isLoading: isMatchLoading } = useMatchWithRoster(Number(id));
  const { record, isLoading: isRecordLoading } = useMatchRecording(id ?? "");

  if (id && (isMatchLoading || isRecordLoading)) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[#0a0b07] px-4 text-center font-dash text-[#f5f5f0]">
        <Spinner className="size-6" />
        <p className="text-[#a9b096]">載入比賽數據中…</p>
      </div>
    );
  }

  if (!match || !id) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[#0a0b07] px-4 text-center font-dash text-[#f5f5f0]">
        <p className="text-[#a9b096]">找不到這場比賽。</p>
        {/* 不用共用的 BackToMatchListButton：那顆元件走 shadcn Button 的淺色配色，是給
            還沒套用深色語言的頁面用的，這裡直接刻一顆跟這頁其他元素同一套語言的版本，
            不動共用元件本身。 */}
        <Link href="/" className={SECONDARY_BUTTON_CLASS}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          比賽列表
        </Link>
      </div>
    );
  }

  const completedSets = record?.completedSets ?? [];
  const currentSet = record?.currentSet;

  // 比分總覽：已結束的局 + 進行中的那一局（跟 ScoreSheetStats 的 setRows 是同一套判定：
  // currentSet.serving !== null 才代表這局真的已經開球，避免顯示一個 0:0 的空局）。
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

  // 球員統計：completedSets 全部 history + currentSet.history 一起丟給 buildPlayerMatrix。
  const allHistory: PointRecord[] = [
    ...completedSets.flatMap((s) => s.history ?? []),
    ...(currentSet?.history ?? []),
  ];
  const playerRows = buildPlayerMatrix(allHistory, match.players);

  // 換人統計：已結束各局的次數加總，加上目前這局 regularSubs 的長度（跟 ScoreSheet.tsx
  // 算 totalSubCount 是同一條公式）。
  const subCountsHistory = record?.subCountsHistory ?? [];
  const currentSubCount = record?.regularSubs.length ?? 0;
  const totalSubCount = subCountsHistory.reduce((a, b) => a + b, 0) + currentSubCount;

  // 左側導覽軌（issue #160）的「比」按鈕要導回去的頁面，規則共用 matchBackHref。
  const backHref = matchBackHref(match.tournamentId);

  return (
    // issue #172：三欄骨架交給 AppShell（mode="A"）。不傳 aside——站位列的資訊欄版本目前
    // 被 #76 擋住（分析頁還沒有可以放進右欄的站位資料），這一環也不重寫功能元件，所以維持
    // 「這一頁沒有右欄」。原本的「回列表」「回計分表」header 連結統一交給 MatchNavRail
    // （issue #160，不變）。
    <AppShell
      mode="A"
      nav={<MatchNavRail matchId={id ?? ""} backHref={backHref} active="analytics" />}
      className="bg-[#0a0b07] font-dash text-[#f5f5f0]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(245,245,240,0.035) 0 1px, transparent 1px 28px)," +
          "repeating-linear-gradient(-45deg, rgba(245,245,240,0.035) 0 1px, transparent 1px 28px)",
      }}
    >
      {/* 原本是 min-h-screen（讓整個瀏覽器視窗跟著內容變長、由視窗自己捲）。AppShell 改成
          h-screen 固定版面之後，捲動責任下放到這一層：min-h-0 + flex-1 讓它剛好吃滿中央
          主區的高度、不多不少，再由自己的 overflow-y-auto 捲內容。留著 min-h-screen 的話，
          這塊的最小高度會被釘在 100vh，之後若中央主區上面多一條 header，它就會超出容器
          一個 header 的高度、把捲軸推到看不見的地方。 */}
      <div className="min-h-0 w-full flex-1 overflow-y-auto">
        <header className="flex items-center justify-center border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
          <h1 className="text-lg font-bold">vs {match.opponent} · 數據分析</h1>
        </header>

        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          {/* ── 比分總覽 ── */}
          <section className={GLASS_SECTION_CLASS}>
            <h2 className="mb-3 text-sm font-bold text-[#f5f5f0]">比分總覽</h2>
            {setRows.length === 0 ? (
              <p className="text-sm text-[#a9b096]">尚未開始記分。</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {setRows.map((s) => {
                    const weWon = s.ourScore > s.opponentScore;
                    const inProgress = s.status === "in-progress";
                    return (
                      <div
                        key={s.setNumber}
                        className={`flex flex-col items-center rounded border px-3 py-1.5 min-w-[52px] text-center ${
                          inProgress
                            ? "border-sky-400/30 bg-sky-400/10"
                            : weWon
                              ? "border-[#c6f135]/30 bg-[#c6f135]/10"
                              : "border-[#ef4444]/30 bg-[#ef4444]/10"
                        }`}
                      >
                        <span className="text-[11px] leading-none text-[#a9b096]">
                          第 {s.setNumber} 局
                        </span>
                        <span
                          className={`font-numeric text-sm font-bold tabular-nums leading-none mt-1 ${
                            inProgress
                              ? "text-sky-300"
                              : weWon
                                ? "text-[#c6f135]"
                                : "text-[#ef4444]"
                          }`}
                        >
                          {s.ourScore}:{s.opponentScore}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {completedSets.length > 0 && (
                  <div className="text-sm text-[#a9b096]">
                    局數{" "}
                    <span
                      className={ourSetsWon > opponentSetsWon ? "font-bold text-[#c6f135]" : ""}
                    >
                      {ourSetsWon}
                    </span>
                    :
                    <span
                      className={opponentSetsWon > ourSetsWon ? "font-bold text-[#ef4444]" : ""}
                    >
                      {opponentSetsWon}
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── 球員統計（決定球矩陣） ── */}
          <section className={GLASS_SECTION_CLASS}>
            <h2 className="text-sm font-bold text-[#f5f5f0]">球員統計</h2>
            {/* 語意說明：見 lib/statsMapping.ts 的 buildPlayerMatrix 註解——這是「決定球歸屬」
              統計，不是逐觸球統計，接—舉—攻只有最後一人被記，舉球員數字會系統性偏低。 */}
            <p className="mb-3 text-xs text-[#a9b096]">
              這是「決定球歸屬」統計：一分只記終結那一球是誰、做了什麼動作，接—舉—攻只有最後一人被記
              到，舉球員的數字會系統性偏低，不代表他表現不好。
            </p>
            {playerRows.length === 0 ? (
              <p className="text-sm text-[#a9b096]">尚無記錄。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-white/[0.2]">
                      <th className="pb-1 text-left text-[#a9b096] font-normal w-8">#</th>
                      {ACTIONS.map((a) => (
                        <th
                          key={a}
                          colSpan={2}
                          className="pb-1 text-center font-semibold text-[#f5f5f0] border-l border-white/[0.08] px-1"
                        >
                          {ACTION_LABELS[a]}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-white/[0.08]">
                      <th className="pb-0.5" />
                      {ACTIONS.flatMap((a) => [
                        <th
                          key={`${a}-won`}
                          className="pb-0.5 text-right font-medium text-[#c6f135] border-l border-white/[0.08] px-1"
                        >
                          得
                        </th>,
                        <th
                          key={`${a}-lost`}
                          className="pb-0.5 text-right font-medium text-[#ef4444] px-1"
                        >
                          失
                        </th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {playerRows.map((row) => (
                      <tr key={row.playerId} className="border-b border-white/[0.06]">
                        <td className="py-1 font-semibold text-[#f5f5f0]">{row.number}</td>
                        {ACTIONS.flatMap((a) => {
                          const s = row.stats[a];
                          const hasData = s.won + s.lost > 0;
                          return [
                            <td
                              key={`${a}-won`}
                              className={`py-1 text-right font-numeric tabular-nums border-l border-white/[0.08] px-1 ${
                                hasData ? "text-[#c6f135]" : "text-white/20"
                              }`}
                            >
                              {hasData ? s.won : "—"}
                            </td>,
                            <td
                              key={`${a}-lost`}
                              className={`py-1 text-right font-numeric tabular-nums px-1 ${
                                hasData ? "text-[#ef4444]" : "text-white/20"
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

          {/* ── 換人統計 ── */}
          <section className={GLASS_SECTION_CLASS}>
            <h2 className="mb-2 text-sm font-bold text-[#f5f5f0]">換人統計</h2>
            <div className="flex items-center gap-2">
              <span className="font-numeric text-2xl font-bold tabular-nums text-[#f5f5f0]">
                {totalSubCount}
              </span>
              <span className="text-sm text-[#a9b096]">次（全場累計，含進行中的這局）</span>
            </div>
            <p className="mt-1 text-[11px] text-[#a9b096]">僅計入一般換人（不含自由球員）。</p>
          </section>

          {/* ── 階段接續：即將推出（明確空狀態，不放假資料） ── */}
          <section className={`${GLASS_SECTION_CLASS} border-dashed`}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#f5f5f0]">階段接續</h2>
              <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-[#a9b096]">
                即將推出
              </span>
            </div>
            <p className="text-sm text-[#a9b096]">
              side-out% /
              破發率、各輪次得失分等「跨球序的階段性」統計，需要更完整的輪次追蹤，規劃中。
            </p>
          </section>

          {/* ── 差異化：需要進階記錄才會點亮（誠實空狀態，不放假圖表） ── */}
          <section className={`${GLASS_SECTION_CLASS} border-dashed`}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#f5f5f0]">防守到位率 / 對手球線分布</h2>
              <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-[#a9b096]">
                需要進階記錄
              </span>
            </div>
            <p className="text-sm text-[#a9b096]">
              目前的簡易記錄只存「這一球是誰、做了什麼動作」，沒有座標/落點/品質——算不出到位率跟球線
              熱區。等進階記錄（賽後影片補填）落地後，這裡才會顯示真實數字。
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
