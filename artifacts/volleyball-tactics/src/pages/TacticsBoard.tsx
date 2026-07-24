import React, { useEffect } from "react";
import { useParams } from "wouter";
import AppShell, { ShellMode } from "../components/AppShell";
import NavRail, { matchBackHref } from "../components/NavRail";
import NewTacticDialog from "../components/NewTacticDialog";
import RotationTable from "../components/RotationTable";
import TacticsBoardPanel from "../components/TacticsBoardPanel";
import TacticsEditToolRail from "../components/TacticsEditToolRail";
import TacticsRosterPanel from "../components/TacticsRosterPanel";
import Court from "../components/Court";
import { useMatchWithRoster } from "../hooks/useMatches";
import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import { useTacticsBoardController } from "../hooks/useTacticsBoardController";
import { captureCurrentRotation } from "../lib/captureCurrentRotation";
import { PRIMARY_BTN_CLASS } from "../lib/tacticsBoardStyles";

export default function TacticsBoard() {
  const { id } = useParams<{ id: string }>();
  // URL 的 id 是字串，後端 match id 是整數，取用前轉成 number。
  const { match } = useMatchWithRoster(Number(id));
  const setRoster = useRotationTable((state) => state.setRoster);
  const resetBoardView = useTacticsBoard((state) => state.resetBoardView);
  // session !== null＝正在編輯一張戰術：這一個欄位同時決定「AppShell 要用 mode B / C / D」
  // （下面）跟「aside/tools 該放什麼」，是這一環（issue #176）新增的唯一畫面分支——issue #177
  // 再加一層：session.arranging 進一步決定 C 跟 D 兩態。
  const session = useTacticsBoard((state) => state.session);
  // 唯讀檢視中的那張已存戰術（PR B）——球場右上角的模式鈕在「檢視中」要顯示「編輯」，
  // 就是靠這個欄位判斷（見下面球場容器內那顆按鈕的說明）。
  const viewingScene = useTacticsBoard((state) => state.viewingScene);
  const enterEditFromViewing = useTacticsBoard((state) => state.enterEditFromViewing);
  const confirmArrangement = useTacticsBoard((state) => state.confirmArrangement);
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
    resetBoardView(id);
  }, [id, resetBoardView]);

  // 進入戰術板時，把這場比賽名單帶進來，這樣球員設定才會跟外面比賽列表輸入的資訊一致。
  // 只在比賽資料本身變動時才重新同步，不然每次 render 都會跑。
  // setRoster 現在要指定 matchId（issue #119）：名單存進「這一場」的分片，不會污染別場。
  useEffect(() => {
    if (match && id) {
      setRoster(id, match.players);
    }
  }, [match, id, setRoster]);

  // tournamentId 存在時返回該資料夾頁，否則返回根列表。
  const backHref = matchBackHref(match?.tournamentId);

  // issue #173：左欄 NavRail「戰」子清單的「+ 新增戰術」需要呼叫端注入的「現在站位」擷取
  // 邏輯——這一頁的「現在」＝輪轉表當下排的站位。四個呼叫端（這裡、TacticsBoardPanel、
  // 兩個列表頁）共用 lib/captureCurrentRotation，那個檔案開頭說明了為什麼可以抽成共用模組
  // 卻不會弱化 #154 的單向依賴防線（重點：抽出去的同時把它一起加進 eslint 的禁止清單，
  // 否則白板 store 就能靠 import 這個工具繞過原本擋掉的相依）。

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
    // 3. 中央主區內部的 260px 輪轉表欄：docs/layout-spec.md §4 把輪轉表歸在右側資訊欄裡，
    //    但那次搬移屬於環 3（#174，右欄資訊欄元件化），環 1（這一環）刻意不重寫任何功能
    //    元件、也不做視覺變更。所以 RotationTable 那一欄目前先留在中央主區（children）
    //    內部，用一個 flex 容器把它跟球場欄放在一起，畫面完全維持原樣；等環 3 動手時，
    //    再把這一欄從這裡搬進 AppShell 的 aside 插槽。
    //
    // 4.（issue #176 環 5 新增，issue #177 擴充成三態）mode B/D/C 換欄：session === null 時
    //    是 mode B（右欄放 TacticsBoardPanel）；session.arranging（佈陣中）是 mode D（右欄放
    //    TacticsRosterPanel，見下面 aside 插槽的說明）；session 存在但已按過「確定」是 mode C
    //    （右欄從「資訊欄」換成「工具軌」TacticsEditToolRail，132px）。D 跟 B 一樣顯示中央
    //    260px 輪轉表欄（見下面第 3 點條件），只有 C 隱藏它、讓球場吃滿中央主區剩下的全部
    //    寬度——這正是 mode C 的核心訴求：只有「畫筆/防守範圍」這種真正的編輯動作才需要
    //    球場最大化，佈陣（拖球員上下場）不需要。
    <AppShell
      mode={mode}
      nav={
        // 共用左側導覽軌（issue #160 起，#173 收斂進 NavRail）：以前「回列表」「計分表」是
        // 這個 header 自己的 <BackToMatchListButton> / <Link>，跟另外兩個 match-scoped 頁面
        // 各刻各的、樣式不統一。現在三個頁共用同一個 NavRail，導覽只在一個地方定義。外面包
        // 一層 `relative z-10 h-full`，理由見上面第 2 點的說明。
        <div className="relative z-10 h-full">
          <NavRail
            matchId={id ?? ""}
            backHref={backHref}
            active="board"
            captureCurrent={() => captureCurrentRotation(id ?? "")}
            captureLabel={`將複製當下輪次的站位`}
            // 這一頁沒有「先發還沒排好」這種需要停用的情境（輪轉表沒排位置時
            // captureFromRotation 就回一張 players 是空陣列的快照，仍然是一個合法的
            // CourtSnapshot——空戰術當起點本身沒問題，不需要為此停用按鈕）。
          />
        </div>
      }
      aside={
        // mode B／D 才會被 AppShell 實際渲染出來（見 AppShell.tsx 的 MODES 查表：B/D 的右欄
        // 插槽是 aside，C 是 tools）。mode C 時這個 JSX 仍會被建出來當一個物件，但不會被
        // mount 進畫面——React 只有真的把元素放進渲染樹才會呼叫元件函式，所以下面的內容不會
        // 在 mode C 期間執行，不用另外包一層條件判斷。
        //
        // B／D 兩態右欄放的內容不同（issue #177）：D（session?.arranging）放
        // TacticsRosterPanel——佈陣模式的唯一任務是「把人排上場」，球員名單比戰術瀏覽清單
        // 更有用；B（沒在編）維持原本的 TacticsBoardPanel（戰術瀏覽／唯讀檢視）。用同一個
        // 容器包起來（border-l／bg／backdrop-blur／relative z-10／h-full 這些視覺 class 兩態
        // 共用，理由見上面第 2 點的 backdrop 說明），內容用 session?.arranging 判斷該渲染哪個。
        //
        // 原本這裡是 `<div className="flex w-[250px] flex-shrink-0 ...">`，寬度／
        // flex-shrink-0 現在交給 AppShell 的 ASIDE_WIDTH 常數決定（w-72＝288px，跟
        // 原本 250px 不完全一樣——這是這一環唯一刻意沿用「現況已有的共用寬度常數」而非
        // 逐頁自訂數值的地方，見 AppShell.tsx 裡 ASIDE_WIDTH 的註解），這裡只保留視覺
        // class（border-l／bg／backdrop-blur）跟 `relative z-10`（理由同上）、`h-full`
        // 撐滿 AppShell 給的欄位高度。
        <div className="relative z-10 flex h-full flex-col border-l border-white/[0.08] bg-white/[0.02] backdrop-blur-sm">
          {session?.arranging ? (
            <div className="p-3">
              <TacticsRosterPanel matchId={id ?? ""} />
            </div>
          ) : (
            <TacticsBoardPanel
              tactics={controller.tactics}
              onSelectTactic={controller.handleSelectTactic}
              onRenameTactic={controller.handleRenameTactic}
              onDeleteTactic={controller.handleDeleteTactic}
              onOpenNewTacticDialog={openNewTactic}
            />
          )}
        </div>
      }
      tools={
        // mode C（session !== null）才會被實際渲染，理由跟上面 aside 的說明對稱。同樣包一層
        // `relative z-10 h-full`（理由見上面第 2 點：backdrop 的 tb-beam/tb-mark 是
        // z-index:1 的絕對定位層，右欄內容要自己拉進同一層 stacking 比較才會疊在它上面）。
        <div className="relative z-10 h-full">
          <TacticsEditToolRail
            matchId={id ?? ""}
            onSave={controller.handleSave}
            onSaveAs={controller.handleSaveAs}
            onCancel={controller.handleCancel}
            saving={controller.saving}
            savingAs={controller.savingAs}
          />
        </div>
      }
      backdrop={
        // issue #134 Track B（材質強化）：低調斜向光影 + 置中放大的字標，破除原本
        // 「整片平」的單調感。VOLLEY / BOARD 是品牌名稱定案前的佔位字。
        <>
          <div className="tb-beam" />
          <div className="tb-mark">
            <div className="tb-mark-flourish">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="tb-mark-hero">
              <span className="layer layer-glow">
                VOLLEY
                <br />
                BOARD
              </span>
              <span className="layer layer-core">
                VOLLEY
                <br />
                BOARD
              </span>
            </div>
            <div className="tb-mark-caption">Tactics Board · Est. 2026</div>
          </div>
        </>
      }
      className="relative font-dash text-[#f5f5f0]"
      style={{
        background:
          "radial-gradient(ellipse 55% 45% at 18% 12%, rgba(198,241,53,0.10), transparent 70%), " +
          "radial-gradient(ellipse 65% 55% at 88% 92%, rgba(42,110,106,0.30), transparent 70%), " +
          "linear-gradient(160deg, #0a0b07 0%, #16241c 55%, #0a0b07 100%)",
      }}
    >
      {/* 中央主區：header 以前橫跨整頁（在 nav／中央／aside 三欄「上面」置中），現在拆進
          AppShell 之後，header 只會置中在中央主區這一欄的寬度裡——這是這一環唯一刻意的
          小幅視覺位移（issue #172 任務說明裡明確列出的例外），其餘畫面維持原樣。 */}
      <header className="relative z-10 flex shrink-0 items-center justify-center border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
        <h1 className="text-lg font-bold">{match ? `vs ${match.opponent}` : "戰術板"}</h1>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {/* 輪轉表欄留在中央主區內部，見上面「3. 中央主區內部的 260px 輪轉表欄」的說明——
            這一環不把它搬進 aside 插槽。
            issue #177：條件從「!session」改成「只有 mode C 隱藏」——B（沒在編）跟 D（佈陣中）
            都照樣顯示輪轉表，只有 C（真正的編輯模式：畫筆/防守範圍工具軌）才把這一欄藏起來、
            讓球場吃滿中央主區剩下的全部寬度。理由：D 的任務只是把人拖上場，輪轉表仍是使用者
            排陣時很自然想參考的資訊（跟哪一輪的先發長得像），不像 C 那樣需要最大化球場視覺
            空間給畫筆工具用。 */}
        {mode !== "C" && (
          <div className="flex w-[260px] flex-shrink-0 flex-col border-r border-white/[0.08] bg-white/[0.02] backdrop-blur-sm">
            <RotationTable />
          </div>
        )}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
            <Court />
            {/* 球場右上角共用模式鈕（issue #177 §6）：D（佈陣中）顯示「確定」→
                confirmArrangement()，讓 session 從佈陣態切回編輯態（mode C）；B 且正在唯讀
                檢視（viewingScene 存在）顯示「編輯」→ enterEditFromViewing()，這顆鈕取代了
                原本住在 TacticsViewingPanel 裡的「編輯」按鈕（見該檔案開頭的說明）。兩種情況
                互斥（session 存在時 viewingScene 一定是 null，見 useTacticsBoard.ts 開頭的
                狀態機說明），所以可以共用同一個位置/尺寸，只換文案跟 onClick。其他情況
               （browse 模式、mode C 編輯中）不顯示這顆鈕。 */}
            {session?.arranging ? (
              <button
                type="button"
                onClick={confirmArrangement}
                data-testid="button-confirm-arrangement"
                className={`absolute right-6 top-6 z-20 px-4 py-2 text-xs font-bold ${PRIMARY_BTN_CLASS}`}
              >
                確定
              </button>
            ) : (
              viewingScene && (
                <button
                  type="button"
                  onClick={enterEditFromViewing}
                  data-testid="button-edit-current"
                  className={`absolute right-6 top-6 z-20 px-4 py-2 text-xs font-bold ${PRIMARY_BTN_CLASS}`}
                >
                  編輯
                </button>
              )
            )}
            {/* 「新增戰術」中央浮層（issue #177）：只蓋這個中央欄（見 NewTacticDialog.tsx
                開頭「為什麼用 absolute in central column」的說明），左右欄仍看得見。
                captureCurrentFromRotation/currentRotation 沿用原本 TacticsBoardPanel 就在用
                的擷取邏輯／輪次文案，只是擷取來源的說明文字搬到這裡組字串。 */}
            <NewTacticDialog
              open={newTacticOpen}
              onClose={closeNewTactic}
              matchId={id ?? ""}
              captureCurrent={controller.captureCurrentFromRotation}
              captureLabel={`將複製第 ${controller.currentRotation + 1} 輪`}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
