import React, { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import AppShell, { ShellMode } from "../components/AppShell";
import NavRail, { matchBackHref } from "../components/NavRail";
import NewTacticDialog from "../components/NewTacticDialog";
import BoardMatchPicker from "../components/BoardMatchPicker";
import TacticsExportMenu from "../components/TacticsExportMenu";
import TacticsBoardRail from "../components/TacticsBoardRail";
import TacticsEditToolRail from "../components/TacticsEditToolRail";
import ArrangingRail from "../components/ArrangingRail";
import Court from "../components/Court";
import { useMatchWithRoster } from "../hooks/useMatches";
import { useHydrateLineup } from "../hooks/useHydrateLineup";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard, isSessionDirty } from "../hooks/useTacticsBoard";
import { useTacticsBoardController } from "../hooks/useTacticsBoardController";
import { APP_BACKGROUND_STYLE, APP_SHELL_CLASS } from "../lib/appChromeStyles";
import { PRIMARY_BTN_CLASS } from "../lib/tacticsBoardStyles";

export default function TacticsBoard() {
  // #372：/board（空板）沒有 :id 這個路由段，id 會是 undefined。matchId 統一改成
  // `string | null`（undefined 對「沒有值」這件事沒有額外語意，用 null 讓下面每處判斷跟
  // 其他地方既有的「matchId: string | null」型別——例如 CourtSnapshot.matchId——一致，不用
  // 到處寫 `id ?? undefined` / `id ?? null` 混用）。
  const { id } = useParams<{ id?: string }>();
  const matchId = id ?? null;
  const [, setLocation] = useLocation();
  // URL 的 id 是字串，後端 match id 是整數，取用前轉成 number。沒有比賽時 enabled=false，
  // 這條查詢完全不會發——不然 Number(undefined) 會是 NaN，送去打 /matches/NaN 只會換來一個
  // 400，還會在 React Query 的快取裡佔一個沒有意義的 key。
  const { match } = useMatchWithRoster(Number(id), matchId !== null);
  const setRoster = useRotationTable((state) => state.setRoster);
  const resetBoardView = useTacticsBoard((state) => state.resetBoardView);
  const startSession = useTacticsBoard((state) => state.startSession);
  // session !== null＝正在編輯一張戰術：這一個欄位同時決定「AppShell 要用 mode B / C / D」
  // （下面）跟「aside/tools 該放什麼」，是這一環（issue #176）新增的唯一畫面分支——issue #177
  // 再加一層：session.arranging 進一步決定 C 跟 D 兩態。
  const session = useTacticsBoard((state) => state.session);
  // 唯讀檢視中的那張已存戰術（PR B）——球場右上角的模式鈕在「檢視中」要顯示「編輯」，
  // 就是靠這個欄位判斷（見下面球場容器內那顆按鈕的說明）。
  const viewingScene = useTacticsBoard((state) => state.viewingScene);
  const enterEditFromViewing = useTacticsBoard((state) => state.enterEditFromViewing);
  // 「新增戰術」中央浮層開關（issue #177）：左欄 NavRail／TacticsBrowsePanel 按「+ 新增
  // 戰術」時由它們呼叫 store 的 openNewTactic() 打開，這裡只負責讀狀態、渲染浮層本身。
  const newTacticOpen = useTacticsBoard((state) => state.newTacticOpen);
  const closeNewTactic = useTacticsBoard((state) => state.closeNewTactic);
  const openNewTactic = useTacticsBoard((state) => state.openNewTactic);
  // 跟後端互動的 mutation/handler 現在收斂進這支 hook（issue #176），這裡只呼叫一次，
  // 拿到的同一份物件分別餵給下面 aside 的 TacticsBoardPanel 跟 tools 的
  // TacticsEditToolRail——兩邊看到的 saving/savingAs pending 狀態保證同步，理由見
  // hooks/useTacticsBoardController.ts 開頭的說明。
  const controller = useTacticsBoardController(id);

  // mode：B（沒在編，含唯讀檢視）／D（佈陣中：session.arranging）／C（編輯中：session 存在
  // 但已按過「確定」）。三態互斥，直接用 session 的兩個欄位算，不額外存 state（issue #177
  // 延續 #160/#154「能推導就不多存」的原則——這裡 D/C 的判斷雖然要多看 session.arranging
  // 這個顯式欄位，但那顆旗標本身的必要性已經在 useTacticsBoard.ts 交代過，這裡只是讀它）。
  const mode: ShellMode = session ? (session.arranging ? "D" : "C") : "B";

  // 切換到某一場戰術板時，把全域、暫時性的畫面狀態（undo 歷史、布置模式、視圖）歸零
  //（issue #119）：這些是全域共用、但戰術資料是 per-match，不歸零的話從 A 場帶著歷史
  // 切到 B 場再按 Ctrl+Z 會把 A 的快照還原進 B。
  // 傳入 id 之後，resetBoardView 會分辨「跨場」跟「同一場內的交棒」——只有 matchId 真的
  // 變動（跨場）才會清掉 session；同一場（例如從計分頁的「快速戰術板」按鈕先 startSession()
  // 再導航過來，見 ScoreSheet.tsx）進來時，交棒的 session 會被保留（issue #160 C3）。
  useEffect(() => {
    resetBoardView(matchId);
  }, [matchId, resetBoardView]);

  // 進入戰術板時，把這場比賽名單帶進來，這樣球員設定才會跟外面比賽列表輸入的資訊一致。
  // 只在比賽資料本身變動時才重新同步，不然每次 render 都會跑。
  // setRoster 現在要指定 matchId（issue #119）：名單存進「這一場」的分片，不會污染別場。
  // 沒有比賽（match/matchId 任一為空）時整段 no-op——空板沒有名單可帶，也不該把上一場
  // 殘留的 match 資料（React Query 快取還沒切換完成前的舊值）誤塞進某個分片。
  useEffect(() => {
    if (match && matchId) {
      setRoster(matchId, match.players);
    }
  }, [match, matchId, setRoster]);

  // 已經開賽／打完的比賽，站位不在 useRotationTable 裡（那份 store 只有計分頁「排先發」
  // 那一個寫入點，而且刻意不 persist），所以六宮格對這些比賽一律空白——issue #431。這支
  // hook 把後端已凍結的先發補進 store，右欄兩種六宮格（mode B 的站位分頁、mode D 的
  // ArrangingRail）都是直接訂閱 store 的，資料一到就會自己畫出來。
  //
  // 擺在 setRoster 效果**後面**：同一次 commit 裡多個 effect 按原始碼順序執行，先有名單、
  // 後補站位。兩邊誰先到其實都不會壞（setRoster 的幽靈站位清理只掃「不在名單上的人」，而
  // 先發裡的六個人本來就在名單裡），但「先名單、後站位」是這頁其他效果一致的假設，順序照著
  // 排比較不用每次都重新推一遍。
  useHydrateLineup(matchId);

  // #372 決策②③：header 的「選比賽」下拉選了別場之後，要「借那一場最後的輪轉站位」直接
  // 開一個佈陣中（mode D）的 session——但站位資料要等新場的名單真的進了 useRotationTable
  // 才讀得到（見上面的 setRoster 效果）。這裡先把「選了哪一場、還沒借到站位」記在一個
  // local state，等下面這個效果偵測到「路由已經切到那一場、而且（透過上面那個效果）名單
  // 應該也已經寫進 store 了」才真的去借。
  //
  // 為什麼用 local useState 而不是塞進 Zustand：這個旗標只有這個頁面自己在乎（「我剛剛
  // 導頁過來，是不是該借站位」），沒有其他元件需要知道，符合這個檔案一貫「跨元件共用才進
  // store、頁面自己的暫時狀態留在 local」的分法（同一種考量見 TacticsEditToolRail.tsx 的
  // rosterOpen）。
  const [pendingRotationMatchId, setPendingRotationMatchId] = useState<string | null>(null);

  // ⚠️ 這個效果必須寫在上面 setRoster 效果的**後面**（原始碼順序，不是執行時機的巧合）：
  // React 對同一次 commit 裡的多個 useEffect，是照它們在元件裡出現的先後順序依序執行的。
  // 當「切場後名單終於抓回來」這一刻發生時（match 從 undefined 變成有值），上面的 setRoster
  // 效果與這個效果會在**同一次 commit**裡先後被呼叫——upstream 先把新名單寫進
  // useRotationTable，這個效果才呼叫 controller.captureCurrentFromRotation()，而它內部是用
  // useRotationTable.getState() 讀「當下」的 store（見 useTacticsBoardController.ts 的說明），
  // 不是 React 訂閱值，所以能不能讀到剛寫進去的名單，完全取決於「寫」跟「讀」誰先執行。
  // 如果這兩個效果的順序對調（讀寫效果先於寫入效果），這裡讀到的會是切場前的舊分片（或空的），
  // 借回來的站位就會是錯的一場——而且因為兩份資料形狀相似，錯誤不容易被肉眼發現，是那種
  // 「日後有人為了排版方便把效果搬動順序」就會悄悄壞掉的耦合，所以特別寫這段註解說明。
  const captureCurrentFromRotation = controller.captureCurrentFromRotation;
  useEffect(() => {
    if (pendingRotationMatchId !== null && matchId === pendingRotationMatchId && match) {
      startSession(captureCurrentFromRotation(), { arranging: true });
      setPendingRotationMatchId(null);
    }
  }, [pendingRotationMatchId, matchId, match, startSession, captureCurrentFromRotation]);

  // header 的「選比賽」下拉觸發的入口：決定要不要跳確認、要不要導頁、要不要之後借站位。
  // 三種狀況都在這裡集中處理，BoardMatchPicker 本身只負責畫下拉、回報選了什麼（見該檔案
  // 開頭的說明），不知道選了之後會發生什麼事。
  const handleSelectMatch = (chosen: string | null) => {
    // 決策③：板上有未存內容時，選比賽「跳確認、確認後套用」——不是「拒絕、請使用者自己先清
    // 空再選」。使用者按了「確定」代表他知道會蓋掉現有內容，直接照做；按「取消」則什麼都不做，
    // 下拉的顯示值繼續綁著目前的 matchId（controlled component，見 BoardMatchPicker 的
    // matchId prop），畫面會自然「彈回」原本選的那一項，不需要另外處理。
    if (isSessionDirty(session)) {
      const proceed = window.confirm(
        "板上已有內容。選擇比賽會改用那一場最後的輪轉站位，現有內容會被放棄，確定嗎？",
      );
      if (!proceed) return;
    }
    if (chosen === null) {
      // 選「未選比賽（空板）」：單純導頁，不借站位、不開 session——空板本來就沒有站位
      // 可以借，直接進去讓使用者從空球場開始。
      setLocation("/board");
      return;
    }
    // 記下「等一下要借這一場的站位」，navigate 之後 id 改變、名單抓回來，上面那個效果
    // 會接手把 session 開起來（見上面「⚠️」的順序說明）。
    setPendingRotationMatchId(chosen);
    setLocation(`/matches/${chosen}/board`);
  };

  // tournamentId 存在時返回該資料夾頁，否則返回根列表。
  const backHref = matchBackHref(match?.tournamentId);

  return (
    // issue #172：三欄骨架交給 AppShell（mode="B"＝戰術唯讀）。這一頁比另外四頁複雜，有三個
    // 地方需要特別說明：
    //
    // 1. 背景／材質：整頁共用一張材質更豐富的背景（兩顆柔光暈疊底層斜切漸層，呼應球場的
    //    螢光綠強調色跟深青球場色，比單純兩色漸層更有層次），這些 class/style 原樣搬到
    //    AppShell 的 className/style。玻璃分兩層、刻意做出不同的「霧面程度」：外層 chrome
    //    （header、左右功能欄）是大片、模糊度低、幾乎透明的「窗格」，只負責界定區域；
    //    裡面的小卡片（球員列、已儲存戰術）是模糊度更高、更明顯的霧面玻璃，才是真正讀起來
    //    「有質感」的物件——呼應參考圖裡小徽章清楚飄浮在背景上的效果。
    //    注意：className 沒有帶 flex-col——AppShell 自己的最外層容器本來就是「橫向排三欄」
    //    的 flex row（nav/children/aside 並排），如果這裡疊加 flex-col 會把三欄擠成上下堆疊，
    //    整個版面就垮了。以前這裡是 flex-col，是因為那時候「整頁」（header + 三欄）是同一個
    //    div 自己手刻的縱向排列；現在「header 放哪裡」這件事被拆給下面的 children 處理，
    //    AppShell 外層容器只需要負責橫向排三欄。
    //
    // 2. backdrop（tb-beam / tb-mark 光效）：issue #134 加的這兩層背景光是 position: absolute
    //    ＋z-index: 1（見 index.css .tb-beam / .tb-mark）。CSS 的 stacking 規則是：帶正
    //    z-index 的定位元素，繪製順序永遠疊在「沒有設定 position」的一般文件流元素之上，
    //    不管誰先出現在 DOM 裡——所以只把 backdrop 放在 AppShell 提供的插槽還不夠，nav／
    //    children／aside 三欄的實際內容還是得自己補上 `relative z-10`（z-index 隨便挑一個
    //    比 1 大的值），才能把自己拉進跟 backdrop 同一層 stacking 比較、贏過去疊在上面。
    //    這正是原本程式碼在三欄外面包一層 `relative z-10` 的理由（見這段拆分前的舊版本）；
    //    現在三欄變成三個獨立的插槽，就要各自補上這個 class，而不是共用一層。AppShell 本身
    //    刻意不把 `relative z-10` 內建進三欄的插槽容器裡——那是「這一頁剛好有一層絕對定位背景
    //    要疊在下面」的特例，不是每個用 AppShell 的頁面都需要的行為，寫死進去反而讓其他頁面
    //    多一層它們用不到的 stacking context。
    //
    // 3.（issue #172 原本這裡有一段：中央主區內部留一個 260px 輪轉表欄，等右欄資訊欄
    //    元件化那一環再搬進 aside。issue #251 這一輪就是那次搬移——把 RotationTable 整個
    //    移出中央主區，併進 aside 插槽跟球員名單面板疊在一起，理由見下面第 4 點。這裡不再
    //    保留中央欄，是這一輪唯一動到「畫面骨架」的地方，其餘中央主區維持 Court 置中滿版。
    //
    // 4.（issue #176 環 5 新增，issue #177 擴充成三態，issue #251 這一輪再改 B/D 內容）
    //    mode B/D/C 換欄：session === null 時是 mode B；session.arranging（佈陣中）是
    //    mode D；session 存在但已按過「確定」是 mode C（右欄從「資訊欄」換成「工具軌」
    //    TacticsEditToolRail，132px）。
    //    B／D 兩態原本各自在「中央欄的輪轉表」跟「aside 的球員名單/瀏覽清單」兩個地方
    //    重複列出同一場的球員（#251 回報的重複顯示 bug）。這一輪的修法：輪轉表（現在叫
    //    RotationRailPanel，見該檔案）不再活在中央欄，兩個 mode 統一收進 aside，跟原本
    //    aside 已有的內容「疊在同一欄」而不是「分頭各自一份」——
    //      - mode B：aside 由上而下疊 RotationTable（輪轉+球員名單）跟 TacticsBoardPanel
    //        （戰術瀏覽/唯讀檢視），兩者互不衝突，是「參考站位」跟「瀏覽已存戰術」两件事
    //        本來就都想同時看得到。
    //      - mode D：aside 只放 TacticsRosterPanel（現在也是同一顆 RotationRailPanel 的
    //        另一種組裝，見該檔案），不再另外顯示 TacticsBoardPanel——佈陣中使用者的
    //        唯一任務是把人排上場，不需要同時瀏覽戰術清單。
    //    這樣「輪轉/名單面板」在 B/D 之間永遠待在同一欄（aside），不會像重構前那樣
    //    在中央欄／右欄之間跳來跳去，這正是使用者這一輪回報的核心問題（面板位置不一致）。
    //    mode C 一樣完全不顯示這個面板，讓球場吃滿中央主區剩下的全部寬度——只有
    //    「畫筆/防守範圍」這種真正的編輯動作才需要球場最大化，佈陣（拖球員上下場）不需要。
    <AppShell
      mode={mode}
      nav={
        // 共用左側導覽軌（issue #160 起，#173 收斂進 NavRail）：以前「回列表」「計分表」是
        // 這個 header 自己的 <BackToMatchListButton> / <Link>，跟另外兩個 match-scoped 頁面
        // 各刻各的、樣式不統一。現在三個頁共用同一個 NavRail，導覽只在一個地方定義。外面包
        // 一層 `relative z-10 h-full`，理由見上面第 2 點的說明。
        <div className="relative z-10 h-full">
          {/* #372：NavRail 不再吃 matchId／captureCurrent 這些站位擷取相關的 props——左欄
              「戰」不再是需要注入擷取邏輯的子清單，是固定通往這一頁的連結（見 NavRail.tsx
              開頭的說明）。這一頁自己的「+ 新增戰術」現在走中央浮層 NewTacticDialog（下面
              Court 那一段），擷取邏輯（captureCurrentRotation）留在那裡繼續用，不是被刪掉。 */}
          <NavRail backHref={backHref} active="board" />
        </div>
      }
      aside={
        // mode B／D 才會被 AppShell 實際渲染出來（見 AppShell.tsx 的 MODES 查表：B/D 的右欄
        // 插槽是 aside，C 是 tools）。mode C 時這個 JSX 仍會被建出來當一個物件，但不會被
        // mount 進畫面——React 只有真的把元素放進渲染樹才會呼叫元件函式，所以下面的內容不會
        // 在 mode C 期間執行，不用另外包一層條件判斷。
        //
        // B／D 兩態右欄放的內容不同：D（session?.arranging）只放 TacticsRosterPanel
        // （RotationRailPanel 的另一種組裝）——佈陣模式的唯一任務是「把人排上場」；
        // B（沒在編）改成 TacticsBoardRail（issue #331 右欄 v2）：站位／戰術兩個分頁籤 +
        // 常駐 footer 動作列，取代舊版「兩塊直接疊、對半分高度」的版面——那個版面在
        // 745px 視窗下會把「重置先發」按鈕擠出視野，詳見 TacticsBoardRail.tsx 檔頭的說明。
        //
        // 用同一個外層容器包起來（border-l／bg／backdrop-blur／relative z-10／h-full 這些
        // 視覺 class 兩態共用，理由見上面第 2 點的 backdrop 說明），內容用 session?.arranging
        // 判斷該渲染哪個組合。
        //
        // 原本這裡是 `<div className="flex w-[250px] flex-shrink-0 ...">`，寬度／
        // flex-shrink-0 現在交給 AppShell 的 ASIDE_WIDTH 常數決定（w-72＝288px，跟
        // 原本 250px 不完全一樣——這是這一環唯一刻意沿用「現況已有的共用寬度常數」而非
        // 逐頁自訂數值的地方，見 AppShell.tsx 裡 ASIDE_WIDTH 的註解），這裡只保留視覺
        // class（border-l／bg／backdrop-blur）跟 `relative z-10`（理由同上）、`h-full`
        // 撐滿 AppShell 給的欄位高度。
        <div className="relative z-10 flex h-full flex-col border-l border-white/[0.08] bg-white/[0.02] backdrop-blur-sm">
          {session?.arranging ? (
            // issue #433（header ＋ 佈陣右欄 v3）：整條右欄改用 ArrangingRail——空板時它自己
            // 顯示位置調色盤，選了比賽時换成迷你球場輪轉對照＋真人名單，兩者互斥不再並存
            // （見該檔案開頭的說明；#372 當時「兩者要不要並存」的開放問題已在這一輪定案）。
            <ArrangingRail matchId={matchId} match={match} />
          ) : (
            <TacticsBoardRail
              matchId={matchId}
              controller={controller}
              openNewTactic={openNewTactic}
            />
          )}
        </div>
      }
      tools={
        // mode C（session !== null）才會被實際渲染，理由跟上面 aside 的說明對稱。同樣包一層
        // `relative z-10 h-full`（理由見上面第 2 點：這一頁雖然目前沒有再傳 backdrop，
        // 但 z-index 機制是 AppShell 通用的，其他頁面的 .tb-beam 還是這一層 stacking，
        // 保留這個 wrapper 不會有壞處，之後要重新掛背景層時也不用回頭補）。
        <div className="relative z-10 h-full">
          {/* #372：matchId 現在可能是 null（空板也能進 mode C 編輯）——TacticsEditToolRail
              的 prop 型別已經放寬成 string | null，這裡直接傳 matchId 就好，不用再兜一個
              假的空字串。工具軌內部只有「換球員」浮層真的需要用到 matchId，沒有比賽時那塊
              浮層自己會換成提示文字（見 TacticsEditToolRail.tsx）。 */}
          <TacticsEditToolRail
            matchId={matchId}
            onSave={controller.handleSave}
            onSaveAs={controller.handleSaveAs}
            onCancel={controller.handleCancel}
            saving={controller.saving}
            savingAs={controller.savingAs}
          />
        </div>
      }
      // issue #134 Track B 加的置中背景大字標（原本先是 VOLLEY/BOARD 佔位字，
      // 2026-08-07 一度換成 BrandLogo 的「VOL.02」正式文字標）已於同日拿掉——
      // 那顆字標放大到背景尺寸後糊得很嚴重（Anton 字身的漸層/多層描邊在極大字級
      // 下細節撐不住），tang 要求先移除。BrandLogo 本身沒有問題，繼續用在
      // NavRail.tsx 的導覽軌字標（22px，小尺寸不會有這個問題）。
      className={APP_SHELL_CLASS}
      style={APP_BACKGROUND_STYLE}
    >
      {/* issue #433（header ＋ 佈陣右欄 v3）：整條 header 拆掉。它承載的三樣東西各自搬家
          （見下面球場容器內的浮層），省下的高度直接還給球場——頁面因此沒有任何橫跨全寬的列，
          只剩 nav／球場／aside 三欄。「戰術板」那個靜態標題也一併刪除，NavRail 左欄「戰」
          那格已經標明現在在哪一頁，不需要頁面內再講一次。 */}
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {/* 中央主區以前這裡有一欄 260px 寬的 RotationTable（見上面說明的第 3 點），
            issue #251 這一輪把它搬進 aside 插槽（跟球員名單面板疊在一起），所以這裡
            不再需要任何條件分支，球場永遠吃滿中央主區剩下的全部寬度。 */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
            <Court />
            {/* 比賽主詞——原本 header 的下拉選單搬到這裡，貼球場左上角外緣。平常零 chrome
                （沒有背景、沒有邊框，只是浮在球場上的一行字），只有展開選單時才長出深色底
                跟萊姆綠框（見 BoardMatchPicker.tsx 的說明）。三種模式（B/D/C）都要看得到、
                都要能選，所以掛在這個中央欄層級，不進任何一個 mode 專屬的插槽。 */}
            <div className="absolute left-4 top-4 z-20">
              <BoardMatchPicker matchId={matchId} onSelect={handleSelectMatch} />
            </div>
            {/* 匯出／匯入——原本 header 右緣的鈕，搬到球場右上角。跟主詞分居球場兩個角，
                各自不干擾。匯出 PNG 抓的是這一頁球場的 DOM（id="court-wrapper"），只有這一頁
                有，放在球場正上方才誠實（見 TacticsExportMenu.tsx 開頭的完整說明）。 */}
            <div className="absolute right-4 top-4 z-20">
              <TacticsExportMenu matchId={matchId} />
            </div>
            {/* 球場右上角「編輯」鈕（issue #177 §6）：B 且正在唯讀檢視（viewingScene 存在）
                時顯示，取代原本住在 TacticsViewingPanel 裡的「編輯」按鈕。D（佈陣中）的
                「確定」已經搬進 ArrangingRail 的 rfoot（issue #433），不再跟這顆共用位置——
                球場右上角現在只留匯出跟這顆編輯鈕，各自獨立不互斥。 */}
            {viewingScene && (
              <button
                type="button"
                onClick={enterEditFromViewing}
                data-testid="button-edit-current"
                className={`absolute right-4 top-16 z-20 px-4 py-2 text-xs font-bold ${PRIMARY_BTN_CLASS}`}
              >
                編輯
              </button>
            )}
            {/* 「新增戰術」中央浮層（issue #177）：只蓋這個中央欄（見 NewTacticDialog.tsx
                開頭「為什麼用 absolute in central column」的說明），左右欄仍看得見。
                captureCurrentFromRotation/currentRotation 沿用原本 TacticsBoardPanel 就在用
                的擷取邏輯／輪次文案，只是擷取來源的說明文字搬到這裡組字串。 */}
            <NewTacticDialog
              open={newTacticOpen}
              onClose={closeNewTactic}
              matchId={matchId}
              captureCurrent={controller.captureCurrentFromRotation}
              // 沒有比賽時「現有輪轉位」按鈕停用（見下面 captureDisabled）——空板沒有輪轉表
              // 可以複製，captureLabel 順便誠實講清楚為什麼，而不是留著一句對不上狀態的
              // 「將複製第 N 輪」（沒有比賽時 controller.currentRotation 固定是 0，那句話會
              // 誤導使用者以為按了就會複製到「第 1 輪」）。
              captureLabel={
                matchId
                  ? `將複製第 ${controller.currentRotation + 1} 輪`
                  : "先選一場比賽才有輪轉站位可複製"
              }
              captureDisabled={matchId === null}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
