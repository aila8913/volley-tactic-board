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

\_Last updated: 2026-08-06 (tang) — **設計系統「戰術版風格」的背景層與 token 落地全站（PR #321）**，
同批把計分板改成一鍵記分。新開 #320（背景強度微調）／#322／#323／#324；#134 Track B 標記為已由設計
系統接手，#21／#19 過時的 body 一併修正。\_

\_Last updated: 2026-08-09 (aila) — 示範資料整條打通（#344/#345/#346/#348，改成 1 場完整比賽）；
正式站 schema push 漏做導致 500，已修；#349「第 4 局」修兩次才修完（PR #350→#351），收斂工作開 #352；
合併關卡從 ship skill 搬進 `CLAUDE.md`。\_

## Current state

Where the project actually stands right now (durable "current" facts; per-session detail
lives in git log + the issues named).

### 開發進度 (aila — backend / frontend / db / infra)

- **示範資料整條打通了（#344／#345／#346／#348，08-08～09）。** `lib/db/src/demoData.ts` 的
  `seedDemoData(exec, userId, seed)` 是**唯一一份**示範資料建構器，兩個消費者共用：`db:reset` 的
  種子腳本、以及 `POST/DELETE /demo-data`（灌進使用者自己的帳號、刪除時用
  `and(eq(userId), eq(isDemo, true))` 白名單只砍示範資料）。前端空狀態多了「載入示範比賽」按鈕。
  **#348 把 4 場零碎比賽改成 1 場完整的**（範例球隊 vs 範例對手、烏野 12 人名單、三局 2:1、
  含換人／暫停／自由球員上下場），因為 4 場之中有 2 場湊不滿六個非自由球員、seed 不出 lineups，
  新使用者第一次點進去看到的反而是空盤子——**示範資料的價值在「完整走完一場」，不在場數**。
- **正式站踩到的坑：merge 不會幫你 push schema（08-08）。** `render.yaml` 的 `buildCommand`
  **刻意沒有** `drizzle-kit push`——雲端 schema 變更必須是明確的人為動作，不能是合併的副作用。
  代價是合併了動 `lib/db/src/schema/` 的 PR 卻忘了 push，正式站的新程式就會查一個不存在的欄位、
  當場 500，而**四道 CI 全綠**（CI 跑的是本機／CI 資料庫，看不到雲端的 schema 漂移）。
  另外兩件當場學到的：Neon 要用 **Direct** 連線字串（pooled 會靜靜卡在「Pulling schema…」）；
  dotenv **不覆蓋**已存在的 `process.env`，所以在 shell 裡設 `DATABASE_URL` 會蓋過 repo 的 `.env`。
- **#349「第 4 局」修了兩次才修完（08-09）。** 已完賽的比賽在右欄「場上站位」預設停在一格不存在的
  空局。病根是 #218 之後已完賽**沒有進行中的那一局**，但 UI 仍無條件 `completedSets.length + 1`。
  PR #350 只修了分析頁，PR #351 才補上**第二份拷貝** `MatchInfoRail.tsx`（比賽列表右欄，也就是
  範例比賽最先被看到的地方）。順帶把判準從「已完賽就不 +1」改成**看那一格裡有沒有資料**
  （`currentSet.serving !== null`）——前者會讓「2:0 已分勝負但教練仍按下一局並繼續記分」那局滑不到。
  收斂成一支共用函式的工作開在 **#352**（M3.5）；`MatchInfoRail` 目前零測試，卡 #168。
- **合併關卡改寫進 `CLAUDE.md`（08-09）。** 原本「push 前確認、merge 前確認」只寫在
  `.claude/skills/ship/SKILL.md` 裡，而 skill **靠觸發詞才載入**——任務式的講法（「解決 #349」）
  不會載入它，那三道關卡就一次都沒生效，PR #350 因此在 CI 綠、但只修一半的狀態下被合併。
  現在的規則：**commit／push／開 PR 不用問，`gh pr merge` 一定停下來等使用者驗過**。
  這條跟「不用等 tangyi1025 approve」是兩件事，不衝突。
- **Roadmap 結構改了（08-07）：原 M5「體驗重整與雜項」拆成三包**——**M5 自由球員與計分正確性**
  （記出來的數據會不會錯）／**M6 介面精簡與導覽重構**（源自 #209、票之間互相牽動）／**M7 打磨與雜項**
  （只收獨立、小、隨時可插隊的）。拆的原因值得記住，因為會復發：**名字裡有「雜項」的 milestone 會變成
  垃圾桶**——原 M5 三週吃掉 31 張 open 的 23 張（74%），一行 CSS bug 跟要開設計會的方向題混在同一張
  清單裡，就無法排序。M1～M3.5 運作良好是因為每個都是「一個價值假設＋少量票＋做完就關」。
  **各 milestone 的收件標準與 CLI id 見 `.claude/skills/wrap-up/reference.md`**（那裡也記了為什麼
  「M5」這種會滾動的編號不該被抄進靜態文件——那行 `--milestone "M5 體驗重整與雜項"` 今天起會執行失敗）。
  同批把 `CONTRIBUTING.md` 的 **`needs-plan` 定義修正成「動工時要好好規劃」**（原本寫「範圍或設計還沒
  定案」，害這次盤點差點把 10 張可動工的票當成待決策凍結）並補上新的 `epic` 標籤。
- **後端「合併規則」現在測得到了（#229，08-07）。** `routes/analysis.ts` 兩支彙總 endpoint 的 JS 合併
  段（哪一局算已結束、已完賽要砍沒開球的尾巴局、跨場去重、teamBreakdown）搬進
  `artifacts/api-server/src/lib/analysisSummary.ts` 的 `summariseMatches` / `summarisePerson`，
  餵 literal rows 就能斷言、不用開 Postgres。**PO 拍板的取捨要記住：只抽純函式，不做 query adapter、
  不做 DI**——issue body 自己的警告成立，只有一個實作的 adapter 是假 seam、只是多一層。因此
  **#232（`createDb` 注入）並沒有被這張帶掉**，它剩下的價值要單獨評估：真要動就得同時接上第二個
  adapter，並把 `insertIdempotent`／`handler` 的 owns 這兩個「收斂過的守衛」補上測試。
- **測試假資料有共用 builder 了（#306，08-07）。** `artifacts/volleyball-tactics/src/lib/__fixtures__/scoreSheet.ts`
  提供 `makeSet` / `makeRally` / `makeEvent` / `makeSubstitution` / `makeTimeout` / `makeLineup`，
  簽章一律是「一包 `Partial<T>` 覆寫，其餘給最無趣的預設值」。**要守住的規則：預設值不能帶語意**
  ——任何某條測試正在斷言的值，一律要在該測試的呼叫裡明寫，否則讀測試的人看不出關鍵條件從哪來。
  背景是 #64 PR1 把主鍵改成 uuid 時、光這一支測試檔就要手改 36 處；#292 補上了偵測（測試檔納入
  typecheck），這張補上的是修復成本。目前只導入 `scoreSheetMapping.test.ts`（收益最集中），
  其他測試檔要不要跟進另外判斷。
- **手動測試有沙盒了（#339，08-07）。** `pnpm run db:reset`＝schema push ＋ 清空 ＋ 重灌
  `lib/db/src/seed-testdata.ts` 的種子資料。用法是**另開一顆「試驗沙盒」資料庫**、`.env` 指過去，
  隨手點畫面就不會把開發資料越測越亂。這次補上：**production 安全閘門**（`assertSafeDatabaseHost`）、
  `lineups`／`tactics` 種子（原本被 TRUNCATE 卻從沒被 insert，所以先發／戰術板畫面一直是空的）、
  npm script、以及 `.env.example`／README 的說明。
  **安全閘門是白名單不是黑名單**——只放行 `localhost`／`127.0.0.1`／`::1`／`host.docker.internal`，
  其餘一律拒絕，逃生門是必須完全等於 `"yes"` 的 `ALLOW_DESTRUCTIVE_SEED`。理由：黑名單
  （`!== "production"`）是在窮舉「想得到的壞情況」，`prod-db.example.com` 這種沒被想到的名字會
  直接放行。跟 `requireAuth` 的 `NODE_ENV === "development"` 是同一套慣例。
  **刻意沒做假後端**——見 #339 body：手動測試的價值就在抓真實後端行為（ownership／Zod／冪等），
  手寫的記憶體假後端必然跟 `routes/*.ts` 漂移，漂移之後測試會過、正式環境會壞。出貨給使用者的
  示範資料（#336）才走前端攔截，兩張**刻意不共用實作**。
  剩下的已知限制見 #341（schema 刪欄位時 `drizzle-kit push` 會跳 y/n，而 `db:reset` 沒東西餵它）。
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
  幽靈站位掃空先發仍由 `filterLineupToRoster` 的名單過濾擋著（`lib/rotationLogic.ts`；#231 PR3
  之前這件事由 `captureLineupFromRotations` 兼著做）。
  已在 #115 補留言註記其解耦模型作廢（多處文件曾拿它當法規引用）。
- **輪轉表 store 的站位表示法只剩一份（#231，08-06 合併、08-07 關閉）。**
  `PerMatchRotationState` 現在只存 `lineup: LineupSnapshot`（起始號位 → playerId，**0~6 人皆合法**）
  ＋ `liberoZones: (number|null)[]`（長度 6，L 這一輪站哪個後排格）＋ `startingLiberoId`；
  舊的 `rotations: RotationPositions[]`（六輪座標）與 `liberoReplacement`（被 L 蓋住的人）都刪了，
  改由 `deriveRotation(lineup, liberoId, liberoZone, rotation)` 在渲染時現算。原則是
  `docs/event-grammar-spec.md` 那條**「能推導就不存」**套到前端 store。
  - `resetCurrentRotationPositions` → **`resetPositions`（清全部六輪）**：一份共用 `lineup` 下
    「只有第 3 輪是空的」不可表示；舊行為本來也名不副實（清完再拖一個人，六輪就全部重算）。PO 已確認接受。
  - 「可不可以開賽」的門檻獨立成 `isLineupFull`，跟「現在排了誰」徹底分家（#174 死結的根因）。
  - ⚠️ **`liberoZones` 這個方向已於 08-07 被 PO 推翻，#326 接手改掉**。當時的理由是「L 不佔輪轉序，
    所以各輪站哪格是獨立的真實資訊」；但 PO 定案的規則是**「L 從後排轉出去就下場、留在場外，直到
    手動再換上場」**，在這條規則下「L 站哪格」＝被頂替者在該輪的號位，是**推導值**。
    **判準值得記住：「這個值能不能從別的值推出來」要先確定領域規則是什麼——規則沒釘死之前，
    看起來像獨立事實的東西可能只是缺了那條規則。** #231 刪掉的 `liberoReplacement`（頂替誰）其實
    才是原始事實，留下的 `liberoZones` 才是推導值，方向反了。
  - **#14 的「一般球員疊到 L 站的格子」這次驗證不了**（原本以為順帶消失）：QA 時發現使用者根本
    排不出自由球員先發，構造不出那個情境。見下一條。
- **自由球員目前完全沒有可用的設定入口（08-07 QA 發現，#327）。** 「誰是先發 L」在整個 app 裡只有
  一個入口——`Court.tsx:568` 的 L 備位圓圈，只在 `courtView === "rotation"` 渲染。而 (1)
  `useTacticsBoard.ts:287` 的 `startSession()` 無條件把 `courtView` 設成 `"tactics"`，新開一份戰術
  就跳過去了、到不了那顆圓圈；(2) `RotationRailPanel.tsx:161` 的 `roster.filter(p => p.role !== "L")`
  把 L 從球員清單濾掉，而戰術板右欄與比賽列表右欄用的都是這顆元件（#251 統一的）；(3) 格子只有
  `grid-cols-3` × 2 六格，沒有自由球員格。**三個各自看都合理的決定疊起來，結果是一個功能完全無法使用**
  ——而且沒有任何測試會失敗，因為每一處單獨看都是對的。修正順序 #326（模型）→ #327（3×2＋1 格）→
  #328（中央輪轉視圖退役）。
- **`courtView` 是個沒有名字也沒有切換入口的隱性狀態（#328）。** `Court.tsx` 一支元件兼「輪轉站位」
  與「戰術快照」兩種畫法，但**沒有任何按鈕能切換它**——只是 `startSession`/`viewTactic`/`discardSession`/
  `useRotationStepper.ts:33` 的副作用，畫面上也沒有任何地方指出現在是哪一種。PO 實測時明確表示看不懂
  這個概念，而 `CONTEXT.md`／`docs/layout-spec.md` 兩份都沒有它的名字——**它是 #174/#251 把輪轉表搬進
  右欄之後剩下來的遺留畫面，不是被設計出來的**，唯一還獨有的東西就是那顆 L 備位圓圈。
- **比賽編輯要從彈窗搬進右欄就地編輯（#329，08-07 PO 定案，尚未動工）。** 現在「這場比賽是什麼」被切
  成兩半：右欄 `MatchInfoRail` 看比分／站位，改時間／對手／球隊／賽制／名單卻要開 `MatchFormDialog`
  （492 行），而彈窗一開就把右欄整個蓋掉。目標形態是**右欄＝比賽的唯一編輯面板**：選中→唯讀、按編輯→
  就地可改、新增比賽→直接開在編輯模式，`MatchFormDialog` 整支刪掉。PO 已定案**球員名單一起搬**
  （右欄一次到位，不留「基本欄位在右欄、名單還在彈窗」的半套）。
  - **實作時最容易做錯的一點：站位的唯讀規則不能被這個新的「編輯模式」開關覆蓋。** 站位可不可以改是
    領域規則（歷史局／局中凍結一律唯讀，只有未開賽的局能排先發，見 `MatchInfoRail.tsx` 那串 if/else），
    跟「比賽資訊在不在編輯狀態」是**兩個不同層次的可寫性**，一按編輯就全部解鎖會讓已開賽的局的先發被改掉。
  - 順序上要等 **#327**（`RotationRailPanel` 加自由球員格）先落地——右欄內嵌的正是那顆元件。相關的
    #222／#24／#209 已補上交界留言與 body 修正。
- **衍生文件不維護（07-21 PO 決定，`docs/flow-diagrams.html` 已刪）。判準值得記住：決策文件
  （`docs/*-spec.md`、issue 留言）值得維護，「描述程式碼現在怎麼跑」的衍生文件不值得**——它註定
  落後，而落後時**主動誤導**（#163 整張 issue 就在處理這件事：它描述的 API 不是「舊」而是已被刪除，
  照著讀會實作出一條被 CI 焊死禁止的資料流）。onboarding 入口改成「跑起來自己點一遍」＋
  `docs/requirements-pattern-language.md`。**同判準於 07-28 再砍一份：`docs/match-recording-erd.html`
  （582 行手繪 ERD）只畫 6 張表，實際 schema 已有 13 張——它獨有的推論早就寫進
  `backend-architecture.md` 本文，刪掉不損失資訊。**
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

### 設計進度 (tang — 視覺 / UX / area:design)

- **深色語言已套完全站、手繪風全站退役，#131 於 07-23 關閉**（`docs/design-spec.md`）：深色儀表板語言
  （`#0a0b07` 底＋萊姆綠 `#C6F135`＋玻璃卡片＋Space Grotesk/JetBrains Mono）。`wobbly-border` 與
  `--font-display`/Caveat/Permanent Marker 死碼已從 `index.css` 清掉。品牌 logo mark 已定案
  （`public/favicon.svg`）。**寫 UI 前先讀 design-spec.md**；實作數值以該檔「實作微調」「實作決定」註記
  為準（邊框 `white/[0.12]`～`[0.26]`、球場單一平色 `#1B6E62`——非原始的 `#121310`/暖木色）。
  **整頁背景已於 08-06 換成製圖紙（見下一條），`#0a0b07` 不再是背景值。**
  （#134 仍 open，但**只剩 Track A／C**：Track B 材質強化已由設計系統接手並推廣全站；Track A 微 3D 已
  拍板延後到很後面；Track C 版面呼吸空間等功能介面先穩定，目前介面不夠流暢之處彙整在 #209。#132
  首頁 review 收尾獨立進行。）
- **設計系統「戰術版風格」已落地：整頁背景＝製圖紙、`--ds-*` token 進 `:root`**（PR #321，08-06）。
  來源是 tang 在 claude.ai/design 建的設計系統專案（含 7 個元件、2 份頁面樣板）。這一輪只取「背景＋
  token」，字體與元件對齊留待後續。背景組成：底色 `#050603` → 48/240px 雙層網格 → 青綠／萊姆兩顆光暈
  → 斜光束 → 噪點 → 暗角，52 秒一輪的極慢飄移。實作是 `index.css` 的 `.app-canvas`，全站 8 頁透過
  `APP_SHELL_CLASS` 共用。
  **換掉舊漸層的理由是玻璃質感，不是換花樣**：`backdrop-filter` 模糊的是元件背後的東西，漸層太平滑、
  模糊完幾乎還原成純色，玻璃感沒有真的產生；網格與噪點是高頻細節，blur 攪得動，球場毛玻璃地板才讀得
  出來是玻璃。**網格弱化有下限**——弱到看不見就退回這個坑，調 #320 時要一併確認 `.court-glass` 還像玻璃。
  背景層全站只掛一次，各頁重複的 `.tb-beam` 已移除（該 class 已從 `index.css` 刪除）。
  **技術細節**：背景層用 `z-index: -1` 搭 `isolation: isolate`——isolate 讓 `.app-canvas` 自成 stacking
  context，負 z-index 被關在裡面，只疊在自己底色之上、所有內容之下；少了 isolate 會往頁面後面竄而看不見。
  29 個 token 目前 12 個有 `var()` 消費者，其餘 17 個（色彩／玻璃兩階／骨架寬度）是既有字面值的正規
  來源，遷移另計。**待調**：底色更深＋格線更弱（#320）；載入／錯誤狀態頁還沒吃到新背景（#322）。
- **計分板改成一鍵記分**（PR #321 同批，08-06）：點我方／對手大比分卡直接記一分，不再彈「選動作 →
  選得失分」兩層選單（原本記一分要點三次，跟不上比賽節奏）。**刻意不記 `action`／`touchedBy`**——那個
  當下不知道是誰碰的球、做了什麼動作（可能是對方失誤），硬填推測值會汙染球員統計，**寧可少記也不要記
  假的**。要記細節的路徑保留：點球場上的球員仍走原本的選單流程。所以計分頁有**兩個入口並存**（比分卡
  ＝快、球場＝細），這層關係已寫進 design-spec 第 5 節，#21 重新設計球線軌跡時不要把快速路徑吃掉。
  比分卡同時從 `<div>` 改成真正的 `<button type="button">`（它是整頁最主要的操作，鍵盤／螢幕閱讀器
  都該用得到）。已知會 aila：從比分卡記的球在球員決定球矩陣裡不會有貢獻者。
- **球場材質與球員圈已全站共用**：`courtTheme` 模組（毛玻璃地板／邊緣繞行光／漸層，`Court.tsx` 與
  `ScoreSheetCourt.tsx` 吃同一份，改一處兩邊同步）＋`components/PlayerMarker.tsx`（深色玻璃底＋狀態色
  邊框＋圈內背號／圈下姓名，戰術板 `PlayerNode.tsx` 與計分表共用）。計分表原本那個沒有 UI 能切換的死
  開關 `circleLabel` 已退役。**08-04 加了 `solidFill` 布林 prop**：預設狀態維持「深色玻璃底＋狀態色
  描邊」，`solidFill=true` 時 fill/stroke 對調成「狀態色實色填滿＋深色描邊」，目前唯一用途是自由球員
  （見下一條）；姓名文字**固定米白、不跟著 `solidFill` 換色**（背號在圈裡、姓名在圈下方深色球場背景
  上，兩者所在的底色不同，不能共用同一條換色邏輯——踩過一次姓名跟著換成深色、蓋在深色球場上看不見）。
- **自由球員視覺定案：跟前排球員同一個綠、實色填滿＋深色邊框**（PR #260，08-04）。原本橘色
  `#FF6B00`（計分表拖曳鈕、L 疊圖、拖曳合法目標提示環、戰術板備位圓圈、`PlayerNode.tsx` 場上狀態色）
  全站統一換成 `#CCFF00`——不是新配色，是直接沿用 `isFrontRow` 已經在用的同一個值，理由是「自由球員」
  跟「前排」在合法站位下不會同時成立（自由球員規則上只能站後排），共用色相不會造成混淆，也不用另外
  設計一個新色相。填色關係從「深底描邊」改成「實色填滿＋深色邊框」（`solidFill`，上一條），是使用者
  拿一般球員圈當參照直接要求「外框/填充色相反」。**發光效果試過又拿掉**——常駐發光曾比照「發球方才
  發光」延伸給「L 待命」，使用者實機看過覺得不需要，實色填滿的綠圈本身已經夠醒目。戰術板那個珊瑚色
  虛線「L 備位框」（`#fca5a5`，issue #18 舊物）**已拿掉**，備位圓圈跟底下的留白空間都還在，只是不再
  多畫一圈虛線裝飾。**教訓值得記**：`overflow:hidden` 裁的是「元件背後的內容」，鈕若用 `left:100%`
  之類的定位貼在容器邊界「外面」，即使容器本身沒有明顯視覺裁切效果，滑鼠事件跟畫面照樣被整個吃掉——
  這次因此多包一層 `court-shell`（拿掉 `overflow:hidden`，只管定位）撐住 `court-glass`（保留
  `overflow:hidden`，只管視覺裁切），兩層責任分開後鈕才點得到。
- **計分表新增「局點提示」**（PR #260 同批，08-04，無對應 issue）：一般局 25 分／決勝局（第 5 局）
  15 分且淨勝 2 分以上，跳出琥珀色提示條（沿用既有「柔性提醒、不鎖版面」語彙），不強制任何動作——
  比分卡跟球場手勢完全不受影響，教練仍可自行決定何時按「下一局」。`isSetComplete()` 這個判斷式
  （`lib/scoreSheetMapping.ts`，issue #45 就有）本身沒改，這次只是把它接到一個新的畫面提示上。
- **全站外殼材質（背景／右欄）已收斂成 `lib/appChromeStyles.ts`**（PR #253，**已合併**）：`APP_SHELL_CLASS`
  （整頁外層 class）、右欄外殼 `INFO_RAIL_BASE_CLASS`（半透明玻璃 `bg-[#121310]/75 + backdrop-blur-md`，
  取代原本的實色板子）各只有一個家。動機是這兩串樣式原本在七個頁面／三個右欄各複製一份，而 #131 改版
  **只改到戰術板／計分表兩頁**、其餘五頁停在舊的斜線網格版本分裂成兩代——複製的成本不在寫的當下，在改
  的時候。要調整全站氛圍改那一個檔案就好。
  **08-06 更新**：整頁背景已搬到 `index.css` 的 `.app-canvas`（`APP_SHELL_CLASS` 帶進去），
  `APP_BACKGROUND_STYLE` 因此變成空物件、只留作 inline 覆寫的入口——**調背景現在要改 `index.css` 的
  `--ds-bg-*`，不是改這個常數**。右欄那條不受影響。
  **待調項目**（記在 PR #253 留言，尚未動工）：右欄透明度 `/75` 的實際數值、`ListItemCard` 比例（要拿
  Figma 重畫線稿，不再猜 px）。字級收斂那項已由 #310／PR #311 交付。
- **工具軌正式圖示已上線**（PR #248，08-03 合併）：10 顆圖示取代單字佔位，每顆照該工具在球場上實際
  畫出來的樣子設計。**#176 已關閉；細節統整跟微調另開 #284**（線條粗細一致性、虛線密度、排列時的
  視覺微調，留給下一輪，不卡在 #176）。
- **UX 測試流程已成文**：`docs/ux-testing.md`（PR #244）——兩個方案分不出高下時用小規模 moderated
  usability test（無事件追蹤基礎設施，做不了正式 A/B），測試結果寫在相關 issue 留言、不另開文件。
  #214 的[留言](https://github.com/aila8913/volley-tactic-board/issues/214#issuecomment-5126493974)是範例格式。
- **教訓（踩過三次，兩條）**：(1) aila 的架構重構（#154/#160、#172 AppShell）速度很快，材質類 PR 只要
  卡在分支上超過一天，動到的元件常常已被換掉底層架構——合併前務必先 `git fetch` 比對 `origin/main`，
  抓到就**直接照新結構重做一次**（不要嘗試 rebase 硬套舊 diff；#167 與 #182 都是重做的第二版）。
  (2) 落後 main 又同檔的 PR，**git 自動合併無衝突不等於合對**，要讀合併後的檔案確認雙方改動都活著；
  另外 fork PR 的 CI 預設不跑、要手動核准。(3) **UX 微調類需求，先實機讓使用者確認過效果，才做
  branch/commit/push/PR 那一整套**（08-04 使用者明確要求）——自由球員配色這次來回改了七輪，同一個
  PR、同一個分支上迭代，最後才一次 push，避免每一輪小調整都各自跑一次完整 ship 流程。
  **08-06 補充**：使用者看過效果後若給的是「方向對、強度要收」這類反饋，可以照常 ship、把微調開成
  issue 帶著走（這次背景就是這樣處理，追在 #320），不必卡著不合併——(3) 要防的是「沒人看過就 ship」，
  不是「不到完美不准 ship」。
- **本機環境會悄悄落後，卡住的時候先查這兩個**（08-06 實際踩到，各花了不少時間）：(1) `.env` 少了新加的
  必要變數——`COOKIE_SECRET` 缺了 api-server 直接起不來，`.env.example` 有列但 `CLAUDE.md` 沒有（已開
  #323 補文件）。(2) **本機 DB 沒跟著 schema 走**——這專案用 `drizzle-kit push` 不產 migration 檔，拉完
  code 要自己 push schema；這次本機 DB 停在 #64 PR1 之前的世代（六張表主鍵還是整數、schema 早已改
  uuid），Postgres 無法自動轉型，最後是整個 `public` schema 砍掉重建＋跑 `lib/db/src/seed-testdata.ts`
  才解決。症狀是「建立比賽 500」「計分頁卡在載入」「API 回 Invalid uuid」——**看到這類錯誤先查 DB 世代，
  不要往前端找**。

## Known gaps / next big pieces

Backlog lives in **GitHub Issues, phase-ordered via Milestones M1–M5** — this file no longer
duplicates it. Current phase = lowest-numbered milestone with open issues:

```
gh issue list --milestone "M3 部署給真人試用"   # 當前階段
gh issue list --state open                        # 全部
```

**M1／M2／M1.5／M2.5 milestone 皆已關閉。** M1.5「戰術板 UI 大改版」＝七環
（#172–#178），規格住 `docs/layout-spec.md`、相依鏈 `環1 →（環2 ‖ 環3 ‖ 環4）→ 環5 → 環6`；環 1–6
結構工作全部落地，剩的一張尾巴（#178 環 7 響應式需線框稿）已移入 **M3**，卡在 M1.5 內部推不動的
外部輸入（另一張 #176 繪圖工具圖示已於 08-04 關閉，細節統整轉 #284）。**#199**（戰術板對手球員分色渲染——Court
從未渲染對手、snapshot player 無 `side`；spec 把 mode D 叫「對手佈陣」的那層 #177 沒做）07-28 補上
milestone，歸 **M5**。

**M3「部署給真人試用」（軟目標日 8/7）已 0 張 open。** 最後一張 #209（UX 密度盤點）依 tang 08-06 的
回覆移入 M5——比照 #178／#284 的既有判準：卡在設計輸入的純外部阻塞項，不掛在有軟目標日的階段。
tang 選了「暫時沒空、之後回來繼續盤點」，所以那張留著當清單，不擋 M3 收尾。
#218（一場比賽「結束」的操作節點）已於 08-05 交付並關閉（PR #300），#287（球隊帶出歷史名單建議）
同日交付，兩張都見下方 Recently closed。**08-05 新開 #301「賽制自訂化」歸 M5**——PO 要友誼賽／
自訂規則（一局 30 分不 deuce 之類），做法是**廢掉 `matchFormatEnum` 改存四個數字**（局數／一般局
分數／決勝局分數／deuce 封頂），三戰兩勝等變成表單 preset；設計決定已在 issue body 裡拍板完，
不掛 `needs-plan`。歸 M5 而非 M3 是 PO 的排期決定（不擋部署，8/7 軟目標日守得住）。脊椎已於 08-02
（#77）與 08-04（#26）全數收尾，M3 剩下的都是不擋部署、搭便車的項目。**#221/#224/#240（人員合併
與管理）已於 08-05 全數交付並關閉**，#176（工具軌圖示）也已關閉，尾巴切成 **#284**（圖示細節與
視覺調整，08-05 歸 M5——它卡在 @tangyi1025 的設計輸入，同 #178 的判準：純外部阻塞項不掛在有軟目標日
的當前階段）；#178（響應式）已移出 M3 歸 M5。**PWA 化已開成 #278**（manifest ＋ vite-plugin-pwa，
歸 M5）——跟 #64 資料層零依賴、可平行，且是唯一能自然分給設計夥伴、又不需要先懂佇列設計的一塊。

**M2.5「收斂重複規則」（軟目標日 8/1）已全數關閉。** `#228`（route handler 儀式：404 樣板 ×33、
ownership 守衛 ×25 全靠人記得寫）08-01 完成收尾：`lib/handler.ts` 落地後 12 支 route 檔案
（tactics/matches/teams/tournaments/people/players/sets/rallies/events/substitutions/timeouts/
analysis）全部遷移完（PR #256/#262~#272），`owns` 必填欄位讓漏寫擁有權檢查變成編譯錯誤。
**08-06 深模組盤點又補收一份同性質的**：`lib/insertIdempotent.ts` 收掉 sets/rallies/events/
substitutions/timeouts 五份逐字相同的冪等寫入（各約 22 行），`scope` 參數比照 `owns` 設成**必填**
——重送撞到既有 id 要重讀那列時，不限定「掛在已驗過擁有權的上層底下」就是 IDOR 探測管道。
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

其餘 open 的技術債與待辦（**#292／#294 已於 08-06 交付並關閉**，見下方 Recently closed）：
**#168（引入 `@testing-library/react`）** ——現行 `renderToStaticMarkup` 慣例無法觸發事件、讀不到 Radix
Portal，飛出選單與帶 mutation 副作用的 controller 全在自動測試盲區（#201 的計分頁死結修復就落在這裡，
僅手動驗證）。**架構掃描把這個盲區量化了，它是 M2.5/M3.5 的實質前置**：每一支刻意抽到 `lib/` 的純函式
都有測試，每一個握著座標數學、指標事件、輪轉/自由球員規則的元件都沒有（`Court.tsx`、
`ScoreSheetCourt.tsx`、`useRotationTable.ts` 364 行全部零測試，座標數學部分已隨 #227 抽成
`lib/courtGeometry.ts` 並補測試，元件本體互動邏輯仍是零測試）。**測試覆蓋的是安全的部分，
沒覆蓋的是危險的部分。**（**`useRotationTable.ts` 的部分已於 #231 PR1 補上 21 條特徵化測試**，
`Court.tsx`／`ScoreSheetCourt.tsx` 仍是零測試，等 #168 引入 `@testing-library/react`。）
**#231 已於 08-06 全數合併、08-07 關閉**，依賴它的幾條現況：
**#309**（計分頁站位單一真相）設計面與程式面都不再卡著；
**#14** 的「一般球員疊到 L 那格」**仍未驗證**——08-07 實測時發現排不出自由球員先發（#327），
構造不出那個情境，驗收改隨 #326／#327 一起補；
**ADR-0006**（單一表示法決策 ＋「persist 永不能帶 match 資料」不變條件）尚未寫，
且要等 #326 改完 L 模型再寫，否則會把已被推翻的 `liberoZones` 方向寫進 Accepted 狀態。
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

- **#231**（先發只留一種表示法，08-06 合併四個 PR、08-07 關閉）— 重構目標達成：`PerMatchRotationState`
  只剩一份 `lineup`，其餘輪次由 `deriveRotation` 現算（#312 特徵化測試 → #317 改用既有
  `assignPlayerToZone` → #314 推導層純函式 → #318 換 state 形狀＋刪死碼）。**但這張真正的產出是手動
  QA 撈出來的東西，不是重構本身**：四個 PR 全綠、typecheck 過、CI 過，PO 一坐下來實際點，第一步就
  卡住——**排不出自由球員**（#327）。那個洞是三個各自正確的決定疊出來的（`startSession` 切
  `courtView`、`LineupSnapshot` 不收 L、格子只畫六格），**沒有任何一處寫錯，所以沒有任何測試會失敗**。
  **判準值得記住：自動化驗證的是「每一處有沒有寫錯」，走一遍流程驗證的是「合起來還能不能用」，
  後者抓不到的東西前者也抓不到。** 附帶推翻了本張的一個結論：`liberoZones` 方向反了（見 Current
  state 該條的判準），#326 接手。#14 的疊圈 bug **仍未驗證**，不是已修。
- **#292 ＋ #294**（測試檔進 typecheck／players 名單補 `ORDER BY`，08-06）— #292 表面上是「tsconfig
  的 `exclude` 少寫一個 `*.test.tsx` 對稱項」，拿掉排除後才看見代價的規模：**7 個測試檔冒出約 90 個
  型別錯誤，全部是既有的脫節**。來源是三次重構——#64 PR1（主鍵改 uuid，fixture 還在寫 `id: 1`）、
  #213（`MatchPlayer` 多了必填 `personId`）、#230（`backendRef` 從字串分類改成 `{ table, id }`）。
  最值得記的是 `scoreSheetMapping.test.ts` 佔了其中約 80 處：**它是 replay 重建邏輯的核心測試，
  假資料整整落後一個主鍵型別遷移，而 217 個測試一路全綠**——因為那些 id 在測試裡只被搬運、沒被
  當字串用。**判準：測試通過只證明執行期沒爆，不證明它斷言的還是現在這套型別**；把測試排除在
  typecheck 之外，等於讓重構的安全網成為唯一沒有型別保護的地方。修法只改假資料型別，沒刪測試、
  沒加 `any`／`@ts-expect-error`。api-server 的 tsconfig 一併拿掉排除（它上個月才被加上、註解還
  引用 #292 說「兩邊都排除才一致」——那是往錯的方向對齊），CLAUDE.md 補上「測試檔會被 typecheck」
  的約定免得有人加回去。**修的過程本身變成 #306 的證據**：光這一次型別遷移，`scoreSheetMapping.test.ts`
  就要手改 36 處假資料，因為每個 fixture 都是就地展開的字面物件——下次任何一個必填欄位變動都會
  重演一次，所以開了 #306 把假資料抽成 fixture builder（Backlog，不擋任何事）。
  #294：`GET /matches/:matchId/players` 補
  `.orderBy(number, name, id)`——**Postgres MVCC 下 `UPDATE` 是「舊版本標記失效＋heap 尾端寫新版本」**，
  所以沒有 `ORDER BY` 時任何一次 PATCH 都會把該列擠到名單最後（#221 合併時看到的「名單跳動」只是
  最容易察覺的觸發方式）。三層排序鍵是因為 `number` 沒有 unique constraint，只排 number 仍是偏序，
  補 `name`／`id`（uuid，對人無意義但唯一穩定）才是全序。其餘 15 支 route 掃過沒有第二處遺漏。
- **#303**（自由球員自動回位抽成 `lib/liberoRotation.ts`，08-06）— 深模組盤點開出的第一張債還掉。
  規則本體原本整段住在 `ScoreSheet.tsx` 的 `useEffect` 裡，要驗證它得先 render 元件＋模擬輪轉，
  而這專案沒有 `@testing-library/react`（#168）——**結果最容易寫錯的那條「誰接替誰」啟發式反而是
  零覆蓋**。抽出來的 `resolveLiberoOnRotation(state, positions)` 不需要 React（輸入是「現在誰被頂替
  ＋上一輪的頂替目標＋這一輪六人站位」，輸出是新的頂替狀態），9 條測試把三條分支＋兩種幽靈 id
  ＋繞完一整圈六輪釘死；元件那邊只剩「湊輸入、寫回去」。**不等 #168 就做得到**，跟
  `assignPlayerToZone`（#120 時從 `SetLineupDialog` 抽出）是同一招。
  ⚠️ **但「接替」啟發式（分支 2）已於 08-07 被 PO 推翻，#326 要刪掉它**——抽成純函式＋補測試這件事
  仍然成立（那是本張的價值），**被推翻的是那條規則本身**：PO 定案 L 從後排轉出去就下場、留在場外，
  不自動找下一個頂替對象。值得一提的是分支 2 當初就跟它隔壁分支 3 的註解自相矛盾（「不自動亂猜一個
  人：猜錯會讓紀錄裡出現一次不存在的替換，而這是**紀錄**不是顯示」）——**把散在元件裡的規則抽成純
  函式的附帶好處，就是讓這種矛盾變得看得見**，在 `useEffect` 裡它藏了很久沒人發現。
  兩個順帶的決定：①**前後排判定從 `courtGeometry.rowOf` 換成 `rotationLogic.isBackRowPosition`**
  ——對這裡的輸入兩者答案完全相同（座標必定是六個號位的精確值），但語意層次不同：`rowOf` 是
  「圓圈該不該上前排配色」的純視覺判斷、`isBackRowPosition` 是從 `BACK_ROW_ZONES` 導出的領域規則，
  `courtGeometry.ts` 的註解本來就警告過別把兩者混為一談，而這支函式整個就是領域規則。（PR #305
  當天才把這裡從裸門檻收斂到 `rowOf`，那一步的重點是「別再寫第三份 `y > 0.75`」，方向沒錯、
  只是停在視覺層。）②**沒有變化時回傳原本那個物件參照**，呼叫端據此跳過兩次寫入——這是
  PR #69→#70 那個坑的預防（effect 裡回傳新參照會多觸發一輪 render，當時演變成無限迴圈）。
- **#310 ＋ #209 盤點推進**（字級語意 token，08-06）— #209 是 tang 的 UX 密度盤點清單，08-06 把四點
  重新對過現在的程式碼，第 3、4 點定案並各自拆成可執行 issue（#309／#310），第 2 點留在原 issue 裡，
  **#209 保持 open** 當容器。查證結果值得記的兩件事：①**16 種字級的數字一種都沒少**——任意值的
  _用量_ 有在降（`text-[10px]` 從 12 檔案/28 處 → 10 檔案/20 處），但 _種類_ 沒收斂，因為沒有一個叫得
  出名字的東西可以用，下一個人就會再開一個 `text-[Npx]`。②#209 第 3 點（計分頁站位重複）的顧慮是
  對的：`ScoreSheetCourt.tsx` 完全沒有拖放指派邏輯，只有 `findNearestZone` 拿來做「發球員不換」的
  命中判定——但它已經有場邊欄、`Court.tsx` 也有現成協定可抄，缺口比原本寫的小（細節見 #309）。
  #310 本身是**純換名字、畫面 no-op** 的重構：`index.css` 的 `@theme` 新增六個語意 token
  （`--text-micro/caption/action/panel-title/marker/marker-xs`），初始值＝現在實際在用的 px，48 處
  `text-[Npx]` 全部換掉。**命名規則刻意是「一個 px 值一個名字」而不是「一個元件一個名字」**，
  讓這一輪維持機械替換、不偷渡設計判斷；數值定案仍留給 tang 的 Figma 線稿，屆時只改 `@theme`
  一處。唯一例外是 `Markers.tsx` 的 `text-[5px]`——那個 input 在 `<foreignObject>` 裡，5px 是 SVG
  viewBox 座標不是螢幕 px，跟正文字級不同單位系統，留任意值＋`eslint-disable` 註明理由。
  **真正的價值在那條 eslint 規則**（`no-restricted-syntax`，`Literal` 與 `TemplateElement` 兩個
  selector 都要，因為不少 className 是模板字串拼的）：沒有它，收斂完照樣會再漂回去——跟 #154
  把單向依賴焊進 CI 是同一個判準，**把約定寫進 CI 比寫進文件可靠**。
- **深模組盤點 ＋ 兩處重複收斂（08-06，PR 見 `chore/insert-idempotent-and-rowof-dedup`）** — 用
  「深模組（小介面／大實作）」的判準掃全 repo。結論：`lib/` 層普遍健康（`handler.ts`、
  `writeLog.ts`、`rotationLogic.ts`／`volleyballRules.ts` 都是好例子），問題集中在**頁面元件**與
  **route 檔**。動手做掉兩處：(1) 五份逐字相同的冪等寫入 → `lib/insertIdempotent.ts`（見上方
  M2.5 段落）；(2) `ScoreSheet.tsx` 自由球員 effect 裡的**第三份 `y > 0.75` 裸門檻** → 改用
  `courtGeometry.rowOf()`（#43／#227 已收斂過兩份，同一個 effect 上面兩行用的就是 `rowOf`）。
  盤點結果落成 **#303**（自由球員自動回位規則鎖在 useEffect 裡、測不到，**不用等 #168**）與
  **#304**（`useTacticsBoard` 35 個成員、三組平行 add/update/remove 三連，低優先）。
  第三項「api-server 補測試」**沒有開新 issue**——`#232` 已涵蓋且分析更完整，改為留言補證據
  （`insertIdempotent` 加入「安全關鍵但測不到」名單；api-server 的 vitest 環境其實已備妥，
  缺的純粹是 db 注入，該張剩餘範圍比 body 讀起來窄）。
- **#218**（一場比賽「結束」的操作節點與畫面，08-05）— 表面上是「把計分頁那顆假的『結束比賽』
  `<Link>` 變成真動作」，實際挖到的病根是全站那條「**sets 最後一局＝進行中**」的推導慣例
  （前端 `splitCompletedAndCurrent` ＋ 後端 `analysis.ts` 的 SQL 鏡射）：打完的最後一局永遠被當成
  進行中而**不算數**，局比數／分析頁／資料夾戰績全部少算一局，seed 資料還得靠「補一局空 set」
  才顯示得對。修法是加 `matches.status`（`in_progress | finished`），讓那條慣例吃它——**ADR-0005**，
  「不要重新提議」段落釘死「用局比數推導完賽」「補空 set」兩條回頭路。PO 四點拍板：加欄位／
  達成勝局只把按鈕變強調**不自動彈窗**（誤判成本高於忘記按）／確認 dialog 後導既有分析頁**不做
  賽後摘要頁**（會跟 `MatchAnalytics` 重複）／**可逆且不藏**（完賽後計分頁唯讀＋「重新開啟比賽」）。
  兩個實作決定值得記：(1) 切換狀態後**重跑 `reconstructRecording`**，不在本地手搬
  `currentSet`↔`completedSets`——`CompletedSet` 沒存 serving／輪轉／serverId，搬回來那局會少掉發球方，
  從 rallies 重放才全對；(2) 完賽時要**砍掉沒開球的尾巴局**（按了「下一局」才想起比賽已結束），
  否則各局比分多一行 0:0，前後端兩邊都要砍。seed 的假空局一併移除。
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
- **#228**（抽出 `lib/handler.ts` 收斂 route ownership 檢查，08-01，PR #256，issue 已於 08-01 關閉）—
  #225（tactics 路由漏 ownership 檢查）暴露的病根是「擁有權檢查靠人記得寫」，`owns` 在既有寫法裡是
  可選欄位，忘記加不會被 TypeScript 攔下來。新的 `handler(config, fn)` 把 `owns` 改成**必填欄位**
  （`"public" | OwnsCheck | OwnsSpec | Array<...>`），漏寫從「容易漏看的重複程式碼」變成編譯錯誤。
  `tactics.ts` 是第一個遷移案例，self-review 時順手發現 GET/PUT/DELETE 三處 `owns` closure 逐字重複，
  抽成 `lib/ownership.ts` 的 `tacticBelongsToUser` 一併收斂。其餘約 10 支 route 檔案還沒遷移，按
  一檔一 PR 的節奏陸續進行。

### 設計 (tang)

- **PR #321**（設計系統「戰術版風格」背景層＋token 落地全站、計分板一鍵記分，08-06，無對應 issue）—
  見上方 Current state 兩條，細節不重複列。這裡記幾件過程中的事：
  - **同批把兩項決定補進 `docs/design-spec.md`**（第 4 節整頁背景、第 5 節計分板一鍵記分）。規範沒跟上
    實作正是這份文件自己記過的教訓——背景改版曾經只改到兩頁、其他五頁停在舊版，直到一頁一頁看才發現。
    design-spec 是共用約定檔，已依慣例在 PR 上 @-mention aila。
  - **一併知會 aila 記分行為改變會影響數據面**：從比分卡記的球不寫 `action`／`touchedBy`，在球員決定球
    矩陣裡不會有貢獻者。他若認為分析頁不能接受，會另開 issue 處理「事後補動作」的入口。
  - **新開 #320／#322／#323／#324**；#134 Track B 標記為已由設計系統接手（該 issue 只剩 Track A／C），
    #21／#19 過時的 body 一併修正（#21 的「現狀」只適用球場路徑了；#19 引用的 `MatchRecording.tsx`
    早已不存在、且把自己列為自己的相依）。
- **PR #260**（計分表：長按換人＋自由球員鈕改位＋支援兩位候選，08-04，無對應 issue）— 見上方
  Current state「自由球員視覺定案」「局點提示」兩條，細節不重複列。這裡記流程教訓：這張 PR 在同一條
  分支上前後改了七輪配色/位置（球場左右側→垂直位置對齊後排→橘色多種變體→萊姆綠→填色關係反轉→
  拿掉發光），每輪都先在瀏覽器裡實機確認過效果才進下一輪，最後才一次 push／合併——沒有每輪各自開
  commit/PR。手勢類互動（長按換人、長按選自由球員）這個 sandbox 沒辦法用合成事件穩定觸發，最終
  由使用者自己實機驗證後才合併。
- **#176 關閉（08-04），新開 #284**（工具軌圖示：統整細節與視覺調整）— PR #248 已交付 10 顆正式
  圖示，#176 的原始範圍（正式圖示）算完成，關閉時說明剩下的細節調整（線條粗細一致性、虛線密度、
  排列時的視覺微調）移到 #284 追蹤，不卡在已完成的票上。
- **PR #248**（#176 剩餘的工具軌正式圖示，08-03 合併）— 10 顆圖示取代單字佔位，每顆照該工具在球場上
  實際畫出來的樣子設計（虛線工具的圖示真的用 `stroke-dasharray` 畫）。實機看過後拿掉「攻擊線」工具
  （跟實線箭頭分不出來）與「號位標示」開關（連 store 欄位＋`Court.tsx` 渲染一起刪，決定已留言在 #176）。
- **PR #253**（全站背景與右欄材質統一，08-03 合併）— 見上方 Current state「全站外殼材質」一條。
  合併過程中跟 aila 同期的 #251（PR #274）在 `MatchInfoRail.tsx`／`TournamentDetail.tsx` 有真實文字
  衝突（型別改名、資料源換掉），用 `git worktree` 隔離解衝突、跑完整檢查套件後才推。
- **#276**（修掉戰術板頁面空白崩潰，08-03 合併，無關聯設計工作、順手抓到）— `useRosterEditor.ts` 的
  Zustand selector `state.dataByMatch[matchId]?.roster ?? []` 兩個 fallback 分支各自產生新陣列參照，
  觸發 React `useSyncExternalStore` 判定「快照每次都變了」的無限重繪迴圈，整個 `<RotationPanel>` 崩潰。
  修法是把 fallback 提到模組層常數 `EMPTY_ROSTER`，跟 `RotationTable.tsx`／`Court.tsx` 既有慣例一致。
  確認是 aila PR #274 帶進來的既有 bug，跟本次設計工作無關，獨立分支/PR 修完立刻合併。

---

- （更早的條目已修剪——記錄住在各自 issue 留言、`docs/*-spec.md`、git log：
  #177 環 6 新增戰術流程＋佈陣 mode D、#176 環 5 工具軌結構（PR #197，**#176 仍 open**，剩正式圖示待
  @tangyi1025，已移 M3）、#175 環 4 中央列表型（`ListItemCard`/`ListScrollArea`/`matchSummary.ts`）、
  PR #182 計分表計分區深色化、PR #167 戰術板球場材質（**#134 仍 open**）、
  #172 `AppShell` 三欄骨架（PR #180）、PR #179 `layout-spec.md`＋七環拆解、
  #163 文件同步、#160 C1/C2/C3 三顆 PR、#44 暫停全棧、#147/#149 undo 一次退兩步、
  PR #141 協作規則放寬、PR #142 pattern-language、PR #148 品牌 logo、PR #140 戰術板材質、
  PR #135/#129 深色語言首批，以及更早的 #118/#117/#115/#41/#50/#74/#73/#63/#20 等。）
