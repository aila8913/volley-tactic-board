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
        <Link
          href={`/matches/${match.id}/board`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.26] px-3 py-2
            text-[13px] font-semibold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]"
        >
          <LayoutGrid className="h-4 w-4" />
          戰術板
        </Link>
        <Link
          href={`/matches/${match.id}/record`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.26] px-3 py-2
            text-[13px] font-semibold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]"
        >
          <ClipboardList className="h-4 w-4" />
          計分表
        </Link>
        <Link
          href={`/matches/${match.id}/analytics`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.26] px-3 py-2
            text-[13px] font-semibold text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]"
        >
          <BarChart3 className="h-4 w-4" />
          數據
        </Link>
      </div>
    </article>
  );
}
