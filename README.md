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
