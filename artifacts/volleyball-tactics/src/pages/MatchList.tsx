import { useState } from 'react';
import { useLocation } from 'wouter';
import { Folder, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useMatches } from '@/hooks/useMatches';
import { useTournaments } from '@/hooks/useTournaments';
import MatchFormDialog from '@/components/MatchFormDialog';
import TournamentFormDialog from '@/components/TournamentFormDialog';
import MatchCard from '@/components/MatchCard';
import { Match } from '@/types/match';
import { Tournament } from '@/types/tournament';

// 首頁是「資料夾」(Tournament) 跟「最上層的單場比賽」混在一起的列表，
// 用 kind 標記要哪種卡片渲染方式，依 createdAt 排序讓兩種項目可以交錯顯示。
type RootItem = { kind: 'tournament'; data: Tournament } | { kind: 'match'; data: Match };

export default function MatchList() {
  const [, navigate] = useLocation();
  const matches = useMatches((state) => state.matches);
  const deleteMatch = useMatches((state) => state.deleteMatch);
  const tournaments = useTournaments((state) => state.tournaments);
  const deleteTournament = useTournaments((state) => state.deleteTournament);

  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [tournamentDialogOpen, setTournamentDialogOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  // 跟作業系統的資料夾一致：單擊只是選取（用來標示「目前點到哪個」），雙擊才真的進去——
  // 不然每次手滑點到資料夾就直接跳轉，很容易誤觸。
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

  // !m.tournamentId 而不是 === null：舊版資料（改版前存進 localStorage 的比賽）根本沒有
  // tournamentId 這個欄位，讀出來是 undefined，用 falsy 判斷一樣會被當成「最上層」，不用特別寫遷移邏輯。
  const topLevelMatches = matches.filter((m) => !m.tournamentId);

  const items: RootItem[] = [
    ...tournaments.map((t): RootItem => ({ kind: 'tournament', data: t })),
    ...topLevelMatches.map((m): RootItem => ({ kind: 'match', data: m })),
  ].sort((a, b) => a.data.createdAt.localeCompare(b.data.createdAt));

  const openCreateMatchDialog = () => {
    setEditingMatch(null);
    setMatchDialogOpen(true);
  };

  const openEditMatchDialog = (match: Match) => {
    setEditingMatch(match);
    setMatchDialogOpen(true);
  };

  const handleDeleteMatch = (id: string) => {
    if (window.confirm('確定要刪除這場比賽嗎？')) {
      deleteMatch(id);
    }
  };

  const openCreateTournamentDialog = () => {
    setEditingTournament(null);
    setTournamentDialogOpen(true);
  };

  const openEditTournamentDialog = (tournament: Tournament) => {
    setEditingTournament(tournament);
    setTournamentDialogOpen(true);
  };

  // 刪資料夾要連同裡面的比賽一起刪，不然會留下「孤兒」比賽——tournamentId 指到一個
  // 已經不存在的資料夾，沒有任何畫面會再顯示它，但資料還留在 localStorage 裡。
  const handleDeleteTournament = (tournament: Tournament) => {
    const matchesInside = matches.filter((m) => m.tournamentId === tournament.id);
    const message = matchesInside.length > 0
      ? `這個資料夾裡還有 ${matchesInside.length} 場比賽，確定要連同這些比賽一起刪除嗎？`
      : '確定要刪除這個資料夾嗎？';
    if (window.confirm(message)) {
      matchesInside.forEach((m) => deleteMatch(m.id));
      deleteTournament(tournament.id);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">比賽列表</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openCreateTournamentDialog}>新增資料夾</Button>
            <Button onClick={openCreateMatchDialog}>新增比賽</Button>
          </div>
        </div>

        {items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-muted-foreground">尚未建立任何比賽或資料夾</p>
              <Button onClick={openCreateMatchDialog}>新增第一場比賽</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) =>
              item.kind === 'tournament' ? (
                <Card
                  key={item.data.id}
                  className={selectedTournamentId === item.data.id ? 'ring-2 ring-primary' : undefined}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div
                      className="flex flex-1 cursor-pointer select-none items-center gap-2"
                      onClick={() => setSelectedTournamentId(item.data.id)}
                      onDoubleClick={() => navigate(`/tournaments/${item.data.id}`)}
                    >
                      <Folder className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <CardTitle>{item.data.name}</CardTitle>
                        <CardDescription>
                          {matches.filter((m) => m.tournamentId === item.data.id).length} 場比賽
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditTournamentDialog(item.data)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteTournament(item.data)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ) : (
                <MatchCard
                  key={item.data.id}
                  match={item.data}
                  onEdit={() => openEditMatchDialog(item.data)}
                  onDelete={() => handleDeleteMatch(item.data.id)}
                />
              )
            )}
          </div>
        )}
      </div>

      <MatchFormDialog
        open={matchDialogOpen}
        onOpenChange={setMatchDialogOpen}
        match={editingMatch}
        tournamentId={null}
      />
      <TournamentFormDialog
        open={tournamentDialogOpen}
        onOpenChange={setTournamentDialogOpen}
        tournament={editingTournament}
      />
    </div>
  );
}
