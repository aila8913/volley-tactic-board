# Progress Snapshot

> This is a **live snapshot**, not a log — the `wrap-up` skill overwrites the "Current
> state" section at the end of each work session, it doesn't append to it. For the
> permanent history of _why_ things changed, that's what `git log` and commit messages
> are for. For static repo layout/commands, see `CLAUDE.md`. For the backlog of
> planned-but-not-done work, see GitHub Issues (`gh issue list`), not this file.
>
> Read this file, plus `gh issue list --state open` and recent `git log`, at the start
> of a new session instead of re-exploring the whole codebase from scratch.

_Last updated: 2026-07-02 (after PR #23 merge — libero substitution fix, tactics-view
whiteboard, header nav)_

## Current state

- On `main`, latest commit `def20be` (merge of PR #23). Working tree is clean except an
  untracked personal note file (`排球比賽的特性.txt`, not part of the codebase).
- Frontend (`artifacts/volleyball-tactics`) has a working tactics board: drag-and-drop
  player placement onto 6 court zones, rotation auto-calculation, layout-mode-gated
  drawing tools (arrows/lines/attack-line/text/volleyball + defense-range shapes), and a
  match-recording page with a split-panel result view (`MatchResult.tsx`).
- **Libero (自由球員) substitution logic is now fully correct in both court views**
  (closes #14 — see PR #23, commit `5dcc4ed`, plus the follow-up fixes in the same PR):
  - `placePlayerOnCourt` (rotation view) and `placePlayerFree` (tactics view) share one
    substitution helper (`placeLiberoOnCourt` in `useTactics.ts`) — only one libero can
    ever be on court at a time, back-row-only is enforced in both views, and
    `startingLiberoId` stays in sync regardless of which view triggered the swap.
  - Right-click removal in tactics view now also clears the leftover `tacticPositions`
    entry (previously only `positions` was cleared, so the removed libero kept
    rendering).
  - LeftPanel no longer has a manual "先發" toggle button — status is shown the same way
    as regular players ("已上場" / "備位"), matching regular drag-based interaction.
  - Dragging a libero past the court's/whiteboard's bottom edge in tactics view sends
    them back to the bench (same effect as right-click removal), gated so it doesn't
    conflict with the new out-of-bounds drawing feature below.
- **Tactics view ("戰術視圖") is now a resizable whiteboard**, not a fixed-size court
  card:
  - The SVG viewBox is computed dynamically (`Court.tsx`, `computeTacticsViewBox` +
    `ResizeObserver`) to exactly match the center panel's rendered aspect ratio, so the
    court (still logically 100x200 / 1:2) sits centered inside it without distortion.
    Rotation view is unaffected — it stays strictly clamped to the real court/6 zones.
  - Players, arrows, markers, and defense-range shapes can now be placed/drawn outside
    the court boundary (illustrating players running out of bounds, arrows flying off,
    off-court notes). The thick court border and rounded corners are drawn as an SVG
    `<rect id="court-border">` around the literal court sub-rectangle (not the whole
    whiteboard) so the frame always hugs the real court regardless of panel size.
  - No background color distinction between "court" and "whiteboard margin" — just the
    border marks the boundary (per explicit user preference; an earlier gray-fill
    version was reverted).
- Tactics are persisted via PostgreSQL through the REST API (see commit `096a19f`).
  Full tactic management works: `activeProjectId` tracks which tactic is open, "save"
  overwrites it while "save as" always creates a new one, plus rename and delete.
- Backend (`artifacts/api-server`) only has `/healthz` — the match-recording API routes
  described in `docs/api-spec.md` are not implemented yet, and the frontend doesn't call
  them yet either.
- `docs/tactics-board-todo.md`'s "還沒做的事" section only pointed at #10/#12/#13, which
  are now all closed — that doc's remaining content is purely historical
  design-rationale notes at this point, no action needed on it.

## Known gaps / next big pieces

Tracked in GitHub Issues (open backlog, check `gh issue list --state open` for current
status — the list below is a snapshot, not guaranteed up to date):

- [#17](https://github.com/aila8913/volley-tatic-board/issues/17) — UX 重整：視圖控制
  流程（新增/布置模式重疊）、輪次選擇改成純數字按鈕、頁首漢堡選單（顯示設定 + 匯出/
  匯入搬過去）。Design is fully written out in the issue body, ready to implement.
- [#18](https://github.com/aila8913/volley-tatic-board/issues/18) — 備位自由球員在球場
  上要有明確的淺紅色外框標示區（目前只有 LeftPanel 文字標籤 + 球場下方的橘色圓圈，還
  沒有專屬的視覺框）。Not implemented yet — the current libero bench UI (added this
  session) is functional but doesn't match this issue's exact visual spec.
- [#19](https://github.com/aila8913/volley-tatic-board/issues/19) — 紀錄版面（
  `MatchRecording.tsx`）UI 簡化與調整，placeholder issue that depends on #20/#21 landing
  first.
- [#20](https://github.com/aila8913/volley-tatic-board/issues/20) — 紀錄版面多項 Bug 與
  功能補齊。
- [#21](https://github.com/aila8913/volley-tatic-board/issues/21) — 紀錄互動重新設計：
  球線軌跡記錄。
- [#22](https://github.com/aila8913/volley-tatic-board/issues/22) — 動作分類擴充與重新
  設計（攻擊/防守/發球/犯規）。
- Backend match-recording API routes (`docs/api-spec.md`) still unimplemented; frontend
  doesn't call them yet either.

## Recently closed

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
