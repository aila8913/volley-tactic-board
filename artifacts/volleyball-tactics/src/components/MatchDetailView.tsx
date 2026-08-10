import { formatMatchDateTime } from "@/lib/matchSummary";
import type { MatchFormat } from "@/lib/matchOutcome";
import type { Match } from "@/types/match";

// 右欄「比賽基本資料」的**唯讀**檢視（issue #329）。
//
// 這裡原本還畫了一份球員名單，PO 2026-08-09 拿掉了：RotationRailPanel 底下本來就有一份
// 球員清單（拖上場用的那份），同一份名單在同一欄裡畫兩次，右欄那點寬度根本吃不消。
// 合併之後名單只剩下面那一份，它同時扮演「這場比賽有誰」跟「把誰拖上場」——不編輯時
// 就是站位的來源清單，按了編輯才換成 MatchDetailForm 的可增刪版本。
//
// 這支元件刻意做成純呈現：不 import 任何 store、不呼叫任何 query，資料全由 props 決定。
// 兩個理由：
//
// 1. 跟 RotationRailPanel 同一條規矩（見該檔案開頭「刻意不 import 任何 store」那段）——右欄
//    的每一塊都只負責畫，資料從哪來是容器的事。
// 2. **純元件最好測**。純元件餵得進假資料就直接渲染（MatchDetailView.test.tsx 用
//    renderToStaticMarkup 就寫得完）；一旦它自己去 useTeamList()/useMatchWithRoster()，
//    測試就得先架 QueryClientProvider、再把那些 hook 一支支 mock 掉——#168 之後這件事做得到了
//    （見 MatchInfoRail.test.tsx），但成本仍然明顯高一截，而且 mock 越多、測到的真東西越少。
//    所以「唯讀怎麼畫」這件事拆出來、測起來，編輯表單那半（hook 很重）走手動驗收。
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
    </div>
  );
}
