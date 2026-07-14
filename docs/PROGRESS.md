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

_Last updated: 2026-07-14 — schema 換季第一刀落地：**players.id serial→uuid**（#118 的 schema 部分，
commit `5741452`，branch `schema/players-id-uuid`，**PR 待開/待 merge**）。連動 events/lineups/
substitutions 三張 FK 表改 uuid、openapi→codegen 重生、後端 players POST 收 body.id、順帶簡化 mapping
層多餘的 Number/String 轉換；typecheck/lint/76 tests 全綠。dev DB 已 **drop 重建**成 uuid schema
（int→uuid 不能原地 ALTER，只能 drop——用一次性腳本 `DROP…CASCADE` 後 `drizzle push`）。後端目前只是
「有能力」收前端鑄造 id、行為不變；前端實際送 uuid ＋ handleRosterSave 改 await 是 #118 後續 PR。
**兩條 branch 待送 PR**：本 branch（players uuid）＋ `docs/openvolley-external-reference`（70cf591，
openvolley 外部參考 docs，上 session 遺留、尚未開 PR）。三條不變量提醒：I1 單一真相來源、I2 per-match
狀態用 matchId 當 key、I3 一個實體一套 id 只鑄造一次（完整＝ #117 錨點留言）。_

## Current state

Where the project actually stands right now (durable "current" facts; per-session detail
lives in git log + the issues named):

- **Backend match-recording API is fully implemented and live (dev DB).** matches / players /
  sets / rallies / events / substitutions CRUD + tactics/health, ownership-scoped. The
  frontend scoresheet is **fully off localStorage** (matches, scores/rotation, events
  read-back → per-player stats). Design + phased history in `docs/backend-architecture.md`;
  #58 closed.
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

## Known gaps / next big pieces

Backlog lives in **GitHub Issues, phase-ordered via Milestones M1–M5** — this file no longer
duplicates it. Current phase = lowest-numbered milestone with open issues:

```
gh issue list --milestone "M1 簡易版收尾"   # 當前階段
gh issue list --state open                   # 全部
```

M1 收尾焦點：**全域 store 去汙染家族 #117/#118/#119**（#115 已修先發那條、CLOSED；同根因仍在別處——
見 #117 錨點留言的三條不變量與落地順序）。順序＝(1) ✅ #117-最小止血（#122 已 merge）；
(2) schema 換季（趁部署前可丟資料窗口）三刀，可拆 PR：**✅ players.id→uuid（#118 離線版，commit
`5741452`，PR 待開/待 merge）**／⬜ tournaments 表 uuid PK+cascade+API（#117 完整，照 `useMatches.ts`
模板）／⬜ tactics 加 matchId（#119 前置）；(3) #118 前端 await ＋實際送鑄造 uuid；(4) #119 兩 store
byMatch 分片+去 persist；(5) #120 純展示唯讀站位視圖。另 #64（背景寫入失敗不 reconcile，關聯部署 #26／
離線契約 #75）、#44（暫停/timeout，M1 唯一舊 open 項）。#120 純 UI、依賴 #119，暫不排期。（#115/#41/#50
本週關閉；#20/#63/#74 先前已關閉。）
進階版差異化（M4）：#51 動作子分類、#21 球線座標、#99 站位快照——同屬 advanced tier，可一起設計。

## Recently closed (past ~week)

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
- **#58** — 後端 Phase 3：計分表脫離 localStorage（3a matches+名單／3b-i 比分輪轉／3b-ii events 讀回，
  PR #60/#62/#66）。跨場統計拆到 #65。
- **#93** — `lineups` 起始先發表（PR #94）。#43 — libero 後排規則收斂到共用 `isBackRowPosition`（PR #67）。
