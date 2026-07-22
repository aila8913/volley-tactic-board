import type { ReactNode } from "react";
import { Link } from "wouter";

// 這場比賽底下三個分頁（戰術板／計分表／數據分析）+「回列表」共用的左側導覽軌。
//
// 為什麼要抽成一個共用元件、而不是讓每個頁面自己寫一排導覽連結？
// 這三個頁面（TacticsBoard / ScoreSheet / MatchAnalytics）以前各自在自己的 <header>
// 裡手刻「跳去另一頁」的連結，結果三頁的導覽長得都不太一樣（有的用 <Link>、有的用
// <Button asChild>，位置、字樣也各寫各的）。抽成一個共用元件之後，「這場比賽有哪些
// 分頁、順序長怎樣」只在這一個檔案定義——之後要加第五個分頁、調整順序或改配色，
// 改這裡一個地方，三個頁面自動一起變，不會漏改到某一頁。這是很常見的「單一事實來源」
// （single source of truth）概念：重複的 UI 邏輯散在多處，改一次要記得改 N 次，
// 遲早會有一次漏改造成三頁不一致。
// issue #172：新增 "list" 這個值，代表現在停在比賽列表／資料夾內頁（MatchList.tsx /
// TournamentDetail.tsx）——這兩頁不屬於任何一場比賽，之前沒有掛這條導覽軌，環 1 把 AppShell
// 抽出來後順便讓它們也用上共用導覽軌，所以要多一個「現在在列表」的 active 狀態可以標記。
type ActivePage = "board" | "record" | "analytics" | "list";

type MatchNavRailProps = {
  // issue #172：改成可選。MatchList.tsx／TournamentDetail.tsx 這兩頁本來就不在「某一場比賽」
  // 底下（使用者可能還沒選、或正在看的是資料夾而不是單場比賽），沒有 matchId 可傳。
  // 沒有 matchId 時，「計」「數」「戰」這三個要靠 matchId 組出網址的入口沒有地方可以連過去，
  // 下面會把它們渲染成停用狀態，而不是硬塞一個假的 matchId 生出一個連過去會 404 的連結。
  matchId?: string;
  backHref: string;
  active: ActivePage;
  // issue #160 C3：計分頁要把「戰」按鈕換成一個會展開飛出選單（列出已存戰術＋新增戰術）的
  // 觸發器，而不是單純跳頁的連結。這個元件本身刻意維持 dumb（見檔案開頭的說明），不知道
  // 「戰術選單長什麼樣、要接哪些 API」，所以把整塊內容當一個 React 節點從外面傳進來——
  // 有傳就渲染呼叫端給的東西取代原本的 <Link>，沒傳（TacticsBoard.tsx / MatchAnalytics.tsx
  // 這兩個呼叫端）就完全維持原本「戰」是純導覽連結的行為，不會有任何差異。
  boardSlot?: ReactNode;
};

// 為什麼 active 是外面傳進來的 prop、不是這個元件自己讀路由去判斷？
// wouter 提供 useRoute 之類的 hook，理論上這個元件可以自己讀當下網址、比對出「現在在
// 哪一頁」。但那樣一來這個元件就必須知道三個頁面各自的路由字串長怎樣，變成跟「外面」
// 綁死。故意留成 dumb component（純粹依賴傳入的 props 畫圖、不自己讀外部狀態）
// 有兩個好處：一是好測試/好預覽——不用真的掛在某個路由底下也能單獨渲染看畫面；
// 二是呼叫端（TacticsBoard.tsx 等）本來就百分之百知道「我是哪一頁」，讓它直接告訴
// 這個元件比讓元件自己猜路由字串更直接、也更不容易因為路由改名而跟著壞掉。
type NavItemDef = {
  key: ActivePage | "back";
  glyph: string; // 顯示用的單字（比 / 計 / 數 / 戰）
  label: string; // aria-label / title 用的完整詞（螢幕閱讀器 & 滑鼠 hover 提示用）
  href: string;
  // issue #172：這個入口需不需要 matchId 才連得過去。「計」「數」「戰」的網址都是
  // `/matches/${matchId}/...`，沒有 matchId 就沒有合法目的地；「比」永遠回得去列表，
  // 不需要 matchId。
  requiresMatch?: boolean;
};

// 「這場比賽的『回上一層』該回哪裡」——這條規則三個頁面都要用，所以放在導覽軌
// 這個模組裡當單一事實來源，而不是每頁各寫一次同樣的三元判斷。
//
// 規則本身：比賽如果被歸在某個資夾（tournament）底下，返回時就回那個資夾內頁；
// 沒有歸資夾的散場比賽才回最外層的比賽列表。之所以要分這兩種情況，是因為使用者
// 是從資夾點進來的話，直接把他丟回最外層列表會讓他得再點一次資夾才回得去原位。
//
// 參數收 tournamentId 而不是整包 match 物件，是為了讓這個函式不必知道 match 的
// 完整型別長怎樣——它只需要這一個欄位，收得越少、能重用的地方越多，也不會因為
// match 型別以後多長出欄位就得跟著改。
export function matchBackHref(tournamentId: string | null | undefined): string {
  return tournamentId ? `/tournaments/${tournamentId}` : "/";
}

export default function MatchNavRail({ matchId, backHref, active, boardSlot }: MatchNavRailProps) {
  // 上半群組：回列表、計分表、數據分析——這三個是「常態」入口。
  // 「計」「數」的 href 在沒有 matchId 時組不出合法網址（會變成 `/matches/undefined/...`），
  // 但反正 requiresMatch 為真時 NavRailItem 根本不會把它當連結渲染，href 值不會被用到——
  // 這裡還是給一個字串只是為了滿足型別、避免額外處理 undefined 的分支。
  const topItems: NavItemDef[] = [
    { key: "back", glyph: "比", label: "比賽列表", href: backHref },
    {
      key: "record",
      glyph: "計",
      label: "計分",
      href: `/matches/${matchId}/record`,
      requiresMatch: true,
    },
    {
      key: "analytics",
      glyph: "數",
      label: "數據",
      href: `/matches/${matchId}/analytics`,
      requiresMatch: true,
    },
  ];

  // 「戰」（戰術板）單獨拉到最下面，用 mt-auto 頂到 rail 底部，跟上面三個明顯分開一段距離。
  // 這是 PO 在 #160 的產品決策：戰術板現在被定位成「次要」入口——賽前排陣用一次就好，
  // 平常盯場多半停留在計分/數據頁。之後（見 #160 的後續 PR）會在計分頁加「快速排陣」
  // 之類的按鈕當作進戰術板的主要途徑，這裡的「戰」只是保底、隨時能回去的備用入口，
  // 所以刻意排在視覺上最不顯眼的位置，而不是跟其他三個平起平坐。
  const boardItem: NavItemDef = {
    key: "board",
    glyph: "戰",
    label: "戰術",
    href: `/matches/${matchId}/board`,
    requiresMatch: true,
  };

  return (
    // w-full h-full：撐滿 AppShell 左欄插槽給的尺寸。issue #172 之前這裡是寫死的
    // `w-16 shrink-0`，現在「左欄多寬」由 AppShell 的 NAV_WIDTH 常數獨家決定（驗收條件
    // 就是「三欄寬度只在那一個檔案裡定義」），這個元件只負責填滿被分配到的空間——
    // 兩邊都寫一次寬度的話，以後環 2 調寬度時改了 AppShell 卻忘了改這裡，rail 的背景色塊
    // 就會跟欄位寬度對不齊，露出一條沒上色的縫。
    // 配色跟 TacticsBoard.tsx 現有的「玻璃感」chrome 用同一組 token：半透明白底
    // （bg-white/[0.02]）+ 模糊背景（backdrop-blur-sm）+ 極淡邊框，維持整個 app
    // 一致的深色玻璃質感，不要每個地方各配一種深淺。
    <nav
      className="flex h-full w-full flex-col border-r border-white/[0.08]
        bg-white/[0.02] font-dash text-[#f5f5f0] backdrop-blur-sm"
    >
      {/* active="list"（比賽列表／資料夾內頁）要點亮的是「比」，但「比」這一項的 key 歷史上
          叫 "back"（它在 match-scoped 頁面的語意是「回上一層」）。與其為了對齊而去改 key 名字
          （那會牽動 boardSlot 之外所有呼叫端），這裡用一個小小的對照把兩種語意接起來：
          在列表頁時，「比」就是當前頁。 */}
      <div className="flex flex-col items-center gap-1 py-3">
        {topItems.map((item) => (
          <NavRailItem
            key={item.key}
            item={item}
            isActive={item.key === active || (active === "list" && item.key === "back")}
            hasMatch={matchId !== undefined}
          />
        ))}
      </div>
      {/* mt-auto：在 flex-column 容器裡把自己推到最底——這是「戰」被壓到 rail
          最下方、跟上面三個拉開距離的關鍵，不用另外算 margin 數字。
          boardSlot 有傳（目前只有 ScoreSheet.tsx）就整個取代下面的 <NavRailItem>——飛出
          選單的觸發按鈕長得跟 NavRailItem 很像，但它自己內部還要接一片絕對定位的選單、
          管開關狀態，這些邏輯不屬於這個 dumb rail，所以整塊交給呼叫端決定要放什麼。
          （boardSlot 只會由已經知道自己 matchId 的 ScoreSheet.tsx 傳進來，沒有 matchId
          的列表型頁面不會用到這個分支，不用在這裡額外判斷 hasMatch。） */}
      <div className="mt-auto flex flex-col items-center gap-1 py-3">
        {boardSlot ?? (
          <NavRailItem
            item={boardItem}
            isActive={boardItem.key === active}
            hasMatch={matchId !== undefined}
          />
        )}
      </div>
    </nav>
  );
}

// issue #172：為什麼「沒有 matchId 就渲染停用態」是寫在同一個 NavRailItem 裡的 if 分支，
// 而不是乾脆做兩個元件（一個給「有比賽」的頁面、一個給「純列表」的頁面）？
// 因為環 2（#173）已經排定要把整條軌道改成「hover 展開＋active 整行反白＋戰術子清單」，
// 那些邏輯不管有沒有 matchId 都是同一套（列表頁一樣要能 hover 展開看到「比賽列表」被
// 反白）。如果現在就分成兩個元件，環 2 動手時勢必要同時改兩份幾乎一樣的程式碼，兩份
// 遲早會抄錯一次、慢慢分岔成兩套不同步的行為——回到這個檔案開頭說明過的「重複 UI 邏輯
// 散在多處」的老問題。停用態本身的語意其實很單純：「這個入口需要先選一場比賽才能用」，
// 用一個 if 就能誠實表達，沒有理由為了這麼小的差異拆成兩個元件。
function NavRailItem({
  item,
  isActive,
  hasMatch,
}: {
  item: NavItemDef;
  isActive: boolean;
  hasMatch: boolean;
}) {
  // 需要 matchId 但目前沒有 matchId 的入口，例如使用者停在比賽列表、還沒點進任何一場比賽時
  // 的「計」「數」「戰」。渲染成不可互動的 <span>（不是 <Link>，避免跳去一個 matchId 是
  // undefined 的壞網址），並用 aria-disabled + title 告訴使用者「為什麼點不動」。
  const disabled = item.requiresMatch === true && !hasMatch;

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        title="先選一場比賽"
        // 樣式沿用一般未選中狀態的 text-white/60，再降一階到 text-white/25，讓「純粹沒選中」
        // 跟「選不了」在視覺上有明顯區別，不會讓使用者以為只是還沒點過去而已。
        // cursor-not-allowed 是額外的滑鼠提示，加強「這裡點不動」的訊號。
        className="flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-lg
          text-lg font-bold text-white/25"
      >
        {item.glyph}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      // aria-current="page" 是給螢幕閱讀器/輔助科技用的語意標記，告訴使用者「這個
      // 連結就是你現在所在的頁面」——因為視覺上這裡只顯示一個中文字，看不出文字
      // 意涵的使用者光聽 aria-label 讀出「計分」還不夠，還要知道是不是當前頁。
      aria-current={isActive ? "page" : undefined}
      aria-label={item.label}
      title={item.label}
      className={`flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold
        transition-colors ${
          isActive ? "bg-white/[0.06] text-[#c6f135]" : "text-white/60 hover:text-[#c6f135]"
        }`}
    >
      {item.glyph}
    </Link>
  );
}
