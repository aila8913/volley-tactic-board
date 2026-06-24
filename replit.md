# Volleyball Tactics Board

A web app for planning and analyzing volleyball matches: pre-match lineup/formation planning, live
play-by-play recording during a match, post-match video backfill, and defense statistics.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from `$PORT`)
- `pnpm --filter @workspace/volleyball-tactics run dev` — run the frontend dev server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only, no migration files)
- Required env: `DATABASE_URL` (Postgres connection string), `PORT`, `BASE_PATH` (Vite `base` path)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, Tailwind CSS 4, shadcn/ui, Zustand, wouter, TanStack React Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (schema-first, no migration files — `drizzle-kit push`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (backend bundles to ESM `.mjs`)

## Where things live

```
artifacts/   deployable apps (each independently runnable)
  api-server/         Express backend
  volleyball-tactics/ main frontend (Vite + React)
  mockup-sandbox/     design/mockup sandbox, not shipped
lib/         shared packages, imported by artifacts (not run directly)
  db/                 Drizzle schema + DB client
  api-spec/           openapi.yaml (source of truth) + orval.config.ts
  api-client-react/   generated — do not hand-edit, regenerate via codegen
  api-zod/            generated — do not hand-edit, regenerate via codegen
scripts/     one-off TS scripts run via tsx
docs/        spec-index.md links the product/db/api specs for the match-recording feature
```

## Architecture decisions

- OpenAPI spec is the source of truth for the API contract; React Query client and Zod schemas are generated
  from it via Orval rather than hand-written, so frontend/backend types can't drift apart.
- Drizzle schema is schema-first with no migration files (`drizzle-kit push`) — acceptable while there's a
  single dev database and no production data yet.
- Match recording is single-user and offline-tolerant by design: only one person (coach/assistant) records
  at a time, so there's no need for multi-device sync — recordings should queue locally and sync once
  connectivity returns, since match-day network can be unreliable.

## Product

- **Pre-match**: tactics board for planning lineup/formation (existing).
- **Live recording**: tap two court coordinates per ball (precise position, not zone numbers), pick
  player + action, tag with presets or free text, log the score at the end of each rally.
- **Post-match video backfill**: same screen as live recording — if a match has a YouTube URL, the player
  shows alongside the court and clicking a play auto-captures the video timestamp for later review.
- **Defense statistics**: aggregate by reception type (serve receive, dig vs. spike, vs. "chance ball", vs.
  tip) using a 0–3 quality score per touch; see `docs/product-spec.md` for the open question on the exact
  definition of "chance ball" (嗆司).

## User preferences

This is a learning project — see `CLAUDE.md`'s "Collaboration style" section for how to work in this repo
(explain commands and non-obvious decisions, comment code at a learning level).

## Gotchas

- pnpm is enforced — the root `preinstall` script blocks npm/yarn.
- `lib/api-client-react` and `lib/api-zod` are generated; edit `lib/api-spec/openapi.yaml` and run `codegen`
  instead of hand-editing them.
- React/React-DOM are pinned to exact `19.1.0` in the pnpm catalog — don't bump independently.
- `pnpm-workspace.yaml` enforces a 1-day minimum npm package release age (`minimumReleaseAge`) as a
  supply-chain safeguard — don't remove it when adding dependencies.
- The `gitsafe-backup` git remote only resolves from inside a Replit container, not from an external
  machine — if working on a local clone, push to a separate real remote (e.g. GitHub) and re-import into
  Replit from there.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
- See `CLAUDE.md` for the full collaboration style and current implementation gaps.
- See `docs/spec-index.md` for the match-recording feature's product/DB/API specs.
