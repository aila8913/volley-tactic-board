import { useRef, useState } from "react";
import type { FocusEvent } from "react";
import { Link, useLocation } from "wouter";
import { Tactic, useListTactics, getListTacticsQueryKey } from "@workspace/api-client-react";
import { useTacticsBoard, isSessionDirty, DISCARD_MSG } from "../hooks/useTacticsBoard";
import { useRotationTable } from "../hooks/useRotationTable";
import { useToast } from "@/hooks/use-toast";
import { exportCourtAsPng, exportStateAsJson, importStateFromJson } from "../lib/exportUtils";
import NewTacticDialog from "./NewTacticDialog";
import type { CourtSnapshot } from "../types/courtSnapshot";

// issue #173（layout-spec 環 2）：全站左側導覽，取代原本分開的 MatchNavRail（收合直排導覽軌）
// + TacticsRailMenu（只掛在計分頁、單獨處理「戰」的飛出選單）。
//
// 為什麼把兩個元件合併成一個，而不是繼續讓 MatchNavRail 保持 dumb、只在需要飛出選單的地方
// 塞 boardSlot？因為這一環的規格（docs/layout-spec.md §2）把「收合 ↔ hover 展開」定成整條
// 導覽軌共用的行為，不是只有「戰」這一格特殊——展開態底下，比賽列表／計分表／數據分析都要
// 變成完整文字、active 那一項要整行反白；「戰」跟新增的「出」（匯出）則額外多一層子清單。
// 如果繼續維持 boardSlot 那種「大部分邏輯在 MatchNavRail，個別格子的特殊行為外包給呼叫端」
// 的分工，「hover 展開」這種橫跨全部項目的狀態就得同時存在兩個元件裡才能運作（MatchNavRail
// 要知道「現在展開了沒」，TacticsRailMenu 也要知道，兩邊還要對齊動畫時機），會比合併成一個
// 元件更難維護。所以這一環把「戰」「出」的子清單邏輯內建進來，呼叫端只需要注入「新增戰術
// 要怎麼擷取現在站位」這一小塊真的因頁面而異的邏輯（見下面 NavRailProps 的說明），其餘全部
// 由這個元件自己負責。

export type ActivePage = "board" | "record" | "analytics" | "list";

// 「這場比賽的『回上一層』該回哪裡」——原本住在 MatchNavRail.tsx，原封不動搬過來，理由跟
// 之前完全一樣：比賽如果被歸在某個資料夾（tournament）底下，返回時就回那個資料夾內頁；
// 沒有歸資料夾的散場比賽才回最外層的比賽列表。三個 match-scoped 頁面
//（TacticsBoard/ScoreSheet/MatchAnalytics）都要用到，所以放在這個模組裡當單一事實來源。
export function matchBackHref(tournamentId: string | null | undefined): string {
  return tournamentId ? `/tournaments/${tournamentId}` : "/";
}

// ── props 型別：用 discriminated union（判別聯合型別）逼呼叫端誠實 ──
//
// 「計／數／戰／出」這四格需要 matchId 才連得到合法目的地，「戰」的子清單（+ 新增戰術）
// 還需要呼叫端告訴我們「這一頁的『現在站位』要怎麼擷取」——這件事因頁面而異（戰術頁讀
// 輪轉表當下站位、計分頁讀計分表自己凍結的先發快照），這個元件不該自己猜，理由跟
// NewTacticDialog.tsx／TacticsRailMenu.tsx（已退役）當初的說明完全一樣：一旦這裡自己讀某個
// store，就等於幫戰術白板的「單向依賴」開了一個後門。
//
// 用 union 而不是把 captureCurrent 等三個欄位都設成 optional，是因為「有 matchId 就一定要
// 給擷取邏輯」是這個元件真正的規則——如果全部 optional，某個 match-scoped 頁面忘記傳
// captureCurrent，只會在使用者實際點開「+ 新增戰術」那一刻才爆炸（甚至更糟：因為
// captureCurrent 型別要求必須回傳一個 CourtSnapshot，忘記傳就要嘛編譯期報錯、要嘛得生一個
// 假的預設值，兩者都不好）。union 讓「沒給 matchId」和「給了 matchId 但沒給擷取邏輯」在
// TypeScript 編譯期就分得出來，寫錯的呼叫端會在 `tsc` 這一關就被抓到，不用等到執行期。
type NavRailBaseProps = {
  backHref: string;
  active: ActivePage;
};

export type NavRailProps =
  | (NavRailBaseProps & { matchId?: undefined })
  | (NavRailBaseProps & {
      matchId: string;
      // 見 NewTacticDialog.tsx 開頭的說明：呼叫端提供的「擷取現在站位」邏輯，這個元件原封
      // 不動轉手給 NewTacticDialog，自己不碰、也不猜。
      captureCurrent: () => CourtSnapshot;
      captureLabel: string;
      captureDisabled?: boolean;
    });

// ── 選取狀態視覺（issue #134 環 0 定案，直接照抄，不要在這裡自創新的色階）──
// 強階：目前所在的導覽入口整行（例如 active="record" 時的「計分表」）。
// 弱階：子清單裡選中的那一筆（例如目前正在編輯/檢視的那個已存戰術）。
const STRONG_SELECT_CLASS = "bg-[#c6f135]/15 ring-1 ring-inset ring-[#c6f135] text-[#c6f135]";
const WEAK_SELECT_CLASS = "bg-[#c6f135]/20 text-[#f5f5f0]";

// 「戰」「出」這兩格底下的子清單目前只有這兩種，用一個小型別描述「目前展開的是哪一個」，
// 比起兩個獨立的 boolean（openBoard / openExport）更不容易寫出「兩個同時是 true」這種
// 不該存在的狀態組合（就是很基本的「讓不合法的狀態在型別上就不可表達」的技巧）。
type SubmenuKey = "board" | "export" | null;

export default function NavRail(props: NavRailProps) {
  const { backHref, active } = props;
  const matchId = props.matchId;

  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // expanded：側欄是不是展開中（hover 或鍵盤 focus 觸發，見下面的事件處理）。
  // openSubmenu：展開態下，「戰」或「出」誰的子清單正被掀開。兩者故意分開管理——
  // expanded 管的是「整條側欄浮層在不在」，openSubmenu 管的是「浮層裡面哪一段子清單露出來」，
  // 沒有理由把它們綁成同一顆開關（例如使用者滑鼠移出去、側欄收合了，openSubmenu 記住的
  // 「上次展開的是戰術子清單」下次再展開時還能沿用，不用重新點一次）。
  const [expanded, setExpanded] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<SubmenuKey>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const containerRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 戰術白板 store：子清單（已存戰術／匯出匯入）都要讀寫這裡 ──
  // 跟已退役的 TacticsRailMenu 一樣，各自訂閱需要的欄位，不整包解構（避免元件在不相干的
  // store 變化時也重繪，見 TacticsBoardPanel.tsx 開頭的同類說明）。
  const session = useTacticsBoard((s) => s.session);
  const viewingTacticId = useTacticsBoard((s) => s.viewingTacticId);
  const loadProject = useTacticsBoard((s) => s.loadProject);
  const buildSavedTactic = useTacticsBoard((s) => s.buildSavedTactic);
  const importState = useTacticsBoard((s) => s.importState);
  const isDirty = isSessionDirty(session);
  // 「目前這一筆戰術是不是被打開著」的判準：編輯中看 session.serverId，唯讀檢視看
  // viewingTacticId——兩者不會同時有值（session 存在時 viewingScene 一定是 null，見
  // useTacticsBoard.ts 開頭「戰術頁狀態機」的說明），所以直接串起來當一個值用不會衝突。
  const selectedTacticId = session?.serverId ?? viewingTacticId;

  // 這場已存的戰術清單。
  //
  // 注意 `enabled: matchId !== undefined` 這個 query option 不是可有可無的效能微調，
  // 少了它會是個實際的行為問題：這個元件現在掛在全站五個頁面上（以前的 TacticsRailMenu
  // 只掛在計分頁），而 `useListTactics(undefined)` 的語意是「不帶 matchId 過濾條件去查」
  // ＝跟後端要**這個使用者所有比賽的全部戰術**。比賽列表／資料夾內頁根本沒有 matchId、
  // 「戰」那一格是灰的、清單永遠不會被渲染出來，卻每次進頁面都白打一支會越用越慢的 API。
  // React Query 的 `enabled: false` 表示「這個 query 先不要跑」，等條件成立（真的有 matchId）
  // 才發請求；查詢鍵（queryKey）本身不受影響，所以之後條件成立時仍會正常快取/共用。
  // （queryKey 也要一起帶：這批 generated hook 的 options 型別把 queryKey 列為必填，
  // 所以照 hooks/useMatches.ts 既有的作法，用對應的 getXxxQueryKey 產生跟 hook 內部
  // 預設值一模一樣的鍵。）
  const tacticsParams = matchId ? { matchId: Number(matchId) } : undefined;
  const { data: tactics = [] } = useListTactics(tacticsParams, {
    query: { enabled: matchId !== undefined, queryKey: getListTacticsQueryKey(tacticsParams) },
  });

  // ── 展開/收合的觸發：hover（滑鼠）＋ focus-within（鍵盤 tab 到裡面任一個可聚焦元素）──
  // 兩種都要顧到：hover 給滑鼠使用者，focus 給鍵盤導覽/螢幕閱讀器使用者（單純只做 hover
  // 的話，鍵盤使用者 tab 進到子清單裡的連結時，側欄根本沒展開，會看到一個「聚焦到看不見
  // 的東西」的詭異狀態）。React 的 onFocus/onBlur 是合成事件、會像一般事件一樣冒泡（這點
  // 跟原生 DOM 的 focus/blur 不冒泡不一樣），所以可以直接掛在最外層 <nav>，不用在每個
  // 子元件各自掛一次。
  const openByHover = () => setExpanded(true);
  const closeByHover = () => setExpanded(false);
  const openByFocus = () => setExpanded(true);
  // blur 時要判斷「新的焦點還在不在這個 nav 裡面」——如果只是從側欄裡的 A 項目 tab 到
  // 側欄裡的 B 項目，中途會先觸發一次 blur（離開 A）再觸發一次 focus（進入 B），如果 blur
  // 不分青紅皂白就把 expanded 關掉，會在兩個項目之間閃一下收合再展開，很難看。
  // relatedTarget 是「搶走焦點的下一個元素」，用 containerRef 檢查它還在不在容器內。
  const closeByBlur = (e: FocusEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setExpanded(false);
    }
  };

  // ── 「戰」「出」的觸控友善開合 ──
  // TacticsRailMenu.tsx 退役前就點出過的教訓：這是平板優先的 PWA，觸控裝置沒有滑鼠 hover，
  // 純 hover 觸發等於這兩格永遠打不開。所以點擊（含觸控輕觸）這兩格時，行為是「展開側欄 +
  // 掀開對應子清單」，不是導覽——導覽（真的要去戰術板頁）要等使用者在子清單裡選了一筆戰術
  // 或按了「+ 新增戰術」才會發生。桌機滑鼠使用者點下去雖然側欄已經因為 hover 展開了，這個
  // handler 還是會把 openSubmenu 設成對應那一個，行為一致，不用特別分桌機/觸控兩條路徑。
  const toggleSubmenu = (key: "board" | "export") => {
    setExpanded(true);
    setOpenSubmenu((cur) => (cur === key ? null : key));
  };

  // 滑鼠移到「戰」／「出」上面就掀開對應子清單（issue #173，PO 決定：這兩格也要 hover 展開，
  // 不是非點不可）。跟上面的 toggleSubmenu 分成兩個函式而不是共用一個：hover 的語意是
  // 「開啟」（移到另一格就換成另一格的清單），點擊的語意是「切換」（再點一次收起來）——
  // 如果 hover 也走 toggle，滑鼠在同一格上稍微移動觸發第二次事件就會把清單收掉，
  // 變成清單自己在閃。
  const openSubmenuByHover = (key: "board" | "export") => setOpenSubmenu(key);

  // 沒有 matchId 時，「計／數／戰／出」四格全部灰掉——這是 issue #173 留言裡 PO 拍板的決定
  // （見 issue 討論）：位置固定不隱藏，讓使用者維持位置記憶；但停用不再是啞的，點下去要跳
  // toast 告訴使用者「為什麼點不動」，而不是像舊版 MatchNavRail 那樣渲染成不可互動的 <span>。
  // 這裡改用 <button>（保留 aria-disabled="true"，但不能用 HTML disabled 屬性）：disabled
  // 屬性會讓瀏覽器完全不派發任何滑鼠事件給這個元素，onClick 永遠不會被呼叫，也就跳不出 toast。
  const handleDisabledClick = () => {
    toast({ title: "先選一場比賽" });
  };

  const goToBoard = () => {
    if (matchId) setLocation(`/matches/${matchId}/board`);
  };

  // 「+ 新增戰術」：跟已退役的 TacticsRailMenu 同一套確認流程——開彈窗前先檢查有沒有正在
  // 編、還沒存的 session，有的話先問過使用者要不要捨棄（isSessionDirty/DISCARD_MSG 是
  // useTacticsBoard.ts 共用的判準，三個消費者：這裡、RotationSwitcher、原本的
  // TacticsBoardPanel，都不各自重寫一份）。
  const handleOpenNewTacticDialog = () => {
    if (isDirty && !window.confirm(DISCARD_MSG)) return;
    setDialogOpen(true);
  };

  // 點子清單裡一筆已存戰術：跟原本 TacticsRailMenu.handleSelectTactic / 原本
  // TacticsBoardPanel.handleSelectTactic 是同一條路徑（loadProject → 唯讀檢視 → 若不在戰術頁
  // 就跳過去）。loadProject 內部走 zod 驗證（parseSavedTactic），格式壞掉會 throw，用 try/catch
  // 包起來給使用者明確的錯誤提示，不讓整個畫面因為一筆壞資料而炸掉。
  const handleSelectTactic = (t: Tactic) => {
    if (isDirty && !window.confirm(DISCARD_MSG)) return;
    try {
      loadProject(t.data, t.id, t.name);
      toast({ title: "已載入（唯讀檢視），按「編輯」可修改" });
      goToBoard();
    } catch {
      toast({ title: "載入失敗", description: "戰術格式無法辨識", variant: "destructive" });
    }
  };

  // ── 匯出／匯入（issue #173 承接 #17 第 3 節：漢堡選單「≡」拆成兩半，這裡是搬過來的
  // 匯出這一半，原本的實作住在 TacticsBoardPanel.tsx 底部「分享匯出」區塊，那個區塊已整段
  // 移除）──
  //
  // 這三個動作分兩種「全站可用程度」，PO 在 issue #173 留言第 3 點已經確認過：
  //   - 匯出/匯入 JSON 走 useTacticsBoard 這顆全域 store（buildSavedTactic/importState），
  //     跟頁面上有沒有球場 DOM 無關，任何一頁只要 matchId 存在（這一整組本來就在沒有
  //     matchId 時灰掉）都能用。
  //   - 匯出 PNG 抓的是 DOM 裡 id="court-wrapper" 的元素（戰術板球場那塊），只有 TacticsBoard
  //     頁面有——在其他頁面（計分表／數據分析）點「匯出 PNG」，畫面上根本沒有球場可以截圖，
  //     這裡選擇顯示提示 toast、不靜默失敗，也不整個炸掉（找不到就跳過 exportCourtAsPng，
  //     不會因為 document.getElementById 找不到元素而出現執行期錯誤）。
  const situationLabel = session?.name || "tactics";

  const handleExportPNG = () => {
    if (!document.getElementById("court-wrapper")) {
      toast({
        title: "請先開啟戰術板",
        description: "這一頁沒有球場畫面可以匯出，請先切到戰術板頁面。",
      });
      return;
    }
    // 檔名沿用搬家前 TacticsBoardPanel 的格式「<戰術名>_輪次N」——只有一張球場圖的 PNG，
    // 檔名裡的輪次是使用者事後分辨「這張是第幾輪」的唯一線索，掉了會讓一次匯出好幾輪的人
    // 對不上號。輪次用 getState() 在「按下去的那一刻」讀一次，不是用 hook 訂閱：這裡要的是
    // 快照而不是即時綁定（跟 TacticsBoard.tsx／TacticsBoardPanel.tsx 的 captureCurrentFromRotation
    // 同一個理由），順帶避免導覽軌因為輪轉表每次變動就跟著重繪。
    // 讀輪轉表 store 本身是安全的：eslint 焊死的單向規則管的是「戰術白板 store 不得 import
    // 那兩顆 store」，UI 邊界以值讀取一律允許（#154 的病根是反向寫回，不是讀）。
    const rotation = useRotationTable.getState().dataByMatch[matchId ?? ""]?.currentRotation ?? 0;
    exportCourtAsPng("court-wrapper", `${situationLabel}_輪次${rotation + 1}`);
    toast({ title: "匯出成功", description: "PNG 下載中..." });
  };

  const handleExportJSON = () => {
    exportStateAsJson(buildSavedTactic(), situationLabel);
    toast({ title: "匯出成功", description: "JSON 下載中..." });
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importStateFromJson(file);
      importState(data);
      toast({ title: "匯入成功", description: "戰術板已更新（唯讀檢視）" });
    } catch {
      toast({ title: "匯入失敗", description: "檔案格式錯誤", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── 上／下兩群組要渲染哪些入口，依有沒有 matchId 決定要不要走停用分支 ──
  // 「比」永遠是普通連結，不受 matchId 影響（回列表這件事任何時候都合法）。
  const listActive = active === "list";

  return (
    // 最外層 <nav>：撐滿 AppShell 分配給左欄插槽的寬度（NAV_WIDTH，目前是 AppShell.tsx 裡的
    // w-26）。relative 是給下面「展開態浮層」的 absolute 定位當基準；z-20 確保浮層蓋在中央
    // 主區的內容之上（各頁面 z-10 的 backdrop 前景層之上一階，見 TacticsBoard.tsx 的說明）。
    <nav
      ref={containerRef}
      onMouseEnter={openByHover}
      onMouseLeave={closeByHover}
      onFocus={openByFocus}
      onBlur={closeByBlur}
      className="relative z-20 flex h-full w-full flex-col border-r border-white/[0.08]
        bg-white/[0.02] font-dash text-[#f5f5f0] backdrop-blur-sm"
    >
      {/* ── 收合態本體：永遠渲染、永遠佔滿 NAV_WIDTH ── */}
      {/* 這一層不會因為展開而被拿掉或替換掉，展開時是「疊上去」而不是「換掉」——這是
          docs/layout-spec.md §0／AppShell.tsx 的常數註解都強調過的規則：展開是 hover 觸發的
          暫時互動態，不能變成撐開版面寬度的東西，否則滑鼠移開時中央/右欄要跟著整個 reflow
          一次。讓收合本體一直待在原地，展開浮層只是額外蓋上去，也順便解決了「滑鼠從收合軌
          移到浮層途中會不會有一段空隙導致 hover 意外中斷」的問題——因為滑鼠移動路徑全程都
          還在同一個 <nav> 的範圍內。 */}
      <div className="flex flex-1 flex-col items-center gap-1 py-3">
        <CollapsedEntry glyph="比" label="比賽列表" href={backHref} isActive={listActive} />
        <CollapsedEntry
          glyph="計"
          label="計分"
          href={matchId ? `/matches/${matchId}/record` : undefined}
          isActive={active === "record"}
          onDisabledClick={matchId ? undefined : handleDisabledClick}
        />
        <CollapsedEntry
          glyph="數"
          label="數據"
          href={matchId ? `/matches/${matchId}/analytics` : undefined}
          isActive={active === "analytics"}
          onDisabledClick={matchId ? undefined : handleDisabledClick}
        />
      </div>
      <div className="mt-auto flex flex-col items-center gap-1 py-3">
        <CollapsedEntry
          glyph="戰"
          label="戰術"
          isActive={active === "board"}
          onDisabledClick={matchId ? undefined : handleDisabledClick}
          onToggle={matchId ? () => toggleSubmenu("board") : undefined}
        />
        <CollapsedEntry
          glyph="出"
          label="匯出／匯入"
          isActive={false}
          onDisabledClick={matchId ? undefined : handleDisabledClick}
          onToggle={matchId ? () => toggleSubmenu("export") : undefined}
        />
      </div>

      {/* ── 展開態浮層：absolute + z-index，寬 22rem，蓋在收合本體與中央主區上面 ── */}
      {expanded && (
        // issue #173（PO 看過畫面後改的決定，見 AppShell.tsx NAV_COLUMN_CLASS 的說明）：
        // 展開態不是蓋在其他欄位上的浮層，而是「這一欄真的變寬、中央主區跟著讓位」。
        // 所以這裡用 inset-0（填滿被 AppShell 撐開的欄位）而不是固定寬的 absolute 面板——
        // 寬度由 AppShell 那一個常數獨家決定，這個元件不再自己寫死 22rem，否則就回到
        // 「兩個地方各管一份寬度、改一邊忘另一邊」的老問題。
        // 仍然用 absolute inset-0 疊在收合本體上（而不是把收合本體換掉），是為了讓滑鼠從
        // 收合態移進展開態的過程中，游標全程都還在同一個 <nav> 範圍內，不會因為 DOM 被
        // 抽換而觸發一次 mouseleave、造成展開/收合閃爍。
        <div
          data-testid="nav-rail-expanded-panel"
          className="absolute inset-0 z-30 flex flex-col overflow-y-auto border-r
            border-white/[0.14] bg-[#12140f]/97 p-2 shadow-2xl shadow-black/50 backdrop-blur-lg"
        >
          <div className="flex flex-col gap-1">
            <ExpandedEntry glyph="比" label="比賽列表" href={backHref} isActive={listActive} />
            <ExpandedEntry
              glyph="計"
              label="計分表"
              href={matchId ? `/matches/${matchId}/record` : undefined}
              isActive={active === "record"}
              onDisabledClick={matchId ? undefined : handleDisabledClick}
            />
            <ExpandedEntry
              glyph="數"
              label="數據分析"
              href={matchId ? `/matches/${matchId}/analytics` : undefined}
              isActive={active === "analytics"}
              onDisabledClick={matchId ? undefined : handleDisabledClick}
            />
          </div>

          <div className="mt-auto flex flex-col gap-1">
            <ExpandedEntry
              glyph="戰"
              label="戰術板"
              isActive={active === "board"}
              isOpen={openSubmenu === "board"}
              onDisabledClick={matchId ? undefined : handleDisabledClick}
              onToggle={matchId ? () => toggleSubmenu("board") : undefined}
              onHoverOpen={matchId ? () => openSubmenuByHover("board") : undefined}
            />
            {/* 戰術子清單：已存戰術（弱階選取態標示目前正在編輯/檢視的那一筆）＋ 最底下
                「+ 新增戰術」列，左側一條垂直細線把它們跟上面的「戰術板」串起來
                （docs/layout-spec.md §2.2）。 */}
            {matchId && openSubmenu === "board" && (
              <div
                data-testid="nav-rail-board-submenu"
                // max-h-28（112px）≈ 兩列（每列 h-14＝56px）的高度，超過的部分自己捲
                // （issue #173，PO 決定）：戰術清單長度不可預期，一場比賽存十幾張戰術是
                // 正常的，若讓子清單無限往下長，整條側欄會被它撐爆、上面的導覽入口全被
                // 擠出畫面。露出兩列剛好能讓使用者看出「這裡是可以捲的清單」，又不會吃掉
                // 導覽本身的空間。
                className="relative ml-4 flex max-h-28 flex-col gap-1 overflow-y-auto
                  border-l border-white/[0.15] py-1 pl-3"
              >
                {tactics.length === 0 && (
                  <p className="px-2 py-2 text-xs text-[#a9b096]">尚無已儲存戰術</p>
                )}
                {tactics.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTactic(t)}
                    data-testid={`button-nav-rail-tactic-${t.id}`}
                    className={`h-14 truncate rounded-lg px-3 text-left text-sm font-semibold
                      transition ${
                        selectedTacticId === t.id
                          ? WEAK_SELECT_CLASS
                          : "text-[#f5f5f0]/80 hover:bg-white/[0.06]"
                      }`}
                  >
                    {t.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleOpenNewTacticDialog}
                  data-testid="button-nav-rail-new-tactic"
                  className="flex h-14 items-center rounded-lg px-3 text-left text-sm font-bold
                    text-[#c6f135] transition hover:bg-white/[0.06]"
                >
                  ＋ 新增戰術
                </button>
              </div>
            )}

            <ExpandedEntry
              glyph="出"
              label="匯出／匯入"
              isActive={false}
              isOpen={openSubmenu === "export"}
              onDisabledClick={matchId ? undefined : handleDisabledClick}
              onToggle={matchId ? () => toggleSubmenu("export") : undefined}
              onHoverOpen={matchId ? () => openSubmenuByHover("export") : undefined}
            />
            {/* 匯出子清單：跟戰術子清單共用同一套「垂直細線 + 子項」機制（issue #173 留言第
                2 點的決定：不要為匯出另外做一種獨立的 flyout，兩處子清單語意/樣式要一致，
                之後每加一個入口才不用重新選一次要用哪一套）。這三顆都是「按下就執行」的動作
                （momentary），不是「選中並停留」的清單項，所以不套用弱階選取態樣式——那是
                留給「目前選中哪一筆」這種持續性狀態用的。 */}
            {matchId && openSubmenu === "export" && (
              <div
                data-testid="nav-rail-export-submenu"
                // max-h-28（112px）≈ 兩列（每列 h-14＝56px）的高度，超過的部分自己捲
                // （issue #173，PO 決定）：戰術清單長度不可預期，一場比賽存十幾張戰術是
                // 正常的，若讓子清單無限往下長，整條側欄會被它撐爆、上面的導覽入口全被
                // 擠出畫面。露出兩列剛好能讓使用者看出「這裡是可以捲的清單」，又不會吃掉
                // 導覽本身的空間。
                className="relative ml-4 flex max-h-28 flex-col gap-1 overflow-y-auto
                  border-l border-white/[0.15] py-1 pl-3"
              >
                <button
                  type="button"
                  onClick={handleExportPNG}
                  data-testid="button-nav-rail-export-png"
                  className="flex h-14 items-center rounded-lg px-3 text-left text-sm font-semibold
                    text-[#f5f5f0]/80 transition hover:bg-white/[0.06]"
                >
                  匯出 PNG
                </button>
                <button
                  type="button"
                  onClick={handleExportJSON}
                  data-testid="button-nav-rail-export-json"
                  className="flex h-14 items-center rounded-lg px-3 text-left text-sm font-semibold
                    text-[#f5f5f0]/80 transition hover:bg-white/[0.06]"
                >
                  匯出 JSON
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-nav-rail-import-json"
                  className="flex h-14 items-center rounded-lg px-3 text-left text-sm font-semibold
                    text-[#f5f5f0]/80 transition hover:bg-white/[0.06]"
                >
                  匯入 JSON
                </button>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleImportJSON}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* NewTacticDialog 只在有 matchId 時可能被開啟（handleOpenNewTacticDialog 只有 matchId
          存在的收合／展開分支才連得到），沒有 matchId 就不渲染，跟原本 TacticsRailMenu 的
          作法一致。 */}
      {matchId && (
        <NewTacticDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          matchId={matchId}
          onStarted={goToBoard}
          captureCurrent={props.captureCurrent}
          captureLabel={props.captureLabel}
          captureDisabled={props.captureDisabled}
        />
      )}
    </nav>
  );
}

// ── 收合態的單一入口（比/計/數/戰/出共用同一顆，用 props 分辨是連結、停用、還是可展開的
// toggle）──
//
// 為什麼不比照原本 MatchNavRail.tsx 拆成三種各自獨立的函式？因為視覺樣式（h-11 w-11、
// 圓角、選取態/停用態的色票）三種變體幾乎完全一樣，只有「按下去要幹嘛」不同——用一個函式
// 加上條件分支，比三份幾乎相同的 JSX 更不容易出現「改了一種忘了改另一種」的漂移。
function CollapsedEntry({
  glyph,
  label,
  href,
  isActive,
  onDisabledClick,
  onToggle,
}: {
  glyph: string;
  label: string;
  href?: string;
  isActive: boolean;
  onDisabledClick?: () => void;
  onToggle?: () => void;
}) {
  const sizeClass = "flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold";

  // 停用態優先判斷：href 沒給值（代表這格需要 matchId 但目前沒有）時，onDisabledClick 一定
  // 有值（呼叫端的收合/展開兩處都是成對傳的），渲染成會跳 toast 的按鈕。
  if (onDisabledClick) {
    return (
      <button
        type="button"
        aria-disabled="true"
        title="先選一場比賽"
        onClick={onDisabledClick}
        data-testid={`button-nav-rail-collapsed-${glyph}`}
        className={`${sizeClass} cursor-not-allowed text-white/25`}
      >
        {glyph}
      </button>
    );
  }

  // onToggle 有值：這是「戰」或「出」，點擊不導航，改成展開側欄 + 掀開子清單（見上面
  // toggleSubmenu 的說明）。
  if (onToggle) {
    return (
      <button
        type="button"
        aria-haspopup="menu"
        aria-label={label}
        title={label}
        onClick={onToggle}
        data-testid={`button-nav-rail-collapsed-${glyph}`}
        className={`${sizeClass} transition-colors ${
          isActive ? STRONG_SELECT_CLASS : "text-white/60 hover:text-[#c6f135]"
        }`}
      >
        {glyph}
      </button>
    );
  }

  return (
    <Link
      href={href!}
      aria-current={isActive ? "page" : undefined}
      aria-label={label}
      title={label}
      data-testid={`link-nav-rail-collapsed-${glyph}`}
      className={`${sizeClass} transition-colors ${
        isActive ? STRONG_SELECT_CLASS : "text-white/60 hover:text-[#c6f135]"
      }`}
    >
      {glyph}
    </Link>
  );
}

// ── 展開態的單一入口：跟 CollapsedEntry 同一套分支邏輯，差別只在「顯示完整文字、字級放大、
// 整行（而不是一個 44×44 方塊）當作可點擊區域」，符合 docs/layout-spec.md §2.2 的
// 「入口變成完整文字」「當前入口整條反白」。isOpen 額外用來標示「戰」/「出」子清單目前是否
// 掀開——這不是 #134 定案的兩層選取語意（強階/弱階）的一部分，它標示的是「這個觸發器底下的
// 子清單現在看不看得到」，跟「使用者現在停在哪一頁」是兩件不同的事，所以刻意用比選取態更
// 收斂的樣式（純文字顏色變化，不套 lime 底色/細環），避免使用者把「子清單開著」誤讀成
// 「這是目前所在的頁面」。
function ExpandedEntry({
  glyph,
  label,
  href,
  isActive,
  isOpen,
  onDisabledClick,
  onToggle,
  onHoverOpen,
}: {
  glyph: string;
  label: string;
  href?: string;
  isActive: boolean;
  isOpen?: boolean;
  onDisabledClick?: () => void;
  onToggle?: () => void;
  onHoverOpen?: () => void;
}) {
  // h-14（56px）是 Tailwind 內建刻度裡最接近 layout-spec §2.2 寫的「58px 高的字框」的值——
  // 這份 spec 本來就講過不用逐 px 照抄（見 §0），56 跟 58 差 2px 肉眼分不出來。
  const baseClass =
    "flex h-14 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold";

  if (onDisabledClick) {
    return (
      <button
        type="button"
        aria-disabled="true"
        title="先選一場比賽"
        onClick={onDisabledClick}
        data-testid={`button-nav-rail-expanded-${glyph}`}
        className={`${baseClass} cursor-not-allowed text-white/25`}
      >
        <span className="w-5 text-center">{glyph}</span>
        {label}
      </button>
    );
  }

  if (onToggle) {
    return (
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
        // hover 掀開子清單（滑鼠使用者）＋ 點擊切換（觸控裝置沒有 hover，見 toggleSubmenu
        // 上方的說明）。兩種輸入方式各自都能單獨把清單打開，不互相依賴。
        onMouseEnter={onHoverOpen}
        data-testid={`button-nav-rail-expanded-${glyph}`}
        className={`${baseClass} transition-colors ${
          isActive
            ? STRONG_SELECT_CLASS
            : isOpen
              ? "bg-white/[0.06] text-[#f5f5f0]"
              : "text-white/70 hover:text-[#c6f135]"
        }`}
      >
        <span className="w-5 text-center">{glyph}</span>
        {label}
      </button>
    );
  }

  return (
    <Link
      href={href!}
      aria-current={isActive ? "page" : undefined}
      data-testid={`link-nav-rail-expanded-${glyph}`}
      className={`${baseClass} transition-colors ${
        isActive ? STRONG_SELECT_CLASS : "text-white/70 hover:text-[#c6f135]"
      }`}
    >
      <span className="w-5 text-center">{glyph}</span>
      {label}
    </Link>
  );
}
