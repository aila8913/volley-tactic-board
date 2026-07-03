# Progress Snapshot

> This is a **live snapshot**, not a log — the `wrap-up` skill overwrites the "Current
> state" section at the end of each work session, it doesn't append to it. For the
> permanent history of _why_ things changed, that's what `git log` and commit messages
> are for. For static repo layout/commands, see `CLAUDE.md`. For the backlog of
> planned-but-not-done work, see GitHub Issues (`gh issue list`), not this file.
>
> Read this file, plus `gh issue list --state open` and recent `git log`, at the start
> of a new session instead of re-exploring the whole codebase from scratch.

_Last updated: 2026-07-03 (session: added onboarding docs for an incoming
frontend/UI-UX teammate — root `README.md`, `docs/onboarding.md`, plus linking them up
with the `CONTRIBUTING.md` another session had just written; see below)_

## Current state

- On `main`, latest commit `af228db` (PR #33). Working tree clean.
- **New human-facing onboarding docs exist** (PR #33), written for a teammate who is new
  to programming/Git/GitHub/AI-agent collaboration (design/PM background):
  - Root [`README.md`](../README.md) — project one-liner, points first to
    `docs/flow-diagrams.html` for a fast mental model before reading code, tech-stack
    table, quick-start commands, repo layout guide (what's editable vs. generated), and
    links out to the other two docs.
  - [`docs/onboarding.md`](./onboarding.md) — zero-background primer on what Git/GitHub/
    an AI agent (Claude Code) actually are, an environment-install checklist, and what
    `CLAUDE.md` plus the `catch-up`/`ship`/`wrap-up` skills do. Links out to
    `CONTRIBUTING.md` for the concrete commit/PR/label mechanics rather than duplicating
    them.
  - `CONTRIBUTING.md` (created by another session alongside the new issue-label
    taxonomy) had its opening section reworked this session to point at `README.md`'s
    quick-start instead of `CLAUDE.md` (which only lists env-var names, not runnable
    commands), and `.claude/skills/wrap-up/SKILL.md`'s label-creation instructions were
    updated to reference `CONTRIBUTING.md`'s taxonomy instead of a one-off `needs-plan`
    snippet, so the label rules live in one place.
- Also landed since the last real update to this file: PR #31 (offline
  `docs/flow-diagrams.html`, already reflected below) and PR #32 (fixed the `ship` skill
  to branch _before_ committing, avoiding local/`origin` `main` divergence after
  squash-merge).
- **The former single "tactics board" is now three independently-named features**, both
  in conversation and in code (PR #28):
  - **輪轉表 (rotation table)** — `components/RotationTable.tsx` (was `LeftPanel.tsx`) +
    `hooks/useRotationTable.ts` (was part of `useTactics.ts`). Owns `roster`, per-rotation
    `positions`/`liberoReplacement`, `currentRotation`, `startingLiberoId`, `circleLabel`.
  - **戰術板 (tactics board)** — `components/TacticsBoardPanel.tsx` (was `RightPanel.tsx`)
    - `hooks/useTacticsBoard.ts`. Owns `tacticsByRotation` (markers/defense
      ranges/tactics-view positions), tool state, undo/redo, project save/load.
  - **計分表 (scoresheet)** — `pages/ScoreSheet.tsx` (was `MatchRecording.tsx`) +
    `hooks/useScoreSheet.ts` (was `useRecording.ts`), plus renamed
    `ScoreSheetCourt.tsx`/`ScoreSheetStats.tsx`. `liberoSubstitution` moved from the
    shared tactics store into `ScoreSheetState`, keyed per matchId (previously a single
    global value that would leak across different matches' scoresheets — fixed as part
    of the split).
  - `pages/TacticsBoard.tsx` still hosts 輪轉表 (left) + `Court.tsx` (center) + 戰術板
    (right) **simultaneously side by side** — a same-day attempt to make them a
    page-flip (only one mounted at a time) was tried and reverted; the user wants both
    always visible.
- **Tactics-board editing is now a one-time snapshot, not a live view of rotation-table
  data** (same-day follow-up after the split, PR #30):
  - Clicking "戰術布置" calls `useTacticsBoard.enterTacticsLayout()`, which copies
    `useRotationTable`'s current-rotation positions into `tacticPositions` once, then
    editing is fully independent — nothing written in 戰術布置 flows back to
    `useRotationTable` anymore, including the libero (no more back-row-only rule or
    `startingLiberoId` sync while in tactics view; it's just a plain marker there now).
    Every click on "戰術布置" re-snapshots and overwrites whatever was there — there is
    no "resume"; to keep edits, save as a tactic and reload it.
  - A separate "編輯" button (disabled until a saved tactic is loaded from the list)
    resumes editing the _currently loaded_ data as-is, without re-snapshotting — this is
    the path for editing a previously-saved tactic.
  - Removing a player branches by which view is active: rotation view still calls
    `useRotationTable.removePlayerFromCourt`; tactics view now calls
    `useTacticsBoard.removePlayerFromTacticView` (local to the current snapshot only).
    The old cross-store cleanup action was removed as unnecessary.
  - Layout-mode footer is now **取消 / 儲存 / 另存新檔** (cancel discards without
    saving and returns to rotation view; "＋新建空白戰術" was removed entirely, along
    with the now-dead `newProject` action).
  - **Fixed a real bug found while testing this**: `Markers.tsx` (arrows/dashed
    lines/attack lines/text/volleyball icons) had no drag-to-move logic at all — only
    click-to-select — unlike `DefenseRange.tsx` which already supported dragging. Added
    the same pointer-capture drag pattern to all marker types.
- **Operation-flow / state-machine reference docs exist for all three features** plus a
  page-transition overview, saved as a self-contained offline file at
  `docs/flow-diagrams.html` (open directly in a browser, no dev server needed) — closes
  #27. Keep this updated per the `wrap-up` skill's step for it (overwrite the "recent
  changes" callout each session, don't accumulate one).
- New UI bugs found while manually testing this session's changes are tracked in
  [#29](https://github.com/aila8913/volley-tatic-board/issues/29) (not fixed yet):
  court bottom boundary line too thin in tactics view; question of why libero defaults
  to the bench slot; "重置站位" has no confirmation/undo; "← 比賽列表" should be
  available on every screen.
- Backend (`artifacts/api-server`) and its tactics-save/load flow are unchanged this
  session. Match-recording API routes (`docs/api-spec.md`) are still unimplemented.

## Known gaps / next big pieces

Tracked in GitHub Issues (open backlog, check `gh issue list --state open` for current
status — the list below is a snapshot, not guaranteed up to date):

- [#17](https://github.com/aila8913/volley-tatic-board/issues/17) — UX 重整：視圖控制
  流程、輪次選擇改成純數字按鈕、頁首漢堡選單。**Note:** this session's work went the
  opposite direction on part of this — it kept (and even cross-store-wired) the
  "重置站位"/"清除畫筆" buttons that #17 wanted removed, and `RotationThumbnails.tsx`
  still shows visual dot-thumbnails rather than plain numbers. Not a deliberate rejection
  of #17, just unrelated work — worth reconciling before implementing #17.
- [#18](https://github.com/aila8913/volley-tatic-board/issues/18) — 備位自由球員在球場
  上要有明確的淺紅色外框標示區。Still just a plain orange circle, no dedicated frame.
  Also now only ever shown in rotation view (tactics view dropped it entirely as part of
  the snapshot decoupling, since it's a rotation-table-only concept).
- [#19](https://github.com/aila8913/volley-tatic-board/issues/19) — 計分表（
  `pages/ScoreSheet.tsx`, issue body still says `MatchRecording.tsx`) UI 簡化與調整,
  placeholder issue depending on #20/#21.
- [#20](https://github.com/aila8913/volley-tatic-board/issues/20) — 計分表多項 Bug 與
  功能補齊. Bug 2 (場外換人入口) confirmed already resolved by earlier work (see
  comment on the issue); Bug 1/3 + sub-count-limit UI still open.
- [#21](https://github.com/aila8913/volley-tatic-board/issues/21) — 球線軌跡記錄. The
  issue's "current state" description was stale (described click-to-menu, but the app
  already uses a drag-line gesture) — corrected via comment. Core ask (recording the
  actual trajectory as analyzable data, not just resolving a hit target) still open.
- [#22](https://github.com/aila8913/volley-tatic-board/issues/22) — 動作分類擴充與重新
  設計（攻擊/防守/發球/犯規）。
- [#24](https://github.com/aila8913/volley-tatic-board/issues/24) — 複製比賽。
- [#25](https://github.com/aila8913/volley-tatic-board/issues/25) — 先發/先接切換。
- [#26](https://github.com/aila8913/volley-tatic-board/issues/26) — 部署準備。
- [#29](https://github.com/aila8913/volley-tatic-board/issues/29) — 這個 session 手動
  測試戰術布置時發現的 4 個小問題（見上方 Current state），還沒修。
- Backend match-recording API routes (`docs/api-spec.md`) still unimplemented; frontend
  doesn't call them yet either.

## Recently closed

- #27 — 輪轉表/戰術板/計分表操作流程圖 + 狀態機圖 + 頁面跳轉大圖，存成
  `docs/flow-diagrams.html`。
- #14 — libero substitution bug + 先發 UX unification, fully fixed in PR #23 (commit
  `5dcc4ed`); PR #16 had only partially fixed it (rotation view only), see the
  clarifying comment added on the issue.
- #10 — decided not to implement cross-match tactic reuse for now; single-match scope is
  enough, can reopen later if needed.
- #12 — brush-tool requirements resolved into #17 (UX overhaul) instead; no standalone
  brush feature planned.
- #13 — base rotation setup now just uses drag-to-grid (existing implementation); the
  separate left-panel 3×2 grid idea was dropped.
- #15 — `/ship` skill (git commit → branch → push → PR → merge flow) written and in use.
