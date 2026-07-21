import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Tactic, useListTactics } from "@workspace/api-client-react";
import { useTacticsBoard, isSessionDirty, DISCARD_MSG } from "../hooks/useTacticsBoard";
import { useToast } from "@/hooks/use-toast";
import NewTacticDialog from "./NewTacticDialog";
import type { CourtSnapshot } from "../types/courtSnapshot";

// 左側導覽軌「戰」按鈕的飛出選單（issue #160 C3）——PO 決定把所有進戰術板的入口收到這裡：
// 點「戰」不再跳頁，改成展開一個選單，第一行「+ 新增戰術」，下面接這場已存的戰術清單，
// 點清單裡一筆就載入唯讀檢視、跳去戰術頁。
//
// 這個元件目前只在 ScoreSheet.tsx（計分頁）接上，透過 MatchNavRail 的 boardSlot prop 掛進
// 導覽軌最下面那格；TacticsBoard.tsx 自己的左欄本來就有完整的戰術庫瀏覽面板
// （TacticsBrowsePanel），再疊一個飛出選單是多餘的，所以戰術頁跟數據頁都不傳 boardSlot、
// 維持 MatchNavRail 原本「戰」是純導覽連結的行為。
//
// 為什麼「擷取現在站位」不自己決定要讀哪個 store？跟 NewTacticDialog.tsx 開頭的說明是同一件
// 事——「現在站位」在戰術頁跟計分頁意思不一樣，這個元件本身不該知道呼叫端是哪一頁、更不該
// 自己猜。所以一樣把 captureCurrent/captureLabel 原封不動往下傳給 NewTacticDialog，
// 這個元件在這件事上只是個「轉手」的中間層，真正的擷取邏輯留給更上層的頁面決定。
interface TacticsRailMenuProps {
  matchId: string;
  // 見 NewTacticDialog.tsx：呼叫端提供的「擷取現在站位」邏輯，這個元件原封不動轉手給
  // NewTacticDialog，自己不碰。
  captureCurrent: () => CourtSnapshot;
  captureLabel: string;
  captureDisabled?: boolean;
}

export default function TacticsRailMenu({
  matchId,
  captureCurrent,
  captureLabel,
  captureDisabled = false,
}: TacticsRailMenuProps) {
  // wouter 的 useLocation 回傳 [目前路徑, 導航函式]，這裡只要導航、不讀目前路徑。
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // menuOpen：飛出選單本身開不開。dialogOpen：選單裡「+ 新增戰術」再往下開的既有彈窗
  // （NewTacticDialog）。兩層各自獨立管理，選單一開新增戰術彈窗就會先把 menuOpen 收起來
  // （避免選單面板疊在彈窗底下、畫面看起來很亂）。
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // containerRef 包住「觸發按鈕 + 選單面板」整塊，用來判斷「使用者是不是點在選單外面」
  // （click-outside）。
  const containerRef = useRef<HTMLDivElement>(null);

  // 這裡重新訂閱同一顆 store 欄位，是因為飛出選單跟戰術頁的殼是兩個不同元件，各自要知道
  // 「現在有沒有東西會被弄丟」，不能共用同一份 React 狀態，只能各自訂閱同一個 Zustand store
  // 的同一個欄位（store 本來就是為了讓分散在不同元件的程式碼讀到同一份「真相」而存在的）。
  // 判準本身用共用的 isSessionDirty，不在這裡再寫一份。
  const session = useTacticsBoard((s) => s.session);
  const loadProject = useTacticsBoard((s) => s.loadProject);
  const isDirty = isSessionDirty(session);

  // 這場已儲存的戰術清單——跟 TacticsBoardPanel.tsx 用同一支 hook、同一種「用 matchId 過濾」
  // 的呼叫方式（issue #119：戰術庫 per-match）。
  const { data: tactics = [] } = useListTactics(matchId ? { matchId: Number(matchId) } : undefined);

  // click-outside + Esc 關閉選單。只在選單開著時掛上 document 監聽器，關掉就拆掉，避免選單
  // 沒開的時候也在背景一直監聽滑鼠/鍵盤事件（沒必要的效能開銷）。
  //
  // 用 mousedown 而不是 click：mousedown 在使用者「按下」的那一刻就觸發，比 click（放開才
  // 觸發）更早，可以避免「按下去→選單關掉→放開時又點到選單原本位置下面藏著的其他元素」
  // 這種時間差造成的誤觸。
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const goToBoard = () => setLocation(`/matches/${matchId}/board`);

  // 「+ 新增戰術」：開下面既有的 NewTacticDialog（跟戰術頁 browse 模式共用同一顆彈窗元件，
  // 不重刻）。開之前先做跟 TacticsBoardPanel.handleCancel 同一種 isDirty 確認——飛出選單
  // 可以在任何頁面、任何時候點開，使用者可能正在戰術頁編到一半、切來計分頁按這顆選單，
  // 這時候「新增戰術」如果直接開始一個新 session，會無聲無息蓋掉還沒存的東西，所以要先問。
  const handleOpenNewTacticDialog = () => {
    if (isDirty && !window.confirm(DISCARD_MSG)) return;
    setDialogOpen(true);
    setMenuOpen(false);
  };

  // 只有「使用者真的選了一個起點」才跳去戰術頁；按 Esc／點外面取消就留在原頁。
  //
  // 這件事交給彈窗的 onStarted 明講，而不是在這裡從 store 反推。曾經寫成「關閉當下如果
  // store 裡有屬於這場的 session 就跳頁」，那是錯的：使用者這場如果本來就有一個編到一半的
  // session，他點開「+」又按取消，條件照樣成立，人就被硬拉去戰術頁了。「彈窗發生了什麼」
  // 只有彈窗自己知道，讓它回報比在外面猜可靠。
  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
  };

  // 點清單裡一筆已存戰術：跟 TacticsBoardPanel.handleSelectTactic 走完全同一條路徑
  // （loadProject → 唯讀檢視），只是多一步「跳去戰術頁」（戰術頁本來就在畫面上、不用跳；
  // 計分頁按這顆選單則需要真的換頁才看得到結果）。
  const handleSelectTactic = (t: Tactic) => {
    if (isDirty && !window.confirm(DISCARD_MSG)) return;
    try {
      loadProject(t.data, t.id, t.name);
      toast({ title: "已載入（唯讀檢視），按「編輯」可修改" });
      setMenuOpen(false);
      goToBoard();
    } catch {
      toast({ title: "載入失敗", description: "戰術格式無法辨識", variant: "destructive" });
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* 觸發按鈕：外觀盡量貼近 MatchNavRail.tsx 裡 NavRailItem 的樣式（同樣 h-11 w-11、同一種
        反白色票），讓「戰」在飛出選單模式下看起來還是導覽軌的一員，不會突兀。
        用 onClick（點擊/輕觸）觸發，不是 hover——這是平板優先的 PWA，觸控裝置沒有 hover，
        純 hover 觸發在平板上等於這顆按鈕永遠打不開，所以一定要用點擊當唯一觸發方式。 */}
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="戰術"
        title="戰術"
        data-testid="button-tactics-rail-menu"
        className={`flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold
          transition-colors ${
            menuOpen ? "bg-white/[0.06] text-[#c6f135]" : "text-white/60 hover:text-[#c6f135]"
          }`}
      >
        戰
      </button>

      {menuOpen && (
        // 絕對定位在觸發按鈕右側（left-full：從 containerRef 的右邊界開始）、bottom-0 對齊
        // 按鈕下緣（MatchNavRail 用 mt-auto 把「戰」壓在 rail 最底部，選單跟著對齊底部比較
        // 自然，不會有選單開在畫面外的疑慮）。rail 本身只有 64px 寬，選單用 w-56（224px）
        // 往右飛出，不會被壓縮變形。
        <div
          role="menu"
          data-testid="tactics-rail-menu-panel"
          className="absolute bottom-0 left-full z-50 ml-2 w-56 rounded-lg border
            border-white/[0.18] bg-[#12140f] p-2 font-dash text-[#f5f5f0] shadow-lg
            shadow-black/40 backdrop-blur-lg"
        >
          <button
            onClick={handleOpenNewTacticDialog}
            data-testid="button-tactics-rail-new"
            className="w-full rounded-lg border border-white/[0.26] bg-white/[0.05] px-2 py-1.5
              text-left text-xs font-bold text-[#c6f135] transition hover:border-[#c6f135]"
          >
            + 新增戰術
          </button>

          <div className="mb-1 mt-2 text-[10px] font-bold text-[#a9b096]">已儲存（點擊載入）</div>
          {tactics.length === 0 ? (
            <p className="py-1 text-[10px] text-[#a9b096]">尚無已儲存戰術</p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {tactics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTactic(t)}
                  data-testid={`button-tactics-rail-item-${t.id}`}
                  className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px]
                    hover:bg-white/[0.08]"
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <NewTacticDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        matchId={matchId}
        onStarted={goToBoard}
        captureCurrent={captureCurrent}
        captureLabel={captureLabel}
        captureDisabled={captureDisabled}
      />
    </div>
  );
}
