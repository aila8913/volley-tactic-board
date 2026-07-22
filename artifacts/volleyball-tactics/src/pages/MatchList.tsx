import { useState } from "react";
import { useLocation } from "wouter";
import { Folder, Pencil, Trash2, Plus } from "lucide-react";
import { useMatchList, useDeleteMatch } from "@/hooks/useMatches";
import { useTournamentList, useDeleteTournament } from "@/hooks/useTournaments";
import MatchFormDialog from "@/components/MatchFormDialog";
import TournamentFormDialog from "@/components/TournamentFormDialog";
import MatchCard from "@/components/MatchCard";
import AppShell from "@/components/AppShell";
import MatchNavRail from "@/components/MatchNavRail";
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
    // issue #172：三欄骨架交給 AppShell，這裡只負責「這一頁的視覺」（背景）跟「這一頁要塞進
    // 哪些插槽」。mode="A"（列表瀏覽）、nav 是共用導覽軌（沒有 matchId——這頁本來就不屬於
    // 任何一場比賽，MatchNavRail 會把「計/數/戰」渲染成停用態）、不傳 aside——右欄資訊欄的
    // 內容是環 3（#174）的事，這一環還沒有東西可以放，讓右欄整個消失比硬渲染一片空欄更誠實。
    //
    // 純色背景會讓 backdrop-blur 白忙一場（模糊純色還是同一個純色，卡片的玻璃感其實沒有真的
    // 產生）。這裡疊一層很淡的斜線網格當「球網紋理」，讓 blur 有東西可以模糊，也呼應排球主題
    // （PR #129 review 建議：docs/design-spec.md 第 4 節寫的玻璃質感本來就是設計給疊在有內容
    // 的背景上用的）。這些 class/style 以前掛在最外層 div 上，現在原樣搬到 AppShell 的
    // className/style——AppShell 自己的 h-screen 已經接手了原本 min-h-screen 的角色。
    <AppShell
      mode="A"
      nav={<MatchNavRail backHref="/" active="list" />}
      className="bg-[#0a0b07] font-dash text-[#f5f5f0]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(245,245,240,0.035) 0 1px, transparent 1px 28px)," +
          "repeating-linear-gradient(-45deg, rgba(245,245,240,0.035) 0 1px, transparent 1px 28px)",
      }}
    >
      {/* AppShell 的中央主區本身不會捲動（overflow-hidden 在最外層），這頁的清單可能很長，
          所以在中央主區內部自己包一層 overflow-y-auto，讓列表能捲、左右兩欄固定不跟著捲走。
          min-h-0 跟 AppShell 裡中央主區的 min-w-0 是同一個 flexbox 坑的另一個方向：flex 子項
          的 min-height 預設也是 auto（＝至少要跟內容一樣高），所以只寫 overflow-y-auto 而不寫
          min-h-0 的話，這一層會被內容撐到比視窗還高、根本不會出現捲軸，超出的部分直接被最外層
          的 overflow-hidden 裁掉——清單一長就再也點不到下面的比賽。flex-1 則是讓它吃滿中央
          主區剩下的高度。 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="font-dash text-2xl font-bold">比賽列表</h1>
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
                          <h2 className="font-dash text-[17px] font-bold">{item.data.name}</h2>
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
    </AppShell>
  );
}
