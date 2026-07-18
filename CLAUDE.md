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
```

## Commands

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from `$PORT`)
- `pnpm --filter @workspace/volleyball-tactics run dev` — run the frontend dev server
- `pnpm run typecheck` — full typecheck (runs `typecheck:libs` via `tsc --build` first, then artifacts/scripts)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate `api-client-react` + `api-zod` from
  `openapi.yaml`, then re-typechecks libs. Run this any time `openapi.yaml` changes.
- `pnpm --filter @workspace/db run push` — push Drizzle schema changes straight to the DB (dev only, no
  migration files are generated)
- `pnpm run test` — runs `vitest` for `@workspace/volleyball-tactics` (the only package with tests so far)

## Required env vars

- `DATABASE_URL` — Postgres connection string (throws on startup if missing, see `lib/db/src/index.ts`)
- `PORT` — required by both the API server and the Vite frontends
- `BASE_PATH` — required by the Vite frontends (used as the Vite `base`)

No `.env.example` exists yet; these are documented only in code (`lib/db/src/index.ts`, `vite.config.ts`)
and in `replit.md`.

## Current gaps (don't assume otherwise)

- `vitest` **is** configured for `@workspace/volleyball-tactics` (`vitest.config.ts`, jsdom environment) —
  run via root `pnpm run test` (fans out to every package with a `test` script) or scoped with
  `pnpm --filter @workspace/volleyball-tactics run test`. Test files exist (e.g. `src/lib/
matchMapping.test.ts`, `src/types/match.test.ts`). No test framework exists for the other packages
  (api-server, db, etc.) yet, so root `pnpm run test` currently only actually runs volleyball-tactics's
  suite.
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

## Workflow notes

- pnpm is enforced (root `preinstall` script blocks npm/yarn).
- `lib/api-client-react` and `lib/api-zod` are generated output — edit `lib/api-spec/openapi.yaml` and run
  `codegen`, never hand-edit the generated packages.
- React/React-DOM are pinned to exact `19.1.0` in the pnpm catalog (required for Expo compatibility) — don't
  bump these independently.
- `pnpm-workspace.yaml` enforces a 1-day minimum npm package release age as a supply-chain safeguard
  (`minimumReleaseAge`). Don't remove or bypass it when adding dependencies.

## Team & collaboration rules

Two-person team: `aila8913` (owner, full-stack — backend/db/infra/product) and `tangyi1025`
(design & UI — `area:design`, visual side of `area:frontend`). The human-facing collaboration
conventions live in CONTRIBUTING.md's「協作與溝通」section; the rules Claude must actively
enforce are:

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
