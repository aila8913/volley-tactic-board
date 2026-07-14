import { useState } from "react";
import { useLocation } from "wouter";
import { Folder, Pencil, Trash2, Plus } from "lucide-react";
import { useMatchList, useDeleteMatch } from "@/hooks/useMatches";
import { useTournaments } from "@/hooks/useTournaments";
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
  const tournaments = useTournaments((state) => state.tournaments);
  const deleteTournament = useTournaments((state) => state.deleteTournament);

  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [tournamentDialogOpen, setTournamentDialogOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  // 跟作業系統的資料夾一致：單擊只是選取（用來標示「目前點到哪個」），雙擊才真的進去——
  // 不然每次手滑點到資料夾就直接跳轉，很容易誤觸。
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

  // 已知資料夾的 id 集合。比賽存在後端 DB、資料夾卻只存在這台裝置的 localStorage，
  // 兩者是「兩層真相來源」（見 #117）：換裝置/清 storage 後，比賽的 tournamentId 會指向
  // 一個本機根本沒有的資料夾。用 Set 而不是每次 .some()，是為了讓下面的 filter 從 O(n²) 降到 O(n)。
  const tournamentIds = new Set(tournaments.map((t) => t.id));

  // 「最上層」= 沒有 tournamentId（舊版資料，undefined 走 falsy）＋ tournamentId 對不到任何已知資料夾
  // 的「孤兒」比賽。後者是 #117 的止血重點：以前只判斷 !m.tournamentId，孤兒比賽會被首頁濾掉、
  // 資料夾卡片又渲染不出來 → 資料無聲消失。fallback 到最上層讓它至少可達（正解＝後端建 tournaments 表）。
  const topLevelMatches = matches.filter(
    (m) => !m.tournamentId || !tournamentIds.has(m.tournamentId),
  );

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

  // 刪資料夾要連同裡面的比賽一起刪，不然會留下「孤兒」比賽——tournamentId 指到一個
  // 已經不存在的資料夾，沒有任何畫面會再顯示它，但資料還留在 localStorage 裡。
  const handleDeleteTournament = (tournament: Tournament) => {
    const matchesInside = matches.filter((m) => m.tournamentId === tournament.id);
    const message =
      matchesInside.length > 0
        ? `這個資料夾裡還有 ${matchesInside.length} 場比賽，確定要連同這些比賽一起刪除嗎？`
        : "確定要刪除這個資料夾嗎？";
    if (window.confirm(message)) {
      // 先把資料夾裡的比賽逐一刪掉（各自送 DELETE），全部完成後再刪本地的資料夾記錄。
      void Promise.all(matchesInside.map((m) => deleteMatch(Number(m.id)))).then(() => {
        deleteTournament(tournament.id);
      });
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0b07] font-dash text-[#f5f5f0]">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-badge text-2xl font-black">比賽列表</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openCreateTournamentDialog}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/[0.26]
                px-5 text-[13px] font-semibold text-[#f5f5f0] transition hover:border-[#c6f135]
                hover:text-[#c6f135]"
            >
              <Plus className="h-[15px] w-[15px]" />
              新增資料夾
            </button>
            <button
              type="button"
              onClick={openCreateMatchDialog}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#c6f135] px-5 text-[13px]
                font-semibold text-[#0a0b07] transition hover:brightness-110"
            >
              <Plus className="h-[15px] w-[15px]" />
              新增比賽
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-white/[0.12] bg-white/[0.07] py-12 text-center text-[#a9b096] backdrop-blur-md">
            載入中…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/[0.12] bg-white/[0.07] py-12 text-center backdrop-blur-md">
            <p className="text-[#a9b096]">尚未建立任何比賽或資料夾</p>
            <button
              type="button"
              onClick={openCreateMatchDialog}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#c6f135] px-5 text-[13px]
                font-semibold text-[#0a0b07] transition hover:brightness-110"
            >
              新增第一場比賽
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) =>
              item.kind === "tournament" ? (
                <article
                  key={item.data.id}
                  onClick={() => setSelectedTournamentId(item.data.id)}
                  onDoubleClick={() => navigate(`/tournaments/${item.data.id}`)}
                  className={`relative flex cursor-pointer select-none flex-col rounded-2xl border
                    bg-white/[0.07] p-5 shadow-lg shadow-black/35 backdrop-blur-md transition ${
                      selectedTournamentId === item.data.id
                        ? "border-[#c6f135]/70"
                        : "border-white/[0.12]"
                    }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-xl bg-[#c6f135]/15 text-[#c6f135]">
                        <Folder className="h-[19px] w-[19px]" />
                      </span>
                      <div>
                        <h2 className="font-badge text-[17px] font-black">{item.data.name}</h2>
                        <p className="text-xs text-[#a9b096]">
                          {matches.filter((m) => m.tournamentId === item.data.id).length} 場比賽
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label="編輯資料夾"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditTournamentDialog(item.data);
                        }}
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-full
                          text-[#a9b096] transition hover:bg-white/[0.12] hover:text-[#f5f5f0]"
                      >
                        <Pencil className="h-[15px] w-[15px]" />
                      </button>
                      <button
                        type="button"
                        aria-label="刪除資料夾"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTournament(item.data);
                        }}
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-full
                          text-[#a9b096] transition hover:bg-[#ef4444]/15 hover:text-[#ef4444]"
                      >
                        <Trash2 className="h-[15px] w-[15px]" />
                      </button>
                    </div>
                  </div>
                </article>
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
