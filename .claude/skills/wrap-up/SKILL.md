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

3. **Propose, don't execute blindly.** Creating/closing GitHub issues is a visible,
   shared-state action (per this project's general safety rules) — always show the user
   a short proposed list first:

   ```
   Close:
     #12 "..." — looks finished by commit abc123 (does X)
   Update:
     #42 "..." — body now stale: <what changed> → <what to fix>
   Create:
     "..." — surfaced this session: <one-line reason>
   ```

   Wait for explicit confirmation (or edits) before running any `gh issue close` /
   `gh issue edit` / `gh issue create` command. Don't ask about read-only commands like
   `gh issue list`.

4. **Execute the confirmed changes.**
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

5. **Sync the roadmap (Milestones + GitHub Project).** The time-ordered roadmap
   lives in two GitHub structures with distinct jobs — each fact has exactly one
   home（single source of truth）:
   - **Milestones M1–M5 = 階段（時間序）**. Every open issue should carry exactly
     one — assign new issues from step 4 in the same pass. Milestones carry **soft
     due dates** that feed the Roadmap view's timeline, not deadlines; if reality
     has drifted noticeably, propose adjusted dates (PO confirms).
   - **Project "Volley Tactics Board" = 當下狀態**（Status:
     Backlog/Todo/In Progress/Blocked/Done）。Workflows auto-add new issues and
     move closed ones to Done; what needs manual care is **Todo** — keep it to the
     current milestone's next 3–5 items, no more. That discipline is the whole
     point of the Backlog/Todo split.
   - Re-scoping the roadmap (moving an issue between milestones, splitting/adding a
     phase) is a PO decision — put it in step 3's proposal list, don't settle it
     unilaterally.
   - Exact milestone names, due dates, stable CLI ids, and the `gh` commands for
     all of the above live in [reference.md](reference.md) — read it when actually
     executing this step, not before.

6. **Refresh `docs/PROGRESS.md` — it is a rolling ~1-week snapshot, not a log.** The
   single most common failure mode here is letting it grow into an append-only session
   history (it hit 580 lines that way before being reset on 2026-07-11). Keep it lean:
   - **Overwrite, don't append.** Rewrite "Current state" to describe where the project
     _actually stands now_ (durable current facts), not "what I did this session" stacked
     on top of last session's "what I did". One `_Last updated_` line only — no `_Prev_`
     chain.
   - **Prune anything older than roughly a week.** "Recently closed" keeps only the past
     ~week's closes; drop older ones (their record lives in the closed issues + git log).
     Same for stale "Current state" bullets that no longer describe the present.
   - **Before deleting an old entry, confirm it has a durable home** — git log, the
     issue's comments, a `docs/*-spec.md`, `CLAUDE.md`, or auto-memory. If it's a **major
     fact/decision/lesson that lives _only_ here** (an orphan), promote it to the right
     home _first_ (usually an auto-memory file for lessons/product judgments, or the
     relevant issue/spec for design decisions), _then_ delete it from PROGRESS. Never drop
     an orphan on the floor.
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

7. **Refresh `docs/flow-diagrams.html` if the interaction flows changed this session.**
   This is the 輪轉表/戰術板/計分表 operation-flow + state-machine reference (originally
   built as a Claude Artifact, copied into the repo on 2026-07-03 so it survives offline
   instead of living only at a claude.ai URL). Same "snapshot, not changelog" rule as
   `docs/PROGRESS.md`: if the file has a "recent changes" note, **overwrite it with only
   what changed since the last wrap-up** — don't accumulate a growing per-session log
   inside it. If nothing about the flows/screens/state machines changed this session,
   leave the file untouched.

8. **Remind, don't act.** If there are still uncommitted changes after all this, remind
   the user to commit — don't commit on their behalf unless they ask.

## What NOT to do

- Don't treat this as a git hook that runs silently on every commit — it's a deliberate,
  user-invoked (or user-confirmed) end-of-session step, because it involves shared-state
  GitHub actions that need a human okay.
- Don't re-derive the whole codebase map from scratch — that's exactly the cost this
  skill (plus `catch-up`) is meant to eliminate.
