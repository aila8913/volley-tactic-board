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

\_Last updated: 2026-07-23 (aila) — 環 4（#175）中央列表改一行式大卡片、比賽入口改「選中就地展開」
（夥伴的 modal 提案經 PO 推翻），順帶收掉 #131 的 TournamentDetail 深色化；前一批：環 2（#173）、
M1.5 七環拆解、環 1（#172）、環 3 Stage A（#181），(tang) 計分表／球場材質深色語言（PR #182/#167）。\_

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
  到 C3 才真正接上。剩下的是 Figma 視覺債。
- **`docs/flow-diagrams.html` 已於 07-21 移除（PO 決定）。** 它記的是「程式碼現在的行為」＝衍生文件，
  註定落後，而落後時**主動誤導**（#163 整張 issue 就在處理這件事：它描述的 `enterTacticsLayout()`
  等不是「舊」而是已被刪除，照著讀會實作出一條被 CI 焊死禁止的資料流）。修完兩天內又同步兩次，
  且 PO 已看不懂 1679 行的內容——對唯一的人類讀者價值已為負。刪前確認過所有 ⚠ 條目都掛著 issue
  編號、全檔零個「為什麼」，沒有孤兒事實。**判準值得記住：決策文件（`docs/*-spec.md`、issue 留言）
  值得維護，衍生文件不值得——程式碼本身就是最準的版本。** README／onboarding 的入口改成「跑起來
  自己點一遍」＋ requirements-pattern-language。
- **站位＝全站共用單一真相（07-21 PO 定案，推翻 #115 的解耦模型）。** 唯一真相是
  `useRotationTable.dataByMatch[matchId]`：比賽列表決定站位，計分表讀它也寫它，**戰術板右欄唯讀**
  （白板不影響資料紀錄——這是 #154 單向不回寫第一次在畫面上被看見，CI 的 `no-restricted-imports`
  仍不得停用）。共存機制是「**共用現役＋開局凍結**」：共用的是「目前站位」，每局開賽那一刻擷取成
  該局的凍結快照（`ScoreSheetState.lineup` 語意改變＝歷史快照，不再是平行的第二份先發），此後該局
  唯讀，事後編輯污染不到歷史統計。判斷式只有一行 `activeLineup = lineup ?? capturableLineup`。
  **#115 原本要解的兩個問題沒有回來**：幽靈站位掃空先發仍由 `captureLineupFromRotations` 的名單過濾
  擋著（`lib/rotationLogic.ts`，5 個單元測試在），事後污染由開局凍結接手——解耦只是當年的手段、不是
  目的。已在 #115 補留言註記作廢，因為多處文件曾拿它當法規引用。
- **#120 計分頁右欄兩階段落地。** 一階段：`CourtReadOnlyView` 常駐唯讀站位（**純展示、不訂閱任何
  store**，#117 錨點決議）＋右欄轉深色玻璃（中間計分區仍白底，記在 #131）；戰術板入口全收進導覽軌
  「戰」飛出選單。二階段：`ScoreSheetRotationPanel` + `ScoreSheetLineupEditor` 併成
  `RotationRailPanel`（layout-spec §4 三段式：格表→輪次 stepper→球員清單），改為**受控元件**——
  改動直接進共用真相，草稿 state 與「確定」鈕整組移除，連帶消滅「排到一半被無關 re-render 洗掉」
  那類 bug。戰術板的 `RotationSwitcher` 與可拖曳名單走 `footer` 注入而非折進面板，因為前者帶著
  「切輪次要確認捨棄未存戰術」的 session 副作用、後者是 `Court.tsx` 拖放協定的來源。
  **`lib/rotationLogic.ts` 連續兩次 UI 重寫都一行未動**——把領域邏輯抽出元件的回報。
  **換局換輪視窗（commit `844b50d`）作廢**：右欄本來就顯示下一局站位、本來就能改，彈窗是多餘轉場。
  **剩：分析頁站位列（blocked #76），#120 保持 open。**（比賽列表／資料夾內頁的右欄已由 #174
  Stage A 補上，見下一則。）
- **版面規格立法＋七環落地計畫（07-22）。** 新增 `docs/layout-spec.md`：2048×1440 畫布的換算表
  （nav 105／aside 493／tools 132／中央 `flex-1`，**不要硬寫 px**）、三欄骨架與四種模式
  （A 列表瀏覽／B 戰術唯讀／C 戰術編輯／D 對手佈陣）、各欄內容規格，並把 M1.5 UI 大改版拆成
  **環 0–6（issue #172–#178）**，相依鏈 `環1 →（環2 ‖ 環3 ‖ 環4）→ 環5 → 環6`。
  **分工判準：版面聽 layout-spec.md、視覺聽 design-spec.md。**
- **環 1（#172）已合併：三欄骨架有主人了。** 在此之前五個頁面各自手刻 `flex h-screen` ＋各自
  寫死欄寬（`w-16`/`w-72` 散落五處），靠複製貼上維持一致。`components/AppShell.tsx` 成為唯一
  擁有者，各頁只往插槽（`nav`/`children`/`aside`/`tools`/`backdrop`）塞內容；模式→右欄插槽用
  查表而非 if 鏈。**兩個刻意不做並寫進註解的決定**：(1) 寬度沿用現況值而非 spec 目標值——搬家
  與裝潢分開做，畫面出錯才分得出是哪一步；(2) 左欄不隨 mode 變寬——spec §1 表格的「展開 370」
  依 §2.1 是 hover 暫時態，當成版面寬度會讓滑鼠一移開就整頁 reflow，環 2 應做成浮層。
  搬家途中撿到真 bug：flex column 子項 `min-height` 預設 `auto`，在 `h-screen + overflow-hidden`
  骨架裡只寫 `overflow-y-auto` 是**捲不動的**（該層被內容撐高、捲軸不出現、長清單被裁掉），
  要補 `min-h-0`——與中央欄的 `min-w-0` 是同一個坑的兩個方向。
- **環 3（#174）Stage A：右欄成為「排先發」的起點**（PR #181，**#174 保持 open**）。實作前發現
  **規格與資料對不上**：issue 要「滑到已打完的局讀該局凍結快照」，但 `CompletedSet` 根本沒存
  lineup——`nextSet` 封存時只留分數與 history，快照直接丟掉，後端 `lineups` 每局都有一筆卻只被
  讀回當前局。已補：`CompletedSet.lineup` ＋ 共用的 `findLineupSnapshotForSet`。
  `RotationRailPanel` 加 `axis`（rotation/set）與 `onStep` stepper，**元件只回報方向**，「輪是
  環狀、局是線性有邊界」屬領域規則留在呼叫端；新元件 `MatchInfoRail` 三態（空狀態／資料夾摘要
  佔位／比賽輪轉表），列表頁與資料夾內頁共用同一顆。選取語意一般化成 `selected { kind, id }`、
  比賽卡片卡身可單擊選取、**不自動選第一場**（使用者未表達意圖前不該讓站位進可寫狀態）。
  「已記完」用新純函式 `getMatchWinner` 判**勝隊**而非局數（三戰兩勝 2:0 也可能已結束）。
  **Stage B（統計格）blocked on M2、跨欄拖曳（DnD）未做，故 #174 不關。**
- **環 2（#173）左欄導覽落地：`NavRail` 一顆取代 `MatchNavRail` ＋ `TacticsRailMenu`**（收合軌
  ↔ 展開側欄、active 整行強階選取態、「戰」子清單、承接 #17 第 3 節的匯出入口「出」）。
  **實作後 PO 依實機畫面推翻兩條既有規格**（已回寫 `docs/layout-spec.md` §2.2）：展開寬度
  370→176px（`w-44`）；展開改成**推開版面、中央跟著壓縮**，不是 #172 註解裡寫死的浮層方案
  ——浮層會遮住使用者正要點的中央內容。欄寬仍由 `AppShell` 單一常數擁有，用 CSS
  `hover:`/`focus-within:` 變體驅動，不把 NavRail 的展開 state 拉上去當 prop（欄寬歸 shell、
  內容歸 rail，各自對同一個瀏覽器事實反應、天然同步）。**踩到的雷**：Tailwind class 是建置時
  掃描原始碼字串產生的，`hover:${變數}` 拼出來的名字掃不到、執行期是條不存在的規則。
  **抓到一個四項檢查全綠、但一定會發生的行為問題**：`NavRail` 現在掛在全站五頁，而
  `useListTactics(undefined)` 的語意是「不帶過濾條件查」＝要全帳號所有戰術，列表頁明明不會
  渲染那份清單卻每次進頁面白打一支；補 `enabled` 才擋掉。**另一個是實機才看得到的**：右欄用
  #174 的 `selected` 判斷選了哪一場，左欄卻寫死「列表頁永遠沒有 matchId」，於是點了卡片右欄
  站位都出來了、左欄還在說「先選一場比賽」——新增 `ListNavRail` 把兩欄接到同一個選取狀態。
  `captureCurrentRotation` 抽成共用工具（本來要變四份複製），抽的同時**把它加進 eslint 的
  禁止清單**：它會讀輪轉表 store，只放進 `lib/` 而不擋，白板 store 就能靠 import 它繞過 #154
  焊在 CI 上的單向依賴禁令（lint 比對的是 import 路徑，看不出這種轉包）。
  #173 驗收項全數完成、已關。實機驗收時另外發現右欄「點擊排站位」在列表頁失效（沒開賽也
  放不上去），連同一直沒做的跨欄拖曳一起歸 #174。
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

- **設計規範已落地三頁（首頁＋戰術板＋計分表），手繪風全站退役**（`docs/design-spec.md`，
  PR #129/#135/#140/#167/#182）：深色儀表板語言（`#0a0b07` 底＋萊姆綠 `#C6F135`＋玻璃卡片＋
  Space Grotesk/JetBrains Mono）。戰術板加材質強化（#134 Track B：球場毛玻璃地板、邊緣繞行光、
  球員標記改玻璃圓片，PR #167，2026-07-22——這批是接在 aila #154/#160 重構後的 session 架構之上
  重做的）；計分表右欄（PR 見 #120）＋中間計分區（`ScoreSheetCourt.tsx`/`RadialMenu.tsx`/
  `ScoreSheet.tsx`，PR #182，2026-07-22）也補齊，`ScoreSheet.tsx` 已改吃 aila 新出的 `AppShell`
  骨架（#172）。`RadialMenu.tsx` 是全站最後一個 `wobbly-border` 消費者，換完後該 class 與
  `--font-display`/Caveat/Permanent Marker 死碼一併從 `index.css` 清掉。品牌 logo mark 已定案
  （`public/favicon.svg`，PR #148），design-spec 多了「品牌標誌」段。**剩數據分析頁、資料夾內頁
  兩處仍是手繪風，由 #131 追蹤**（#134 保持 open：Track A 微 3D／Track C 版面呼吸空間尚未開始）。
  #132（首頁 review 收尾）獨立進行。**寫 UI 前先讀 design-spec.md**；實作數值以該檔「實作微調」
  「實作決定」註記為準（背景 `#0a0b07`、邊框 `white/[0.12]`～`[0.26]`、球場深青漸層——非原始的
  `#121310`/暖木色）。
  **教訓（本次踩了兩次）**：aila 這陣子的架構重構（#154/#160、#172 AppShell）速度很快，材質類 PR
  只要卡在分支上超過一天，動到的元件常常已經被換底層架構，合併前務必先 `git fetch` 比對
  `origin/main`，抓到就直接照新結構重做一次（不要嘗試 rebase 硬套舊 diff）。

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
部署 #26／離線契約 #75 仍屬 priority:essential 的自然接續。**#120 已移到 M1.5、計分頁兩階段落地，
仍 open**：剩分析頁站位列（資訊軸未定，**blocked #76**）。換局換輪視窗已作廢（右欄可就地編輯後成為
多餘轉場）。

**M1.5 的當前形狀＝七環（#172–#178），規格住 `docs/layout-spec.md`、相依鏈
`環1 →（環2 ‖ 環3 ‖ 環4）→ 環5 → 環6`。** 環 1（#172）已關；環 3（#174）Stage A 已送 PR #181。
**下一步是三選一，彼此獨立、順序可調**：#173（環 2 左欄 hover 展開）／#175（環 4 中央列表型）／
#176（環 5 中央球場型＋模式 C，依賴環 1、3、4）。#174 剩 Stage B（統計格，blocked on M2）與跨欄
拖曳（與 #40「undo/redo 不涵蓋輪轉拖曳」相鄰，動到時留意）。#178（環 7 響應式）需先補線框稿。
**新開 #168：引入 `@testing-library/react` 補互動測試**——現行 `renderToStaticMarkup` 慣例無法觸發
事件、讀不到 Radix Portal，飛出選單的行為全無自動測試；這輪就在該盲區抓到一個「四項檢查全綠但
使用者會遇到」的 bug（用 store 狀態反推使用者意圖），修好了但無回歸測試保護。
（#120 已移入 M1.5，原「掛 M5 是否移轉」的待裁決事項結案。）
#40（undo/redo 不涵蓋輪轉拖曳，與 #147 同塊邏輯但不同 store）、
#64（背景寫入失敗不 reconcile，關聯部署 #26／離線契約 #75）、**#127（後端沒驗 tournamentId 擁有權，真 auth
後補）** 仍 open。
進階版差異化（M4）：#51 動作子分類、#21 球線座標、#99 站位快照——同屬 advanced tier，可一起設計。

## Recently closed (past ~week)

### 開發 (aila)

- **#175**（07-23）— 環 4／中央列表型（模式 A）：`ListItemCard`（資／比 徽章，資料夾與比賽**共用
  同一個元件**，因為線框稿的意圖是兩者混在同一列表，分兩個元件遲早飄成兩種行高）＋`ListScrollArea`
  （藏原生捲軸、自繪 8px 指示條；是指示器不是控制項，不可拖）＋`matchSummary.ts`（「3:0 勝」規則，
  4 個測試）。`MatchCard.tsx` 刪除。同 PR 收掉 #131 的 `TournamentDetail` 深色化（那頁的中央區本來
  就要整個重寫，不在 #131 底下另做一次白工）。**兩個 PO 實機推翻**：卡高 Figma 等比 176px 太空曠→
  104（線框稿高度是配多行內容畫的）；比賽三入口從 @tangyi1025 提的 modal 改成**選中的卡片就地向下
  展開**——疊層會把「旁邊還有哪幾場、我捲到哪」一起蓋掉，還多一個返回動作。「整張反白」照 #134
  環 0 定案改用玻璃提亮＋細環（持續狀態不適合實色）。實機測試另外長出 #190–#193 四張 issue。
- **#172**（PR #180，commit `b130bdb`，07-22）— 環 1／抽出 `AppShell` 三欄骨架，五頁收斂到單一
  版面元件。細節與兩個「刻意不做」的決定見上方 Current state。**教訓值得記**：四項檢查全綠但
  **一項都抓不到版面問題**——捲不動、欄被擠爆、scroll-snap 沒對齊，型別全都合法。這正是 #168
  （引入 `@testing-library/react`）要補的盲區，也是為什麼這類 PR 一定得真的開瀏覽器點過。
- **PR #179**（commit `ddb3777`，07-22）— `docs/layout-spec.md` ＋ 七環拆解（#172–#178）。
  這顆一度是 stranded commit（比前一次 squash merge 晚 46 分鐘落在本機 main 上、沒被帶走），
  由 catch-up 的 drift 比對撿回、cherry-pick 到乾淨分支重送。
- **#163**（07-20）— `docs/flow-diagrams.html` 同步到 #154／#160 之後的實際行為。過期的
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
- **PR #149**（**Closes #147**）— 修戰術板 undo 一次退兩步（commit `3abb312`，07-18）。根因：每個 action
  「先記歷史再改狀態」，`history[historyIndex]` 慢一拍、與 undo 的 `historyIndex-1` 對不上；改成「先改後記」
  ＋回歸測試。那條修好卻沒開 PR 的 stranded 分支靠 catch-up 撿回。
- **PR #141**（無對應 issue）— 拿掉跨領域 PR 的 approve 硬關卡、改「合併前 @ 知會一聲」（commit `fa4e908`,
  07-18）。放寬先前 PR #137 立的規則，動 CLAUDE.md/CONTRIBUTING.md/ship skill；現行生效即知會制。
- **PR #142**（無對應 issue）— 需求層 pattern-language 分析文件（commit `c4e843f`，07-17）。

### 設計 (tang)

- **PR #182**（#131 部分進度，該 issue 保持 open，2026-07-22）— 計分表中間計分區套用深色玻璃語言：
  `ScoreSheet.tsx` 頁面外殼（改吃 `AppShell`）、`ScoreSheetCourt.tsx` 球場配色、`RadialMenu.tsx`
  退役最後的 `wobbly-border`。右欄（`ScoreSheetStats.tsx`/`RotationRailPanel`）已由 aila 的 #120
  處理過，這批完全沒碰。順手清掉 `index.css` 裡沒消費者的 `--font-display`/Caveat/Permanent Marker
  死碼。**第一版曾在舊的 `ScoreSheet.tsx` 結構上做完，但卡分支期間 aila 合併了 #172 AppShell
  重構，整頁骨架換掉，第一版直接作廢、照新結構重做**（v2 才是實際合併的版本）。
- **PR #167**（#134 Track B，**#134 保持 open**，2026-07-22）— 戰術板球場材質補完：`.court-glass`
  毛玻璃地板、`.court-edge-light` 邊緣繞行光（design-spec.md 第 6 節「每頁最多一個環境動效」的
  範本案例）、`PlayerNode.tsx` 球員標記改玻璃圓片（圈內背號＋圈下姓名，取代沒有 UI 能切換的
  `circleLabel` 三選一）。前排/後排/Libero/備位配色邏輯完全沒動。**同樣是接在 aila #154/#160
  重構（`session`/`viewingScene` 架構）之後重做的第二版**——這是本次踩到「材質 PR 落後架構重構」
  這個坑的第一次，第二次就是上面 #182 的教訓。
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
