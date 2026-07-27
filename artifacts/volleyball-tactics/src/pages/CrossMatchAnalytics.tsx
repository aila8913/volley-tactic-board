// 分析頁「視圖②：跨場彙總」（#65 M2）。跟 MatchAnalytics.tsx（視圖一：單場分析）不同，
// 這頁不掛在某一個 matchId 底下，而是回頭一次看這個使用者所有比賽的摘要——解決的是
// MatchList.tsx 首頁卡片「3:0 勝」目前讀本機 store、沒開過的比賽顯示「尚未開賽」的
// fan-out 問題（見該檔案 matchResultText 附近的註解）：後端 GET /analysis/matches 一次把
// 「每場的摘要」在 DB 層算好，這頁只要發一支請求就能列出全部場次，不必逐場再各發一輪
// sets/rallies 請求。
//
// 這是最小可用版本：一張表、每列可點進去單場分析頁，先求「能一覽多場」，視覺打磨（表格
// 排版、篩選、排序等）留給之後迭代／設計夥伴接手，不在這一輪的範圍內。
import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { BarChart3 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import AppShell from "@/components/AppShell";
import NavRail from "@/components/NavRail";
import { useCrossMatchAnalysis } from "@/hooks/useCrossMatchAnalysis";
import { useTeamList } from "@/hooks/useTeams";
import { formatMatchDateTime } from "@/lib/matchSummary";

// 球隊篩選的兩個特殊值：全部場次、以及「未分類」（teamId 為 null 的場）。其餘就是球隊 id。
const TEAM_FILTER_ALL = "all";
const TEAM_FILTER_NONE = "none";

// 跟 MatchAnalytics.tsx 同一套「回列表」次要按鈕語言（不透過 shadcn Button，那套元件的
// 顏色綁在給淺色頁面用的 CSS 變數上，見該檔案同名常數的註解）。
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-white/[0.26] " +
  "bg-white/[0.05] px-5 py-2 text-sm font-bold text-[#f5f5f0] transition " +
  "hover:border-[#c6f135] hover:text-[#c6f135]";

const GLASS_SECTION_CLASS =
  "rounded-2xl border border-white/[0.12] bg-white/[0.07] p-4 shadow-lg shadow-black/35 backdrop-blur-md";

export default function CrossMatchAnalytics() {
  const [, navigate] = useLocation();
  const { summaries, isLoading } = useCrossMatchAnalysis();
  const { teams } = useTeamList();

  // 球隊 id → 名稱，讓每列能顯示球隊名（摘要只帶 teamId 整數，不帶名稱）。
  const teamNameById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

  // 目前選的球隊篩選（預設「全部」）。
  const [teamFilter, setTeamFilter] = useState<string>(TEAM_FILTER_ALL);

  // 依篩選挑出要顯示的場次。用 useMemo 避免每次 render 都重算一遍整個陣列。
  const visibleSummaries = useMemo(() => {
    if (teamFilter === TEAM_FILTER_ALL) return summaries;
    if (teamFilter === TEAM_FILTER_NONE) return summaries.filter((m) => m.teamId == null);
    const id = Number(teamFilter);
    return summaries.filter((m) => m.teamId === id);
  }, [summaries, teamFilter]);

  return (
    // mode="A"（列表瀏覽）：這頁本質上是一張「比賽摘要列表」，跟 MatchList 同一種版面模式。
    // nav：帶上全站共用導覽軌，讓「數」這格在紀錄本頁也常駐、且標成 active——PO 定案數據分析
    // 要像戰術板一樣「隨時翻得開」，所以它自己也要有那條可以再翻去別頁的軌（沒有 matchId，
    // 所以 NavRail 走 base 變體、計/戰/出照樣灰掉；「數」因為永遠可到而亮起）。aside 仍不傳
    // ——右欄目前的內容都綁在單一比賽/資料夾情境，這頁沒有那種情境，硬湊反而沒意義。
    <AppShell
      mode="A"
      nav={<NavRail backHref="/" active="analytics" />}
      className="bg-[#0a0b07] font-dash text-[#f5f5f0]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(245,245,240,0.035) 0 1px, transparent 1px 28px)," +
          "repeating-linear-gradient(-45deg, rgba(245,245,240,0.035) 0 1px, transparent 1px 28px)",
      }}
    >
      <div className="min-h-0 w-full flex-1 overflow-y-auto">
        <header className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <BarChart3 className="h-5 w-5 text-[#c6f135]" />
            數據分析 · 跨場彙總
          </h1>
          <div className="flex items-center gap-2">
            {/* 往「視圖③：球員跨場分析」(#213) 的入口——跟這頁（視圖②：跨場彙總）是
                平級的兩種聚合視角，一個以「場」為單位、一個以「人」為單位。左側子導覽
                （比賽/球員/隊伍分析）留給 #214 再做，這裡先給一顆按鈕當入口。 */}
            <Link href="/analytics/people" className={SECONDARY_BUTTON_CLASS}>
              球員分析
            </Link>
            {/* 這頁不強求完整導覽軌（見上方 AppShell 註解），至少留一條回列表的路。 */}
            <Link href="/" className={SECONDARY_BUTTON_CLASS}>
              回比賽列表
            </Link>
          </div>
        </header>

        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          <section className={GLASS_SECTION_CLASS}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#f5f5f0]">各場比賽摘要</h2>
              {/* 球隊篩選。頁面是刻意的深色玻璃風、跟淺色的 shadcn Select 主題不合，這裡先用
                  一個輕量的原生 select 手接篩選，視覺打磨留給後續／設計夥伴。 */}
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="rounded-full border border-white/[0.26] bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-[#f5f5f0] outline-none transition hover:border-[#c6f135] focus:border-[#c6f135] [&>option]:bg-[#0a0b07]"
              >
                <option value={TEAM_FILTER_ALL}>全部球隊</option>
                {teams.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
                <option value={TEAM_FILTER_NONE}>未分類</option>
              </select>
            </div>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-[#a9b096]">
                <Spinner className="size-4" />
                載入中…
              </div>
            ) : summaries.length === 0 ? (
              <p className="text-sm text-[#a9b096]">還沒有任何比賽記錄。</p>
            ) : visibleSummaries.length === 0 ? (
              <p className="text-sm text-[#a9b096]">這個球隊底下還沒有比賽。</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-white/[0.2]">
                    <th className="pb-1 text-left font-normal text-[#a9b096]">對手</th>
                    <th className="pb-1 text-left font-normal text-[#a9b096]">球隊</th>
                    <th className="pb-1 text-left font-normal text-[#a9b096]">日期</th>
                    <th className="pb-1 text-right font-normal text-[#a9b096]">局數</th>
                    <th className="pb-1 text-right font-normal text-[#a9b096]">得分:失分</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSummaries.map((m) => (
                    <tr
                      key={m.matchId}
                      // 點整列導去既有的單場分析頁（視圖一），這頁只負責「一覽多場、挑一場」，
                      // 細節統計仍由 MatchAnalytics.tsx 負責，不重複刻一份。
                      onClick={() => navigate(`/matches/${m.matchId}/analytics`)}
                      className="cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.05]"
                    >
                      <td className="py-1.5 font-semibold text-[#f5f5f0]">vs {m.opponent}</td>
                      <td className="py-1.5 text-[#a9b096]">
                        {m.teamId != null ? (teamNameById.get(m.teamId) ?? "—") : "未分類"}
                      </td>
                      <td className="py-1.5 text-[#a9b096]">{formatMatchDateTime(m.date)}</td>
                      <td className="py-1.5 text-right font-numeric tabular-nums text-[#f5f5f0]">
                        {m.setsPlayed}
                      </td>
                      <td className="py-1.5 text-right font-numeric tabular-nums text-[#f5f5f0]">
                        {m.ourPoints}:{m.opponentPoints}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
