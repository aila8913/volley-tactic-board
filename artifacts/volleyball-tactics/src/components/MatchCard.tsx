import { Link } from "wouter";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Match } from "@/types/match";
import { useRoster } from "@/hooks/useMatches";

interface MatchCardProps {
  match: Match;
  onEdit: () => void;
  onDelete: () => void;
}

// 抽出來給首頁（最上層的單場比賽）跟資料夾內頁共用，避免同一張卡片的 JSX 重複寫兩次。
export default function MatchCard({ match, onEdit, onDelete }: MatchCardProps) {
  // 列表傳進來的 match 不含名單（避免列表 N+1 一次撈全部），所以卡片自己抓自己這場的名單來顯示人數。
  // 每張卡各一個查詢，React Query 會平行送並各自快取。
  const { players } = useRoster(Number(match.id));
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>vs {match.opponent}</CardTitle>
          <CardDescription>{new Date(match.dateTime).toLocaleString()}</CardDescription>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{players.length} 位球員</p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button asChild variant="outline">
          <Link href={`/matches/${match.id}/board`}>戰術板</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/matches/${match.id}/record`}>計分表</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/matches/${match.id}/analytics`}>數據</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
