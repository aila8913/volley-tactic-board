// 分析頁「視圖③：球員跨場/跨隊分析」(#213)。跟視圖②（CrossMatchAnalytics.tsx）一樣不掛在
// 單一 matchId 底下，但聚合單位不同——視圖②是「每場比賽一列」，這頁是「選定一個人、看他
// 跨越所有場次/球隊的歷程」。people 這層「跨場身分」(#212 建的 people CRUD) 就是為了讓這頁
// 有事可做：同一個人在不同場可能背號、位置、甚至球隊都不同，這頁要能把這些歷程串起來看。
//
// 重要：這頁只呈現「資料真的支援」的統計。events.outcome（得分/失分）的寫入路徑已經補上
// 了（#365），這頁也從 #370 開始消費它，呈現跨場加總的得分/失分結構。仍然做不到的是
// 比率統計（side-out%／決定率這類），那需要「這一分開始時是誰在發球」，要從發球序反推，
// 邏輯複雜到不適合塞進現有聚合查詢，留給 #235；也刻意不做「戰績（勝/負）」（那需要
// matches.format，是另一張 PR 的東西，見 api-server 的 analysis.ts 對應路由註解）。
// 頁面上要老實告知還缺什麼，而不是靜默地不顯示讓人以為壞了——見下面 <p> 那段常駐說明文字。
import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { Users } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import AppShell from "@/components/AppShell";
import NavRail from "@/components/NavRail";
import { usePersonList } from "@/hooks/usePeople";
import { usePersonAnalysis } from "@/hooks/usePersonAnalysis";
import { useTeamList } from "@/hooks/useTeams";
import { APP_BACKGROUND_STYLE, APP_SHELL_CLASS } from "@/lib/appChromeStyles";
import { buildPersonActionSummary, buildPersonOutcomeSummary } from "@/lib/personAnalysisMapping";
import { formatMatchDateTime } from "@/lib/matchSummary";

// 跟 CrossMatchAnalytics.tsx 同一套次要按鈕／玻璃卡片語言，維持三個分析頁視覺一致。
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-white/[0.26] " +
  "bg-white/[0.05] px-5 py-2 text-sm font-bold text-[#f5f5f0] transition " +
  "hover:border-[#c6f135] hover:text-[#c6f135]";

const GLASS_SECTION_CLASS =
  "rounded-2xl border border-white/[0.12] bg-white/[0.07] p-4 shadow-lg shadow-black/35 backdrop-blur-md";

export default function PersonAnalytics() {
  const [, navigate] = useLocation();
  const { people, isLoading: peopleLoading } = usePersonList();
  const { teams } = useTeamList();

  // 目前選定的人（下拉選單挑一個 personId，選了才發 /analysis/people/:id 請求，
  // 見 usePersonAnalysis 的 enabled 防呆）。用 string 存 select 的 value，"" 代表還沒選。
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const personId = selectedPersonId === "" ? undefined : Number(selectedPersonId);

  const { analysis, isLoading: analysisLoading, isError } = usePersonAnalysis(personId);

  const teamNameById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

  // 動作次數固定排序＋補中文標籤＋缺席補 0（見 lib/personAnalysisMapping.ts 的理由）。
  const actionSummary = useMemo(
    () => buildPersonActionSummary(analysis?.actionCounts ?? []),
    [analysis],
  );

  // 得分／失分結構同一套固定排序＋補 0 邏輯（#370），見 personAnalysisMapping.ts 的
  // buildPersonOutcomeSummary 註解。
  const outcomeSummary = useMemo(
    () => buildPersonOutcomeSummary(analysis?.outcomeBreakdown ?? []),
    [analysis],
  );
  // 「未填」欄要不要出現是整張表一起決定，不是逐列各自判斷——只要任一動作有
  // outcome=null 的資料，就代表這個人身上真的有一批舊資料還沒跑過回填腳本，整張表
  // 一起亮出這欄比較看得出「這裡缺資料」，逐列各自出現/消失反而讓表格欄位對不齊。
  const hasUnknownOutcome = outcomeSummary.some((row) => row.unknown > 0);

  return (
    // mode="A"：跟 CrossMatchAnalytics 一樣是「列表/彙總瀏覽」頁面模式。nav 一樣走 base
    // 變體（沒有 matchId），active="analytics" 讓左側「數」那格亮起——這頁本質上也是
    // 「數」底下的其中一種視圖，不是獨立的新入口（左側子導覽本身留給 #214 再做）。
    <AppShell
      mode="A"
      nav={
        <div className="relative z-10 h-full">
          <NavRail backHref="/" active="analytics" />
        </div>
      }
      className={APP_SHELL_CLASS}
      style={APP_BACKGROUND_STYLE}
    >
      {/* relative z-10：疊在 backdrop 的 .tb-beam 之上，理由見 TacticsBoard.tsx 的說明。 */}
      <div className="relative z-10 min-h-0 w-full flex-1 overflow-y-auto">
        <header className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-5 w-5 text-[#c6f135]" />
            數據分析 · 球員跨場分析
          </h1>
          <div className="flex items-center gap-2">
            {/* #224：人員名單管理頁的入口——這頁（視圖③）是唯讀的分析入口，改名/刪除/合併
                都不在這裡做，見 PeopleManagement.tsx 檔頭註解。 */}
            <Link href="/analytics/people/manage" className={SECONDARY_BUTTON_CLASS}>
              管理球員名單
            </Link>
            <Link href="/analytics" className={SECONDARY_BUTTON_CLASS}>
              回跨場彙總
            </Link>
          </div>
        </header>

        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          <section className={GLASS_SECTION_CLASS}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#f5f5f0]">選擇球員</h2>
              {/* 跟 CrossMatchAnalytics 的球隊篩選同一套原生 select 手接方案——頁面是深色
                  玻璃風，跟淺色的 shadcn Select 主題不合，視覺打磨留給後續／設計夥伴。 */}
              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                className="rounded-full border border-white/[0.26] bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-[#f5f5f0] outline-none transition hover:border-[#c6f135] focus:border-[#c6f135] [&>option]:bg-[#0a0b07]"
              >
                <option value="">請選擇球員</option>
                {people.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {peopleLoading ? (
              <div className="flex items-center gap-2 text-sm text-[#a9b096]">
                <Spinner className="size-4" />
                載入球員名單中…
              </div>
            ) : people.length === 0 ? (
              <p className="text-sm text-[#a9b096]">
                還沒有任何球員身分。到比賽的名單裡把某個名單列「對應」到一個人，就能在這裡看到
                他跨場的統計。
              </p>
            ) : (
              <p className="text-sm text-[#a9b096]">
                下面的統計只算「已經對應到這個人」的名單列——如果某場比賽的名單還沒關聯過來，
                那一場就不會被算進去。
              </p>
            )}
          </section>

          {/* 資料完整性的常駐說明：不管選了誰，都要老實告知這頁做不到什麼，避免使用者
              以為「少了什麼」是系統壞掉。這頁已經接上得分/失分結構（#370），還缺的是
              「比率」這個維度，不是「有沒有得失分」——這條要跟著功能一起更新，不然舊說法
              會變成誤導使用者的假話（見 CLAUDE.md 對這段的要求）。 */}
          {personId !== undefined && (
            <p className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-xs text-[#a9b096]">
              下面的得分／失分結構已經接上
              <code className="mx-1 rounded bg-white/[0.08] px-1 py-0.5">events.outcome</code>
              這個欄位（#370），但還沒有 side-out%／決定率這類「比率」統計——那需要先推導出
              「這一分開始時是誰在發球」（發球序），邏輯複雜到現在的聚合查詢還做不到，留給 #235。
            </p>
          )}

          {personId === undefined ? null : analysisLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#a9b096]">
              <Spinner className="size-4" />
              載入中…
            </div>
          ) : isError || !analysis ? (
            <p className="text-sm text-[#a9b096]">載入這個人的分析資料失敗，稍後再試一次。</p>
          ) : analysis.matchesPlayed === 0 ? (
            <section className={GLASS_SECTION_CLASS}>
              <p className="text-sm text-[#a9b096]">
                {analysis.name} 目前還沒有任何場次的名單被關聯到這個人——可能是還沒去比賽的名單裡
                把對應的名單列「對應」過來，不代表他真的一場都沒打過。
              </p>
            </section>
          ) : (
            <>
              {/* 出賽場數＋跨隊情況＋先發局數：三個一眼看完的數字卡。 */}
              <section className={GLASS_SECTION_CLASS}>
                <h2 className="mb-3 text-sm font-bold text-[#f5f5f0]">{analysis.name} · 總覽</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="text-xs text-[#a9b096]">出賽場數</div>
                    <div className="font-numeric text-2xl font-bold tabular-nums">
                      {analysis.matchesPlayed}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="text-xs text-[#a9b096]">先發局數</div>
                    <div className="font-numeric text-2xl font-bold tabular-nums">
                      {analysis.setsStarted}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="text-xs text-[#a9b096]">出賽球隊數</div>
                    <div className="font-numeric text-2xl font-bold tabular-nums">
                      {analysis.teamBreakdown.length}
                    </div>
                  </div>
                </div>
              </section>

              {/* 跨隊情況：這個人打過哪些球隊、各幾場。teamId=null 代表那些場次沒標球隊。 */}
              <section className={GLASS_SECTION_CLASS}>
                <h2 className="mb-3 text-sm font-bold text-[#f5f5f0]">跨隊情況</h2>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {analysis.teamBreakdown.map((row) => (
                    <li
                      key={row.teamId ?? "none"}
                      className="flex items-center justify-between border-b border-white/[0.06] pb-1.5 last:border-b-0 last:pb-0"
                    >
                      <span className="text-[#f5f5f0]">
                        {row.teamId != null ? (teamNameById.get(row.teamId) ?? "—") : "未分類"}
                      </span>
                      <span className="font-numeric tabular-nums text-[#a9b096]">
                        {row.matchesPlayed} 場
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* 觸球動作分布：跨場加總，固定順序＋補 0，見 buildPersonActionSummary 註解。 */}
              <section className={GLASS_SECTION_CLASS}>
                <h2 className="mb-3 text-sm font-bold text-[#f5f5f0]">觸球動作分布（跨場加總）</h2>
                <ul className="grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
                  {actionSummary.map((row) => (
                    <li
                      key={row.action}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2"
                    >
                      <div className="text-xs text-[#a9b096]">{row.label}</div>
                      <div className="font-numeric text-lg font-bold tabular-nums">{row.count}</div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* 得分／失分結構：跨場加總，同一套固定順序＋補 0，見 buildPersonOutcomeSummary
                  註解。「未填」欄只在真的有 outcome=null 的資料時才出現——固定顯示一欄
                  永遠 0 的「未填」是雜訊，不如乾脆不畫，只在真的發生時才提醒使用者這裡有
                  一批舊資料還沒補值。 */}
              <section className={GLASS_SECTION_CLASS}>
                <h2 className="mb-3 text-sm font-bold text-[#f5f5f0]">
                  得分／失分結構（跨場加總）
                </h2>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-white/[0.2]">
                      <th className="pb-1 text-left font-normal text-[#a9b096]">動作</th>
                      <th className="pb-1 text-right font-normal text-[#a9b096]">得分</th>
                      <th className="pb-1 text-right font-normal text-[#a9b096]">失分</th>
                      {hasUnknownOutcome && (
                        <th className="pb-1 text-right font-normal text-[#a9b096]">未填</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {outcomeSummary.map((row) => (
                      <tr key={row.action} className="border-b border-white/[0.06] last:border-b-0">
                        <td className="py-1.5 text-[#f5f5f0]">{row.label}</td>
                        <td className="py-1.5 text-right font-numeric tabular-nums text-[#c6f135]">
                          {row.points}
                        </td>
                        <td className="py-1.5 text-right font-numeric tabular-nums text-[#f5f5f0]">
                          {row.losses}
                        </td>
                        {hasUnknownOutcome && (
                          <td className="py-1.5 text-right font-numeric tabular-nums text-[#a9b096]">
                            {row.unknown}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {/* 各場背號與位置：一列一場，點整列導去該場的單場分析頁——跟視圖②「點整列
                  導去單場分析」的互動一致，讓三個分析頁的操作習慣統一。 */}
              <section className={GLASS_SECTION_CLASS}>
                <h2 className="mb-3 text-sm font-bold text-[#f5f5f0]">各場背號與位置</h2>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-white/[0.2]">
                      <th className="pb-1 text-left font-normal text-[#a9b096]">對手</th>
                      <th className="pb-1 text-left font-normal text-[#a9b096]">球隊</th>
                      <th className="pb-1 text-left font-normal text-[#a9b096]">日期</th>
                      <th className="pb-1 text-right font-normal text-[#a9b096]">背號</th>
                      <th className="pb-1 text-right font-normal text-[#a9b096]">位置</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.appearances.map((a) => (
                      <tr
                        key={a.playerId}
                        onClick={() => navigate(`/matches/${a.matchId}/analytics`)}
                        className="cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.05]"
                      >
                        <td className="py-1.5 font-semibold text-[#f5f5f0]">vs {a.opponent}</td>
                        <td className="py-1.5 text-[#a9b096]">
                          {a.teamId != null ? (teamNameById.get(a.teamId) ?? "—") : "未分類"}
                        </td>
                        <td className="py-1.5 text-[#a9b096]">{formatMatchDateTime(a.date)}</td>
                        {/* 背號屬於「分數、背號」規則（2026-08-07 tang 定案），從 font-numeric
                            換成 font-score，跟其他頁面的背號顯示一致。 */}
                        <td className="py-1.5 text-right font-score tabular-nums text-[#f5f5f0]">
                          #{a.number}
                        </td>
                        <td className="py-1.5 text-right text-[#f5f5f0]">{a.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
