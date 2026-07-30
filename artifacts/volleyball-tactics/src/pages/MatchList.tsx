import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, SlidersHorizontal } from "lucide-react";
import { useMatchList, useDeleteMatch } from "@/hooks/useMatches";
import { useTournamentList, useDeleteTournament } from "@/hooks/useTournaments";
import { useCrossMatchAnalysis } from "@/hooks/useCrossMatchAnalysis";
import MatchFormDialog from "@/components/MatchFormDialog";
import TournamentFormDialog from "@/components/TournamentFormDialog";
import ListItemCard from "@/components/ListItemCard";
import ListScrollArea from "@/components/ListScrollArea";
import MatchEntryLinks from "@/components/MatchEntryLinks";
import AppShell from "@/components/AppShell";
import ListNavRail from "@/components/ListNavRail";
import MatchInfoRail, { MatchListSelection } from "@/components/MatchInfoRail";
import { APP_BACKGROUND_STYLE, APP_SHELL_CLASS } from "@/lib/appChromeStyles";
import { formatMatchDateTime, formatMatchResult } from "@/lib/matchSummary";
import { winsNeededFor, type MatchFormat } from "@/lib/matchOutcome";
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
  // 卡片右端「3:0 勝」那格、跟「尚未排先發」黃標的來源，都改讀後端的跨場彙總
  // （GET /analysis/matches，#65 視圖②那支），不再讀本機 zustand store。
  //
  // 為什麼換來源：本機 store（useScoreSheet / useRotationTable）只有在「打開過那一場」時
  // 才會被 hydrate，所以列表剛載入、還沒點任何一場時每張卡都是空的 → 一律顯示「尚未開賽」
  // ＋亮黃標，點進去才變對。改讀這支 bulk endpoint 後，一支請求就把每場的摘要（逐局比分 +
  // 是否排過先發）一次拿回來，列表載入當下就是正確的，不用逐場開啟。而且是「一支請求 O(場數)
  // 列」，不是「一場一輪 sets/rallies 請求」的 fan-out——這正是當初刻意只讀本機 store 想
  // 閃避的成本，現在後端算好摘要就沒這個顧慮了。
  const { summaries, isLoading: isSummaryLoading } = useCrossMatchAnalysis();
  // summaries 的 matchId 是數字（後端 serial），這裡的 domain id 是字串，轉成字串當 key。
  const summaryByMatch = new Map(summaries.map((s) => [String(s.matchId), s]));

  // setResults 只含「已結束局」（後端已排除進行中的最後一局），formatMatchResult 吃的就是
  // 逐局比分，語意跟原本傳 completedSets 完全一致。查不到（還沒載入 / 這場沒資料）就回
  // 空陣列 → 顯示「尚未開賽」。
  //
  // format（#215）：呼叫端（render 時手上就有這張卡片的 match 物件）把賽制換算成
  // winsNeeded 一起傳進來，不能再靠 formatMatchResult 內部假設全站都是五戰三勝。
  const matchResultText = (matchId: string, format: MatchFormat) =>
    formatMatchResult(summaryByMatch.get(matchId)?.setResults ?? [], winsNeededFor(format));

  // issue #190（軟提醒）：這場是否已排先發，直接看後端 hasLineup（有沒有任一局凍結過先發
  // 陣容）。刻意在 summaries 還在載入時先不亮黃標——寧可晚半秒出現，也不要在載入瞬間對每場
  // 都閃一下「尚未排先發」的假警告（那正是使用者回報的困擾）。載完後 hasLineup 為 false 才
  // 判定「還沒排」。注意：輪轉表上「排好但還沒開賽」的暫存陣容不進 DB（見 useRotationTable
  // 的 partialize），所以這裡認的是「已凍結進計分流程」的先發；純輪轉表暫存的先發不算，
  // 這跟「暫存狀態重整就沒了」本來就一致，不是退步。
  const matchNeedsLineup = (matchId: string): boolean => {
    if (isSummaryLoading) return false;
    const s = summaryByMatch.get(matchId);
    if (!s) return true; // 查不到摘要＝這場還沒任何資料，當作「還沒排」
    // 打過至少一局就不用再提醒——鏡射舊本機邏輯的 completedSets>0 分支。這一條也順手擋掉
    // 舊資料的邊界：有些早期/被清過 rally 的比賽，sets 還在但對應的 lineups row 已不存在
    //（hasLineup=false），若只看 hasLineup 會對這種「其實打過球」的比賽誤亮黃標，跟點進去
    // 計分頁看到的（有完成局、不提醒）就對不上。先看 setsPlayed 能讓兩邊一致。
    if (s.setsPlayed > 0) return false;
    return !s.hasLineup;
  };

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
    // 背景改用 lib/appChromeStyles 的共用常數（tang 2026-07-30 要求全站背景統一）：這裡原本
    // 是 #131 那次改版之前留下的舊版本——純色底＋一層很淡的斜線網格。收斂成共用常數的完整
    // 理由（以及為什麼當初會分裂成兩代）寫在那個檔案裡。
    <AppShell
      mode="A"
      nav={
        <div className="relative z-10 h-full">
          <ListNavRail selected={selected} />
        </div>
      }
      aside={
        <div className="relative z-10 h-full">
          <MatchInfoRail selected={selected} />
        </div>
      }
      backdrop={<div className="tb-beam" />}
      className={APP_SHELL_CLASS}
      style={APP_BACKGROUND_STYLE}
    >
      {/* 中央主區（issue #175 環 4）。
          捲動責任下放給 ListScrollArea（AppShell 最外層是 overflow-hidden，沒人接手的話長清單
          會被裁掉），它同時負責藏掉原生捲軸、在右邊畫那條 8px 指示條。
          max-w-[1136px] 是 Figma 的內容寬基準，超寬螢幕下不讓卡片無限拉長。
          relative z-10：跟 backdrop 的 .tb-beam（position:absolute + z-index:1）疊圖時要贏過去，
          理由見 TacticsBoard.tsx 同一種寫法的說明。 */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-8 py-8">
        <div className="mx-auto flex min-h-0 w-full max-w-[1136px] flex-1 flex-col">
          <div className="mb-8 flex items-center justify-between gap-4">
            <h1 className="font-dash text-2xl font-bold">比賽列表</h1>
            {/* §3.1 的操作列，由左至右：篩選（方形圖示鈕）、新增資料夾、新增比賽。 */}
            {/* 跨場紀錄本的入口以前在這裡放一顆 BarChart 小圖示，現在收斂到左欄導覽軌的「數」
                （沒選比賽時「數」就通往 /analytics，見 NavRail.tsx analyticsHref）——同一個目的地
                不再有兩個入口，避免使用者困惑，也讓「隨時翻得開的紀錄本」統一從那條軌進出。 */}
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
                      secondaryText={matchResultText(item.data.id, item.data.format)}
                      statusHint={matchNeedsLineup(item.data.id) ? "尚未排先發" : undefined}
                      selected={selected?.kind === "match" && selected.id === item.data.id}
                      onSelect={() => setSelected({ kind: "match", id: item.data.id })}
                      // 比賽卡片沒有 onOpen（不跳頁）：三個入口改成選中後在卡片裡就地展開，
                      // 見 MatchEntryLinks 開頭記的那段演進。
                      expandedContent={
                        <MatchEntryLinks
                          matchId={item.data.id}
                          needsLineup={matchNeedsLineup(item.data.id)}
                        />
                      }
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
