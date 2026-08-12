# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is an early-stage learning project (volleyball tactics board app). The user is learning full-stack
development through building it, currently at a sophomore Information Management student level. See the
"Collaboration style" section below — it matters more than usual for this repo.

## Stack

- pnpm workspaces (monorepo), Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, Tailwind CSS 4, shadcn/ui, Zustand (state), wouter (routing), TanStack React Query
- Backend: Express 5
- DB: PostgreSQL + Drizzle ORM (schema-first, no migrations — uses `drizzle-kit push`)
- Validation: Zod (`zod/v4` in api-server, `zod` v3 via catalog elsewhere), `drizzle-zod`
- API contract: OpenAPI spec (`lib/api-spec/openapi.yaml`) is the source of truth; Orval generates the
  React Query client (`lib/api-client-react`) and Zod schemas (`lib/api-zod`) from it
- Build: esbuild (backend bundles to ESM `.mjs`, not CJS)

## Repo layout

```
artifacts/   deployable apps (each independently runnable)
  api-server/         Express backend, port from $PORT
  volleyball-tactics/ main frontend (Vite + React)
  mockup-sandbox/     design/mockup sandbox, not shipped
lib/         shared packages, imported by artifacts (not run directly)
  db/                 Drizzle schema + DB client (schema/index.ts defines matches/players/sets/rallies/
                      events/tactics — see "Current gaps" below)
  api-spec/           openapi.yaml + orval.config.ts (codegen source)
  api-client-react/   generated — do not hand-edit, regenerate via codegen
  api-zod/            generated — do not hand-edit, regenerate via codegen
scripts/     one-off TS scripts run via tsx
docs/        specs and decision records
  adr/                architecture decision records — read before proposing structural changes
```

## Commands

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from `$PORT`)
- `pnpm --filter @workspace/volleyball-tactics run dev` — run the frontend dev server
- `pnpm run typecheck` — full typecheck (runs `typecheck:libs` via `tsc --build` first, then artifacts/scripts)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate `api-client-react` + `api-zod` from
  `openapi.yaml`, then re-typechecks libs. Run this any time `openapi.yaml` changes.
- `pnpm --filter @workspace/db run push` — push Drizzle schema changes straight to the DB (dev only, no
  migration files are generated). Unlike the dev servers, this one does **not** read `.env` by itself —
  `drizzle.config.ts` reads `process.env.DATABASE_URL` directly, so PowerShell needs it in the environment
  first: `$env:DATABASE_URL='<the value from .env>'; pnpm --filter @workspace/db run push`. Paste the real
  connection string from `.env` at the prompt — **never into this file**: CLAUDE.md is tracked and this
  repo is public, so a password written here is one `git add -A` away from being published (and it also
  gets loaded into every Claude session's context). `.env` is gitignored; that is where secrets live.
- `pnpm run test` — runs `vitest` for `@workspace/volleyball-tactics` and `@workspace/api-server`

## Required env vars

- `DATABASE_URL` — Postgres connection string (throws on startup if missing, see `lib/db/src/index.ts`)
- `PORT` — required by both the API server and the Vite frontends
- `BASE_PATH` — required by the Vite frontends (used as the Vite `base`)
- `API_PORT` — the API server's local dev port. Dev runs backend/frontend as two processes
  (Vite `5173`, Express `3000`); `artifacts/api-server/src/index.ts` reads `API_PORT ?? PORT`, and Vite's
  `server.proxy` forwards `/api/*` to it. **Not set in production** — there it's a single process serving
  both, using the platform-injected `PORT`.
- `COOKIE_SECRET` — signs the session cookie (#26 PR2). `app.ts` calls this at startup unconditionally
  (`cookie-parser` needs a key to initialize even when nothing is actually doing Google OAuth) — missing it
  throws immediately rather than letting the server half-start. Any string works locally; production should
  generate a real one (`openssl rand -hex 32`).

`.env.example` exists at the repo root and documents all five (plus the optional Google OAuth trio) with the
same reasoning inline — copy it (`cp .env.example .env`) and only `DATABASE_URL` needs a real value. The
human-facing list also lives in `README.md`'s 「快速上手」 section (copy-pasteable `.env` block); the
enforcing code is `lib/db/src/index.ts`, `vite.config.ts`, `artifacts/api-server/src/index.ts`, and
`artifacts/api-server/src/lib/session.ts`.

## Current gaps (don't assume otherwise)

- `vitest` **is** configured for `@workspace/volleyball-tactics` (`vitest.config.ts`, jsdom environment) —
  run via root `pnpm run test` (fans out to every package with a `test` script) or scoped with
  `pnpm --filter @workspace/volleyball-tactics run test`. Test files exist (e.g. `src/lib/
matchMapping.test.ts`, `src/types/match.test.ts`). `@workspace/api-server` also has vitest now
  (`src/lib/personName.test.ts`, added with #221), so root `pnpm run test` fans out to both. `db` and the
  other packages still have no `test` script.
- **`@testing-library/react` + `user-event` 已裝好** (#168)：元件的**互動行為**測得動了（點擊、
  鍵盤、state 變化後的重繪、Radix Portal 裡的彈窗內容）。共用前置在
  `artifacts/volleyball-tactics/src/test/`（`setup.ts` 掛在 vitest 的 `setupFiles`，
  `renderWithProviders.tsx` 包好 QueryClient + wouter 的記憶體路由）。兩種寫法並存是刻意的：
  **純展示元件**（資料全由 props 決定、沒有互動）繼續用 `renderToStaticMarkup`，改寫沒有好處；
  **有互動的**一律用 testing-library。⚠️ 已知坑：jsdom 沒有排版引擎，userEvent 連續點兩個元素時
  第一個的 `mouseout` 會帶 `relatedTarget: null`，靠 hover 展開的 UI（NavRail）會因此誤收合——
  解法與完整說明寫在 `NavRail.test.tsx` 的 `openSubmenu()` 上方。
- **Test files are typechecked** (#292): no tsconfig excludes `**/*.test.ts(x)` anymore, so a type error in
  a test fails `pnpm run typecheck` / CI just like production code. The exclusions used to hide the fact
  that fixtures had drifted a whole refactor behind the DTOs they mock.
- ESLint (`eslint.config.mjs`) and Prettier (`.prettierrc.json`) are now configured at the root — run via
  `pnpm run lint` / `pnpm run format`.
- `lib/db/src/schema/index.ts` defines `matches` / `players` / `sets` / `rallies` / `events` (see
  `docs/db-schema-spec.md`) plus a `tactics` table backing the tactics-board save/load feature. All of
  these are pushed and live (dev DB), and the backend REST API for all of them is fully implemented
  (`artifacts/api-server/src/routes/` — matches/players/sets/rallies/events, plus tactics/health). The
  frontend now calls the matches/players API (`hooks/useMatches.ts`); the scoresheet (sets/rallies/events)
  still reads/writes localStorage only (`hooks/useScoreSheet.ts`) — see `docs/backend-architecture.md` and
  issue #58 for the remaining migration piece.

`pnpm run typecheck` remains the main automated check across the whole monorepo; `pnpm run test` currently
only exercises volleyball-tactics (the only package with a `test` script so far). CI
(`.github/workflows/ci.yml`) runs lint + `prettier --check .` + typecheck + test on every PR — prefer
`gh pr checks` over re-running locally when shipping. The pre-existing lint/format debt was cleared in
issue #81 (PRs #83/#84), so all four checks are expected to pass. `.gitattributes` forces LF line endings
in the working tree (overriding Windows `core.autocrlf`) — without it, `prettier --check` fails locally on
Windows while passing in CI.

## 事實住哪裡（每種事實一個家）

寫下任何「以後還要成立」的東西之前，先決定它住哪。判斷法一句話：
**問「這件事一週後還該留著嗎？」該留 → 家就不是 `docs/PROGRESS.md`。**

| 事實的種類                     | 家                       | 特徵                                             |
| ------------------------------ | ------------------------ | ------------------------------------------------ |
| 架構決策，且不希望被改回去     | `docs/adr/`              | 有「不要重新提議」清單；不可刪改，只能 supersede |
| 產品定位、做／不做的邊界       | `docs/product-vision.md` | 是產品判斷不是技術判斷                           |
| 官方用詞、同義詞禁用           | `CONTEXT.md`             | 只有詞彙，沒有實作與狀態                         |
| 某個功能的規格與設計           | `docs/*-spec.md`         | 決策文件，不是「程式現在怎麼跑」的衍生文件       |
| 單張票的來龍去脈、被否決的備案 | 該 issue 的 body／留言   | 範圍不超出那張票                                 |
| 某段程式為什麼長這樣           | 該檔案自己的註解         | 離現場最近，改程式的人一定會看到                 |
| _why_ 某次改動發生             | `git log` + commit 訊息  | 一次性的、綁在那個 diff 上                       |
| repo 結構、指令、已知落差      | `CLAUDE.md`（本檔）      | 下一個 session 一開始就需要知道                  |
| 協作教訓、PO 的偏好            | auto-memory              | 換一個 repo 還是成立                             |
| **現況快照**                   | `docs/PROGRESS.md`       | **預期會被刪**——一週後就該不見                   |

⚠️ **寫成「刻意不做 X」「別改成 Y」的段落，就是 ADR 跑進了快照。** 那種條目會永遠刪不掉
（刪了就沒別的地方有），PROGRESS 兩次肥大（580 行→重置、830 行→重剪）都是這個機制：
**不是沒在剪，是剪下來沒有地方放。** 先開 ADR，快照只留一行指過去。

這張表**只有這一份**——`.claude/skills/wrap-up/`（收東西時）與 `.claude/skills/catch-up/`
（找東西時）都指回這裡，不要各自抄一份（抄了就是這張表自己在示範的錯）。它寫在 CLAUDE.md
而不是 skill 裡，是因為 **skill 靠觸發詞才載入**，而決策不是只在收工時產生的——同 #350
把合併關卡從 `ship` skill 移進本檔的理由。

## Workflow notes

- pnpm is enforced (root `preinstall` script blocks npm/yarn).
- `lib/api-client-react` and `lib/api-zod` are generated output — edit `lib/api-spec/openapi.yaml` and run
  `codegen`, never hand-edit the generated packages.
- React/React-DOM are pinned to exact `19.1.0` in the pnpm catalog (required for Expo compatibility) — don't
  bump these independently.
- `pnpm-workspace.yaml` enforces a 1-day minimum npm package release age as a supply-chain safeguard
  (`minimumReleaseAge`). Don't remove or bypass it when adding dependencies.
- **Read `CONTEXT.md` (repo root) before writing docs, comments, or UI copy.** It is the domain
  glossary: for each concept it names the one official term and lists the synonyms to stop using
  (`_Avoid_`). Chinese wording in this repo drifted badly before it existed (簡易版/基礎版 for the
  same mode, 陣容 meaning two different things), so match its vocabulary rather than inventing a
  synonym. It is a glossary only — no implementation details, no status, no decisions (those go to
  `docs/adr/`). When a new domain term gets pinned down mid-work, add it there as it happens.
- **Read `docs/adr/` before proposing structural changes.** Those files record decisions that were
  already argued through and settled — each one ends with a「不要重新提議」section naming the
  approaches not to suggest again. Don't re-litigate them; if the friction is real enough to warrant
  reopening one, say so explicitly and cite the ADR rather than quietly proposing the thing it rules
  out. When a decision gets overturned, add a new ADR and mark the old one `Superseded by ADR-NNNN` —
  never edit or delete an accepted one. `docs/adr/README.md` has the judgement call for what earns
  an ADR (roughly: it was overturned once, or the code invites changing it back).

## Team & collaboration rules

Two-person team: `aila8913` (owner, full-stack — backend/db/infra/product) and `tangyi1025`
(design & UI — `area:design`, visual side of `area:frontend`). The human-facing collaboration
conventions live in CONTRIBUTING.md's「協作與溝通」section; the rules Claude must actively
enforce are:

- **Claude stops before `gh pr merge` and waits for the user.** commit / push / `gh pr create`
  need no confirmation — a PR can always be closed. Merging into `main` is the irreversible
  step, so open the PR, wait for CI, then **stop**: tell the user how to verify (which page,
  what they should see) and merge only once they say so. A user who says「merge」/「合併」
  has already confirmed — don't ask twice. This is orthogonal to the no-approval-gate rule
  below: that one says don't wait on `tangyi1025`; this one says do wait on the user.
  Mutating `gh issue create/close/edit` needs the same confirmation (the `wrap-up` skill's
  Close/Update/Create proposal step).
  Why this lives here and not only in `.claude/skills/ship/SKILL.md`: skills load on trigger
  phrases («ship», «送 PR»). Task-shaped requests («解決 #349») never load them, so the gates
  written there silently did nothing — that is how PR #350 got merged CI-green but only
  half-fixed, with the missed copy living in a file no test can reach (#168). CI green ≠
  behaviour verified. A gate that only works when someone says the magic word is not a gate.
- **No approval gate — self-merge freely, just leave the partner a heads-up.** Anyone can
  merge their own PR without waiting on the other person, including PRs that touch the other
  member's area or a shared-convention file (`CLAUDE.md`, `CONTRIBUTING.md`,
  `.claude/skills/`, `docs/design-spec.md`, `lib/api-spec/openapi.yaml`,
  `lib/db/src/schema/`). When a diff touches those, drop a heads-up `@`-mention on the PR so
  the partner can catch up async — it's a notification, never a blocker, and nobody waits on
  it. (Two-person learning project: a hard "wait for approval" gate mostly just stalls
  progress when someone's away.) The `ship` skill's 協作確認 step reflects this.
- **Never close an issue silently.** Prefer `Closes #n` in a PR body; a manual close must
  carry a comment explaining why (done by which commit/PR, or "not planned because…").
  Closing an issue the partner opened needs their @-mentioned confirmation first, unless a
  PR literally completed it.
- **Project discussion belongs on GitHub, not chat apps** — issue comments for task-scoped
  questions, PR reviews for code, a `question`-labeled issue for new decisions. When the
  user relays a decision made over chat, offer to record the conclusion on the relevant
  issue/PR.
- **Conventions for the partner's Claude are communicated by editing the shared config files
  themselves** (CLAUDE.md / CONTRIBUTING.md / `.claude/skills/`) via a PR (heads-up the
  partner per the rule above) — never assume the other Claude "was told" something that
  isn't written here.

## Collaboration style

The user is using this project to learn full-stack development end-to-end, not just to ship features. This
changes default behavior for this repo specifically:

- When running git or other shell commands, briefly explain what the command does and why, not just the
  result — the user wants to follow along, not just see "done."
- When writing non-trivial code (state logic, API wiring, DB schema, build config), add comments explaining
  the _why_ and the underlying concept, pitched at a sophomore Information Management student level — assume
  basic programming knowledge but not deep familiarity with the specific tool/pattern being used. This is
  broader than the usual "only comment the non-obvious" rule — err toward explaining one level more than
  you normally would in this repo.
- Don't skip past architectural decisions silently — when a non-obvious choice gets made (why Drizzle over
  raw SQL, why OpenAPI codegen instead of hand-written types, etc.), say so briefly so it reinforces the
  learning.
- Delegation must not skip the teaching step: after subagent work completes, walk the user through what
  was decided and why — a bare "done" defeats the purpose of this repo.
