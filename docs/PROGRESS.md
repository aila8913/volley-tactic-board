# Progress Snapshot

> This is a **live snapshot**, not a log — the `wrap-up` skill overwrites the "Current
> state" section at the end of each work session, it doesn't append to it. For the
> permanent history of _why_ things changed, that's what `git log` and commit messages
> are for. For static repo layout/commands, see `CLAUDE.md`. For the backlog of
> planned-but-not-done work, see GitHub Issues (`gh issue list`), not this file.
>
> Read this file, plus `gh issue list --state open` and recent `git log`, at the start
> of a new session instead of re-exploring the whole codebase from scratch.

_Last updated: 2026-07-05 (session: fixed #49 (tactics-view whiteboard didn't fill the
middle panel) and #18 (libero waiting slot had no dedicated frame) together in
`Court.tsx` — root cause of #49 was a missing background rect for the whiteboard's true
letterboxed extent, not a broken CSS cascade. Opened PR #61; **not merged yet** — #49/#18
should be closed in a future wrap-up once it lands, not now.)_

## Current state

- On `main`, latest commit `7c18743` (PR #60). This session's work sits on branch
  `fix/whiteboard-libero-zone`, PR [#61](https://github.com/aila8913/volley-tatic-board/pull/61)
  (open, not yet merged): `Court.tsx` reworked so the tactics-view whiteboard fills the
  whole middle panel with a fixed 0px panel↔whiteboard gap and a 5px/10px
  whiteboard↔court-element gap instead of tracking the court's own size (#49); the
  libero waiting slot moved from an HTML row below the court into an in-canvas
  dashed-red box behind zone 1 on both baselines, with an empty mirrored placeholder on
  the opponent's baseline for visual symmetry (#18). Also fixed a real bug found during
  testing: dropping a player into that red box was snapping onto court zone 1 via
  `findNearestZone` instead of registering as "set starting libero" — `handleDrop` now
  branches on `rawY > COURT_H` to call `setStartingLiberoId` instead.
- **Match-recording backend is now fully implemented server-side, and the frontend has
  started migrating off localStorage onto it.** See `docs/backend-architecture.md` for
  the full design + phased plan:
  - **Phase 0 (#55, PR #53) — schema/spec alignment, done.** Fixed two openapi↔DB drifts
    that would have made inserts fail (`Match.name`, `Player.number`), added `events.side`
    (home/away, notNull) + made `events.playerId`/coords nullable so simple-tier
    "對手(全體)"/"沒看到" data fits (per `match-recording-erd.html`), made `matches.name`
    nullable + added `matches.userId` for future real auth. Ran codegen + `db push`.
  - **Phase 1 (#56, PR #54) — flat-resource CRUD, done.** `routes/matches.ts` (GET/POST/
    GET:id/PATCH, `userId`-scoped ownership), `routes/players.ts` + `routes/sets.ts`
    (nested under a match, ownership checked via `lib/ownership.ts`'s
    `matchBelongsToUser()`), plus `middleware/errorHandler.ts` (ZodError→400, FK→404/409,
    else→500 — a gap even `tactics.ts` had). Verified end-to-end against the real dev DB
    (happy path + 400/404), then cleaned up the test rows. (Phase 1 originally shipped
    with no `DELETE /matches` "by design" — that gap was closed in Phase 3a below, once
    the frontend turned out to actually need it.)
  - **Phase 2 (#57, PR #59) — nested rallies + events routes, done.** `routes/rallies.ts`
    (GET/POST `/sets/:setId/rallies`) + `routes/events.ts` (GET/POST
    `/rallies/:rallyId/events`, PATCH/DELETE `/events/:eventId`). Ownership now walks up
    the nesting chain via new `lib/ownership.ts` helpers (`setBelongsToUser` →
    `rallyBelongsToUser` → `eventBelongsToUser`, each join-ing one level further up to
    `match.userId`). **Correction to the original plan:** no `db.transaction()` was added
    — the openapi contract has no bulk "rally + N events" endpoint, so every write is a
    single atomic insert with nothing to wrap. A transaction would only be needed if a
    bulk endpoint is later added to `openapi.yaml`. Verified end-to-end against the real
    dev DB (create chain, list/patch/delete, FK cascade, 404/400 paths), test rows cleaned up.
  - **Phase 3a (part of #58, PR #60) — matches + roster off localStorage, done.**
    Backend gap-fill first (frontend UI already had operations Phase 1 skipped): added
    nullable `matches.tournamentId` (frontend folder grouping — backend just stores it as
    an opaque string, no `tournaments` table), `DELETE /matches/:id` (FK cascade),
    `PATCH`/`DELETE /matches/:id/players/:id`, and added `date` to `UpdateMatch` (editing
    a match's date previously silently didn't persist — a real gap). Then rewrote
    `hooks/useMatches.ts` from a Zustand+persist store into an API adapter layer (React
    Query hooks, same pattern as `TacticsBoardPanel.tsx`'s tactics save/load), with all
    the model-mismatch mapping (id integer↔string, `dateTime` local-string↔ISO, roster
    create/patch/delete diffing) centralized in new `lib/matchMapping.ts` (unit-tested).
    Roster edits use a granular diff (not delete-and-recreate) specifically to keep player
    ids stable for Phase 3b's `events.playerId`. Verified end-to-end: dev-DB curl checks
    plus an actual browser session (create/list/edit/delete a match, roster round-trip,
    tactics board loading the roster from the API).
  - **Phase 3b (part of #58, not started) — scoresheet (`sets`/`rallies`/`events`) off
    localStorage.** Still needs a plan: mapping `PointRecord` (`hooks/useScoreSheet.ts`)
    to rally/event writes, `us`/`opponent` ↔ `home`/`away`, and deciding whether
    `ourRotation`/`opponentRotation` need to be stored or stay a derived value. Real
    prerequisite for persisting #42/#43.
- **Process note: #58 got auto-closed by accident, then reopened.** A PR #60 body edit
  said "本 PR 不 close #58" (intending to _not_ trigger GitHub's auto-close), but GitHub's
  closing-keyword detection is a dumb substring match on "close #58" — it doesn't parse
  Chinese negation, so it closed #58 anyway on merge. Reopened with an explanatory
  comment and rewrote #58's body to reflect the real Phase 3a/3b split. **Lesson for
  future PR bodies:** to reference an issue without closing it, avoid putting
  close/closes/fix/fixes/resolve/resolves directly before a `#number` in any language —
  write "relates to #58" instead, never "not close #58".
- **`CLAUDE.md` had a stale claim, now fixed**: it said "no test framework is
  configured" and to not invent `pnpm test`, but `vitest` has actually been configured
  for a while (`artifacts/volleyball-tactics/vitest.config.ts`, jsdom) with real test
  files, and root `pnpm run test` does work (fans out via `-r --if-present`). Corrected
  the "Current gaps" section to state this accurately.
- **ScoreSheet(計分表)簡易版 recording flow redesigned** (PR #47, closes #22 for the
  simple-tier scope):
  - Action categories expanded from 4 (`serve`/`defense`/`attack`/`block`) to 6
    (`serve`/`receive`/`set`/`attack`/`block`/`dig`), matching `lib/db/src/schema/
events.ts`'s `eventActionEnum` — `types/scoresheet.ts`.
  - `RadialMenu.tsx` no longer hardcodes 4 fixed positions (`top`/`right`/`bottom`/
    `left`) — it now auto-computes each option's angle from array length + a
    `startAngle` prop, so it scales to any option count without a two-tier submenu
    (resolves the "RadialMenu can't fit >4 options" concern #22 raised).
  - New "對手(全體)" tap target on `ScoreSheetCourt.tsx`: records the action as
    `side: "opponent", playerId: undefined` when the point came from an opponent's own
    unforced error (no opposing roster exists to attribute it to a specific player).
  - New "沒看到" button: skips action selection entirely, records only the point
    outcome on `rallies`-equivalent state with zero action/player attribution.
  - Fixed a real scoring bug: 得分/失分 outcome is now judged relative to the tapped
    target's `side` (the actor), not always relative to "us" — previously tapping
    "對手(全體)" → attack → "得分" incorrectly added to our own score.
  - `ScoreSheetStats.tsx`'s player-action matrix updated to the same 6 categories.
- **`docs/match-recording-erd.html` added**: an ERD design doc (rendered first as a
  Claude Artifact, then saved into the repo) exploring how the already-shipped
  ScoreSheet(簡易版) and the still-unimplemented `events`-table pipeline(進階版) should
  share one schema instead of staying parallel. Key decisions captured there: a new
  `events.side` column (home/away, notNull — who performed the touch, independent of
  `rallies.winner`), `events.playerId` becomes nullable (opponent-side actions have no
  roster to point at), `fromX/fromY/toX/toY` become nullable (simple tier never records
  coordinates) — none of this schema change has been implemented yet, it's design-only.
- **Issue #22 closed**, its unfinished scope (action sub-types like 跳發/飄球/跳飄,
  Violation category, Outcome detail expansion) split into new follow-on
  [#51](https://github.com/aila8913/volley-tatic-board/issues/51) since that part is
  advanced-tier (post-match video review) work, not simple-tier.
- **Issue #29 fixed** (PR #46): tactics-view court bottom border now uses
  `vector-effect="non-scaling-stroke"` so it doesn't get squished by the viewBox;
  "重置站位" now has a `window.confirm` guard; "← 比賽列表" extracted into a shared
  `BackToMatchListButton.tsx` and added to `TacticsBoard`/`ScoreSheet`/
  `TournamentDetail`/`not-found` (previously missing on some of those screens entirely).
- **Of the two bugs/ideas filed in the session that opened them, #49 is now fixed**
  (see "Current state" bullet above — PR #61, pending merge); #50 is still open:
  - [#49](https://github.com/aila8913/volley-tatic-board/issues/49) — root cause turned
    out to be neither of the two hypotheses in the issue: the tactics-view whiteboard
    had no background rect of its own, so its true (letterboxed) extent visually
    blended into the court's white and the page's white. Fixed by giving the
    court-canvas its own bounds and reworking the panel→whiteboard→court-element
    padding chain (PR #61).
  - [#50](https://github.com/aila8913/volley-tatic-board/issues/50) — ScoreSheet action
    options should be context-aware based on who's currently serving (serve/receive
    should be mutually exclusive depending on `currentSet.serving`); user noted more
    context rules may follow but hasn't defined them yet. Not started.
- **A pre-existing, unrelated-to-this-session problem was found and fixed while
  shipping**: local `main` had a commit (`a28749f`, the Mermaid.js flow-diagrams
  rewrite) that had never been pushed to `origin/main`. This caused a divergence when
  PR #46 was squash-merged (same pattern PR #32 tried to prevent, but that fix only
  covers commits made _during_ a session — this one predated it). Resolved with a merge
  commit (same precedent as PR #31's "Merge origin/main after squash-merging" pattern),
  then pushed so local/origin `main` are back in sync.
- Previously landed (still true, unchanged this session): new onboarding docs (PR #33),
  the three-way 輪轉表/戰術板/計分表 split (PR #28), tactics-board snapshot decoupling
  (PR #30), offline `docs/flow-diagrams.html` (PR #31, now also carries issue-number
  cross-references added this session for #35–#45 via issue #34's fix).
- Backend match-recording API is **fully implemented server-side** (Phases 0–2 + the
  Phase 3a gap-fill: all of matches/players/sets/rallies/events CRUD is live and
  dev-DB-verified). The frontend now calls the matches/players portion of it (Phase 3a,
  see above); the scoresheet still reads/writes localStorage only (Phase 3b, #58,
  not started) — that's the remaining piece before #51's advanced-tier work or a real
  stats page.
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
  page-transition overview, saved as a file at `docs/flow-diagrams.html` — closes #27.
  Keep this updated per the `wrap-up` skill's step for it (overwrite the "recent
  changes" callout each session, don't accumulate one).
  - **All 4 diagrams were rewritten from hand-coded SVG (manual x/y coordinates for
    every box/arrow/text label) to [Mermaid.js](https://mermaid.js.org/) syntax**
    (`stateDiagram-v2` / flowchart blocks in `<pre class="mermaid">` tags) — much
    easier to edit the diagram content without fighting coordinates. **Tradeoff: the
    file is no longer fully offline** — it now loads `mermaid.js` from a CDN
    (`cdn.jsdelivr.net`) via an ES module `<script>` tag at the bottom of the file, so
    an internet connection is required to render the diagrams (the file still opens
    fine with no dev server, just needs network access).

## Known gaps / next big pieces

Tracked in GitHub Issues (open backlog, check `gh issue list --state open` for current
status — the list below is a snapshot, not guaranteed up to date):

- [#17](https://github.com/aila8913/volley-tatic-board/issues/17) — UX 重整：視圖控制
  流程、輪次選擇改成純數字按鈕、頁首漢堡選單。**Note:** this session's work went the
  opposite direction on part of this — it kept (and even cross-store-wired) the
  "重置站位"/"清除畫筆" buttons that #17 wanted removed, and `RotationThumbnails.tsx`
  still shows visual dot-thumbnails rather than plain numbers. Not a deliberate rejection
  of #17, just unrelated work — worth reconciling before implementing #17.
- [#19](https://github.com/aila8913/volley-tatic-board/issues/19) — 計分表（
  `pages/ScoreSheet.tsx`, issue body still says `MatchRecording.tsx`) UI 簡化與調整,
  placeholder issue depending on #20/#21.
- [#20](https://github.com/aila8913/volley-tatic-board/issues/20) — 計分表多項 Bug 與
  功能補齊. Bug 2 (場外換人入口) confirmed already resolved by earlier work (see
  comment on the issue); Bug 1/3 + sub-count-limit UI still open.
- [#21](https://github.com/aila8913/volley-tatic-board/issues/21) — 球線軌跡記錄（進
  階版：精確座標記錄）. Highly related to new issue #51 — both are "advanced tier"
  recording scope, probably worth designing together. This session's ERD work leans
  towards resolving #21's open "落點要精確座標還是號位" question in favor of precise
  coordinates (zone becomes a derived display value, not an input field).
- [#24](https://github.com/aila8913/volley-tatic-board/issues/24) — 複製比賽。
- [#25](https://github.com/aila8913/volley-tatic-board/issues/25) — 先發/先接切換。
- [#26](https://github.com/aila8913/volley-tatic-board/issues/26) — 部署準備。
- [#50](https://github.com/aila8913/volley-tatic-board/issues/50) — 計分表動作選項應
  依發球方做情境限制（發球/接發互斥）。
- [#51](https://github.com/aila8913/volley-tatic-board/issues/51) — 進階版：動作子分
  類、犯規類型與 Outcome 細節擴充（#22 的後續，見上方 Current state）。Backend 地基
  已完全就緒（Phase 0/1/2/3a），仍需 Phase 3b（#58，計分表接線）才能真正落地。
- [#58](https://github.com/aila8913/volley-tatic-board/issues/58) — 後端 Phase 3b：
  計分表（sets/rallies/events）從 localStorage 切到 API。Phase 3a（matches + 名單）
  已在 PR #60 完成，這個 issue 內容已改為只描述剩下的計分表這半（needs-plan；也是
  #42/#43 真正持久化的前提）。完整設計見 `docs/backend-architecture.md`。

## Recently closed

- #55 — 後端 Phase 0：schema/openapi 三層對齊、events 加 side+nullable、matches 加
  userId，已在 PR #53 完成（retro issue，開完即關以留 ledger 軌跡）。
- #56 — 後端 Phase 1：matches/players/sets CRUD 路由 + errorHandler middleware，已在
  PR #54 完成並對真實 dev DB 端對端驗證（retro issue，開完即關）。
- #57 — 後端 Phase 2：rallies + events 巢狀路由，已在 PR #59 完成並對真實 dev DB
  端對端驗證（放棄原描述的 `db.transaction()`：合約無 bulk endpoint，單筆寫入本就
  原子）。
- #22 — 簡易版所需的動作分類擴充（4→6 大類，對齊 events 表）與 RadialMenu 選項數量
  限制已在 PR #47 完成；子分類/犯規類型/Outcome 細節拆到 #51 繼續追蹤。
- #29 — 戰術布置測試發現的邊框、確認彈窗、返回按鈕問題，已在 PR #46 修正。
- #34 — flow-diagrams.html 的 T5 標記矛盾，已修正並補上已知問題對應的 issue 連結。
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
