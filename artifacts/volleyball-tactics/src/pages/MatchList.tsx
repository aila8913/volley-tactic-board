import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, SlidersHorizontal } from "lucide-react";
import { useMatchList, useDeleteMatch } from "@/hooks/useMatches";
import { useTournamentList, useDeleteTournament } from "@/hooks/useTournaments";
import { useScoreSheet } from "@/hooks/useScoreSheet";
import MatchFormDialog from "@/components/MatchFormDialog";
import TournamentFormDialog from "@/components/TournamentFormDialog";
import ListItemCard from "@/components/ListItemCard";
import ListScrollArea from "@/components/ListScrollArea";
import MatchEntryLinks from "@/components/MatchEntryLinks";
import AppShell from "@/components/AppShell";
import ListNavRail from "@/components/ListNavRail";
import MatchInfoRail, { MatchListSelection } from "@/components/MatchInfoRail";
import { formatMatchDateTime, formatMatchResult } from "@/lib/matchSummary";
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
  //
  // issue #174：選取語意從「只能選資料夾」一般化成「資料夾或比賽都能選」，右欄（aside）
  // 會依照選中的是哪一種顯示不同內容（見 MatchInfoRail.tsx）。刻意不預設選中第一項——
  // 進頁面時右欄是空狀態，理由見 MatchInfoRail 空狀態分支的註解：使用者還沒表達意圖前，
  // 不該把任何一場比賽的站位放進「可編輯」狀態。
  const [selected, setSelected] = useState<MatchListSelection>(null);
  // 卡片右端「3:0 勝」那格的來源。直接讀共用 store 的既有內容，**不**逐場呼叫
  // useScoreSheetController 去 hydrate——那支會為每一場比賽各發一輪 sets/rallies 請求，
  // 列表有 30 場就是 30 輪，為了一行小字讓進頁變慢完全不划算。還沒被開啟過的比賽在 store
  // 裡沒有紀錄，formatMatchResult 會回「尚未開賽」，語意上也剛好對得上。
  const recordingsByMatch = useScoreSheet((s) => s.recordingsByMatch);
  const matchResultText = (matchId: string) =>
    formatMatchResult(recordingsByMatch[matchId]?.completedSets ?? []);

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
    // 任何一場比賽，NavRail 會把「計/數/戰/出」渲染成停用態，issue #173：點下去會跳 toast
    // 「先選一場比賽」，不是完全不可互動）。
    // aside（issue #174）：右欄資訊欄，內容完全交給 MatchInfoRail 依 selected 決定要顯示
    // 空狀態／資料夾摘要／比賽站位——這一頁只負責把「目前選中什麼」傳過去，不自己判斷要
    // 渲染哪一種畫面。
    //
    // 純色背景會讓 backdrop-blur 白忙一場（模糊純色還是同一個純色，卡片的玻璃感其實沒有真的
    // 產生）。這裡疊一層很淡的斜線網格當「球網紋理」，讓 blur 有東西可以模糊，也呼應排球主題
    // （PR #129 review 建議：docs/design-spec.md 第 4 節寫的玻璃質感本來就是設計給疊在有內容
    // 的背景上用的）。這些 class/style 以前掛在最外層 div 上，現在原樣搬到 AppShell 的
    // className/style——AppShell 自己的 h-screen 已經接手了原本 min-h-screen 的角色。
    <AppShell
      mode="A"
      nav={<ListNavRail selected={selected} />}
      aside={<MatchInfoRail selected={selected} />}
      className="bg-[#0a0b07] font-dash text-[#f5f5f0]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(245,245,240,0.035) 0 1px, transparent 1px 28px)," +
          "repeating-linear-gradient(-45deg, rgba(245,245,240,0.035) 0 1px, transparent 1px 28px)",
      }}
    >
      {/* 中央主區（issue #175 環 4）。
          捲動責任下放給 ListScrollArea（AppShell 最外層是 overflow-hidden，沒人接手的話長清單
          會被裁掉），它同時負責藏掉原生捲軸、在右邊畫那條 8px 指示條。
          max-w-[1136px] 是 Figma 的內容寬基準，超寬螢幕下不讓卡片無限拉長。 */}
      <div className="flex min-h-0 flex-1 flex-col px-8 py-8">
        <div className="mx-auto flex min-h-0 w-full max-w-[1136px] flex-1 flex-col">
          <div className="mb-8 flex items-center justify-between gap-4">
            <h1 className="font-dash text-2xl font-bold">比賽列表</h1>
            {/* §3.1 的操作列，由左至右：篩選（方形圖示鈕）、新增資料夾、新增比賽。 */}
            <div className="flex gap-3">
              <button
                type="button"
                // 篩選的行為（要能篩什麼欄位、跟資料夾階層怎麼互動）還沒有定案，線框稿只畫了
                // 這顆鈕的位置。這裡照版面留位、但明確標成停用，不做一顆點下去沒反應的假按鈕
                // ——假按鈕比沒有按鈕更糟，使用者會以為是壞掉。
                disabled
                aria-label="篩選（尚未開放）"
                title="篩選功能規劃中"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border
                  border-white/[0.12] text-[#a9b096] opacity-40"
              >
                <SlidersHorizontal className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={openCreateTournamentDialog}
                className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-white/[0.26]
                px-5 text-[13px] font-semibold text-[#f5f5f0] transition hover:border-[#c6f135]
                hover:text-[#c6f135]"
              >
                <Plus className="h-[15px] w-[15px]" />
                新增資料夾
              </button>
              <button
                type="button"
                onClick={openCreateMatchDialog}
                className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-[#c6f135] px-5 text-[13px]
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
            <ListScrollArea>
              {/* 卡距跟著卡片高度一起收（PO 回饋「上下太寬」）：Figma 的 53px 是配 252px 高的
                  卡片畫的比例，卡片降到 104 之後同樣鬆度大約是 20px。 */}
              <div className="space-y-5">
                {items.map((item) =>
                  item.kind === "tournament" ? (
                    <ListItemCard
                      key={`t-${item.data.id}`}
                      kind="tournament"
                      title={item.data.name}
                      secondaryText={`${matches.filter((m) => m.tournamentId === item.data.id).length} 場比賽`}
                      selected={selected?.kind === "tournament" && selected.id === item.data.id}
                      onSelect={() => setSelected({ kind: "tournament", id: item.data.id })}
                      onOpen={() => navigate(`/tournaments/${item.data.id}`)}
                      onEdit={() => openEditTournamentDialog(item.data)}
                      onDelete={() => handleDeleteTournament(item.data)}
                    />
                  ) : (
                    <ListItemCard
                      // key 加 t-/m- 前綴：資料夾與比賽是兩張不同的表，id 各自從 1 開始，
                      // 混在同一個列表裡不加前綴就會出現重複 key，React 會把兩個項目認成同一個。
                      key={`m-${item.data.id}`}
                      kind="match"
                      title={`vs ${item.data.opponent}`}
                      dateText={formatMatchDateTime(item.data.dateTime)}
                      secondaryText={matchResultText(item.data.id)}
                      selected={selected?.kind === "match" && selected.id === item.data.id}
                      onSelect={() => setSelected({ kind: "match", id: item.data.id })}
                      // 比賽卡片沒有 onOpen（不跳頁）：三個入口改成選中後在卡片裡就地展開，
                      // 見 MatchEntryLinks 開頭記的那段演進。
                      expandedContent={<MatchEntryLinks matchId={item.data.id} />}
                      onEdit={() => openEditMatchDialog(item.data)}
                      onDelete={() => handleDeleteMatch(item.data.id)}
                    />
                  ),
                )}
              </div>
            </ListScrollArea>
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
