// 分析頁「視圖②：跨場彙總」（#65 M2）。跟 MatchAnalytics.tsx（視圖一：單場分析）不同，
// 這頁不掛在某一個 matchId 底下，而是回頭一次看這個使用者所有比賽的摘要——解決的是
// MatchList.tsx 首頁卡片「3:0 勝」目前讀本機 store、沒開過的比賽顯示「尚未開賽」的
// fan-out 問題（見該檔案 matchResultText 附近的註解）：後端 GET /analysis/matches 一次把
// 「每場的摘要」在 DB 層算好，這頁只要發一支請求就能列出全部場次，不必逐場再各發一輪
// sets/rallies 請求。
//
// 這是最小可用版本：一張表、每列可點進去單場分析頁，先求「能一覽多場」，視覺打磨（表格
// 排版、篩選、排序等）留給之後迭代／設計夥伴接手，不在這一輪的範圍內。
import { useLocation, Link } from "wouter";
import { BarChart3 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import AppShell from "@/components/AppShell";
import { useCrossMatchAnalysis } from "@/hooks/useCrossMatchAnalysis";
import { formatMatchDateTime } from "@/lib/matchSummary";

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

  return (
    // mode="A"（列表瀏覽）：這頁本質上是一張「比賽摘要列表」，跟 MatchList 同一種版面模式。
    // 不傳 nav/aside——最小可用先不硬湊左右欄插槽（那兩欄目前的內容都是綁在單一比賽/資料夾
    // 情境設計的，這頁沒有那種情境），之後要不要補齊完整導覽軌留給後續迭代決定。
    <AppShell
      mode="A"
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
          {/* 這頁不強求完整導覽軌（見上方 AppShell 註解），至少留一條回列表的路。 */}
          <Link href="/" className={SECONDARY_BUTTON_CLASS}>
            回比賽列表
          </Link>
        </header>

        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          <section className={GLASS_SECTION_CLASS}>
            <h2 className="mb-3 text-sm font-bold text-[#f5f5f0]">各場比賽摘要</h2>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-[#a9b096]">
                <Spinner className="size-4" />
                載入中…
              </div>
            ) : summaries.length === 0 ? (
              <p className="text-sm text-[#a9b096]">還沒有任何比賽記錄。</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-white/[0.2]">
                    <th className="pb-1 text-left font-normal text-[#a9b096]">對手</th>
                    <th className="pb-1 text-left font-normal text-[#a9b096]">日期</th>
                    <th className="pb-1 text-right font-normal text-[#a9b096]">局數</th>
                    <th className="pb-1 text-right font-normal text-[#a9b096]">得分:失分</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((m) => (
                    <tr
                      key={m.matchId}
                      // 點整列導去既有的單場分析頁（視圖一），這頁只負責「一覽多場、挑一場」，
                      // 細節統計仍由 MatchAnalytics.tsx 負責，不重複刻一份。
                      onClick={() => navigate(`/matches/${m.matchId}/analytics`)}
                      className="cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.05]"
                    >
                      <td className="py-1.5 font-semibold text-[#f5f5f0]">vs {m.opponent}</td>
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
