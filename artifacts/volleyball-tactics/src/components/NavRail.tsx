import { useRef, useState } from "react";
import type { FocusEvent } from "react";
import { Link } from "wouter";
import BrandLogo from "./BrandLogo";
import NavListIcon from "./icons/NavListIcon";
import NavSwordsIcon from "./icons/NavSwordsIcon";
import NavChartIcon from "./icons/NavChartIcon";
import NavPeopleIcon from "./icons/NavPeopleIcon";

// issue #372（範圍第 1、3 點）：左欄的判準改成「需不需要先指定一場比賽才有意義」，取代掉
// #173 那一版「比／計／數／戰／出」五格＋停用態＋子清單的設計。
//
// 為什麼整組砍掉重練，而不是在舊版上面修：PO 在 #372 重新盤點四格之後拍板，四格全部都是
// 「不需要先選比賽」的目的地——比賽列表本身、跨場的數據分析紀錄本、空板可開的戰術板、
// 人員名單管理——所以左欄不再需要知道「現在有沒有選中一場比賽」這件事，NavRail 從此不吃
// matchId，也就不需要停用態（灰掉＋跳「先選一場比賽」toast）、不需要子清單（戰術清單／
// 匯出匯入飛出選單）、不需要 hover-open 的觸控替代方案。這些機制存在的唯一理由就是「這格
// 需要 matchId 才有合法目的地」，前提一旦不成立，機制本身就是要拆的東西，不是可以留著但關掉
// 的選配。
//
// 計分表（原本的「計」）沒有跟著留下來：它就是需要先選比賽才有意義的那一種，改成只從比賽
// 卡片展開的入口進（MatchEntryLinks.tsx），不再佔左欄一格。

export type ActivePage = "list" | "analytics" | "board" | "people";

// 「這場比賽的『回上一層』該回哪裡」——原本住在 MatchNavRail.tsx，原封不動搬過來，理由跟
// 之前完全一樣：比賽如果被歸在某個資料夾（tournament）底下，返回時就回那個資料夾內頁；
// 沒有歸資料夾的散場比賽才回最外層的比賽列表。三個 match-scoped 頁面
//（TacticsBoard/ScoreSheet/MatchAnalytics）都要用到，所以放在這個模組裡當單一事實來源。
export function matchBackHref(tournamentId: string | null | undefined): string {
  return tournamentId ? `/tournaments/${tournamentId}` : "/";
}

// props 收斂成一個純物件：#372 之前是 discriminated union（有沒有 matchId 決定要不要一併
// 給「擷取現在站位」的邏輯），現在四格全部是固定目的地的普通連結，不再有任何一格需要呼叫端
// 額外注入邏輯，union 也就沒有存在的理由了。
//
// active 允許 `ActivePage | "none"`：不是每個掛 NavRail 的頁面都對應到左欄的某一格——計分頁
// 是最明顯的例子，它現在完全不在左欄裡（見上面的說明），但它仍然要渲染這條導覽軌讓使用者能
// 離開。"none" 就是給這種頁面用的：四格都不套用選取態，誠實反映「這一頁在左欄沒有格子代表
// 它」，而不是隨便掛一個看起來像那麼回事、其實不對的 active 值。
export interface NavRailProps {
  backHref: string;
  active: ActivePage | "none";
}

// ── 選取狀態視覺（issue #134 環 0 定案，直接照抄，不要在這裡自創新的色階）──
// 強階：目前所在的導覽入口整行。#372 之後子清單整組拆掉，弱階（子清單裡選中的那一筆）
// 沒有消費者了，這裡不再保留 WEAK_SELECT_CLASS——留著會被 eslint 的 no-unused-vars 抓到。
const STRONG_SELECT_CLASS = "bg-[#c6f135]/15 ring-1 ring-inset ring-[#c6f135] text-[#c6f135]";

export default function NavRail({ backHref, active }: NavRailProps) {
  // expanded：側欄是不是展開中（hover 或鍵盤 focus 觸發）。#372 之前這裡還有 openSubmenu
  // （「戰」／「出」子清單開關）跟一堆只為了子清單/停用態存在的 state／ref／store 訂閱——
  // 四格全部變成固定目的地的連結之後，子清單機制整組沒有消費者了，一併拆掉。
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLElement>(null);

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
  //
  // ⚠️ jsdom 的 hover 測試坑（#168 第一次踩到、#372 沿用同一顆元件所以坑還在）：jsdom
  // 沒有排版引擎，userEvent 連續把游標移到兩個元素上時，第一個元素收到的 mouseout 事件
  // relatedTarget 會是 null（真實瀏覽器裡會是新的那個元素）。React 把「離開了、不知道去
  // 哪」合成成 mouseLeave 派給 <nav>，這裡的 closeByHover 就會把整條側欄收掉——如果測試裡
  // 連續對側欄內兩個元素做 userEvent 互動，中間那次遊標移動就會把側欄關掉，點擊打在已經
  // 卸載的節點上。NavRail.test.tsx 因此固定用 fireEvent（不動游標狀態）先把面板打開，
  // 只在最後一步真正要驗證互動的地方才用 userEvent。
  const closeByBlur = (e: FocusEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setExpanded(false);
    }
  };

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
        {/* 品牌字標，2026-08-07 對齊 Claude Design 的 tokens/logo.html：置頂、置中，
            22px（DS 文件標明的漸層版可讀下限，剛好對應導覽軌這種窄欄情境）。收合／
            展開兩態各自的容器寬度不同，所以下面展開面板頂端另外重複渲染一次，不是
            共用同一個 DOM 節點（展開面板是 absolute 疊上去的另一層，見下方說明）。 */}
        <div className="flex w-full justify-center pb-2">
          <BrandLogo style={{ fontSize: 22 }} />
        </div>
        <CollapsedEntry
          glyph="比"
          icon={<NavListIcon className="size-5" />}
          label="比賽列表"
          href={backHref}
          isActive={listActive}
        />
        <CollapsedEntry
          glyph="數"
          icon={<NavChartIcon className="size-5" />}
          label="數據分析"
          href="/analytics"
          isActive={active === "analytics"}
        />
        <CollapsedEntry
          glyph="戰"
          icon={<NavSwordsIcon className="size-5" />}
          label="戰術板"
          href="/board"
          isActive={active === "board"}
        />
        <CollapsedEntry
          glyph="人"
          icon={<NavPeopleIcon className="size-5" />}
          label="人員名單"
          href="/analytics/people/manage"
          isActive={active === "people"}
        />
      </div>
      {/* #372 之前這裡還有 mt-auto 的下方群組（「戰」「出」兩格，靠 mt-auto 把它們推到
          導覽軌底部，跟上方三格拉開距離，暗示這兩格是比較「進階」的操作）。四格現在全部
          等重、放在同一組（見上面），不再需要這條視覺分隔。
          票面（#372）留了一個未來的位置：大記分板（給場邊觀眾看的大螢幕比分視圖）預計
          會是另一個獨立入口，屆時再決定要不要用 mt-auto 這種「底部另開一組」的排法。 */}

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
          {/* 展開態是另一層疊上去的 DOM（absolute inset-0），跟上面收合本體的字標不是
              同一個節點，所以要在這裡重複放一次，見上面收合本體那邊的說明。 */}
          <div className="flex w-full justify-center pb-2">
            <BrandLogo style={{ fontSize: 22 }} />
          </div>
          <div className="flex flex-col gap-1">
            <ExpandedEntry
              glyph="比"
              icon={<NavListIcon className="size-5" />}
              label="比賽列表"
              href={backHref}
              isActive={listActive}
            />
            <ExpandedEntry
              glyph="數"
              icon={<NavChartIcon className="size-5" />}
              label="數據分析"
              href="/analytics"
              isActive={active === "analytics"}
            />
            <ExpandedEntry
              glyph="戰"
              icon={<NavSwordsIcon className="size-5" />}
              label="戰術板"
              href="/board"
              isActive={active === "board"}
            />
            <ExpandedEntry
              glyph="人"
              icon={<NavPeopleIcon className="size-5" />}
              label="人員名單"
              href="/analytics/people/manage"
              isActive={active === "people"}
            />
          </div>
        </div>
      )}
    </nav>
  );
}

// ── 收合態的單一入口（四格共用同一顆）──
//
// #372 之前這裡還要分「連結 / 停用按鈕（跳 toast） / 可展開的 toggle（掀子清單）」三種變體，
// 現在四格全部是固定目的地的連結，三選一的分支邏輯整組拆掉，只剩最單純的 <Link>。
function CollapsedEntry({
  glyph,
  icon,
  label,
  href,
  isActive,
}: {
  glyph: string;
  icon?: React.ReactNode;
  label: string;
  href: string;
  isActive: boolean;
}) {
  const sizeClass = "flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold";

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      aria-label={label}
      title={label}
      data-testid={`link-nav-rail-collapsed-${glyph}`}
      className={`${sizeClass} transition-colors ${
        isActive ? STRONG_SELECT_CLASS : "text-white/60 hover:text-[#c6f135]"
      }`}
    >
      {icon ?? glyph}
    </Link>
  );
}

// ── 展開態的單一入口：跟 CollapsedEntry 同一套邏輯，差別只在「顯示完整文字、字級放大、
// 整行（而不是一個 44×44 方塊）當作可點擊區域」，符合 docs/layout-spec.md §2.2 的
// 「入口變成完整文字」「當前入口整條反白」。
function ExpandedEntry({
  glyph,
  icon,
  label,
  href,
  isActive,
}: {
  glyph: string;
  icon?: React.ReactNode;
  label: string;
  href: string;
  isActive: boolean;
}) {
  // h-14（56px）是 Tailwind 內建刻度裡最接近 layout-spec §2.2 寫的「58px 高的字框」的值——
  // 這份 spec 本來就講過不用逐 px 照抄（見 §0），56 跟 58 差 2px 肉眼分不出來。
  const baseClass =
    "flex h-14 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold";

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      data-testid={`link-nav-rail-expanded-${glyph}`}
      className={`${baseClass} transition-colors ${
        isActive ? STRONG_SELECT_CLASS : "text-white/70 hover:text-[#c6f135]"
      }`}
    >
      <span className="w-5 text-center">{icon ?? glyph}</span>
      {label}
    </Link>
  );
}
