import { useState } from "react";
import { useLocation } from "wouter";
import { Folder, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useMatchList, useDeleteMatch } from "@/hooks/useMatches";
import { useTournamentList, useDeleteTournament } from "@/hooks/useTournaments";
import MatchFormDialog from "@/components/MatchFormDialog";
import TournamentFormDialog from "@/components/TournamentFormDialog";
import MatchCard from "@/components/MatchCard";
import { Match } from "@/types/match";
import { Tournament } from "@/types/tournament";

// 首頁是「資料夾」(Tournament) 跟「最上層的單場比賽」混在一起的列表，
// 用 kind 標記要哪種卡片渲染方式，依 createdAt 排序讓兩種項目可以交錯顯示。
type RootItem = { kind: "tournament"; data: Tournament } | { kind: "match"; data: Match };

export default function MatchList() {
  const [, navigate] = useLocation();
  const { matches, isLoading } = useMatchList();
  const deleteMatch = useDeleteMatch();
  // 資料夾現在也來自 API（#117），不再是本機 localStorage store。
  const { tournaments } = useTournamentList();
  const deleteTournament = useDeleteTournament();

  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [tournamentDialogOpen, setTournamentDialogOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  // 跟作業系統的資料夾一致：單擊只是選取（用來標示「目前點到哪個」），雙擊才真的進去——
  // 不然每次手滑點到資料夾就直接跳轉，很容易誤觸。
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

  // 「最上層」比賽 = 沒有歸到任何資料夾（tournamentId 為 null）。
  // #117 修好後這裡回到單純判斷 !m.tournamentId：資料夾已進 DB、tournamentId 是帶 cascade 的
  // 外鍵，資料庫保證它「要嘛 null、要嘛指向真實存在的資料夾」，不可能再出現指向不存在資料夾的
  // 孤兒比賽——所以 #122 那段「對不到資料夾就 fallback 到最上層」的止血碼可以拿掉了。
  const topLevelMatches = matches.filter((m) => !m.tournamentId);

  const items: RootItem[] = [
    ...tournaments.map((t): RootItem => ({ kind: "tournament", data: t })),
    ...topLevelMatches.map((m): RootItem => ({ kind: "match", data: m })),
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
    if (window.confirm("確定要刪除這場比賽嗎？")) {
      // id 是 domain 的字串 id（＝後端 serial 整數的字串形式），送 API 前轉回數字。
      void deleteMatch(Number(id));
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

  // 刪資料夾＝連同裡面的比賽一起刪（PO 拍板）。#117 後這是 DB 外鍵 onDelete: "cascade" 一次做到：
  // 前端只要送一個 DELETE /tournaments/:id，資料庫就會自動把資料夾底下的比賽一併清掉，不必再
  // 手動逐場 deleteMatch。useDeleteTournament 內部會 invalidate 比賽列表，讓被連帶刪掉的卡片消失。
  // 這裡仍算一下裡面有幾場比賽，只是為了在確認框提醒使用者「會連同這些一起刪」。
  const handleDeleteTournament = (tournament: Tournament) => {
    const matchesInside = matches.filter((m) => m.tournamentId === tournament.id);
    const message =
      matchesInside.length > 0
        ? `這個資料夾裡還有 ${matchesInside.length} 場比賽，確定要連同這些比賽一起刪除嗎？`
        : "確定要刪除這個資料夾嗎？";
    if (window.confirm(message)) {
      void deleteTournament(tournament.id);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">比賽列表</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openCreateTournamentDialog}>
              新增資料夾
            </Button>
            <Button onClick={openCreateMatchDialog}>新增比賽</Button>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">載入中…</CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-muted-foreground">尚未建立任何比賽或資料夾</p>
              <Button onClick={openCreateMatchDialog}>新增第一場比賽</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) =>
              item.kind === "tournament" ? (
                <Card
                  key={item.data.id}
                  className={
                    selectedTournamentId === item.data.id ? "ring-2 ring-primary" : undefined
                  }
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditTournamentDialog(item.data)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTournament(item.data)}
                      >
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
              ),
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
