# FPL Scraper

FPL Scraper is a Next.js dashboard and data pipeline for Fantasy Premier League transfer decisions powered by YouTube sentiment signals.

## Features

- FPL transfer recommendations (`BUY` / `SELL` / `HOLD`)
- Dashboard with KPI cards, recommendation explorer, event timeline, and video diagnostics
- Settings and sync controls via API routes
- Supabase-backed data access
- shadcn-style UI primitives with Tailwind CSS

## Tech Stack

- Next.js 16
- React 19
- Supabase
- Tailwind CSS + shadcn-style components

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env` with the required keys (Supabase, YouTube, and any app secrets used by your setup).

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` - start development server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run test` - run all tests
- `npm run test:ui` - run UI tests
- `npm run smoke:supabase` - smoke test Supabase routes

## API Routes

- `/api/settings`
- `/api/sync/run`
- `/api/strategy/run`
- `/api/strategy/template`
- `/api/strategy/team`
- `/api/recommendations`
- `/api/runs`
- `/api/events`
- `/api/videos`

## Project Structure

- `src/app` - Next.js app routes and layout
- `src/components` - dashboard and reusable UI components
- `apps/web/src` - app service layer and APIs
- `packages/pipeline/src` - pipeline clients and scoring logic
- `test` - unit, contract, integration, UI, and e2e tests

## Notes

- Keep `.env` local and out of source control.
- Deploy preview builds to Vercel for validation before production.

## What The System Does

The app combines three data lanes into one decision dashboard:

1. `Pipeline sync` ingests YouTube videos, attempts transcript extraction, summarizes sentiment, and writes recommendation rows.
2. `Strategy refresh` builds elite-manager cohort snapshots, template ownership, momentum deltas, and team-fit insights for your entry.
3. `Dashboard API` serves the latest run-backed recommendations plus strategy panels and health diagnostics.

## Process Runbook

Use this sequence when operating or troubleshooting production data:

1. Save settings (`entry_id`, channel ids) in the dashboard Controls panel.
2. Run **Strategy Refresh** first (`/api/strategy/run`) to populate template/team-fit tables.
3. Run **Sync Now** (`/api/sync/run`) to generate a fresh recommendation batch tied to a new `run_id`.
4. Validate in dashboard:
   - Strategy cards are populated (Template Pulse, Team vs Elite, Transfer Radar, Momentum).
   - Recommendation counts reflect the latest run.
   - Pipeline Health shows the run completed (not stuck in running).
5. Use **Video Diagnostics** for transcript failure reasons (`missing_transcript`, `ytdlp_not_installed`, etc.).

## Deployment + Schema Process

When deploying code that changes DB contract:

1. Apply `/scripts/supabase-schema.sql` in Supabase SQL Editor.
2. Verify setup:
   - `npm run supabase:verify`
3. Smoke critical routes:
   - `npm run smoke:supabase`
4. Deploy after verify + smoke pass.

This prevents runtime drift between app expectations and Supabase tables.
