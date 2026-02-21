# BUILD TRACKER

## Current Task
- `T18` Supabase persistence enablement (`IN PROGRESS`)

## Task Board
- `T1` Repo scaffolding + test harness: `DONE`
- `T2` DB schema + migration tests: `DONE`
- `T3` FPL client + contract tests: `DONE`
- `T4` YouTube ingestion + transcript tests: `DONE`
- `T5` Ollama summarization + extraction tests: `DONE`
- `T6` Hybrid scoring engine tests: `DONE`
- `T7` API route tests: `DONE`
- `T8` Transfer Radar UI tests: `DONE`
- `T9` Cron/manual run integration tests: `DONE`
- `T10` End-to-end acceptance + hardening: `DONE`
- `T11` Supabase DB adapter + provider switch tests: `DONE`
- `T12` Production transcript extraction from YouTube captions: `DONE`
- `T13` Next.js API route wrappers: `DONE`
- `T14` Dashboard page wiring: `DONE`
- `T15` Env-driven app bootstrap and provider selection: `DONE`
- `T16` Cron endpoint auth guard tests: `DONE`
- `T17` Vercel cron schedule configuration: `DONE`
- `T18` Supabase schema artifact + verification/smoke scripts: `IN PROGRESS`

## Test Status
- `T1` to `T14`: `RED -> GREEN` completed previously.
- `T15`: `RED -> GREEN` (route/app wiring initially failed due async singleton + import paths; fixed by async `getAppInstance()` and corrected relative imports)
- `T16`: `RED -> GREEN` (`test/contract/t13-next-routes.test.js` now verifies `401` on cron secret mismatch)
- `T17`: `GREEN` (`vercel.json` schedule added with no test regressions)
- `T18`: `MIXED` (`test:contract` green; remote Supabase verify/smoke currently fails because required public tables are not yet visible in schema cache)
- Full suite: `GREEN` (`30/30` passing via `npm test`)

## Evaluation Log
- `T15`: Mistake: app singleton initially mixed real clients with test execution path and had incorrect relative package import depth. Root cause: bootstrap moved from stubs to env-driven clients without isolating test mode. Fix: defaulted to stub clients unless `ENABLE_LIVE_CLIENTS=1`, corrected import paths, and made singleton async-safe. Prevention: keep non-network defaults and explicit opt-in for live clients.
- `T16`: Mistake: sync route originally accepted any caller when configured for cron execution. Root cause: no auth gate at route boundary. Fix: added `CRON_SECRET` bearer check and unauthorized response path. Prevention: add auth tests whenever adding scheduler-triggered mutation routes.
- `T17`: Mistake: scheduling existed only as conceptual next action, not deployment config. Root cause: missing infra config artifact. Fix: added `vercel.json` cron entry for `/api/sync/run`. Prevention: pair runtime routes with deployment config in same task.
- `T18`: Mistake: initial table verification used `head` selects which returned false positives for missing relations. Root cause: PostgREST behavior does not reliably surface missing-table errors on `head` queries. Fix: changed verifier to use `select().limit(1)` and added explicit setup doc + schema SQL artifact. Prevention: mirror runtime query shape when validating infrastructure prerequisites.

## Risks
- Supabase setup depends on running `/scripts/supabase-schema.sql` in dashboard SQL Editor so tables exist in `public` and are visible via PostgREST.
- Live YouTube ingestion requires `YOUTUBE_API_KEY`; without it, live app bootstrap is now blocked by explicit validation.
- Current route/page outputs are framework-compatible file shapes but still return HTML strings rather than full React component trees.
- YouTube watch-page parsing may break if player payload format changes.
- Live pipeline mode requires `ENABLE_LIVE_CLIENTS=1` plus reachable Ollama and external APIs.

## Decisions
- DB access remains async across providers (`memory` and `supabase`).
- Route bootstrap is env-driven and lazy singleton-based.
- Sync route enforces optional bearer auth when `CRON_SECRET` is set.
- Daily schedule configured at `08:00 UTC` in `vercel.json`.
- Supabase setup is codified in repo via `scripts/supabase-schema.sql`, `scripts/verify-supabase-setup.mjs`, and `scripts/smoke-supabase-routes.mjs`.

## Next Actions
1. Run `scripts/supabase-schema.sql` in Supabase SQL Editor and wait for schema cache refresh.
2. Re-run `npm run supabase:verify` and `npm run smoke:supabase` until both pass.
3. Add explicit route for updating settings (`POST /api/settings`) in Next route files.
4. Add observability counters/log rows for cron auth failures and transcript parse failures.
