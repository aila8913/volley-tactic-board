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

\_Last updated: 2026-07-28 (aila) — #213 球員跨場/跨隊分析（people 應用層＋名單去重 UX＋視圖③）
落地，#65 傘只剩比率/差異化統計；同時開了 #218（比賽結束的操作節點與畫面）。前一批 2026-07-27
(aila) — #215 賽制欄位化（`matches.format` enum），並補入 PR #216（分析頁全頁範圍選擇器＋seed）
與 PR #217（tang：計分頁視覺打磨＋左欄導覽圖示化）、壓縮 07-20 以前的條目。前一批 2026-07-26
(aila) — teams 端到端（PR #208）＋數據分析入口改常駐紀錄本（PR #212）。\_

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
  `docs/requirements-pattern-language.md`。
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
  - **環 3（#174，**仍 open**）**：右欄 `RotationRailPanel` 有 `axis`（rotation/set）與 stepper，
    **元件只回報方向**，「輪是環狀、局是線性有邊界」屬領域規則留在呼叫端；`MatchInfoRail` 三態
    （空狀態／資料夾摘要／比賽輪轉表）由列表頁與資料夾內頁共用。實作前發現**規格與資料對不上**：
    `CompletedSet` 沒存 lineup，已補 `CompletedSet.lineup` ＋共用的 `findLineupSnapshotForSet`。
    選取語意一般化成 `selected { kind, id }`、**不自動選第一場**（使用者未表達意圖前不該讓站位進
    可寫狀態）。跨欄拖曳已由 PR #189 完成；**剩 Stage B（統計格）blocked on M2，故不關。**
  - **環 4（#175）／環 5（#176，**仍 open**：剩繪圖工具正式圖示 blocked @tangyi1025）／
    環 6（#177）** 皆已落地，見下方 Recently closed。**環 7（#178）需先補線框稿。**
- **#120 計分頁右欄兩階段落地（**仍 open**）。** `CourtReadOnlyView` 常駐唯讀站位（**純展示、不訂閱
  任何 store**）＋`RotationRailPanel` 改為**受控元件**——改動直接進共用真相，草稿 state 與「確定」鈕
  整組移除，連帶消滅「排到一半被無關 re-render 洗掉」那類 bug。**`lib/rotationLogic.ts` 連續兩次 UI
  重寫都一行未動**——把領域邏輯抽出元件的回報。**換局換輪視窗已作廢**（右欄本來就能就地改，彈窗是
  多餘轉場）。分析頁站位列已由 #193 交付**唯讀**版（`AnalyticsRotationRail`）；#120 仍 open 是因為原
  構想的可寫/彙總版待 #76 定調資訊軸。
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
  #65 傘只剩比率/差異化有著落才收。
- **`lib/db/src/seed-testdata.ts` 是分析頁的驗證資料來源**（全部三戰兩勝、刻意留一場進行中；每分補一顆
  決定球 event 讓球員矩陣有數字；`buildRallies` 保證「賽末點收在最後一球」，不再出現「我方達標後對手
  還在加分」的不可能畫面）。
- **專案 roadmap 已上線。** 時間序住在 repo **Milestones M1–M5**（軟目標日 7/18→9/11，非死線），當下
  狀態住在 [GitHub Project #4](https://github.com/users/aila8913/projects/4)。**注意：Todo 欄目前是空的**
  （#213–#217 都沒設 status），所以「下一步做什麼」這輪要重新決定，不能直接看 Todo 欄。維護規則與 CLI
  id 在 `.claude/skills/wrap-up/SKILL.md` step 5。尚待 PO 在網頁完成：Workflows 自動化＋三個 view。
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
- **教訓（踩過三次，兩條）**：(1) aila 的架構重構（#154/#160、#172 AppShell）速度很快，材質類 PR 只要
  卡在分支上超過一天，動到的元件常常已被換掉底層架構——合併前務必先 `git fetch` 比對 `origin/main`，
  抓到就**直接照新結構重做一次**（不要嘗試 rebase 硬套舊 diff；#167 與 #182 都是重做的第二版）。
  (2) 落後 main 又同檔的 PR，**git 自動合併無衝突不等於合對**，要讀合併後的檔案確認雙方改動都活著；
  另外 fork PR 的 CI 預設不跑、要手動核准。

## Known gaps / next big pieces

Backlog lives in **GitHub Issues, phase-ordered via Milestones M1–M5** — this file no longer
duplicates it. Current phase = lowest-numbered milestone with open issues:

```
gh issue list --milestone "M1 簡易版收尾"   # 當前階段
gh issue list --state open                   # 全部
```

**M1 實作項已清空**（去汙染家族 #115/#117/#118/#119、undo 一次退兩步 #147、暫停 #44 全數落地）。
**M1.5「戰術板 UI 大改版」＝七環（#172–#178）**，規格住 `docs/layout-spec.md`、相依鏈
`環1 →（環2 ‖ 環3 ‖ 環4）→ 環5 → 環6`。環 1–6 已全部落地，剩下的 open 尾巴：

- **#178（環 7 響應式）**——需先補線框稿。
- **#176（環 5）**——只剩繪圖工具正式圖示，blocked @tangyi1025。
- **#174（環 3）**——只剩 Stage B（統計格），blocked on M2。
- **#199**——戰術板**對手球員分色渲染**（Court 從未渲染對手、snapshot player 無 `side`、珊瑚橘
  `#FF8A5C` 無落點）。這是 spec 把 mode D 叫「對手佈陣」的那層，#177 沒做。
- **#120**——剩分析頁站位列的可寫/彙總版，**blocked #76**（資訊軸未定）。

**重心在 M2 數據分析（#65 傘）**：#213 已交付，**#214（分析頁導覽重構）是最現成的下一步**——#213 刻意
沒動 `NavRail.tsx`，左側子導覽（比賽/球員/隊伍分析）整塊留給它，現在有三個視圖了正是動它的時機。
#213 衍生的兩個缺口：**#221 人員合併**（去重刻意接受「未確認就建新身分」，累積下來需要合併能力）與
**#222 `RosterEditDialog` 沒有去重 UX**（從戰術板那條路徑新增的球員 `personId` 永遠是 null，兩條新增
路徑行為不一致，且沒有任何提示）。**#218**（一場比賽「結束」的操作節點與畫面）——目前「結束比賽」只是導去分析頁的 `<Link>`，
**最後一局不會被封存**（`completedSets` 只在按「下一局」時累積），是資料缺口不只是 UX 缺口。

其餘 open 的技術債與待辦：
**#168（引入 `@testing-library/react`）** ——現行 `renderToStaticMarkup` 慣例無法觸發事件、讀不到 Radix
Portal，飛出選單與帶 mutation 副作用的 controller 全在自動測試盲區（#201 的計分頁死結修復就落在這裡，
僅手動驗證）。**#40**（undo/redo 不涵蓋輪轉拖曳，與 #147 同塊邏輯但不同 store）。
**#64**（背景寫入失敗不 reconcile）——#201 在 `useScoreSheet.start()` 補了 guard，**堵掉「單機就能製造
serving≠null 但 record.lineup=null」那條路**，但真正的 reconcile 仍未做；關聯部署 #26／離線契約 #75，
兩者仍屬 priority:essential 的自然接續。
**#184**（唯讀面板不該掛整套記分 mutation hooks）。
進階版差異化（M4）：#51 動作子分類、#21 球線座標、#99 站位快照——同屬 advanced tier，可一起設計。

**已修掉但判準值得留著的**：#127（後端沒驗 tournamentId 擁有權）——**外鍵保證 referential integrity
（uuid 指得到一列），不保證 ownership（那列是不是你的）**，兩者很容易被當成同一件事；`lib/ownership.ts`
的 `tournamentBelongsToUser`／`teamBelongsToUser` 就是這條判準的落點。

## Recently closed (past ~week)

### 開發 (aila)

- **#213**（球員跨場/跨隊分析，07-28）— 三塊：(1) **people 應用層**——`routes/people.ts` CRUD 鏡射
  teams、`personBelongsToUser` 防 IDOR、`players` 的 POST/PATCH 可寫 `personId`（判斷用 `!== undefined`
  而非 truthy，因為 `null` 是合法值＝解除歸屬，truthy 會讓解除靜默失效）。(2) **去重 UX**——見上方
  Current state 的不對稱判準；順帶修掉 `RosterEditDialog` 不帶 `personId` 會靜默清掉既有對應的 bug。
  (3) **視圖③**——`GET /analysis/people/:personId`＋`pages/PersonAnalytics.tsx`，**只做資料真的支援的
  五項**（出賽場數／跨隊／各場背號位置／觸球動作分布／先發局數），**刻意不做「這個人得幾分」**——
  `events.outcome` 恆為 null（#51），做出來只能是近似值假裝，頁面上明講這個限制而不是靜默留白。
  三種 grain（match／event／set）照 `/analysis/matches` 既有做法拆成三支查詢在 JS 合併。
  **實測踩到的坑**：`usePeople` 原本寫 `data ?? []`，擋不掉「後端回非陣列」——api-server 沒重啟時請求
  掉進 SPA fallback 拿回 `index.html` 字串，一路傳到 `people.find(...)` 才炸，錯誤訊息指著使用端、離
  病根很遠。已改 `Array.isArray` 並連帶補 `useTeams`（同形狀、同坑，只是 `/teams` 早就上線沒發作）。
- **#215**（賽制欄位化，07-27）— `matches.format` pgEnum（`best_of_3`/`best_of_5`，
  `notNull().default("best_of_3")`）貫穿 db → openapi → codegen → routes → domain 型別 → 純函式 →
  四個呼叫端 → `MatchFormDialog` 賽制下拉 → seed。`WINS_NEEDED_TO_CLINCH` 寫死值刪除，
  `getMatchWinner(sets, winsNeeded)`／`formatMatchResult(sets, winsNeeded)` 第二參數**必填無預設**，
  賽制→門檻的翻譯由新的 `winsNeededFor(format)` 隔開（維持 matchOutcome.ts「純規則不認識 domain
  型別」的既有哲學）。`AnalyticsRotationRail` 加 `winsNeeded` prop 而非自己抓資料——它刻意不重用
  `MatchInfoRail` 的理由就是不要多一條資料依賴。回歸測試鎖住「同一組 2:1 在 best_of_3 是勝、在
  best_of_5 是 null」。
- **PR #216**（分析頁範圍選擇器＋seed，07-26）— 比分總覽卡片本身變成篩選按鈕，全頁改由單一 `scope`
  state 驅動（取代各區塊各自的切換）；各輪次得失分改前端算（`buildRotationStats`），因為後端聚合只能
  算整場、跟不了選局。`seed-testdata.ts` 入庫：修分數成長圖假象、補每分一顆決定球 event、全部改三戰
  兩勝。**這批資料當場暴露 #215**（三戰兩勝在列表被誤標「進行中」），當時另立 issue 未在本 PR 修。
- **PR #208**（#65 續：teams 分組標籤端到端，07-26）— `routes/teams.ts` CRUD 鏡射 tournaments，
  **兩處刻意分歧**：`teams.id` 是 `serial` 整數（非 client-mintable uuid，故 POST 不收 id）、
  `matches.teamId` FK 是 `onDelete: set null`（刪球隊只把比賽設回未分類，與 tournaments 的 cascade
  刻意相反——標籤不該拖著比賽走）。＋`teamBelongsToUser` 防 IDOR＋前端 `useTeams`／`MatchFormDialog`
  球隊選擇器／視圖②球隊過濾欄。
- **PR #212**（數據分析入口＝常駐紀錄本，07-26，無對應 issue、PO 當場定方向）— 左欄「數」永遠可到
  （context-aware），紀錄本頁補上共用導覽軌並標 active，首頁移除重複的 BarChart 入口。計分結束的跳轉
  沿用既有「結束比賽」按鈕，未新增。
- **PR #207**（07-26）— 比賽列表卡片改讀後端跨場摘要（`GET /analysis/matches`），修正「一載入就對每場
  誤顯示尚未開賽/尚未排先發」。換來源的理由：本機 store 只有「打開過那場」才 hydrate，列表剛載入必然
  是空的；改一支 bulk endpoint 就是 O(場數) 列，不是一場一輪請求的 fan-out。
- **#190–#193**（右欄三頁補齊，PR #201，07-25）— #190 柔性引導（未排先發顯示琥珀提示、推去右欄排，
  **不鎖任何版面**——PO 在「引導 vs 鎖住」拍板走引導）；#191 局軸狀態 pill＋#192 當局比分行，兩者都是
  `axis="set"` 專用的加成式 prop，輪次軸呼叫端不傳就零回歸；#193 數據頁新增 `AnalyticsRotationRail`
  唯讀右欄，**刻意不重用 `MatchInfoRail`**（那顆有可寫分支＋讀共用輪轉表 store，會把「可編輯站位」
  語意偷渡進唯讀頁）。**同 PR 修掉一隻既有死結**：`start()` 無條件寫 `serving` 但只條件性凍結
  `record.lineup`，會生出 serving≠null／lineup=null 的局 →「看得到球員拖不動」＋中央顯示「還沒排先發」。
- **#177**（環 6／新增戰術流程＋佈陣 mode D，07-24）— 「+」在戰術板頁改開**只蓋中央球場的浮層**
  （`absolute inset-0`＋父容器 `relative`，天然蓋不到左右欄，比 Portal＋算座標省事）。狀態機加一個
  顯式 `session.arranging` 位元（D/C 兩態 session 形狀相同、無既有欄位可推導，故誠實多存一位）。
  18 個 store 狀態機測試＋浮層測試。
- **#176**（環 5 結構部分，PR #197，07-24，**#176 保持 open**）— 編輯戰術時整個右欄換成 132px 工具軌、
  中央球場放大。頁面層一行 `mode={session ? "C" : "B"}`＋把 mutation 抽成 `useTacticsBoardController`
  共用 hook（aside 與工具軌看到同一份 pending，不會不同步）。
- **#175**（環 4／中央列表型，07-23）— `ListItemCard`（資／比 徽章，資料夾與比賽**共用同一顆**，因為
  線框稿的意圖是兩者混在同一列表，分兩個元件遲早飄成兩種行高）＋`ListScrollArea`（自繪指示條，是指示器
  不是控制項）＋`matchSummary.ts`。**兩個 PO 實機推翻**：卡高 176→104px；比賽三入口從 modal 改成**選中
  的卡片就地向下展開**——疊層會把「旁邊還有哪幾場、我捲到哪」一起蓋掉，還多一個返回動作。
- **#172**（環 1／`AppShell` 三欄骨架，PR #180，07-22）— 詳見上方 Current state。**教訓值得記**：四項
  檢查全綠但**一項都抓不到版面問題**——捲不動、欄被擠爆、scroll-snap 沒對齊，型別全都合法。這正是 #168
  要補的盲區，也是為什麼這類 PR 一定得真的開瀏覽器點過。
- **PR #179**（`docs/layout-spec.md` ＋七環拆解，07-22）— 這顆一度是 stranded commit（比前一次 squash
  merge 晚 46 分鐘落在本機 main 上、沒被帶走），由 catch-up 的 drift 比對撿回、cherry-pick 重送。

### 設計 (tang)

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
- **PR #182**（#131 計分表中間計分區深色化，07-22）— `ScoreSheet.tsx` 改吃 `AppShell`、`RadialMenu.tsx`
  退役最後的 `wobbly-border`。**第一版曾在舊結構上做完，但卡分支期間 aila 合併了 #172，整頁骨架換掉，
  第一版直接作廢、照新結構重做**（v2 才是實際合併的版本）。
- **PR #167**（#134 Track B 戰術板球場材質，**#134 保持 open**，07-22）— `.court-glass` 毛玻璃地板、
  `.court-edge-light` 邊緣繞行光（design-spec 第 6 節「每頁最多一個環境動效」的範本案例）、`PlayerNode`
  改玻璃圓片。同樣是接在 aila #154/#160 重構之後重做的第二版。

---

- （更早的條目已修剪——記錄住在各自 issue 留言、`docs/*-spec.md`、git log：
  #163 文件同步、#160 C1/C2/C3 三顆 PR、#44 暫停全棧、#147/#149 undo 一次退兩步、
  PR #141 協作規則放寬、PR #142 pattern-language、PR #148 品牌 logo、PR #140 戰術板材質、
  PR #135/#129 深色語言首批，以及更早的 #118/#117/#115/#41/#50/#74/#73/#63/#20 等。）
