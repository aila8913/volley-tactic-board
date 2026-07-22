import { useState } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import BackToMatchListButton from "@/components/BackToMatchListButton";
import { useMatchList, useDeleteMatch } from "@/hooks/useMatches";
import { useTournamentList } from "@/hooks/useTournaments";
import MatchFormDialog from "@/components/MatchFormDialog";
import MatchCard from "@/components/MatchCard";
import AppShell from "@/components/AppShell";
import MatchNavRail from "@/components/MatchNavRail";
import MatchInfoRail, { MatchListSelection } from "@/components/MatchInfoRail";
import { Match } from "@/types/match";

// 「找不到資料夾」錯誤畫面的次要按鈕，跟 ScoreSheet.tsx/MatchAnalytics.tsx 同名常數
// 同一套語言（不透過 shadcn Button，理由見那邊的註解）。這個早期 return 是獨立於下面
// AppShell 主要 render 路徑（仍是 bg-white，留給 #175）的頁面外殼，先轉不受影響。
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-white/[0.26] " +
  "bg-white/[0.05] px-5 py-2 text-sm font-bold text-[#f5f5f0] transition " +
  "hover:border-[#c6f135] hover:text-[#c6f135]";

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
  // issue #174：跟 MatchList.tsx 一樣的右欄選取狀態，只是這裡的選取語意永遠只會是
  // kind: "match"——資料夾內頁裡不會再出現子資料夾可以選。共用同一個 MatchListSelection
  // 型別（而不是另外定義一個只收 string 的窄型別），是因為 MatchInfoRail 的 props 契約本來
  // 就是吃這個型別，兩邊維持同一份型別，日後兩個頁面的行為要保持一致時才不會各自飄掉。
  const [selected, setSelected] = useState<MatchListSelection>(null);

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
  // 這兩個早期 return 是獨立於下面主要 render 路徑的頁面外殼——AppShell 本身（含中央列表）
  // 的深色化留給 #175（環 4，中央列表型會整個重寫這塊），這裡只先轉不受那次重寫影響的
  // loading/error 狀態，避免白工。
  if (tournamentsLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#0a0b07] font-dash text-[#a9b096]">
        載入中…
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[#0a0b07] px-4 text-center font-dash text-[#f5f5f0]">
        <p className="text-[#a9b096]">找不到這個資料夾。</p>
        {/* 不用共用的 BackToMatchListButton：見 MatchAnalytics.tsx 同名常數的說明。 */}
        <Link href="/" className={SECONDARY_BUTTON_CLASS}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          比賽列表
        </Link>
      </div>
    );
  }

  return (
    // issue #172：跟 MatchList.tsx 一樣改成 AppShell 的 mode="A"，nav 是共用導覽軌（同樣沒有
    // matchId——這頁是「資料夾」層級，不是某一場比賽）。
    // 這裡是 tournament 本身的資料，不是「這場比賽」的資料，所以 backHref 固定回最外層列表
    //「/」，跟 matchBackHref() 那條「比賽該回哪個資料夾」的規則是兩回事，不能共用。
    // aside（issue #174）：跟 MatchList.tsx 用同一個 MatchInfoRail——issue 原文明講「進資料夾
    // 後右欄就消失會很突兀」，所以資料夾內頁要有跟頂層列表一致的右欄體驗，不能因為進了資料夾
    // 就少一塊。
    <AppShell
      mode="A"
      nav={<MatchNavRail backHref="/" active="list" />}
      aside={<MatchInfoRail selected={selected} />}
      className="bg-white"
    >
      {/* 跟 MatchList.tsx 同一個原因：AppShell 中央主區本身不捲動，這頁的比賽清單也可能超過
          一屏高，所以一樣包一層 overflow-y-auto，不然長清單會被裁掉、捲不到下面的項目
          （原本 min-h-screen 的寫法是讓整個瀏覽器視窗捲動，換成 AppShell 的 h-screen 固定
          版面之後，捲動責任要下放到這一層，不然是體驗上的退步）。 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
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
                  selected={selected?.kind === "match" && selected.id === match.id}
                  onSelect={() => setSelected({ kind: "match", id: match.id })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <MatchFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        match={editingMatch}
        tournamentId={tournament.id}
      />
    </AppShell>
  );
}
