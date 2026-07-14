import { Link } from "wouter";
import {
  Pencil,
  Trash2,
  Calendar,
  Users,
  LayoutGrid,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import { Match } from "@/types/match";
import { useRoster } from "@/hooks/useMatches";

interface MatchCardProps {
  match: Match;
  onEdit: () => void;
  onDelete: () => void;
}

// 卡片底部三個操作連結共用同一套樣式，抽成資料 + map 避免同一段 class 字串複製三份
// ——以後要調整 hover 顏色之類的樣式，改這裡一個地方就好。
const ACTION_LINK_CLASS =
  "inline-flex items-center gap-1.5 rounded-xl border border-white/[0.26] px-3 py-2 text-[13px] " +
  "font-semibold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]";

function actionLinks(matchId: string) {
  return [
    { href: `/matches/${matchId}/board`, icon: LayoutGrid, label: "戰術板" },
    { href: `/matches/${matchId}/record`, icon: ClipboardList, label: "計分表" },
    { href: `/matches/${matchId}/analytics`, icon: BarChart3, label: "數據" },
  ];
}

// datetime-local 字串（無時區，見 types/match.ts）轉成卡片要的「07/14（二）19:00」格式。
function formatMatchDateTime(dateTime: string): string {
  const d = new Date(dateTime);
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${weekday}）${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 抽出來給首頁（最上層的單場比賽）跟資料夾內頁共用，避免同一張卡片的 JSX 重複寫兩次。
export default function MatchCard({ match, onEdit, onDelete }: MatchCardProps) {
  // 列表傳進來的 match 不含名單（避免列表 N+1 一次撈全部），所以卡片自己抓自己這場的名單來顯示人數。
  // 每張卡各一個查詢，React Query 會平行送並各自快取。
  const { players } = useRoster(Number(match.id));

  return (
    <article
      className="relative flex flex-col rounded-2xl border border-white/[0.12] bg-white/[0.07] p-5
        font-dash text-[#f5f5f0] shadow-lg shadow-black/35 backdrop-blur-md"
    >
      <div className="mb-3 flex items-start justify-between gap-2.5">
        <div>
          <h2 className="font-badge text-lg font-black leading-tight">vs {match.opponent}</h2>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-[13px] tabular-nums text-[#a9b096]">
            <Calendar className="h-[13px] w-[13px] flex-shrink-0" />
            {formatMatchDateTime(match.dateTime)}
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-1">
          <button
            type="button"
            aria-label="編輯比賽"
            onClick={onEdit}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-[#a9b096]
              transition hover:bg-white/[0.12] hover:text-[#f5f5f0]"
          >
            <Pencil className="h-[15px] w-[15px]" />
          </button>
          <button
            type="button"
            aria-label="刪除比賽"
            onClick={onDelete}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-[#a9b096]
              transition hover:bg-[#ef4444]/15 hover:text-[#ef4444]"
          >
            <Trash2 className="h-[15px] w-[15px]" />
          </button>
        </div>
      </div>

      <p className="mb-4 flex items-center gap-1.5 text-sm text-[#a9b096]">
        <Users className="h-[14px] w-[14px] flex-shrink-0" />
        {players.length} 位球員
      </p>

      <div className="flex gap-2">
        {actionLinks(match.id).map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} className={ACTION_LINK_CLASS}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>
    </article>
  );
}
