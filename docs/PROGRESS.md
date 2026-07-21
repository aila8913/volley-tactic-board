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

\_Last updated: 2026-07-21 (aila) — #120 第一階段：計分頁右欄改三段式（常駐唯讀站位／統計／導覽）
並轉深色玻璃；戰術板入口收進導覽軌「戰」飛出選單。新開 #168（互動測試缺口）。\_

## Current state

Where the project actually stands right now (durable "current" facts; per-session detail
lives in git log + the issues named).

### 開發進度 (aila — backend / frontend / db / infra)

- **Backend match-recording API is fully implemented and live (dev DB).** matches / players /
  sets / rallies / events / substitutions / **tournaments** CRUD + tactics/health,
  ownership-scoped. The frontend scoresheet is **fully off localStorage** (matches,
  scores/rotation, events read-back → per-player stats)；**資料夾（tournaments）也已脫離
  localStorage、進 DB**（#117 完整版已合併）——`matches.tournamentId` 是帶 `onDelete: cascade`
  的 uuid FK，刪資料夾自動連帶刪比賽、不再有孤兒。Design + phased history in
  `docs/backend-architecture.md`；#58 closed。
- **前端 store 已全面 per-match 分片、去汙染。** 計分表（`useScoreSheet`，#115）、戰術板／輪轉表
  （`useTacticsBoard`／`useRotationTable`，#119）都改成 `dataByMatch[matchId]` 分片，A 場的編輯不會污染
  B 場；戰術板/輪轉表工作狀態**不再 persist**（PO 決策：只有存成戰術才算數，硬重整不還原未存排版）。
  切輪次的跨 store 同步走 `RotationSwitcher → syncRotationChange` 明確呼叫，不再靠全域 subscribe。
- **戰術板單向化（#154）bug 本體修復完成；UI 改版移至 #160。** PR A（#155，denormalized
  `CourtSnapshot` 型別＋`parseSavedTactic` 舊檔轉接層＋擷取純函式）與 PR B（#157，載入已存戰術改
  唯讀檢視、砍掉 `loadRotationData` 反向寫回、Court 渲染改吃 `SnapshotPlayer` 快照）**均已 merge**——
  三個 bug（新增球員消失／站位被覆蓋回不去／刪名單舊快照對不上人）架構性解決；「編輯已存戰術」鈕
  暫停用、待 #160。**07-19 PO 依自繪 Figma 稿拍板 UI 新方向**：戰術板＝左欄底部降級工具頁（列表＋
  新增選來源＋佈陣→確定→編輯）＋各頁右 panel 快照快速入口（一鍵抓當下站位直落編輯）——原 overlay
  方案（含原 PR C 側邊白板）作廢，#17 第 1 節同步作廢。完整權衡在 #154 07-19 comment。
  **UI 改版 #160 已於 07-20 分三顆 PR 全數落地**（C1 導覽軌／C2 兩模式狀態機／C3 計分頁快照快速
  入口，見下方 Recently closed）；`captureFromScoreSheet()`（#154 PR A 就寫好、一直沒有 caller）
  到 C3 才真正接上。`docs/flow-diagrams.html` 已於 #163 同步、#120 再同步計分頁一節，**該檔現在
  可信**。剩下的是 Figma 視覺債。
- **#120 第一階段落地：計分頁常駐唯讀站位視圖。** 右欄改三段式（站位／統計／導覽）並整條轉
  design-spec 深色玻璃（中間計分區仍白底，進度記在 #131）。核心是 `CourtReadOnlyView`——**純展示、
  不訂閱任何 store**（#117 錨點決議），各頁餵自己的資料源；計分頁餵的是既有的 `ourPositions`
  （自己的逐局先發快照換算），所以 #115 切開的解耦沒被拉回來。**版面依據是 #160 的右 panel 語言，
  不是原 issue 寫的「左欄」**（原 issue body 已於 07-21 修正，避免未來 session 照舊描述重做）。
  同時把進戰術板的入口全收進導覽軌「戰」的**飛出選單**（「+ 新增戰術」＋已存戰術列表），移除右欄
  底部那顆「快速戰術板」——兩個入口分處左下右下、使用者分不出差別。`NewTacticDialog` 的擷取來源
  改成**必填 prop 注入**（戰術頁傳輪轉表、計分頁傳計分快照）：做成必填而非有預設值，是為了讓未來
  的呼叫端無法無聲沿用「讀全域 store」。**剩：換局換輪視窗、分析頁站位列（#120 保持 open）。**
- **Schema foundations for stats are in place:** `lineups`（起始先發，一局一 row）、
  `substitutions`（換人，存比分快照）、`events.outcome`（得/失/球續 enum）、`people`＋`teams`
  （跨場跨隊身分／分組標籤，`players.personId`/`matches.teamId` nullable FK、`onDelete: set null`
  保留歷史事實）全部 live。這些是 #65 數據分析頁往上長的地基。
- **暫停/timeout（#44）全棧落地。** `timeouts` 表（`setId`＋比分快照＋`side` home/away，跟
  `substitutions` 同形狀、更簡單：無球員無 kind、只記次數與時機、不記時長——PO 定的「純記錄事件」範圍）
  已 push；REST（GET bulk-per-match／POST-per-set／DELETE-for-undo）＋ownership 全掛上；前端接進
  `useScoreSheet` 同一套本地優先＋背景寫入＋undo（`backendKind:"timeout"`），計分頁每方一顆暫停鈕
  （每局上限 2 次，達標反灰——與換人「只提醒不擋」不同，因 2 次是無例外硬規則），統計欄加暫停區。
  全棧 happy-path 驗過（create→POST→bulk-GET→DELETE→cascade）。**這是 M1 最後一個實作項。**
- **#65 數據分析頁：視圖一（單場比賽分析）骨架已上線**（`pages/MatchAnalytics.tsx`，PR #101）。
  比分總覽＋球員決定球矩陣＋換人統計；比率統計（side-out%/輪次得失）與差異化區塊（到位率/球線
  熱區）目前是**誠實空狀態**，等進階記錄 #51/#21 落地才點亮。視圖二（隊伍）/視圖三（球員跨場跨隊）
  尚未做（需 #102 的 teams/people 接上前端）。
- **專案 roadmap 已上線。** 時間序住在 repo **Milestones M1–M5**（軟目標日 7/18→9/11，估自實測
  velocity、非死線），當下狀態住在 [GitHub Project #4](https://github.com/users/aila8913/projects/4)
  （Status 五欄，Todo＝當前 milestone 的 3–5 項）。**「下一步做什麼」直接看 Todo 欄／M1，不用再問。**
  維護規則與 CLI id 都在 `.claude/skills/wrap-up/SKILL.md` step 5；跨 milestone 移動是 PO 決定。
  尚待 PO 在網頁完成（API 做不到）：Workflows 自動化（auto-add／closed→Done）＋三個 view。
- **記錄成本預算（#74）設計定案並已「落地」關閉**（`docs/recording-cost-budget.md`）：簡易/進階是懸崖式
  硬分界——簡易版一分打完後在死球空檔記**恰好一筆決定球**＋排先發＋換人/暫停＋「沒看到」escape valve；
  任何 per-touch／座標／到位分／子分類全歸進階版（賽後影片補填）。PO 拍板嚴守此界、不開 simple+。
  分層歸屬結論已回灌 #50（零成本顯示層）/#51（子分類全進階）/#21（座標進階），#74 收工。
- **事件文法（#73）＝統計權威依據**（`docs/event-grammar-spec.md`）：每個統計 = events/rallies/sets
  欄位的純函數。對帳確認「必須早補」的結構缺口已全數落地；剩餘缺口都是故意延到進階版的欄位
  （#51/#21/#44）或教練待確認項（到位門檻 `quality>=2`、嗆司定義，皆有預設在跑、不擋實作——
  07-12 起兩項預設皆有外部標準出處：VIS 官方門檻背書／DV Freeball 候選定義，見該 spec
  〈外部標準對照〉一節，schema 設計亦獲 VIS/DV 慣例驗證）。
- **兩人協作流程已上線並放寬**（PR #137 立、PR #141 放寬）：討論分流／關 issue 規則住 CONTRIBUTING.md
  「協作與溝通」，Claude 要主動把關的版本住 CLAUDE.md「Team & collaboration rules」。跨領域 PR **不再需要
  對方 approve**、只要合併前 @ 知會一聲（#141 拆掉 approve 硬關卡）；「對方的 issue 不單方面關」仍在。
  改協作規範＝開 PR 動那些檔案。
- **需求層的 pattern-language 分析住 `docs/requirements-pattern-language.md`**（Alexander 式，P1–P7）：
  把「為什麼要做這些功能／背後哪兩股力在打架」講清楚，是 product-vision（定位）／recording-cost-budget
  （記錄成本）／event-grammar-spec（統計可推導）三份 spec 的上位框架。每個 pattern 的「落點」都標了
  對應 issue，最後的「整體性評語」點名 P7 離線（假牆）與 P6 球線分布（wow 點的洞）是兩處待補的張力。
  （已 merge，PR #142，commit `c4e843f`。）

### 設計進度 (tang — 視覺 / UX / area:design)

- **設計規範已落地兩頁（首頁＋戰術板），手繪風確定全退役**（`docs/design-spec.md`，PR #129/#135/#140）：
  深色儀表板語言（`#0a0b07` 底＋萊姆綠 `#C6F135`＋玻璃卡片＋Space Grotesk/JetBrains Mono）。戰術板再加
  材質強化（#134 Track B，PR #140），品牌 logo mark 已定案（`public/favicon.svg`，PR #148），design-spec
  多了「品牌標誌」段。剩計分表（`ScoreSheetCourt`/`RadialMenu`）、數據分析頁、資料夾內頁三處仍是手繪風，
  由 #131 追蹤，但**排在 #134（戰術板視覺定案，needs-plan）之後**——#134 可能改動 spec 本身。#132（首頁
  review 收尾）獨立進行。**寫 UI 前先讀 design-spec.md**；實作數值以該檔「實作微調」「實作決定」註記為準
  （背景 `#0a0b07`、邊框 `white/[0.12]`～`[0.26]`、球場深青漸層——非原始的 `#121310`/暖木色）。

## Known gaps / next big pieces

Backlog lives in **GitHub Issues, phase-ordered via Milestones M1–M5** — this file no longer
duplicates it. Current phase = lowest-numbered milestone with open issues:

```
gh issue list --milestone "M1 簡易版收尾"   # 當前階段
gh issue list --state open                   # 全部
```

M1 收尾焦點：**M1 實作項已清空**——全域 store 去汙染家族（#115/#117/#118/#119）、undo 一次退兩步
（#147，兩條分支分別由 PR #149/#158 修完關閉）、暫停/timeout（#44）全數落地。**下一階段起點已定：
PO 拍板插入 M1.5「戰術板 UI 大改版」（#160）於 M1 與 M2 之間**——milestone 本體待 PO 在網頁建立後
掛上（MCP 工具建不了 milestone）。**#160 的 C1/C2/C3 三顆已全數落地**（見下方 Recently closed）。
#163（文件同步）亦已收工。
部署 #26／離線契約 #75 仍屬 priority:essential 的自然接續。**#120 第一階段（計分頁常駐唯讀站位）
已落地，仍 open**：剩換局換輪視窗（唯一能改站位的入口，寫計分表自己的逐局快照）與分析頁站位列
（資訊軸未定，綁 #76）。原「比賽頁快速戰術板按鈕」一項已由導覽軌飛出選單取代、不再另外掛帳。
**新開 #168：引入 `@testing-library/react` 補互動測試**——現行 `renderToStaticMarkup` 慣例無法觸發
事件、讀不到 Radix Portal，飛出選單的行為全無自動測試；這輪就在該盲區抓到一個「四項檢查全綠但
使用者會遇到」的 bug（用 store 狀態反推使用者意圖），修好了但無回歸測試保護。
**待 PO 裁決：#120 目前掛 M5，但實質是 #160（M1.5）大改版的延續，是否移轉 milestone。**
#40（undo/redo 不涵蓋輪轉拖曳，與 #147 同塊邏輯但不同 store）、
#64（背景寫入失敗不 reconcile，關聯部署 #26／離線契約 #75）、**#127（後端沒驗 tournamentId 擁有權，真 auth
後補）** 仍 open。
進階版差異化（M4）：#51 動作子分類、#21 球線座標、#99 站位快照——同屬 advanced tier，可一起設計。

## Recently closed (past ~week)

### 開發 (aila)

- **#163**（本次 PR，07-20）— `docs/flow-diagrams.html` 同步到 #154／#160 之後的實際行為。過期的
  方式會**主動誤導**：它描述的 `isLayoutMode`／`enterTacticsLayout()`／戰術板反寫回輪轉表的
  `removePlayerTacticPositions()`／`resetCurrentRotationTactics()` 全都不是「舊」而是**已被刪除**，
  照著讀會實作出一條被 CI 焊死禁止的資料流。改動：Part 2 整段重寫成 browse／viewing／edit 三態
  （並寫明模式是 `session`/`viewingScene` 的**推導值**、store 裡沒有 mode 欄位）；Part 1 拿掉跨
  store 呼叫與 ⚠R2／⚠R3；Part 0 大圖補數據分析頁、`MatchNavRail`、C3 快照交棒。**issue 沒列到、
  盤點時自己找出來的三處**：Part 3 的 S5 還寫「整個 codebase 完全沒有 timeout 概念」（#44 兩天前
  就上線了）、Part 1 C4 還寫「戰術板訂閱輪轉表變化」（那條全域 subscribe 在 #119 就拿掉、改成
  `RotationSwitcher.go()` 明確呼叫）、以及 `useRotationTable.ts` 一行同源的過期程式碼註解。
  **驗證方式值得記**：mermaid 語法錯誤只在瀏覽器渲染時才炸、看 diff 完全看不出來，所以起了臨時
  http server 實際載入頁面，確認四張圖都產出 SVG、console 無錯，並撈出狀態機節點文字核對內容。
- **#160 C3**（PR #165，commit `f4b5743`，07-20）— 計分頁右欄底部「快速戰術板」鈕：擷取當下站位 → `startSession()`
  → 導航到戰術板直落編輯模式。**範圍經 PO 決策砍半**：原訂比賽頁也要一顆，但比賽頁的右 panel
  根本還沒建（`MatchList.tsx`/`TournamentDetail.tsx` 都沒有），那個 panel 是 #120 的本體，故該按鈕
  整包併入 #120。站位來源用計分表自己的 `activeLineup`（逐局快照）而非全域 rotation store——這正是
  #115 解掉、#160 needs-plan 明文禁止拉回的耦合。跨頁交棒走「A 頁 `startSession()` → 導航」而不是
  query param + 到站再擷取，後者會逼戰術板去 import 計分表 store、撞上 #154 焊進 CI 的
  `no-restricted-imports` 牆。連帶改 `resetBoardView(matchId?)`：戰術板一 mount 就 reset，原本無條件
  清空會把剛交棒的 session 殺掉，改成「跨場才清、同場保留」（#119 的跨場保護原封不動，同場重整不再
  誤刪未存工作）。**review 抓到一個四項檢查全綠也照樣漏掉的行為 bug**：session 保留了但 `courtView`
  仍被打回 `"rotation"`，而 `Court.tsx` 是 `courtView === "tactics" && session` 才畫東西 → 會落地在
  「資料完好、畫面全白」。兩個欄位各自都合法，錯的是它們之間的隱含關係，型別檢查看不出來；已改成
  兩者同進同退＋三個回歸測試（暫時退掉修正確認測試真的會紅）。
- **#160 C2**（PR #164，commit `63eedcd`，07-20）— 戰術頁狀態機 + 右 panel 拆檔。**規格在動工前經 PO
  修正：原訂「瀏覽→佈陣→編輯」三模式改成兩模式**（[修正留言](https://github.com/aila8913/volley-tactic-board/issues/160#issuecomment-5021652106)）
  ——球員名單在比賽列表就已填好，故名單「常駐右 panel」隨時可拖進拖出，佈陣不再是獨立階段。
  連帶好處：少一組轉場，undo 歷史不用處理跨階段語意（單一 session 單一歷史）。
  實作：`TacticsBoardPanel` 724→290 行變成薄殼，拆出 `TacticsBrowsePanel`/`TacticsViewingPanel`/
  `TacticsEditPanel`/`TacticsRosterPanel`/`TacticsList`/`NewTacticDialog`＋`lib/tacticsBoardStyles.ts`；
  新增戰術改走 Dialog 選來源（擷取現在輪轉位／空站位）。**`useTacticsBoard.ts` 一行未動**——模式純由
  既有的 `session`/`viewingScene` 推導，不加 `phase` 欄位，#154 焊進 CI 的單向性防線原封不動；
  「空站位」只在 `lib/courtSnapshot.ts` 加純函式 `captureBlank()`（`source: "blank"` 是 #154 就預留的值）。
  拖放重用 Court 既有的 `dataTransfer` `text/plain` 協定，Court.tsx 未動。
  review 抓到兩處修掉：selector 裡寫 `?? []` 每次生新參照會害 Zustand 每次都重繪（React 18 的
  `useSyncExternalStore` 會直接噴 getSnapshot 未快取），改成模組層級常數；殼元件的整包解構訂閱改逐欄位 selector。
- **#160 C1**（PR #162，commit `c675b07`，07-20，**#160 保持 open**）— 導覽重排：抽共用
  `MatchNavRail` 左側導覽軌，戰術板／計分表／數據分析三頁 match-scoped 換上，取代各頁自刻、樣式不一的
  header 連結；`matchBackHref()` 收掉三頁重複的返回目的地判斷。戰術入口依 #160 產品決策用 `mt-auto`
  壓到軌底（降級成次要入口）。待補的外觀債已在 PR 知會 tang：導覽軌目前掛在各頁 header 底下而非通頂滿版、
  Figma 的 hover 展開文字標籤未做。
- **#44**（PR #153，commit `27a6a26`，07-18）— 暫停/timeout 全棧：`lib/db/src/schema/timeouts.ts`
  ＋`routes/timeouts.ts`＋`timeoutBelongsToUser`＋openapi/codegen＋前端 `useScoreSheet`（reducer/controller/
  reconstruct/undo）＋計分頁按鈕＋統計欄。形狀早在 `docs/event-grammar-spec.md` G 群定案；範圍（純記錄事件、
  不記時長）由 PO 拍板。
- **#147**（PR #158，commit `4ff53ac`，07-19）— 修畫線拖曳的 undo 殘留分支（#149 只修了站位拖曳）：
  `addMarker` 拖曳畫線改跳過歷史、由 Court 在 pointerUp 才記一次完整的線＋回歸測試。#147 就此關閉。
- **#146**（上一 session）— PROGRESS.md 改單檔＋開發／設計分區（本結構），並新增 `workflow` 標籤。
- **#119**（上一 session 關）— 戰術板/輪轉表兩 store 改 `dataByMatch[matchId]` 分片、去 persist、
  `buildSnapshot` 過濾幽靈站位。前端 **PR #145 已 merge**（commit `d18f69e`），後端前置 **PR #143**
  （`tactics` 加 `matchId` integer FK＋`?matchId=` 過濾，commit `e905844`）。三症狀（跨場汙染／幽靈站位／
  activeProjectId 誤覆寫）有 `useTacticsBoard.test.ts` 釘住、整套綠 → 驗證後關閉。跨 store 全域 subscribe
  換成 `RotationSwitcher` 明確呼叫 `syncRotationChange`。型別坑：`matches.id` 是 `serial`（整數）不是 uuid，
  FK 要跟著用 integer。
- **PR #149**（**Closes #147**）— 修戰術板 undo 一次退兩步（commit `3abb312`，07-18）。根因：每個 action
  「先記歷史再改狀態」，`history[historyIndex]` 慢一拍、與 undo 的 `historyIndex-1` 對不上；改成「先改後記」
  ＋回歸測試。那條修好卻沒開 PR 的 stranded 分支靠 catch-up 撿回。
- **PR #141**（無對應 issue）— 拿掉跨領域 PR 的 approve 硬關卡、改「合併前 @ 知會一聲」（commit `fa4e908`,
  07-18）。放寬先前 PR #137 立的規則，動 CLAUDE.md/CONTRIBUTING.md/ship skill；現行生效即知會制。
- **PR #142**（無對應 issue）— 需求層 pattern-language 分析文件（commit `c4e843f`，07-17）。
- **PR #137**（無對應 issue）— 兩人協作流程規範（commit `ab626b1`，07-16）。CONTRIBUTING.md「協作與溝通」
  ＋ CLAUDE.md「Team & collaboration rules」＋ ship 協作確認步驟。**已於 PR #141 放寬成知會制**（見上）。
  ship skill 瘦身門檻＝超過 ~350 行時把 Step 6 坑史移去 `ship/reference.md`（先不動）。

### 設計 (tang)

- **PR #148**（無對應 issue）— tang 的品牌 logo mark（旋轉排球）＋ design-spec「品牌標誌」段（commit
  `e920ac1`，07-18）。品牌名稱未定、字標佔位；spec `stroke-width 6.5` vs 實檔 `9` 已在 PR 留言請對齊。
- **PR #140**（#134 Track B，**#134 保持 open**）— 戰術板材質強化：置中字標、低調光影、玻璃卡片加深
  （commit `72a3670`，07-18）。#134 微 3D／版面呼吸等其餘方向續留 issue。
- **PR #135 / #129**（#131 部分進度，該 issue 保持 open）— 戰術板＋首頁套深色語言、手繪風全退役、
  球場改深青漸層（commit `0d63ee3`／`bef0e14`）。方法論教訓（review 夥伴 PR 用）：落後 main 又同檔的
  PR，git 自動合併無衝突**不等於合對**，要讀合併後檔案確認雙方改動都活著；fork PR 的 CI 預設不跑、
  要手動核准。

---

- （更早的 #118/#117/#115/#41/#50/#74/#73/#63/#20 等已修剪——記錄住在各自 issue 留言、
  `docs/*-spec.md`、git log。）
