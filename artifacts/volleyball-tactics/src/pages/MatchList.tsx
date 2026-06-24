import { useState } from 'react';
import { Link } from 'wouter';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useMatches } from '@/hooks/useMatches';
import MatchFormDialog from '@/components/MatchFormDialog';
import { Match } from '@/types/match';

export default function MatchList() {
  const matches = useMatches((state) => state.matches);
  const deleteMatch = useMatches((state) => state.deleteMatch);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);

  const openCreateDialog = () => {
    setEditingMatch(null);
    setDialogOpen(true);
  };

  const openEditDialog = (match: Match) => {
    setEditingMatch(match);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('確定要刪除這場比賽嗎？')) {
      deleteMatch(id);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">比賽列表</h1>
          <Button onClick={openCreateDialog}>新增比賽</Button>
        </div>

        {matches.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-muted-foreground">尚未建立任何比賽</p>
              <Button onClick={openCreateDialog}>新增第一場比賽</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <Card key={match.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle>{match.name}</CardTitle>
                    <CardDescription>
                      vs {match.opponent} · {new Date(match.dateTime).toLocaleString()}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(match)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(match.id)}>
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
            ))}
          </div>
        )}
      </div>

      <MatchFormDialog open={dialogOpen} onOpenChange={setDialogOpen} match={editingMatch} />
    </div>
  );
}
