import { Link } from 'wouter';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Match } from '@/types/match';

interface MatchCardProps {
  match: Match;
  onEdit: () => void;
  onDelete: () => void;
}

// 抽出來給首頁（最上層的單場比賽）跟資料夾內頁共用，避免同一張卡片的 JSX 重複寫兩次。
export default function MatchCard({ match, onEdit, onDelete }: MatchCardProps) {
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
        <p className="text-sm text-muted-foreground">{match.players.length} 位球員</p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button asChild variant="outline">
          <Link href={`/matches/${match.id}/board`}>戰術板</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/matches/${match.id}/record`}>紀錄</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
