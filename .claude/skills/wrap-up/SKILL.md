---
name: wrap-up
description: >
  Use when the user is ending a work session on this project and wants to close things
  out properly — trigger phrases include "收工", "今天先做到這", "結束工作", "wrap up",
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

5. **Refresh `docs/PROGRESS.md`.** Overwrite (don't append to) the "Current state" and
   "Known gaps / next big pieces" sections to reflect reality after this session,
   referencing issue numbers instead of re-explaining their full detail. Update the
   "Recently closed" section with what was just closed. Update the "Last updated" date.

6. **Refresh `docs/flow-diagrams.html` if the interaction flows changed this session.**
   This is the 輪轉表/戰術板/計分表 operation-flow + state-machine reference (originally
   built as a Claude Artifact, copied into the repo on 2026-07-03 so it survives offline
   instead of living only at a claude.ai URL). Same "snapshot, not changelog" rule as
   `docs/PROGRESS.md`: if the file has a "recent changes" note, **overwrite it with only
   what changed since the last wrap-up** — don't accumulate a growing per-session log
   inside it. If nothing about the flows/screens/state machines changed this session,
   leave the file untouched.

7. **Remind, don't act.** If there are still uncommitted changes after all this, remind
   the user to commit — don't commit on their behalf unless they ask.

## What NOT to do

- Don't treat this as a git hook that runs silently on every commit — it's a deliberate,
  user-invoked (or user-confirmed) end-of-session step, because it involves shared-state
  GitHub actions that need a human okay.
- Don't re-derive the whole codebase map from scratch — that's exactly the cost this
  skill (plus `catch-up`) is meant to eliminate.
