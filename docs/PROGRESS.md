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

_Last updated: 2026-07-11 — 給 Claude 看的 doc 治理：PROGRESS 從 580 行瘦身為近一週 rolling
snapshot（並在 wrap-up skill step 6 寫死「覆蓋不疊加／砍一週以上／孤兒先升級進 memory」防再膨脹）；
校正三份對現況說謊的 schema/API doc（`db-schema-spec`/`api-spec`/`backend-architecture` 漏了
lineups/substitutions/people/teams、且宣稱後端未實作）。純 docs，無程式碼變更。前一段：建立專案
roadmap（Milestones M1–M5 ＋ Project #4，見下方 Current state）。_

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
- **記錄成本預算（#74）設計定案**（`docs/recording-cost-budget.md`）：簡易/進階是懸崖式硬分界——
  簡易版一分打完後在死球空檔記**恰好一筆決定球**＋排先發＋換人/暫停＋「沒看到」escape valve；
  任何 per-touch／座標／到位分／子分類全歸進階版（賽後影片補填）。PO 拍板嚴守此界、不開 simple+。
- **事件文法（#73）＝統計權威依據**（`docs/event-grammar-spec.md`）：每個統計 = events/rallies/sets
  欄位的純函數。對帳確認「必須早補」的結構缺口已全數落地；剩餘缺口都是故意延到進階版的欄位
  （#51/#21/#44）或教練待確認項（到位門檻 `quality>=2`、嗆司定義，皆有預設在跑、不擋實作）。

## Known gaps / next big pieces

Backlog lives in **GitHub Issues, phase-ordered via Milestones M1–M5** — this file no longer
duplicates it. Current phase = lowest-numbered milestone with open issues:

```
gh issue list --milestone "M1 簡易版收尾"   # 當前階段
gh issue list --state open                   # 全部
```

M1 收尾焦點：#20（計分表 Bug＋子分類數上限 UI）、#41（換人 undo）、#50（動作選項依發球方情境限制）、
#63/#64（3b-i 離線 edge case／背景寫入失敗不 reconcile，關聯部署 #26）、#74 落地回灌。
進階版差異化（M4）：#51 動作子分類、#21 球線座標、#99 站位快照——同屬 advanced tier，可一起設計。

## Recently closed (past ~week)

- **#73** — 事件文法領域模型。設計 T1（PR #92）＋對帳收束（PR #105）；缺口對帳結論見上方 Current state。
- **#102** — `people`＋`teams` 身分/球隊 schema 地基（PR #104）。刻意留給 #65 後面階段：openapi/codegen、
  前端讀寫、建名單去重 UX、舊資料回填。
- **#42** — 計分表換人不持久化（PR #98）：`substitutions` 後端 REST ＋ 前端搬進 store 走「本地即時＋背景
  POST＋進頁重建」。libero 持久化留 #43、undo 留 #41。
- **#58** — 後端 Phase 3：計分表脫離 localStorage（3a matches+名單／3b-i 比分輪轉／3b-ii events 讀回，
  PR #60/#62/#66）。跨場統計拆到 #65。
- **#93** — `lineups` 起始先發表（PR #94）。#43 — libero 後排規則收斂到共用 `isBackRowPosition`（PR #67）。
- **#81 / #82** — lint/format 存量清理＋納入 CI（PR #83/#84/#85）／branch protection（squash-only、test 必綠、
  合併自動刪分支）。
- **#35 / #36 / #37 / #38 / #45** — 輪轉表/計分表一輪 bug 收尾（PR #69/#71）：幽靈站位、移除球員邏輯、
  先發完整度收斂、砍掉匯出6輪PNG、下一局勝負判斷。**#25** — 先發/先接切換，討論後決定不做。
