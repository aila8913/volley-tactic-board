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

## Required env vars

- `DATABASE_URL` — Postgres connection string (throws on startup if missing, see `lib/db/src/index.ts`)
- `PORT` — required by both the API server and the Vite frontends
- `BASE_PATH` — required by the Vite frontends (used as the Vite `base`)

No `.env.example` exists yet; these are documented only in code (`lib/db/src/index.ts`, `vite.config.ts`)
and in `replit.md`.

## Current gaps (don't assume otherwise)

- No test framework is configured (no vitest/jest, no `*.test.ts` files anywhere).
- ESLint (`eslint.config.mjs`) and Prettier (`.prettierrc.json`) are now configured at the root — run via
  `pnpm run lint` / `pnpm run format`.
- `lib/db/src/schema/index.ts` defines `matches` / `players` / `sets` / `rallies` / `events` (see
  `docs/db-schema-spec.md`) plus a `tactics` table backing the tactics-board save/load feature, which is
  pushed and live (dev DB) — `artifacts/api-server/src/routes/tactics.ts` reads/writes it via Drizzle.
- `lib/api-spec/openapi.yaml` covers the match-recording feature (see `docs/api-spec.md`); backend routes
  for match-recording specifically aren't implemented yet (`artifacts/api-server/src/routes/` currently
  has `/healthz` and `tactics.ts`, not match-recording routes), and the frontend doesn't call the
  match-recording API yet either.

Don't invent commands like `pnpm test` or `pnpm lint` — they don't exist. If asked to verify changes,
typecheck (`pnpm run typecheck`) is currently the only automated check available.

## Workflow notes

- pnpm is enforced (root `preinstall` script blocks npm/yarn).
- `lib/api-client-react` and `lib/api-zod` are generated output — edit `lib/api-spec/openapi.yaml` and run
  `codegen`, never hand-edit the generated packages.
- React/React-DOM are pinned to exact `19.1.0` in the pnpm catalog (required for Expo compatibility) — don't
  bump these independently.
- `pnpm-workspace.yaml` enforces a 1-day minimum npm package release age as a supply-chain safeguard
  (`minimumReleaseAge`). Don't remove or bypass it when adding dependencies.

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
