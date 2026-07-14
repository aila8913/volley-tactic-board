import { useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import BackToMatchListButton from "@/components/BackToMatchListButton";
import { useMatchList, useDeleteMatch } from "@/hooks/useMatches";
import { useTournamentList } from "@/hooks/useTournaments";
import MatchFormDialog from "@/components/MatchFormDialog";
import MatchCard from "@/components/MatchCard";
import { Match } from "@/types/match";

// 資料夾的內頁——只顯示歸在這個資料夾底下的比賽 (tournamentId 等於這個資料夾的 id)。
export default function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  // 資料夾現在也來自 API（#117）。isLoading 要留著：載入完成前 find 會回 undefined，
  // 若不區分「還在載」和「真的找不到」，進頁會先閃一下「找不到這個資料夾」。
  const { tournaments, isLoading: tournamentsLoading } = useTournamentList();
  const tournament = tournaments.find((t) => t.id === id);
  // 比賽列表現在來自 API（useMatchList），這裡在 render 裡 filter 出屬於這個資料夾的比賽。
  const { matches: allMatches } = useMatchList();
  const matches = allMatches.filter((m) => m.tournamentId === id);
  const deleteMatch = useDeleteMatch();

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

  const handleDelete = (matchId: string) => {
    if (window.confirm("確定要刪除這場比賽嗎？")) {
      void deleteMatch(Number(matchId));
    }
  };

  // 還在載資料夾時先別下「找不到」的定論，避免閃錯誤訊息。
  if (tournamentsLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white text-muted-foreground">
        載入中…
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-muted-foreground">找不到這個資料夾。</p>
        <BackToMatchListButton />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <BackToMatchListButton className="mb-4 -ml-2" />

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <Button onClick={openCreateDialog}>新增比賽</Button>
        </div>

        {matches.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-muted-foreground">這個資料夾裡還沒有比賽</p>
              <Button onClick={openCreateDialog}>新增第一場比賽</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onEdit={() => openEditDialog(match)}
                onDelete={() => handleDelete(match.id)}
              />
            ))}
          </div>
        )}
      </div>

      <MatchFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        match={editingMatch}
        tournamentId={tournament.id}
      />
    </div>
  );
}
