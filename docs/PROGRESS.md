# Progress Snapshot

> This is a **rolling ~1-week snapshot, not a log**. The `wrap-up` skill **overwrites**
> the "Current state" section each session and prunes anything older than roughly a week —
> it does **not** append an ever-growing history.
>
> **Durable facts don't live here.** A decision, lesson, or fact that must still hold weeks
> from now belongs in its permanent home, not this file:
>
> - _why_ code/schema changed → `git log` + commit messages
> - a feature's design decisions → the GitHub issue's comments + `docs/*-spec.md`
> - collaboration lessons / product judgments → auto-memory (`memory/`)
> - static repo layout/commands/architecture → `CLAUDE.md`
> - the planned-but-not-done backlog → GitHub Issues / Milestones, not here
>
> Before pruning an old entry, check it already has one of those homes; if it's an orphan,
> promote it first, then drop it. Read this file + `gh issue list --state open` + recent
> `git log` at the start of a session instead of re-exploring the codebase.
>
> **各自的進度分區寫，別跨區改**（#146）：`Current state` / `Recently closed` 都拆成
> **開發進度 (aila)** 與 **設計進度 (tang)** 兩個子區塊。各自 wrap-up 時只改自己那區，
> 平行 PR 就落在不同行段、git 幾乎都能自動合併，不用真的把檔案拆兩份、也保住一眼 catch-up。
> 上面的 `_Last updated_` 是共用一行摘要（誰更新了什麼），保持精簡、別長成段落。

\_Last updated: 2026-08-05 (aila) — #287 交付（PR #297），M3 剩 #218/#209 兩張 needs-plan 的 UX 題；
#232 body 除鏽。\_

\_Last updated: 2026-07-30 (tang) — 工具軌圖示（PR #248）與全站背景統一（PR #253）兩張 PR 開著待調整；
實機盤點挖出兩個遷移缺口／需求，開了 **#251**（戰術板頁沒接上 `RotationRailPanel`，三份名單重複）與
**#252**（球員身分挑選，待與 aila 討論）。\_

## Current state

Where the project actually stands right now (durable "current" facts; per-session detail
lives in git log + the issues named).

### 開發進度 (aila — backend / frontend / db / infra)

- **Backend match-recording API is fully implemented and live (dev DB).** matches / players /
  sets / rallies / events / substitutions / lineups / timeouts / tournaments / teams CRUD +
  tactics/health + `analysis` 唯讀報表路由，全部 ownership-scoped。前端計分表**已完全脫離
  localStorage**（比賽、比分/輪轉、事件讀回→逐球員統計），資料夾（tournaments）同樣進 DB
  （#117）。設計與分期沿革見 `docs/backend-architecture.md`；#58 closed。
- **前端 store 已全面 per-match 分片、去汙染**（#115/#119）：計分表（`useScoreSheet`）、戰術板／
  輪轉表（`useTacticsBoard`／`useRotationTable`）都是 `dataByMatch[matchId]`，A 場編輯不污染 B 場；
  戰術板/輪轉表工作狀態**不 persist**（PO 決策：只有存成戰術才算數）。切輪次的跨 store 同步走
  `RotationSwitcher → syncRotationChange` 明確呼叫，不靠全域 subscribe。
- **戰術板單向化（#154）＋ UI 改版（#160）都已落地。** 戰術快照是 denormalized 的自給自足
  `CourtSnapshot`，載入已存戰術＝唯讀檢視、**不反向寫回輪轉表**，這條單向依賴由 eslint
  `no-restricted-imports` **焊在 CI 上，不得停用**。模式（browse／viewing／edit）是
  `session`/`viewingScene` 的**推導值**，store 裡沒有 mode 欄位。完整權衡在 #154 / #160 的留言。
- **站位＝全站共用單一真相（07-21 PO 定案，推翻 #115 的解耦模型）。** 唯一真相是
  `useRotationTable.dataByMatch[matchId]`：比賽列表決定站位，計分表讀它也寫它，**戰術板右欄唯讀**
  （白板不影響資料紀錄）。共存機制是「**共用現役＋開局凍結**」：共用的是「目前站位」，每局開賽
  那一刻擷取成該局的凍結快照（`ScoreSheetState.lineup` 語意＝歷史快照，不是平行的第二份先發），
  此後該局唯讀，事後編輯污染不到歷史統計。判斷式只有一行 `activeLineup = lineup ?? capturableLineup`。
  幽靈站位掃空先發仍由 `captureLineupFromRotations` 的名單過濾擋著（`lib/rotationLogic.ts`）。
  已在 #115 補留言註記其解耦模型作廢（多處文件曾拿它當法規引用）。
- **衍生文件不維護（07-21 PO 決定，`docs/flow-diagrams.html` 已刪）。判準值得記住：決策文件
  （`docs/*-spec.md`、issue 留言）值得維護，「描述程式碼現在怎麼跑」的衍生文件不值得**——它註定
  落後，而落後時**主動誤導**（#163 整張 issue 就在處理這件事：它描述的 API 不是「舊」而是已被刪除，
  照著讀會實作出一條被 CI 焊死禁止的資料流）。onboarding 入口改成「跑起來自己點一遍」＋
  `docs/requirements-pattern-language.md`。**同判準於 07-28 再砍一份：`docs/match-recording-erd.html`
  （582 行手繪 ERD）只畫 6 張表，實際 schema 已有 13 張——它獨有的推論早就寫進
  `backend-architecture.md` 本文，刪掉不損失資訊。**
- **版面規格立法：`docs/layout-spec.md`**（2048×1440 畫布換算表、三欄骨架、四種模式 A/B/C/D）。
  **分工判準：版面聽 layout-spec.md、視覺聽 design-spec.md。** M1.5 拆成環 0–6（#172–#178）。
  - **環 1（#172，已關）**：`components/AppShell.tsx` 成為三欄骨架的唯一擁有者，各頁只往插槽
    （`nav`/`children`/`aside`/`tools`/`backdrop`）塞內容。**撿到的坑值得記**：flex column 子項
    `min-height` 預設 `auto`，在 `h-screen + overflow-hidden` 骨架裡只寫 `overflow-y-auto` 是
    **捲不動的**，要補 `min-h-0`——與中央欄的 `min-w-0` 是同一個坑的兩個方向。
  - **環 2（#173，已關）**：`NavRail` 一顆取代 `MatchNavRail` ＋ `TacticsRailMenu`（收合軌 ↔ 展開
    側欄、「戰」子清單、匯出入口「出」）。PO 依實機推翻兩條規格並回寫 layout-spec §2.2：展開寬度
    370→176px；展開改**推開版面**而非浮層（浮層會遮住使用者正要點的中央內容）。**踩到的雷**：
    Tailwind class 是建置時掃描原始碼字串產生的，`hover:${變數}` 拼出來的名字掃不到。
  - **環 3（#174，已關）**：右欄 `RotationRailPanel` 有 `axis`（rotation/set）與 stepper，
    **元件只回報方向**，「輪是環狀、局是線性有邊界」屬領域規則留在呼叫端；`MatchInfoRail` 三態
    （空狀態／資料夾摘要／比賽輪轉表）由列表頁與資料夾內頁共用。實作前發現**規格與資料對不上**：
    `CompletedSet` 沒存 lineup，已補 `CompletedSet.lineup` ＋共用的 `findLineupSnapshotForSet`。
    選取語意一般化成 `selected { kind, id }`、**不自動選第一場**（使用者未表達意圖前不該讓站位進
    可寫狀態）。跨欄拖曳已由 PR #189 完成；**Stage B（統計格）已由 PR #239 合併**（見下方 Recently
    closed），#174 與 #120 一併關閉，**M1.5 milestone 已收掉**。
  - **環 4（#175）／環 5（#176，**仍 open**：剩繪圖工具正式圖示 blocked @tangyi1025，07-28 已移入 M3）／
    環 6（#177）** 皆已落地，見下方 Recently closed。**環 7（#178）需先補線框稿（在 M3）。**
  - **戰術板頁遺留的 #174 遷移缺口已補上（#251，08-02，PR #274）。** 環 3 當時只把 `RotationRailPanel`
    接上列表頁／資料夾內頁，戰術板頁被漏掉，`TacticsBoard.tsx` 一直是中央欄一份舊版 `RotationTable`
    ＋右欄一份 `TacticsRosterPanel`，同一場的球員清單重複列了兩三次。現在兩個 mode（B／D）統一收進
    右欄同一顆 `RotationRailPanel`：格子維持 ADR-0001 訂死的唯讀（不能寫回輪轉真相），新增獨立的
    `benchDraggable` prop 讓球員清單本身仍可拖到球場——「格子能不能改」跟「清單能不能拖」是兩個互不
    相干的開關。中央欄那份固定 260px 的輪轉表欄整個拿掉，面板固定活在 aside，不再依 mode 換位置。
- **#120 計分頁右欄兩階段落地（已關，隨 PR #239 收尾）。** `CourtReadOnlyView` 常駐唯讀站位（**純展示、不訂閱
  任何 store**）＋`RotationRailPanel` 改為**受控元件**——改動直接進共用真相，草稿 state 與「確定」鈕
  整組移除，連帶消滅「排到一半被無關 re-render 洗掉」那類 bug。**`lib/rotationLogic.ts` 連續兩次 UI
  重寫都一行未動**——把領域邏輯抽出元件的回報。**換局換輪視窗已作廢**（右欄本來就能就地改，彈窗是
  多餘轉場）。分析頁站位列已由 #193 交付**唯讀**版（`AnalyticsRotationRail`）。**#120 的收尾條件是 #174
  環 3**（見 #120 的 07-21 留言：列表頁與資料夾內頁掛上右欄後才算滿足），不是 #76——#76 已關（ADR-0002）。
- **Schema foundations for stats are in place:** `lineups`（起始先發，一局一 row）、`substitutions`
  （換人，存比分快照）、`timeouts`（#44，比分快照＋side，純記錄事件不記時長）、`events.outcome`
  （得/失/球續 enum）、`people`＋`teams`（跨場跨隊身分／分組標籤，`players.personId`/`matches.teamId`
  nullable FK、`onDelete: set null` 保留歷史事實）、**`matches.format`（#215，賽制 enum）** 全部 live。
  `people`／`players.personId` **已補上應用層**（#213）：`/people` CRUD＋名單去重 UX＋`personBelongsToUser`，
  不再是「建了表沒人用」的狀態。
- **賽制成為比賽的固有欄位（#215，07-27）。** `matches.format` 是 `pgEnum("match_format",
["best_of_3","best_of_5"])`、`notNull().default("best_of_3")`——既有資料 push 時自動補值，不需要
  資料補丁。`getMatchWinner(sets, winsNeeded)` 的第二個參數**刻意必填、不給預設值**：#215 的病根正是
  一個「看似合理的預設」（寫死 3＝五戰三勝）讓所有呼叫端都不必想這件事。**判準值得記住：當一個參數
  的正確值取決於呼叫端情境時，必填比預設安全——「合理的預設值」和「沉默的錯誤答案」常常是同一個東西。**
- **人員去重的預設方向（#213，07-28）——上一條判準的補完。** 名單打字時命中同名 person 會顯示建議，
  **按下才綁；但送出時仍沒有 `personId` 的列會自動建一個新 person**。看似違反上一條，其實不是，關鍵是
  **方向不對稱**：自動建**新身分**安全（最壞是同一人散成多筆待合併，資料仍正確）；自動**合併到既有身分**
  不安全（猜錯就把兩人生涯數據永久混在一起且難以發現）。**判準：能不能給預設值，取決於預設的那個方向
  會不會產生錯誤答案**——#215 兩個方向都會錯所以必填，這裡只有一個方向會錯所以另一個方向可以當預設。
- **#252 定案：不建「球隊常態名單」資料概念（08-04）。** tang 提的「新增比賽時能否從已知球員挑選」
  訴求，討論後決定**不**新增 `team_members` 多對多表、也不在 `people` 加 `teamId`——前者會推翻
  `teams.ts` 現有「teams 只是分組標籤」的決定並引出一串 membership 語意問題，後者跟「一人跨多隊」
  的產品定位衝突。改用查詢層推導：`matches.teamId → players.personId → people` 撈出「這支球隊歷史
  用過的人」當建議清單，套用 ADR-0003 判準（讀取不貴、無需物化）。實作追蹤移到 #287（M3），#252 已關。
- **#65 數據分析頁：視圖①②已上線＋teams 端到端＋入口＝常駐紀錄本。** 視圖①單場分析
  （`pages/MatchAnalytics.tsx`）＝比分總覽＋球員決定球矩陣＋換人統計＋各輪次得失分；**比分總覽已改成
  全頁範圍選擇器**（PR #216：點某局就把底下所有區塊篩到那局、「全場」按鈕顯示局數比數，全頁由單一
  `scope` state 驅動；各輪次得失分連帶改前端算 `buildRotationStats`，因為後端聚合只能算整場、跟不了
  選局）。視圖②跨場彙總（`pages/CrossMatchAnalytics.tsx`＋`GET /analysis/matches`）＝一支請求列全部
  場次摘要＋球隊過濾。入口改 context-aware（左欄「數」永遠可到：有比賽→單場、沒選→跨場）。
  **視圖③已於 #213 落地**（`pages/PersonAnalytics.tsx`＋`GET /analysis/people/:personId`，路由
  `/analytics/people`）。**仍未做**：導覽重構（頁內選比賽下拉＋日期篩選＋左側子導覽）是 **#214**
  ——#213 刻意不碰 `NavRail.tsx`，把左側子導覽整塊留給它，避免兩個 issue 在同一檔案打架；比率統計
  （side-out%）與差異化（到位率/球線熱區）仍是**誠實空狀態**，等 #51/#21 與發球序推導。
  **#65 傘已於 07-28 關閉**：三個視圖都上線、剩下的內容全部有各自的 issue 接手（得/失分→#51、
  球線→#21、比率統計→**#235**、導覽→#214、人員合併/管理頁→#221/#224）。#235 是收傘時發現的孤兒
  （#65 body 列的「到位率」類比率統計原本沒人接）——重點是**資料已經夠了、不用改 schema**：
  發球方可由 `sets.firstServer` 當種子 ＋「第 n 分的發球方＝第 n-1 分的贏家」逐分推導出來。
- **`lib/db/src/seed-testdata.ts` 是分析頁的驗證資料來源**（全部三戰兩勝、刻意留一場進行中；每分補一顆
  決定球 event 讓球員矩陣有數字；`buildRallies` 保證「賽末點收在最後一球」，不再出現「我方達標後對手
  還在加分」的不可能畫面）。
- **架構決策紀錄上線＝`docs/adr/`（PR #233/#234，07-28）。** 判準是**「這個決定被推翻過、或未來的人
  看到程式碼會很自然想改回去嗎？」**——不是設計文件也不是進度紀錄。首批三張都是既有決定，先前只活在
  已關閉的 issue 留言裡：ADR-0001 戰術板嚴格單向＋快照 denormalize（#154，含中途 overlay→左欄工具頁
  的方向修正——**UI 形式改了、不變式沒改**，只看 #154 開頭很容易誤判整張作廢）、ADR-0002 分析→戰術板
  回跳閉環取消（#76）、ADR-0003 rally 輪次物化成欄位（#76 ①，**違反「衍生值別存」的一般預設**，故最
  需要留理由）。每張末尾有「不要重新提議」小節，CLAUDE.md 已加規則指向這裡。**規矩：已 Accepted 的
  不改不刪，被推翻時新增一張並把舊的標 `Superseded by ADR-NNNN`。**
- **領域詞彙表上線＝根目錄 `CONTEXT.md`（07-28）＋ADR-0004。** 每個概念釘一個官方用詞＋`_Avoid_`
  同義詞清單（記錄模式叫「簡易版」不叫「基礎版」；歧義的「陣容」一律拆成「先發」與「在場六人」；
  「輪次」1–6，`rallies.homeRotation` 的 0-based 只是實作細節）。ADR-0004 把 `tournaments` 定義成
  **資料夾**——不加賽期/主辦/賽制/名次欄位，表名也不改。CLAUDE.md／README.md／`docs/spec-index.md`
  三個入口都已指向它。**判準值得記住：詞彙表管的是概念層，機制層的詞不能順手一起禁掉**——「時機」
  （換人/暫停何時發生）與「比分快照」（它存成 homeScore/awayScore 而非 rallyId）是兩層，原本把後者
  列入 `_Avoid_`，等於讓那個不可逆設計決策沒詞可講，已改成兩者並存。
  同日順手清掉的過期物：`replit.md`（與 CLAUDE.md 重複且已開始說謊）、`index.html` 三處
  `built on Replit` placeholder meta（`robots: index,follow`，會被搜尋引擎收錄）＋`lang="en"`。
- **架構掃描（`improve-codebase-architecture`）產出 #225–#232，兩個新 milestone。** 掃描依 git log
  熱點（計分／戰術板／輪轉、api-server routes、analysis）。**M2.5 收斂重複規則**（8/2）原三張 Strong：
  #227 球場座標（`*100/*200` 內嵌 12 處、CTM 換算 5 份、前排門檻已分歧成 `<0.75` 與 `<=0.75` 只是還沒
  現形）已關閉；**#228 route handler 儀式（404 樣板 ×33、ownership 守衛 ×25 全靠人記得寫）仍 open**，
  `lib/handler.ts` 已落地、`tactics.ts` 是第一個遷移案例（PR #256），約 10 支 route 檔案待陸續遷移。
  **#226（得分/輪轉規則四份實作）已於 07-30 全部收斂並關閉**——三份 PR：PR1 #242（side-out 輪轉／換人
  淨額摺疊／「最後一局進行中」慣例 → `volleyballRules.ts`）、PR2 #245（局比數計算，原四份重複 →
  `countSetWins`/`setWinner`）、PR3 #246（勝負反轉換算，原本沒測試、寫在 JSX 裡 → `resolveScoringSide`）。
  輪次聚合／局比分 replay vs 後端 SQL 重複依 **ADR-0003** 判定不算重複規則（後端欄位是 replay 邏輯的
  下游物化結果），維持現狀不處理。**PR1 過程中發現的連鎖換人摺疊（A→B→C）既有行為另開 #247 追蹤**，
  刻意不在 #226 範圍內解決。**#225（tactics 路由缺 ownership）已於 07-30 修掉**——它是 **#127 那條判準
  的復發**：外鍵保證 referential integrity，不保證 ownership，`tactics.ts` 是當初漏網的檔案，整份沒
  import `ownership`。詳見下方 Recently closed。
- **M3 的脊椎＝#77 →（#75 → #64）→ #26，其餘 6 張是搭便車的。** 這不是推測，是 issue 自述：#77 的
  產出寫明「直接寫進 #26 的規格」，#75 body 寫明「**擋在 #26 前面**」。**#77 已關（08-02）**：v1 auth
  ＝Google OAuth／每人一帳號，**理由是共用帳號會讓 #127/#225/#228 那整串 ownership 基礎建設沒有兌現
  對象**——`handler()` 的 `owns` 必填、`lib/ownership.ts` 那些守衛都寫完了，缺的只是上面那顆真的
  `userId`（現況 `mockAuth.ts:43` 無條件塞 `mock-user-001`）。
- **離線可靠性契約定案（#75，08-02）＝按「資料能不能事後重建」切線。** 保證的四張表都是「比賽當下
  不記就永遠沒有」；先發（`lineups`）與戰術板/名單丟了要重做、但**重做得回來**，所以不保證。
  **判準值得記住：離線保證的邊界不是照技術難度切，是照可重建性切**——跟 #74 記錄成本預算的簡易/進階
  硬分界是同一種判準。`sets` 一併進佇列但**不算擴大範圍**：四類保證資料全掛在 `setId` 底下（FK），
  局本身若只在線上才建，離線第一步就斷鏈；它沒有使用者感受得到的內容，是達成保證的必要掛鉤。
  **這份設計的正確性建立在「單裝置單人」（P7）前提上**——要支援「教練與球經各拿一台平板記同一場」
  就得整個重來，已寫進 #75 當警語。因為前提成立，要做的是**重放（replay）不是合併（merge）**，
  所以不需要 CRDT。**#230 依此設計不獨立做**（它要的有序寫入紀錄就是離線佇列本來需要的結構，
  分兩次做等於同一份設計做兩遍），落地併進 #64 PR2。
- **五張表主鍵已改 client-mintable uuid（#64 PR1）。** `sets`/`rallies`/`events`/`substitutions`/
  `timeouts` 的 `id` 從 `serial` 改成 `uuid().defaultRandom()`（比照 `players`/`people`/`teams` 既有
  模式），`lineups.setId` 的 FK 型別跟著改。**非改不可的理由**：寫入鏈是「一分 → 一球」，`event` 要掛
  `rallyId`，線上靠「先等 POST 一分回來拿到 DB 配的號碼」撐住，而**離線根本沒有「等後端」這個選項**。
  附帶好處是**主鍵本身就是冪等鍵**（重試時同一個 uuid 重送，`ON CONFLICT DO NOTHING` 即安全 no-op），
  不用另設冪等鍵欄位。**過程中抓到一個型別檢查抓不到的正確性地雷**：`substitutions`/`timeouts` 的
  `orderBy` 原本用 `id` 當第二層 tiebreaker，靠的是「自增主鍵＝insert 順序」，改隨機 uuid 後會變成
  **隨機排序**，同一分內連續換兩次人的 replay 結果每次都不同。修法是兩張表各加一個非主鍵的
  `seq: serial()` 專供排序。**這類「舊語意藏在型別裡」的相依，是機械式型別遷移最容易無聲踩掉的東西。**
  另一個踩到的坑：**Postgres 無法把 integer 自動轉成 uuid**（`cannot be cast automatically`），
  schema-first + `drizzle-kit push` 沒有 migration 檔可以寫 `USING` 轉換，只能 drop 六張表再 push＋
  重跑 seed（PO 已授權；seed 本來就是 `TRUNCATE ... RESTART IDENTITY CASCADE` ＋固定種子 PRNG，
  重灌結果與先前完全一致）。
- **計分頁的寫入已收斂成一條有序 write log（#64 PR2，順帶關掉 #230）。** 新增
  `artifacts/volleyball-tactics/src/lib/writeLog.ts`：六個動作（`start`/`score`/`undo`/`goNextSet`/
  `substitute`/`callTimeout`）不再各自呼叫各自的 mutation，而是 append 一筆
  `WriteLogEntry`，由一個集中的 executor 依序翻成 API 呼叫。**三疊平行的 id ref
  （`rallyIdsRef`/`subIdsRef`/`timeoutIdsRef`）與那個「undo 該 pop 哪一疊」的字串 switch 一起消失**——
  因為主鍵已是 uuid，動作發生的當下就鑄得出 id，直接存進 undo 快照的 `backendRef: { table, id }`，
  刪誰變成資料而不是推論。**PR1 只改了 DB 型別，API 仍逐欄白名單、不收 body 的 `id`**，所以這張 PR
  一併把 `NewSet`/`NewRally`/`NewEvent`/`NewSubstitution`/`NewTimeout` 開出選填的 `id`（否則 log 的
  `id` 只能等 POST 回來才填、delete 又得回頭查表，等於先蓋一版 PR3 會拆掉的東西）。冪等
  （`ON CONFLICT DO NOTHING`）仍留給 PR3——PR2 沒有重送，撞不到。#230 抱怨的「create 先於 delete
  只靠佇列巧合、沒有測試守著」現在有 `writeLog.test.ts` 五條合約測試守住。
- **write log 已落地、撐得過 reload（#64 PR3）。** 新增
  `artifacts/volleyball-tactics/src/lib/writeLogStore.ts`：entry 進 **IndexedDB**（主鍵
  `[matchId, seq]`），開頁時把上一輪沒送完的讀回來、**依 `seq` 補送**，送成功才刪掉（＝「至少送
  一次」；先刪再送斷在中間就是永久掉一筆）。三個非顯然的決定：①**序號游標存 localStorage**——
  `seq` 必須在同步的 `append()` 當下就決定，而 IndexedDB 全是非同步的，游標要是重新從 1 開始，
  新 entry 會直接覆蓋掉還沒送出的舊 entry。②**drain 從 promise 鏈改成「挑 `seq` 最小的 pending」**
  ——重放的 entry 是非同步才進得了 log，promise 鏈會讓使用者的新動作插到它前面。
  ③**重放跑完才 hydrate**（`replayed` promise ＋ `invalidateQueries`），否則畫面會先少幾分、
  補送完又冒回來。undo 多了「還沒送出就直接作廢」的路徑（`cancelPending`，連同子 event 一起），
  取代盲目 append 一筆 delete。後端五支 POST 補上 `ON CONFLICT (id) DO NOTHING` ＋重送回既有列
  （**先驗 parent 相符才回，否則 409**，不然等於開了一條拿別人 row id 換內容的探測管道）；
  DELETE 的重送則由前端把 404 當成功處理。
- **離線寫入會自己補送，畫面也說得出「還有幾筆沒上去」（#64 PR4，這張做完 #64 收工）。**
  `createWriteLog` 多了退避重送：一輪 drain 結束還有 `error` 就排一次計時器，間隔
  `3s → 10s → 30s → 60s`（全數送成功就歸零），時間到把 `error` 推回 `pending` 再跑一次。
  另外開放 `retry()`（立刻重試＋退避歸零）與 `dispose()`（停掉計時器）。**兩個觸發點都留是刻意的**：
  `online` 事件快但會說謊（它只代表「作業系統覺得有網路」，後端掛掉/咖啡廳登入頁都會讓它說謊），
  退避計時器慢但唯一判準是「真的送成功了沒有」——只有前者會漏掉「網路一直在、後端掛了五分鐘」。
  UI 是 `components/UnsyncedWritesBadge.tsx`（計分頁標題列右上、amber、0 筆時完全不出現、
  點一下手動重試）；數字靠 `WriteLogOptions.onChange` 回呼抄進 React state——log 的 entry 是就地
  改狀態的普通物件，React 看不到。**已知缺口（不在 #64 範圍）**：開頁當下後端就連不上時，
  hydrate 的 query 全失敗 → 計分頁停在「載入計分記錄中…」，未同步徽章根本沒機會顯示；
  要修得先有「整場資料的本機快取」，那是離線讀取、不是離線寫入的題目。
- **部署形態定案＝單一服務，前端不分開部署（#26 PR1）。** 手冊在 `docs/deploy.md`。
  關鍵發現：`app.ts` 早就用 `express.static` ＋ SPA fallback 在吐前端 dist，所以 issue #26 body 裡
  「前端上 Vercel／後端上 Render，`/api` 相對路徑失效，要選 rewrite 還是 CORS」**那題不用選——
  不要拆**。同一個 origin 讓 `orval.config.ts` 的 `baseUrl: "/api"` 原封不動，也讓 PR2 的 session
  cookie 完全避開跨站 cookie 那一串。DB 選 **Neon 而非 Supabase**：Supabase 免費專案 7 天無請求
  會暫停且**要手動 restore**，而這個 app 的前提正是「不知道誰哪天會打開」；Neon 休眠是連線就自己醒。
  落地的檔案：`render.yaml`（blueprint，把 build/start/健康檢查寫成 code 而非儀表板點選）、
  `.node-version`＋`package.json` 的 `packageManager`/`engines`（雲端機器預設只有 npm，靠 corepack
  裝對版本的 pnpm）、`.env.example`、`app.set("trust proxy", 1)`（代理後面 `req.ip`/`req.protocol`
  才正確，PR2 的 `secure` cookie 少了這行會安靜地發不出去）。`buildCommand` 裡的 `--prod=false` 是
  必要的：`NODE_ENV=production` 會讓 pnpm 跳過 devDependencies，而 vite/esbuild/tsc 全在那裡。
  **本階段仍跑 mockAuth，網址先不公開**——刻意把「雲端環境跑不跑得起來」和「OAuth 寫對沒有」
  分開 debug，一次只查一個變因。
- **Google OAuth 接線＋mockAuth 退役（#26 PR2）。** `mockAuth.ts` 改名 `requireAuth.ts`：
  session 走簽章 httpOnly cookie（`lib/session.ts`，`cookie-parser` 簽章，不是伺服器端
  session store——單一行程、無擴充需求，換不到好處只多養一個 store）。`lib/googleAuth.ts`
  用官方 `google-auth-library` 的 `OAuth2Client` 換 token／驗 id_token（不手刻 JWT 簽章驗證，
  那是最容易埋身分冒用漏洞的地方）。新增 `/api/auth/google`（導向）、`/callback`（換身分、
  CSRF state 比對）、`/me`、`/logout`（後兩者才進 `openapi.yaml`／走 codegen，前兩者是純瀏覽器
  導覽、不是 JSON API）。`requireAuth` 跟 `GET /auth/me` 都保留「開發環境讀不到 session 就退回
  `mock-user-001`」的 fallback（`resolveDevFallbackUserId`，兩處必須共用同一份判斷——
  **上線前抓到一個真 bug**：一開始只在 `requireAuth` 加了 dev fallback、`/auth/me` 沒加，
  會讓本機 `pnpm run dev` 整個打不開，因為前端的 `AuthGate` 靠 `/auth/me` 判斷登入狀態、
  收到 401 就永遠卡在登入畫面，即使其他 API 底下其實都正常跑在 mock 帳號上——用瀏覽器實測
  才抓到，純看程式碼／型別檢查看不出來）。收掉全開的 `app.use(cors())`（同源不需要，開著只是
  多一個攻擊面）。前端新增 `AuthGate.tsx`（未登入時整站只看得到登入畫面，包在 `App.tsx` 最外層、
  不侵入 `NavRail`/`AppShell` 的三欄骨架，那是 tangyi1025 的設計治理範圍）＋畫面右下角固定的
  身分/登出小徽章。**既有 `mock-user-001` 測試資料 PO 決定直接清空、不遷移**——雲端 DB 本來就是
  PR1 新 push 出來的空庫，本機的 mock 資料留給 dev fallback 繼續用。**本機 `.env` 需要新增一個
  `COOKIE_SECRET`**（`.env.example` 已給可直接複製的開發用值）——這是這張 PR 對既有本機工作流程
  唯一的 breaking change，`app.ts` 開機時強制要求這個值（cookie-parser 初始化需要），不看
  `NODE_ENV`。Google Cloud Console 的 OAuth 用戶端申請步驟、`docs/deploy.md` 步驟 5–7。
- **專案 roadmap 已上線。** 時間序住在 repo **Milestones M1–M5**（現為 M1–M5＋M1.5/M2.5/M3.5）（軟目標日
  7/18→9/11，非死線），當下狀態住在 [GitHub Project #4](https://github.com/users/aila8913/projects/4)。
  **M1／M2／M1.5 milestone 皆已關閉**（M1.5 由 PR #239 帶關 #174/#120 後收掉；#176 已移 M3，
  它卡在 @tangyi1025 的圖示、不該讓一個純外部阻塞項把階段一直掛在逾期狀態）。**Todo 欄已填上 M2.5 的
  #226/#227/#228**——下一步直接看 Todo 欄就好，不用再重推。維護規則與 CLI id 在
  `.claude/skills/wrap-up/SKILL.md` step 5＋`reference.md`。尚待 PO 在網頁完成：Workflows 自動化＋三個 view。
- **記錄成本預算（#74，已關）＝`docs/recording-cost-budget.md`**：簡易/進階是懸崖式硬分界——簡易版
  一分打完後在死球空檔記**恰好一筆決定球**＋排先發＋換人/暫停＋「沒看到」escape valve；任何 per-touch／
  座標／到位分／子分類全歸進階版（賽後影片補填）。PO 拍板嚴守此界、不開 simple+。
- **事件文法（#73，已關）＝統計權威依據**（`docs/event-grammar-spec.md`）：每個統計 = events/rallies/sets
  欄位的純函數。剩餘缺口都是故意延到進階版的欄位（#51/#21）或教練待確認項（到位門檻 `quality>=2`、
  嗆司定義，皆有預設在跑、且有外部標準出處：VIS 官方門檻／DataVolley 慣例，見該 spec〈外部標準對照〉）。
- **兩人協作流程已上線並放寬**（PR #137 立、PR #141 放寬）：討論分流／關 issue 規則住 CONTRIBUTING.md
  「協作與溝通」，Claude 要主動把關的版本住 CLAUDE.md「Team & collaboration rules」。跨領域 PR **不需要
  對方 approve**、只要合併前 @ 知會一聲；「對方的 issue 不單方面關」仍在。改協作規範＝開 PR 動那些檔案。
- **需求層 pattern-language 住 `docs/requirements-pattern-language.md`**（Alexander 式 P1–P7）：是
  product-vision／recording-cost-budget／event-grammar-spec 三份 spec 的上位框架。「整體性評語」點名
  P7 離線（假牆）與 P6 球線分布（wow 點的洞）是兩處待補的張力。

### 設計進度 (tang — 視覺 / UX / area:design)

- **深色語言已套完全站、手繪風全站退役，#131 於 07-23 關閉**（`docs/design-spec.md`）：深色儀表板語言
  （`#0a0b07` 底＋萊姆綠 `#C6F135`＋玻璃卡片＋Space Grotesk/JetBrains Mono）。`wobbly-border` 與
  `--font-display`/Caveat/Permanent Marker 死碼已從 `index.css` 清掉。品牌 logo mark 已定案
  （`public/favicon.svg`）。**寫 UI 前先讀 design-spec.md**；實作數值以該檔「實作微調」「實作決定」註記
  為準（背景 `#0a0b07`、邊框 `white/[0.12]`～`[0.26]`、球場深青漸層——非原始的 `#121310`/暖木色）。
  （#134 仍 open：Track A 微 3D 已拍板延後到很後面；Track C 版面呼吸空間等功能介面先穩定，目前介面
  不夠流暢之處彙整在 #209。#132 首頁 review 收尾獨立進行。）
- **球場材質與球員圈已全站共用**：`courtTheme` 模組（毛玻璃地板／邊緣繞行光／漸層，`Court.tsx` 與
  `ScoreSheetCourt.tsx` 吃同一份，改一處兩邊同步）＋`components/PlayerMarker.tsx`（深色玻璃底＋狀態色
  邊框＋圈內背號／圈下姓名，戰術板 `PlayerNode.tsx` 與計分表共用）。計分表原本那個沒有 UI 能切換的死
  開關 `circleLabel` 已退役。
- **全站外殼材質（背景／右欄）已收斂成 `lib/appChromeStyles.ts`**（PR #253，**尚未合併**）：整頁背景
  `APP_BACKGROUND_STYLE`＋`APP_SHELL_CLASS`、右欄外殼 `INFO_RAIL_BASE_CLASS`（半透明玻璃
  `bg-[#121310]/75 + backdrop-blur-md`，取代原本的實色板子）各只有一個家。動機是這兩串樣式原本在
  七個頁面／三個右欄各複製一份，而 #131 改版**只改到戰術板／計分表兩頁**、其餘五頁停在舊的斜線網格版本
  分裂成兩代——複製的成本不在寫的當下，在改的時候。要調整全站氛圍改那一個檔案就好。
- **UX 測試流程已成文**：`docs/ux-testing.md`（PR #244）——兩個方案分不出高下時用小規模 moderated
  usability test（無事件追蹤基礎設施，做不了正式 A/B），測試結果寫在相關 issue 留言、不另開文件。
  #214 的[留言](https://github.com/aila8913/volley-tactic-board/issues/214#issuecomment-5126493974)是範例格式。
- **教訓（踩過三次，兩條）**：(1) aila 的架構重構（#154/#160、#172 AppShell）速度很快，材質類 PR 只要
  卡在分支上超過一天，動到的元件常常已被換掉底層架構——合併前務必先 `git fetch` 比對 `origin/main`，
  抓到就**直接照新結構重做一次**（不要嘗試 rebase 硬套舊 diff；#167 與 #182 都是重做的第二版）。
  (2) 落後 main 又同檔的 PR，**git 自動合併無衝突不等於合對**，要讀合併後的檔案確認雙方改動都活著；
  另外 fork PR 的 CI 預設不跑、要手動核准。

## Known gaps / next big pieces

Backlog lives in **GitHub Issues, phase-ordered via Milestones M1–M5** — this file no longer
duplicates it. Current phase = lowest-numbered milestone with open issues:

```
gh issue list --milestone "M3 部署給真人試用"   # 當前階段
gh issue list --state open                        # 全部
```

**M1／M2／M1.5／M2.5 milestone 皆已關閉。** M1.5「戰術板 UI 大改版」＝七環
（#172–#178），規格住 `docs/layout-spec.md`、相依鏈 `環1 →（環2 ‖ 環3 ‖ 環4）→ 環5 → 環6`；環 1–6
結構工作全部落地，剩的兩張尾巴（#176 繪圖工具圖示 blocked @tangyi1025、#178 環 7 響應式需線框稿）
已移入 **M3**，因為兩者都卡在 M1.5 內部推不動的外部輸入。**#199**（戰術板對手球員分色渲染——Court
從未渲染對手、snapshot player 無 `side`；spec 把 mode D 叫「對手佈陣」的那層 #177 沒做）07-28 補上
milestone，歸 **M5**。

**當前階段＝M3「部署給真人試用」（軟目標日 8/7，2 張 open：#218/#209，兩張都是 `needs-plan` 的
UX 題）。** #287（球隊帶出歷史名單建議）已於 08-05 交付，見下方 Recently closed。脊椎已於 08-02
（#77）與 08-04（#26）全數收尾，M3 剩下的都是不擋部署、搭便車的項目。**#221/#224/#240（人員合併
與管理）已於 08-05 全數交付並關閉**，#176（工具軌圖示）也已關閉，尾巴切成 **#284**（圖示細節與
視覺調整，08-05 歸 M5——它卡在 @tangyi1025 的設計輸入，同 #178 的判準：純外部阻塞項不掛在有軟目標日
的當前階段）；#178（響應式）已移出 M3 歸 M5。**PWA 化已開成 #278**（manifest ＋ vite-plugin-pwa，
歸 M5）——跟 #64 資料層零依賴、可平行，且是唯一能自然分給設計夥伴、又不需要先懂佇列設計的一塊。

**M2.5「收斂重複規則」（軟目標日 8/1）已全數關閉。** `#228`（route handler 儀式：404 樣板 ×33、
ownership 守衛 ×25 全靠人記得寫）08-01 完成收尾：`lib/handler.ts` 落地後 12 支 route 檔案
（tactics/matches/teams/tournaments/people/players/sets/rallies/events/substitutions/timeouts/
analysis）全部遷移完（PR #256/#262~#272），`owns` 必填欄位讓漏寫擁有權檢查變成編譯錯誤。
**#226（07-30）／#227（07-30，PR #250）／#238＋#257（08-01，PR #258/#259）都已收斂並關閉**（見下方
Recently closed），Project #4 網頁上的卡片待 PO 手動移過去。**#247**（連鎖換人 A→B→C 摺疊後查不到
原始先發，#226 PR1 過程中發現）是 M2.5 之外的新孤兒，未歸 milestone，需先討論修法方向（`needs-plan`
性質）。下一個階段還沒有明確軟目標日，目前最新落地的是跨 milestone 的獨立缺口 **#251**（戰術板頁
輪轉/名單面板重複顯示，08-02 已關閉，PR #274，見下方 Recently closed）。

M2 雖已收 milestone，衍生待辦仍在各自 issue：**#214**（分析頁導覽重構，M5）、**#235**（side-out%
等比率統計，M5——資料已足夠，發球方可由 `sets.firstServer` 當種子逐分推導）、**#222**
（`RosterEditDialog` 沒有去重 UX，從戰術板那條路徑新增的球員 `personId` 永遠 null）。**#221/#224
（人員合併與管理頁）已於 08-05 交付，見下方 Recently closed。**
**#218**（一場比賽「結束」的操作節點與畫面）——目前「結束比賽」只是導去分析頁的 `<Link>`，**最後一局
不會被封存**（`completedSets` 只在按「下一局」時累積），是資料缺口不只是 UX 缺口。

其餘 open 的技術債與待辦：
**#292（tsconfig `exclude` 漏了 `*.test.tsx` 的對稱項）** ——`*.test.ts` 測試檔完全沒進 typecheck，
所以測試裡的型別錯誤 CI 抓不到；跟 #294（`GET /matches/{matchId}/players` 缺 `ORDER BY`，Postgres
MVCC 讓任何 UPDATE 把該列擠到名單最後）同為 #221/#224 期間發現的既有缺口，兩張都歸 **M3.5**。
**#168（引入 `@testing-library/react`）** ——現行 `renderToStaticMarkup` 慣例無法觸發事件、讀不到 Radix
Portal，飛出選單與帶 mutation 副作用的 controller 全在自動測試盲區（#201 的計分頁死結修復就落在這裡，
僅手動驗證）。**架構掃描把這個盲區量化了，它是 M2.5/M3.5 的實質前置**：每一支刻意抽到 `lib/` 的純函式
都有測試，每一個握著座標數學、指標事件、輪轉/自由球員規則的元件都沒有（`Court.tsx`、
`ScoreSheetCourt.tsx`、`useRotationTable.ts` 364 行全部零測試，座標數學部分已隨 #227 抽成
`lib/courtGeometry.ts` 並補測試，元件本體互動邏輯仍是零測試）。**測試覆蓋的是安全的部分，
沒覆蓋的是危險的部分。**
**#40**（undo/redo 不涵蓋輪轉拖曳，與 #147 同塊邏輯但不同 store）——建議排在 **#231 之後**：先發表示法
收斂成一份、座標降級為衍生值之後，undo 要回捲的目標才明確，屆時這張可能小很多。
**#64**（背景寫入失敗不 reconcile）——#201 在 `useScoreSheet.start()` 補了 guard，**堵掉「單機就能製造
serving≠null 但 record.lineup=null」那條路**，但真正的 reconcile 仍未做；**#230 是它的結構前提**（現在
六個 action 各自重寫寫入四步、三疊平行 id ref，沒有一條有序紀錄可以拿來對帳）。關聯部署 #26／離線契約
#75，兩者仍屬 priority:essential 的自然接續。
進階版差異化（M4）：#51 動作子分類、#21 球線座標、#99 站位快照——同屬 advanced tier，可一起設計。

**已修掉但判準值得留著的**：#127（後端沒驗 tournamentId 擁有權）——**外鍵保證 referential integrity
（uuid 指得到一列），不保證 ownership（那列是不是你的）**，兩者很容易被當成同一件事；`lib/ownership.ts`
的 `tournamentBelongsToUser`／`teamBelongsToUser` 就是這條判準的落點。**這條判準已復發過一次**（#225，
`tactics.ts` 是當初唯一沒 import `ownership` 的路由檔）——**判準寫下來擋不住復發，因為新檔案不會自動
知道它**；真正的結構解法是 #228 的 route handler 儀式收斂，讓守衛不再依賴「人記得寫」。

## Recently closed (past ~week)

### 開發 (aila)

- **#287**（球隊帶出歷史用過的人當建議清單，08-05）— #252 定案的查詢層推導實作：新增
  `GET /teams/:teamId/roster-suggestions`，`matches.teamId → players.personId → people` 一句 join
  撈出「這支球隊登錄過的人」，**不建 `team_members`、完全不動 schema**。**走後端 endpoint 而非前端
  拼**：前端拼會變成「撈全部比賽→過濾 teamId→逐場再打一次 `/matches/{id}/players`」的 N+1 請求。
  回傳的 `name`/`number`/`role` 取**最近一場**那一列（`players` 而非 `people.name`，跟 number/role
  同一列來源才一致）——背號/位置會換季換人變，最近一次最可能還是對的。UI 是 `MatchFormDialog` 選了
  既有球隊後出現的一排 chip，**點一顆才加一個人、不自動整批帶入**：自動填會覆蓋使用者已經打好的列，
  是會產生錯誤答案的方向（同 #213/#215 那條「能不能給預設，取決於預設的方向會不會產生錯誤答案」）。
  已在表單裡的 `personId` 會從建議清單濾掉；名單只剩一列空白佔位列時第一次點是**取代**而非 append
  （否則留一列空名字卡住 zod 驗證）。`PlayerRosterMatchHint` 完全沒動——兩者互補：建議清單接住
  「這隊打過的人」，打字比對接住清單裡沒有的人（臨時上場、別隊老面孔）。**實機驗過**：種子資料裡
  林小美同時出現在 A 隊（#15）與 B 隊（#13），正是「一人跨多隊」情境下背號各自不同的預期行為。
- **#221 ＋ #224**（人員合併機制與管理頁，08-05，PR #293/#295）— #213 留下的缺口：`people` 只在
  MatchFormDialog 送出名單時被動建立，同名重複沒地方合併、打錯字沒地方改。#221（後端）：新增
  `person_merges` append-only 稽核表（一次合併寫 N 列，記 target／來源名字快照／被改指的
  `players.id` 清單——合併不可逆，這張表是誤併後人工拆得回來的保險）；`POST /people/:id/merge`
  在單一 transaction 裡「改指向→寫日誌→刪來源」，body 帶進來的 `sourceIds` 額外手動驗擁有權
  （`owns` closure 只驗得到 path param，驗不到 body 陣列，漏掉就是 #225 那類 IDOR）；候選偵測
  `normalizePersonName` 刻意比 MatchFormDialog 的去重判準寬（NFKC＋拿掉所有空白含全形空白），
  因為這裡只是列出來給人勾選確認、猜寬了成本趨近於零，猜漏了才是問題。#224（前端）：
  `GET /people` 順手補上 `matchCount`/`teamNames`（新 `PersonSummary` schema，`Person` 本身
  不動，因為 POST/PATCH 那幾支回應算不出這兩個欄位）；新增 `PeopleManagement.tsx`
  （`/analytics/people/manage`）——列表／新增／行內改名／刪除（`window.confirm` 講清楚只解除
  跨場關聯不刪比賽資料）／合併建議區塊（每組候選選目標＋來源，確認訊息點名哪些名字會消失）。
  **實測抓到的坑**：`normalizePersonName` 原本只把內部空白壓成一個而非整個拿掉，「王　小明」
  （全形空白）配不到「王小明」，正是這功能最該抓的那種手誤，已修正並補測試。**副產品 #294**：
  合併測試時發現 `GET /matches/{matchId}/players` 沒有 `ORDER BY`，Postgres MVCC 讓任何 UPDATE
  都把該列擠到名單最後——與合併無關的既有 bug，另開追蹤、不混進這兩張 PR。
- **#251**（戰術板右欄整併進 `RotationRailPanel`，08-02，PR #274）— tang 實機回報：戰術板佈陣模式
  同一場比賽的球員清單重複顯示兩三份，根因是 #172/#174 那次右欄元件化漏掉戰術板頁，`TacticsBoard.tsx`
  一直用著舊版 `RotationTable`（中央欄）＋另一顆臨時的 `TacticsRosterPanel`（右欄），兩者都不是 #174
  做好的共用元件。這次把兩個 mode（B 瀏覽／D 佈陣）統一改成同一顆 `RotationRailPanel`：新增獨立於
  `readOnly` 的 `benchDraggable` prop，讓 6 宮格站位維持 ADR-0001 規定的唯讀（戰術板不能寫回輪轉表
  真相）、但球員清單本身仍可拖到球場——兩者是互不相干的兩個開關。順手抽出 `useRotationStepper`
  （切輪次的副作用邏輯，含未存內容確認捨棄）取代原本另外一顆長得一樣的 `RotationSwitcher` 元件
  （已刪除）。中央欄固定 260px 的輪轉表欄整個拿掉，面板固定收在右側 aside，不再依 mode 跳位置。
  跟 issue 原始建議清單有一點差異（清單建議整個拿掉 3×2 格子，實際依 PO 確認的 mockup 方向改成
  「格子保留當唯讀參考、只讓清單可拖」），差異已記在 PR body。
- **#238 ＋ #257**（比賽狀態判準收斂到底，08-01，PR #258/#259）— #238：比賽列表、資料夾統計格、
  資料夾內頁三處各自判斷「這場比賽算不算開賽」，判準互相矛盾（`completedSets.length === 0` vs
  `setsPlayed > 0`），同一場打到第一局一半的比賽在不同畫面顯示矛盾答案。收斂成
  `matchOutcome.deriveMatchStatus(winner, setsPlayed, hasLineup)` 單一函式（`MatchStatus` 五態：
  `not_started`/`lineup_only`/`in_progress`/`won`/`lost`），`matchSummary.formatMatchResult` 改吃
  算好的 `status` 而非自己重算，順帶收掉 `MatchList.tsx` 裡跟判準幾乎逐字重複的 `matchNeedsLineup`。
  `lineup_only` 在列表頁（獨立黃標催辦）與資料夾頁（併進主標籤陳述）呈現不同，是刻意的**呈現差異**、
  不是狀態本身有兩個答案。實作過程中發現 `TournamentDetail.tsx` 資料源另有一個獨立問題（本機
  `recordingsByMatch` store 只有「打開過那場」才 hydrate，跟 `MatchList.tsx` 修過的舊坑同款），刻意
  另開 **#257** 不混進 #238 這個 PR，隔天接著修：資料源換成 `useCrossMatchAnalysis` bulk API，並補上
  這頁原本沒有的「尚未排先發」黃標。兩頁的推導邏輯刻意不抽共用 hook——資料接線本來就不同，硬抽反而
  增加耦合。
- **#228 啟動**（抽出 `lib/handler.ts` 收斂 route ownership 檢查，08-01，PR #256，**issue 仍 open**）—
  #225（tactics 路由漏 ownership 檢查）暴露的病根是「擁有權檢查靠人記得寫」，`owns` 在既有寫法裡是
  可選欄位，忘記加不會被 TypeScript 攔下來。新的 `handler(config, fn)` 把 `owns` 改成**必填欄位**
  （`"public" | OwnsCheck | OwnsSpec | Array<...>`），漏寫從「容易漏看的重複程式碼」變成編譯錯誤。
  `tactics.ts` 是第一個遷移案例，self-review 時順手發現 GET/PUT/DELETE 三處 `owns` closure 逐字重複，
  抽成 `lib/ownership.ts` 的 `tacticBelongsToUser` 一併收斂。其餘約 10 支 route 檔案還沒遷移，按
  一檔一 PR 的節奏陸續進行。
- **#227**（抽出 `lib/courtGeometry.ts`，07-30，PR #250）— `toSvg`/`toNorm`（normalized↔SVG 換算）、
  `fromScreen`/`toScreen`（`getScreenCTM` screen↔SVG 換算）、`rowOf`（前後排視覺門檻）三組純函式，
  收斂 `Court.tsx`/`PlayerNode.tsx`/`ScoreSheetCourt.tsx`/`Markers.tsx`/`DefenseRange.tsx` 原本重複的
  12+5+4 處實作；中線/三米攻擊線 SVG 抽成 `courtTheme.tsx` 的 `<CourtLines/>`。**`rowOf` 刻意不跟
  `rotationLogic.ts` 的 `isBackRowPosition` 合併**——前者是純視覺判斷（圓圈該不該套前排配色），後者是
  領域規則（自由球員站這裡合不合法），門檻數字現在一樣只是巧合，未來各自要調整互不影響。順手刪除
  `CourtReadOnlyView.tsx`（零 production caller，只有自己的測試在用）。**範圍依 PO 確認收在核心四項**，
  issue 原本提議但「還沒定案」的鏡射機制統一（`Court.tsx` 三種手寫鏡射並存）與 zone 座標搬家，
  刻意不做、留在原地。
- **#226**（得分/輪轉規則收斂成 deep module，07-30，三份 PR）— PR1 #242：side-out 輪轉、換人淨額摺疊、
  「最後一局進行中」慣例收進 `volleyballRules.ts`，live 記分與 replay 重建共用同一份。PR2 #245：局比數
  計算（原本四份手寫比較）收成 `countSetWins`/`setWinner`。PR3 #246：「得分/失分→誰拿到這一分」的換算
  原本直接寫在 `ScoreSheet.tsx` 事件處理器裡、完全沒測試，抽成 `resolveScoringSide` 純函式後才測得到。
  **輪次聚合、局比分 replay vs 後端 SQL 重複刻意不處理**——依 ADR-0003，後端欄位是 replay 邏輯的下游
  物化結果，不是第二份規則實作。**PR1 過程中發現的既有 bug 另開 #247**：`applyRegularSub` 把換人紀錄
  摺成淨額表示（append-only log → 目前誰在場上），連鎖換人 A→B 接著 B→C 時，中間人 A 曾是先發這件事
  會從清單消失——`ScoreSheetCourt.tsx` 兩處用 `outPlayerId` 查代打的地方查不到最原始先發。確認是 live/
  replay 合併前就存在的既有行為（非本次重構的回歸），修法方向留給 #247 討論再動手。
- **#225**（tactics 路由的兩個 ownership 缺口，07-30）— `POST /tactics` 沒驗 `matchId` 屬於誰（**外鍵只
  保證那筆 id 存在，不保證是你的**——#127 判準的復發），`DELETE` 直接回 204 不看實際刪掉幾列，刪不到
  別人的戰術也回成功、等於對呼叫端說謊。修法照 `matches.ts` 既有樣式：`matchBelongsToUser` 守衛 ＋
  Drizzle `.returning()` 判斷列數，兩者都回 **404 而非 403**（403 等於向攻擊者確認那筆資源存在）。
  `PUT` 不需要改——`UpdateTacticBody` 根本沒有 `matchId` 欄位，改不到歸屬。
  **同 PR 讓跨使用者情境變成「測得出來」**：mockAuth 支援 `X-Mock-User-Id` 假扮，seed 補一場掛在
  `mock-user-002` 底下的空比賽（UI 永遠不會出現，唯一用途是當「別人的資料」）。**gate 用白名單
  `NODE_ENV === "development"` 而非黑名單 `!== "production"`**——`pnpm run start` 不設 NODE_ENV，黑名單
  寫法會判定「不是 production」而把身分冒用後門默默打開。**這個選擇當場就回本**：測試失敗才發現
  dev script 的 `cross-env NODE_ENV=development pnpm run build && pnpm run start` 因 `&&` 中斷作用域，
  **真正跑起來的 server 一直沒有 NODE_ENV**（已修）——黑名單寫法會「正常運作」並把同一個洞帶進正式環境。
  **#232 保持 open**：只完成它三件事裡的 mockAuth 那件，`createDb` 注入未做。
- **PR #242**（#226 PR1，07-29）— 見上方 M2.5 段落。
- **PR #237**（計分頁球場視覺，07-28）— 對手號位圈改共用 `PlayerMarker`＋紅色邊框柔化到 70% 不透明；
  `glowBlur` prop 讓紅色光暈收到 0.75px 而其餘顏色維持 3px（**不同顏色需要不同模糊半徑，不是一個數字
  打天下**）；`courtTheme.tsx` 球場背景從三段深青漸層改單一平色 `#1B6E62`（戰術板與計分表同步變）；
  「沒看到」從球場上兩個虛線框整併進比分卡動作選單，球場內只留「畫線連到明確目標」一種手勢。
  **#220 保持 open**：單色版已上線，但「要不要回頭用漸層」還沒拍板，issue 是刻意留著的討論串。

### 設計 (tang)

- **PR #244**（`docs/ux-testing.md`，07-30，無對應 issue）— 輕量 UX 測試流程：什麼時候該測（兩個方案
  分不出高下時，不是每個設計決定都要測）、怎麼測（任務情境不下指令＋think-aloud＋3–5 人）、決策規則
  （打平時選跟現有互動一致的），底部留一張測試紀錄表格待累積。
- **開著待調整的兩張 PR（今天沒合併，刻意留著追蹤）**：
  - **PR #248**（#176 剩餘的工具軌正式圖示）— 10 顆圖示取代單字佔位，每顆照該工具在球場上實際畫出來的
    樣子設計（虛線工具的圖示真的用 `stroke-dasharray` 畫）。實機看過後拿掉「攻擊線」工具（跟實線箭頭
    分不出來）與「號位標示」開關（連 store 欄位＋`Court.tsx` 渲染一起刪，決定已留言在 #176）。
  - **PR #253**（全站背景與右欄材質統一）— 待調項目記在該 PR 的留言：右欄透明度 `/75` 的實際數值、
    `ListItemCard` 比例（要拿 Figma 重畫線稿，不再猜 px）、全站 16 種字級的收斂。
- **PR #217**（計分頁視覺打磨＋左欄導覽全面圖示化，07-27，無對應 issue）— 大比分改黑底翻牌計分卡、
  字體用 Anton（`--font-score`；這是 design-spec 第 3 節明文留的例外「真的需要大字展示、且內容以數字
  為主」，跟 PR #129 判 Anton 死刑的 17–18px 中英混排卡片標題不同情境）；發球指示從一顆 🏐 改成發球方
  卡片**邊框＋外光暈**亮起（照 design-spec 第 4 節「發光效果只留給真正需要被看見的狀態」）。
  `RotationRailPanel` 拿掉 6 個號位數字（`GRID_ZONES` 的空間排法本身就是站位資訊，數字是多餘圖層）
  ＋收緊間距，解決右欄要滾輪才看得到下面內容。`NavRail` 五格換成手繪風線稿圖示（新增
  `components/icons/`＋共用 `NavIconSvg` 外殼）：動畫用一份共用 keyframes，每條路徑用 CSS 自訂屬性
  `--nav-icon-len` 帶自己的長度（`lib/navIconStyle.ts`）——「戰」的劍形八條路徑有五種長度，每種各刻
  一個 class 會很快失控。
- **PR #210**（計分頁球場置中修正＋`PlayerMarker` 共用，07-26，無對應 issue）— #195 那次改版把球場欄
  寫成 `flex-1`，會先吃光整排剩餘寬度再自己在裡面置中，導致留白全集中在球場左邊、螢幕越寬越偏
  （DOM 量測：1920px 視窗下左 426px、右 0px）。改成球場欄跟內容一樣寬、外層整排 `justify-center`。
  同 PR 抽出共用 `PlayerMarker.tsx`。**同一 session 也在 #134 留言記錄視覺優先順序**（Track A 延後、
  Track C 等功能介面穩定），並開 #209 彙整 UX 資訊密度問題。
- **PR #195**（#131 計分表整頁改版，07-26）— 抽出共用 `courtTheme` 模組；`ScoreSheet.tsx` 版面從上下擠
  一條改成左右發展（球場吃左邊、比分＋操作按鈕收右邊一直欄）；背景加 `.tb-beam` 斜向光影。合併 main
  時與 aila 的 #201 在同一段「誰先發球」JSX 衝突（結構不同、對方那版還是舊單欄版面），已手動把判準
  （改看 `lineup` 而非 `serving`）套進新的左右欄結構。

---

- （更早的條目已修剪——記錄住在各自 issue 留言、`docs/*-spec.md`、git log：
  #177 環 6 新增戰術流程＋佈陣 mode D、#176 環 5 工具軌結構（PR #197，**#176 仍 open**，剩正式圖示待
  @tangyi1025，已移 M3）、#175 環 4 中央列表型（`ListItemCard`/`ListScrollArea`/`matchSummary.ts`）、
  PR #182 計分表計分區深色化、PR #167 戰術板球場材質（**#134 仍 open**）、
  #172 `AppShell` 三欄骨架（PR #180）、PR #179 `layout-spec.md`＋七環拆解、
  #163 文件同步、#160 C1/C2/C3 三顆 PR、#44 暫停全棧、#147/#149 undo 一次退兩步、
  PR #141 協作規則放寬、PR #142 pattern-language、PR #148 品牌 logo、PR #140 戰術板材質、
  PR #135/#129 深色語言首批，以及更早的 #118/#117/#115/#41/#50/#74/#73/#63/#20 等。）
