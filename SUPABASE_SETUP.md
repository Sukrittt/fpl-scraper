# Supabase Setup

This project expects the required tables to exist in the `public` schema.

## 1) Required env vars

Set these in `/Users/sukrit/Web Dev/Projects/FPL Scraper/.env`:

```bash
DB_PROVIDER=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-or-secret-key>
```

## 2) Create schema in Supabase

1. Open Supabase dashboard for your project.
2. Go to `SQL Editor`.
3. Open `/Users/sukrit/Web Dev/Projects/FPL Scraper/scripts/supabase-schema.sql`.
4. Paste and run the full SQL.

## 3) Verify setup

```bash
npm run supabase:verify
```

Expected output:

```text
Supabase setup verified: env vars are present and all required tables exist.
```

## 4) Smoke-check routes against Supabase

```bash
npm run smoke:supabase
```

This runs:
- `GET /api/settings`
- `POST /api/sync/run`
- `GET /api/recommendations`
- `GET /api/videos?status=processed`

## 5) Set real runtime settings

Use your FPL entry id and YouTube channel ids:

```bash
npm run settings:apply -- --entry-id 123456 --channels UCxxxx,UCyyyy
```

This writes settings via `POST /api/settings` and then reads them back.

## 6) Live ingestion prerequisites

To fetch real YouTube videos/transcripts and run Ollama summarization:

```bash
ENABLE_LIVE_CLIENTS=1
YOUTUBE_API_KEY=<youtube-data-api-v3-key>
YOUTUBE_ONLY_CAPTIONED=1
YOUTUBE_USE_YTDLP=1
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1:8b-instruct
```

If `ENABLE_LIVE_CLIENTS=1` and `YOUTUBE_API_KEY` is missing, app bootstrap fails intentionally.
`YOUTUBE_ONLY_CAPTIONED=1` is recommended to avoid spending cycles on videos without available captions.
`YOUTUBE_USE_YTDLP=1` enables a secondary transcript fallback using `yt-dlp` when native caption extraction fails.
