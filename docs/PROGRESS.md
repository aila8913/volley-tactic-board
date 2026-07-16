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

\_Last updated: 2026-07-16 — **戰術板跟上深色語言，#131 決定拍板，且 #132 補上收尾 PR**：
@tangyi1025 現在是 repo 的 **collaborator**（PO 邀請並接受），寫入權限已生效，不用再走 fork。

**PR #135 已合併**（commit `0d63ee3`）——戰術板頁面（`TacticsBoard.tsx` +
`RotationTable`/`TacticsBoardPanel`/`RotationSwitcher`/`Court`）退役 wobbly-border/`font-display`/
漫畫陰影，改用 design-spec.md 的玻璃卡片語言；球場底色從暖木色 `#C9A25D` 改成深青漸層（避免跟
己方萊姆綠/對方珊瑚紅球員點的顏色衝突），L 備位框從球場上下方搬到左右側（球場垂直可用面積變大，
順手解決 PO 反饋的「桌機寬螢幕兩側空空」問題）。`RadialMenu.tsx`（計分表在用）還依賴
wobbly-border，是 #131 剩餘範圍之一，先不動。**#131「手繪風去留」拍板：全拿掉**，議題到此完成。

**#132 曾被誤關一次**：標題「首頁深色改版的收尾」跟 #135「戰術板」範圍不重疊，關 issue 時看錯，
已重開。PR #129 review 的四點修正（純色背景讓 `backdrop-blur` 沒效果、Anton 在 17–18px 標題難讀、
`--font-mono` 蓋掉 Tailwind 內建 key、`.claude/launch.json` 跟視覺改版無關）補進新 PR，
`Closes #132`。**教訓：commit 存在 ≠ 有人看得到**，落地前務必確認 PR 真的開了、issue 真的連得到。

**新開 #134（戰術板視覺定案，needs-plan）**：PO 跟夥伴看過 #135 的畫面後，想再往前一步——微 3D
球場（傾角+厚度+陰影）、材質再強化（毛玻璃/發光加碼）、桌機版面呼吸空間。**微 3D 明確牴觸現行
design-spec 第 6 節「動效輕量」**，要做的話得先改規範。球場配色 PO 那邊看到的還是 issue 開的時候
的舊 spec 值（暖木色），要先跟他對齊「現在已經是深青漸層」這個事實，才能接著討論。動手前排定要
先進 Plan mode，且 PO 那邊還要補齊微 3D 參考圖跟夥伴收集的 Pinterest 參考。

三條不變量提醒：I1 單一真相來源、I2 per-match 狀態用 matchId 當 key、I3 一個實體一套 id 只鑄造一次
（完整＝ #117 錨點留言）。\_

## Current state

Where the project actually stands right now (durable "current" facts; per-session detail
lives in git log + the issues named):

- **Backend match-recording API is fully implemented and live (dev DB).** matches / players /
  sets / rallies / events / substitutions / **tournaments** CRUD + tactics/health,
  ownership-scoped. The frontend scoresheet is **fully off localStorage** (matches,
  scores/rotation, events read-back → per-player stats)；**資料夾（tournaments）也已脫離
  localStorage、進 DB**（#117 完整版已合併）——`matches.tournamentId` 是帶 `onDelete: cascade`
  的 uuid FK，刪資料夾自動連帶刪比賽、不再有孤兒。Design + phased history in
  `docs/backend-architecture.md`；#58 closed。
- **Schema foundations for stats are in place:** `lineups`（起始先發，一局一 row）、
  `substitutions`（換人，存比分快照）、`events.outcome`（得/失/球續 enum）、`people`＋`teams`
  （跨場跨隊身分／分組標籤，`players.personId`/`matches.teamId` nullable FK、`onDelete: set null`
  保留歷史事實）全部 live。這些是 #65 數據分析頁往上長的地基。
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
- **設計規範已落地兩頁**（`docs/design-spec.md`）：深色儀表板語言（`#0a0b07` 底＋萊姆綠
  `#C6F135`＋玻璃卡片＋Space Grotesk/JetBrains Mono）已套進比賽列表首頁（PR #129＋#132 收尾）跟
  戰術板頁面（PR #135）。戰術板另外定案：球場底色深青漸層（非原規範的暖木色）、L 備位框在球場
  左右側，Anton 已棄用、標題一律 Space Grotesk。剩餘待轉換：計分表（`ScoreSheetCourt.tsx`/
  `RadialMenu.tsx`）、數據分析頁、資料夾內頁——屬 #131 剩餘範圍，M3。視覺再進化（微 3D 球場等）
  待 #134（needs-plan）討論定案。**寫 UI 前先讀 design-spec.md**；注意實作數值以該檔「實作微調」/
  「實作決定」註記為準（背景 `#0a0b07`、邊框 `white/[0.12]`～`[0.26]`、球場漸層，非原始的
  `#121310`/`#C9A25D`）。

## Known gaps / next big pieces

Backlog lives in **GitHub Issues, phase-ordered via Milestones M1–M5** — this file no longer
duplicates it. Current phase = lowest-numbered milestone with open issues:

```
gh issue list --milestone "M1 簡易版收尾"   # 當前階段
gh issue list --state open                   # 全部
```

M1 收尾焦點：**全域 store 去汙染家族 #117/#118/#119**（#115 已修先發那條、CLOSED；同根因仍在別處——
見 #117 錨點留言的三條不變量與落地順序）。順序＝(1) ✅ #117-最小止血（#122 已 merge）；
(2) schema 換季（趁部署前可丟資料窗口）三刀，可拆 PR：**✅ players.id→uuid（#118 schema 部分，PR #124
已 merge，commit `a40cb59`）**／**✅ tournaments 表 uuid PK+cascade+API（#117 完整版，PR #128 已 merge，
commit `241a7eb`）**／⬜ tactics 加 matchId（#119 前置）；**(3) ✅ #118 前端半段（本次完成，#118 全案
關閉）**；(4) #119 兩 store byMatch 分片+去 persist；(5) #120 純展示唯讀站位視圖。另 #64（背景寫入失敗不 reconcile，關聯部署 #26／
離線契約 #75）、#44（暫停/timeout，M1 唯一舊 open 項）、**#127（後端沒驗 tournamentId 擁有權，真 auth 後補）**。
#120 純 UI、依賴 #119，暫不排期。**M1 現在只剩 #119＋#44**（兩張都已在 Project 的 Todo 欄）。
（#118/#115/#41/#50 本週關閉；#20/#63/#74 先前已關閉。）
進階版差異化（M4）：#51 動作子分類、#21 球線座標、#99 站位快照——同屬 advanced tier，可一起設計。

## Recently closed (past ~week)

- **#118** — 名單編輯新增球員的同人兩套 id（07-15 收尾，前端半段）。`diffRoster` 送出前端鑄的 uuid
  ＋`RotationTable` 的名單回寫改 await＋失敗 toast。schema 半段是 PR #124；I3「一個實體一套 id
  只鑄造一次」到此在名單這條路徑上成立。「全域 store 去汙染」家族只剩 #119。
- **PR #129**（無對應 issue）— 首頁深色改版＋`docs/design-spec.md`（commit `bef0e14`）。**夥伴
  @tangyi1025 的第一個 PR**。review 四點未處理即合併→已由 **#132** 接住；其他頁面跟上→**#131**。
- **PR #135** — 戰術板深色改版（issue #131 完成，commit `0d63ee3`）。見上方 `_Last updated_`。
- **#117** — 資料夾（tournaments）進 DB：uuid PK + cascade FK（PR #128，commit 241a7eb）。`tournaments`
  表 client-mintable uuid PK、`matches.tournamentId` text→uuid FK `onDelete: cascade`（刪資料夾＝連同
  比賽刪，PO 拍板下沉到 DB）；前端 `useTournaments` 從 Zustand+persist 改成 API adapter。#122 的孤兒
  fallback 一併拆除（cascade 保證孤兒結構上不可能）。留下 #127（tournamentId 擁有權未驗）。
- **#115** — 計分表擁有自己逐局的先發快照，與戰術板/輪轉表全域 store 解耦（PR #121，commit ce5c9f5）。
  這是「全域 store 去汙染」家族第一條落地；暴露的同根因兄弟 #117/#118/#119 見上方焦點與 #117 錨點留言。
- **#41** — 計分表復原改**逐動作 undo**（PR #113，commit a21afce，另一 session 完成、wrap-up 對帳關閉）：
  動作快照堆疊（每動作前存 currentSet/regularSubs/liberoSubstitution 快照，undo pop 還原），得分/換人/
  libero 各為一步連按往回；後端加 `DELETE /substitutions/:id` hard-delete 撤銷已寫入的換人。堆疊純記憶體
  不跨 reload（undo 定位＝即時改錯）。64 tests 全綠。
- **#50** — 計分表動作選單情境過濾（規則面窮舉完畢，commit 33a21c3）：規則#1（發球/接發互斥）改
  「反灰不刪」（六顆固定方位、不合理的灰掉不能點，肌肉記憶/節奏遊戲；RadialMenu 加 disabled 支援，
  `excludedAction`→`disabledActions`）。評估過「多知道得/失分後得分時再多反灰」的 C8 構想，依 Data Volley
  記錄慣例作廢（防守/舉球得分各記自己、接發得分是進階版 Freeball）——`serving`＋`actorSide` 只養得起規則#1
  一條。完整設計/DV 慣例對帳記錄在 #50 留言。
- **#74** — 記錄成本預算「落地」：設計定案（`docs/recording-cost-budget.md`）後把分層歸屬回灌
  #50/#51/#21（#20 早已關），本 session 關閉。
- **#63 / #20** — 計分表 M1 bug 收尾（PR #109，commit 8201b2d）：#63 未開球空局 reload 退回上一局
  （`sets.firstServer` 改 nullable ＋空局防呆）；#20「結束比賽」鈕（導向 analytics）＋換人上限 X/6 提示。
- **#73** — 事件文法領域模型。設計 T1（PR #92）＋對帳收束（PR #105）；缺口對帳結論見上方 Current state。
- **#102** — `people`＋`teams` 身分/球隊 schema 地基（PR #104）。刻意留給 #65 後面階段：openapi/codegen、
  前端讀寫、建名單去重 UX、舊資料回填。
- **#42** — 計分表換人不持久化（PR #98）：`substitutions` 後端 REST ＋ 前端搬進 store 走「本地即時＋背景
  POST＋進頁重建」。libero 持久化留 #43、undo 留 #41。
- **#93** — `lineups` 起始先發表（PR #94）。
