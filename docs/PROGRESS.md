# Progress Snapshot

> This is a **live snapshot**, not a log — the `wrap-up` skill overwrites the "Current
> state" section at the end of each work session, it doesn't append to it. For the
> permanent history of _why_ things changed, that's what `git log` and commit messages
> are for. For static repo layout/commands, see `CLAUDE.md`. For the backlog of
> planned-but-not-done work, see GitHub Issues (`gh issue list`), not this file.
>
> Read this file, plus `gh issue list --state open` and recent `git log`, at the start
> of a new session instead of re-exploring the whole codebase from scratch.

_Last updated: 2026-07-01 (skeleton + initial GitHub Issues migration, not yet through a
real `wrap-up` run)_

## Current state

- Frontend (`artifacts/volleyball-tactics`) has a working tactics board: drag-and-drop
  player placement onto 6 court zones, rotation auto-calculation, libero substitution
  tracking, layout-mode-gated drawing tools (arrows/lines/attack-line/text/volleyball +
  defense-range shapes), and a match-recording page with a split-panel result view
  (`MatchResult.tsx`).
- Tactics are now persisted via PostgreSQL through the REST API (see commit `096a19f`),
  replacing the old localStorage-only storage. Full tactic management already works:
  `activeProjectId` tracks which tactic is currently open, "save" overwrites it while
  "save as" always creates a new one, plus rename and delete — this was previously
  tracked as a gap but is done (see `RightPanel.tsx`).
- Backend (`artifacts/api-server`) only has `/healthz` — the match-recording API routes
  described in `docs/api-spec.md` are not implemented yet, and the frontend doesn't call
  them yet either.
- There is uncommitted work in progress on this branch (`feature/tactics-db-storage`)
  touching `Court.tsx`, `LeftPanel.tsx`, `PlayerNode.tsx`, `RightPanel.tsx`,
  `useTactics.ts`, `types/tactics.ts`, `vite.config.ts` — not yet reflected in this
  snapshot since it hasn't gone through a `wrap-up` run.

## Known gaps / next big pieces

Tracked in GitHub Issues (open backlog, check `gh issue list --state open` for current
status — the list below is a snapshot, not guaranteed up to date):

- [#10](https://github.com/aila8913/volley-tatic-board/issues/10) — narrowed down (was
  originally written before commit `096a19f` and turned out mostly stale/already done,
  see issue history): only remaining piece is making tactics reusable across matches,
  since `PlayerPosition.playerId` is tied to one match's roster. Needs a role-based
  storage design. Labeled `needs-plan`.
- #11 — closed: the "new project wipes all tactics" bug no longer applies post-DB-
  migration; `newProject()` is a plain Zustand reset now, doesn't touch localStorage.
- [#12](https://github.com/aila8913/volley-tatic-board/issues/12) — brush-tool
  requirements unclear (freehand drawing vs. adjustable stroke/color on existing marker
  tools), needs clarification with the user.
- [#13](https://github.com/aila8913/volley-tatic-board/issues/13) — base rotation setup
  (left-panel feature): design confirmed, a couple of implementation details still
  open. The current uncommitted diff on this branch looks like active work on this.
- Backend match-recording API routes (`docs/api-spec.md`) still unimplemented; frontend
  doesn't call them yet either.

`docs/tactics-board-todo.md` has been migrated: its "已完成" sections stay as historical
design-rationale notes (why things were built the way they were), its former "還沒做的事"
section now just points at the issues above.

## Recently closed

- #11 — "new project" localStorage-wipe bug, already fixed by the DB-storage migration
  before the issue was even filed (the issue itself was based on a stale doc).
