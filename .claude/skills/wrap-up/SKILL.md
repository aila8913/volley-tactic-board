---
name: wrap-up
description: >
  Use when the user is ending a work session on this project and wants to close things
  out properly — trigger phrases include "收工", "今天先做到這", "wrap up",
  "before I stop for today", "commit 前幫我整理一下", "幫我更新進度", or right after the
  user has just asked for a commit and seems to be finishing up. Syncs GitHub Issues
  with what actually got done/discovered this session and refreshes docs/PROGRESS.md.
---

# Wrap up a work session

Goal: leave the repo in a state where a _future session_ (possibly a fresh Claude Code
instance with no memory of this conversation) can understand where things stand by
reading `docs/PROGRESS.md` + `gh issue list` + recent `git log`, without needing to
re-explore the whole codebase.

This project uses **GitHub Issues as the TODO ledger** (not a hand-maintained TODO.md)
and `docs/PROGRESS.md` as a living "current state" snapshot (see that file's own header
comment for the distinction). Don't duplicate full TODO detail into both places — issues
own the backlog, PROGRESS.md owns a short narrative snapshot that points at issue
numbers.

## 事實住哪裡（每種事實只有一個家）

PROGRESS.md 是**唯一每次 wrap-up 都保證會被寫**的檔案，所以它是預設的沉澱處——沒有這張表的話，
所有東西都會倒進去，然後因為「孤兒不能丟」（步驟 7）而再也刪不掉。它在 2026-07-11 被重置過一次
（580 行），2026-08-11 又長到 830 行，兩次都是同一個原因：**剪下來沒有地方放**。

| 事實的種類                     | 家                       | 特徵                                             |
| ------------------------------ | ------------------------ | ------------------------------------------------ |
| 架構決策，且不希望被改回去     | `docs/adr/`              | 有「不要重新提議」清單；不可刪改，只能 supersede |
| 產品定位、做／不做的邊界       | `docs/product-vision.md` | 是產品判斷不是技術判斷                           |
| 官方用詞、同義詞禁用           | `CONTEXT.md`             | 只有詞彙，沒有實作與狀態                         |
| 單張票的來龍去脈、被否決的備案 | 該 issue 的 body／留言   | 範圍不超出那張票                                 |
| 開發環境約定、指令、已知落差   | `CLAUDE.md`              | 下一個 session 一開始就需要知道                  |
| 跨專案的教訓、PO 的偏好        | auto-memory              | 換一個 repo 還是成立                             |
| **現況快照**                   | `docs/PROGRESS.md`       | **預期會被刪**——一週後就該不見                   |

判斷法：**問「這件事一週後還該留著嗎」。** 該留 → 它的家不是 PROGRESS，先送過去再寫快照。

## Steps

1. **Gather what happened this session.**
   - `git status --short` for uncommitted changes.
   - `git log --oneline -15` (or since the last commit mentioned in PROGRESS.md's "Last
     updated" line, if that's more precise) for what actually landed.
   - Recall from the conversation itself: any TODOs, gaps, or "we should do X later"
     comments that came up but aren't in code yet — these won't show up in git diffs.

2. **Check the current backlog.** Run `gh issue list --state open --limit 100`. Cross-
   reference against what happened this session:
   - Work that this session's commits/diff appear to **finish** → candidate to close.
   - **Issues opened by the other team member** (two-person team — see the 分工表 in
     CONTRIBUTING.md「協作與溝通」): don't close these unilaterally unless this session's
     PR literally completed them via `Closes #n`. Otherwise propose a comment that
     @-mentions the opener asking them to confirm/close, and leave the issue open. Every
     close must carry a comment explaining what resolved it (commit/PR) or why it's not
     planned — a silent manual close is the failure mode this rule exists to prevent.
   - **Design decisions that changed or were abandoned this session** → close the
     affected issue immediately with a one-line reason (e.g. "decided not to implement",
     "replaced by #NN", "design changed to X"). Don't leave stale open issues that no
     longer reflect intent — they waste time in future sessions when you have to re-judge
     whether they're still valid.
   - New gaps/ideas surfaced this session that aren't already tracked → candidate to
     create as new issues.
   - **Stale but still-valid issues → candidate to _update_ (not close).** An issue can
     stay open and correct in intent while its _body_ goes out of date because this
     session changed the surrounding reality. Check every open issue this session touched
     the neighbourhood of: does its problem statement, "相關程式碼" line refs, or
     assumptions still match the code? Typical triggers: a prerequisite got built (so the
     blocker described in the body is gone), a referenced file/function was renamed or
     moved, or the body explains the mechanism using something that no longer exists.
     Don't rewrite issues wholesale for style — only when a future reader would be
     _misled_ by the current text.
   - If `docs/tactics-board-todo.md` (or any other legacy TODO doc) still has unmigrated
     items relevant to this session's work, flag that migrating them to issues is still
     pending — don't silently let them rot.
   - **Before writing an issue body from a legacy doc, verify its claims against the
     actual current code** — grep for the function/field the doc says doesn't exist yet.
     Docs describing "not implemented" work can go stale the moment a later commit
     implements it without updating the doc. Read the code, not just the doc, before
     filing.

3. **Check whether this session produced an ADR.** Ask the two questions from
   [`docs/adr/README.md`](../../../docs/adr/README.md) 的「什麼時候寫」, verbatim:
   - 這個 session 有沒有**一個提議被否決**，而理由是未來的人需要知道的？
   - 有沒有一個決定經歷過**決定 → 推翻 → 重新決定**？

   大多數 session 的答案是「沒有」——**答「沒有」是正常結果，不要為了填欄位硬湊一張**。
   ADR 的門檻是「未來的人看到程式碼會很自然想改回去」，不是「這個決定很重要」。
   只有**架構／實作**決策進 `docs/adr/`；產品定位進 `product-vision.md`、詞彙進 `CONTEXT.md`
   （見上面的對照表）。還沒拍板的討論留在 issue，ADR 只收結論。

   這一步之所以存在：README 說「不要事後補一批，當下就寫」，但「當下」不是一個會發生的時刻——
   wrap-up 是唯一每次都會跑的檢查點。少了這一步，`docs/adr/` 從流程上走不到
   （2026-08-11 盤點：三張 ADR 全是順手寫的，沒有一張是流程要求的，而同期至少一條符合判準的
   決策——「部署刻意不含 `drizzle-kit push`」——只住在 PROGRESS 裡）。

4. **Propose, don't execute blindly.** Creating/closing GitHub issues is a visible,
   shared-state action (per this project's general safety rules) — always show the user
   a short proposed list first:

   ```
   Close:
     #12 "..." — looks finished by commit abc123 (does X)
   Update:
     #42 "..." — body now stale: <what changed> → <what to fix>
   Create:
     "..." — surfaced this session: <one-line reason>
   ADR:
     "..." — <which of the two triggers it hit>；沒有就寫「無」
   ```

   Wait for explicit confirmation (or edits) before running any `gh issue close` /
   `gh issue edit` / `gh issue create` command. Don't ask about read-only commands like
   `gh issue list`.

5. **Execute the confirmed changes.**
   - Close: `gh issue close <n> --comment "Resolved by <commit-hash-or-summary>"`
   - Update a stale body: `gh issue edit <n> --body-file <file>` (write the corrected body
     to a temp file first — multi-line bodies are error-prone inline). Fix only the parts
     that went stale; keep the rest. Add/adjust labels in the same call when the update
     changes scope (e.g. `--add-label needs-plan` once a prerequisite turns it into a
     design decision).
   - Create: `gh issue create --title "..." --body "..."` — write bodies with enough
     context that a future session (or future you) understands _why_, not just _what_.
     Apply labels per the taxonomy in [CONTRIBUTING.md](../../../CONTRIBUTING.md) — type
     - area, plus `needs-plan` for large-scope items that need design discussion before
       implementation (this project's convention, see existing entries in
       `docs/tactics-board-todo.md` that say "範圍很大，先進 Plan 模式") and `priority:*`
       only when genuinely urgent/essential, not by default.

6. **Sync the roadmap (Milestones + GitHub Project).** The time-ordered roadmap
   lives in two GitHub structures with distinct jobs — each fact has exactly one
   home（single source of truth）:
   - **Milestones M1–M7 = 階段（時間序）**. Every open issue should carry exactly
     one — assign new issues from step 5 in the same pass. Milestones carry **soft
     due dates** that feed the Roadmap view's timeline, not deadlines; if reality
     has drifted noticeably, propose adjusted dates (PO confirms).
   - **Project "Volley Tactics Board" = 當下狀態**（Status:
     Backlog/Todo/In Progress/Blocked/Done）。Workflows auto-add new issues and
     move closed ones to Done; what needs manual care is **Todo** — keep it to the
     current milestone's next 3–5 items, no more. That discipline is the whole
     point of the Backlog/Todo split.
   - Re-scoping the roadmap (moving an issue between milestones, splitting/adding a
     phase) is a PO decision — put it in step 4's proposal list, don't settle it
     unilaterally.
   - Exact milestone names, due dates, stable CLI ids, and the `gh` commands for
     all of the above live in [reference.md](reference.md) — read it when actually
     executing this step, not before.

7. **Refresh `docs/PROGRESS.md` — it is a rolling ~1-week snapshot, not a log.** The
   single most common failure mode here is letting it grow into an append-only session
   history (it hit 580 lines that way before being reset on 2026-07-11). Keep it lean:
   - **Overwrite, don't append.** Rewrite "Current state" to describe where the project
     _actually stands now_ (durable current facts), not "what I did this session" stacked
     on top of last session's "what I did". One `_Last updated_` line only — no `_Prev_`
     chain.
   - **Prune anything older than roughly a week.** "Recently closed" keeps only the past
     ~week's closes; drop older ones (their record lives in the closed issues + git log).
     Same for stale "Current state" bullets that no longer describe the present.
   - **Before deleting an old entry, confirm it has a durable home** — 對照上面的
     「事實住哪裡」表：git log、issue 留言、`docs/adr/`、`docs/product-vision.md`、
     `CONTEXT.md`、`docs/*-spec.md`、`CLAUDE.md`、auto-memory。If it's a **major
     fact/decision/lesson that lives _only_ here** (an orphan), promote it to the right
     home _first_, _then_ delete it from PROGRESS. Never drop an orphan on the floor.
     **特別注意寫成「刻意不做 X」「別改成 Y」的段落**——那是 ADR 的形狀跑進了快照裡，
     它會讓那則條目永遠刪不掉（因為刪了就沒別的地方有）。這正是 PROGRESS 肥大的機制：
     不是沒在剪，是剪下來沒地方放。先開一張 ADR，快照只留一行指過去。
   - **Don't duplicate the backlog.** "Known gaps" points at `gh issue list` / Milestones
     with a one-line current-phase summary — it does not re-list every open issue's detail.
   - **Keep the owner sub-sections separate (#146).** `Current state` and `Recently closed`
     are each split into **開發進度 (aila)** and **設計進度 (tang)** sub-headings. When you
     wrap up, edit **only your own owner's sub-section** and leave the other's block untouched
     — that's the whole point: parallel wrap-up PRs then land on different line ranges and git
     auto-merges them instead of conflicting. Put a design/UX/`area:design` bullet under
     設計; everything backend/frontend/db/infra/product under 開發. Don't collapse the two
     back into one flat list.
   - Update the `_Last updated_` date/summary line — keep it to **one short line** (date +
     owner + what changed); it's the one shared line both owners touch, so don't let it grow
     back into a multi-paragraph blob.

8. **Don't recreate a "current behaviour" doc.** `docs/flow-diagrams.html` (操作流程＋狀態機
   reference) was **deleted on 2026-07-21** by PO decision, and this step used to say
   "keep it in sync". The distinction that killed it is worth keeping:
   - **Decisional docs** (`docs/*-spec.md`, issue comments) record _why_ a choice was
     made. That reasoning exists nowhere else — worth maintaining.
   - **Derived docs** record _what the code currently does_. The code is always the more
     accurate copy, so these only ever fall behind — and a stale one **actively misleads**
     (#163 was an entire issue spent fixing exactly that: the doc described deleted
     functions, so following it produced a data flow that CI hard-blocks).

   So: when this session changed behaviour, update the **code comments** (this repo
   comments unusually densely on purpose — see CLAUDE.md「Collaboration style」) and the
   relevant issue. Don't start a new file that narrates how the app works.

9. **Remind, don't act.** If there are still uncommitted changes after all this, remind
   the user to commit — don't commit on their behalf unless they ask.

## What NOT to do

- Don't treat this as a git hook that runs silently on every commit — it's a deliberate,
  user-invoked (or user-confirmed) end-of-session step, because it involves shared-state
  GitHub actions that need a human okay.
- Don't re-derive the whole codebase map from scratch — that's exactly the cost this
  skill (plus `catch-up`) is meant to eliminate.
