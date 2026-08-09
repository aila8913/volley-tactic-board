import { formatMatchDateTime } from "@/lib/matchSummary";
import type { MatchFormat } from "@/lib/matchOutcome";
import type { Match } from "@/types/match";

// 右欄「比賽基本資料 ＋ 球員名單」的**唯讀**檢視（issue #329）。
//
// 這支元件刻意做成純呈現：不 import 任何 store、不呼叫任何 query，資料全由 props 決定。
// 兩個理由：
//
// 1. 跟 RotationRailPanel 同一條規矩（見該檔案開頭「刻意不 import 任何 store」那段）——右欄
//    的每一塊都只負責畫，資料從哪來是容器的事。
// 2. **這是右欄裡唯一測得動的部分**。這個專案還沒裝 @testing-library/react（issue #168），
//    元件測試只能用 renderToStaticMarkup 驗「一次性的初始渲染」（見
//    AnalyticsRotationRail.test.tsx 開頭的說明）。純元件才餵得進假資料直接渲染；一旦它自己
//    去 useTeamList()/useMatchWithRoster()，就得先架 QueryClientProvider 跟假 server，那種
//    測試在這個專案目前是做不出來的。所以「唯讀怎麼畫」這件事拆出來、測起來，編輯表單那半
//    （hook 很重）走手動驗收。
//
// teamName 由容器查好再傳進來（而不是這裡自己 useTeamList）：同上，為的就是保持純元件。
// null 代表這場比賽沒有標球隊。
interface MatchDetailViewProps {
  match: Match;
  teamName: string | null;
}

// 賽制的顯示文字。跟編輯表單那兩個 SelectItem 的文案要一致，所以抽成一份共用的對照表，
// 不在兩個地方各寫一次字串（這個 repo 已經因為「同一句話抄兩份」吃過虧，見
// lib/appChromeStyles.ts 開頭記的兩次事故）。
export const MATCH_FORMAT_LABEL: Record<MatchFormat, string> = {
  best_of_3: "三戰兩勝",
  best_of_5: "五戰三勝",
};

// 一列「標籤：值」。右欄很窄，所以標籤固定寬、值自己撐開並允許截斷。
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-12 shrink-0 text-[#9AA08C]">{label}</span>
      <span className="min-w-0 flex-1 truncate font-bold text-[#F5F5F0]">{value}</span>
    </div>
  );
}

export default function MatchDetailView({ match, teamName }: MatchDetailViewProps) {
  return (
    <div className="space-y-4 px-3 py-3">
      <section className="space-y-1.5">
        <h2 className="text-sm font-bold text-[#F5F5F0]">比賽資訊</h2>
        {/* 日期用跟左欄卡片同一支 formatMatchDateTime，不另外排一種格式——同一場比賽的時間
            在左右兩欄長得不一樣只會讓人懷疑是兩筆資料。 */}
        <InfoRow label="時間" value={formatMatchDateTime(match.dateTime)} />
        <InfoRow label="對手" value={match.opponent} />
        {/* 沒標球隊時仍然渲染這一列（顯示「未指定」）而不是整列消失：欄位固定在同一個位置，
            使用者才不用每次重新找「球隊那行跑哪去了」。 */}
        <InfoRow label="球隊" value={teamName ?? "未指定"} />
        <InfoRow label="賽制" value={MATCH_FORMAT_LABEL[match.format]} />
      </section>

      <section className="space-y-1.5">
        <h2 className="text-sm font-bold text-[#F5F5F0]">球員名單（{match.players.length}）</h2>
        {match.players.length === 0 ? (
          <p className="text-xs text-[#9AA08C]">這場比賽還沒有球員名單</p>
        ) : (
          <ul className="space-y-1">
            {match.players.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-white/[0.12]
                  bg-white/[0.03] px-2 py-1.5 text-xs"
              >
                {/* tabular-nums：背號等寬對齊，一整排數字才不會因為 1 比 8 窄而歪掉。
                    寫法跟 RotationRailPanel 球員清單那一列一致。 */}
                <span className="w-6 shrink-0 text-right font-bold tabular-nums text-[#F5F5F0]">
                  {p.number}
                </span>
                <span className="min-w-0 flex-1 truncate text-[#F5F5F0]">{p.name}</span>
                <span className="shrink-0 text-micro text-[#9AA08C]">{p.role}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
