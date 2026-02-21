create extension if not exists pgcrypto;

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  entry_id bigint,
  ollama_base_url text,
  ollama_model text,
  channels text[],
  created_at timestamptz default now()
);

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  channel_id text,
  label text,
  created_at timestamptz default now()
);

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  video_id text,
  title text,
  channel text,
  published_at timestamptz,
  status text,
  skip_reason text,
  processed_at timestamptz
);

create table if not exists video_transcripts (
  id uuid primary key default gen_random_uuid(),
  video_id text,
  transcript text,
  created_at timestamptz default now()
);

create table if not exists video_player_mentions (
  id uuid primary key default gen_random_uuid(),
  video_id text,
  player_name text,
  sentiment numeric,
  confidence numeric,
  created_at timestamptz default now()
);

create table if not exists player_metrics_snapshot (
  id uuid primary key default gen_random_uuid(),
  player_id bigint,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists recommendations_snapshot (
  id uuid primary key default gen_random_uuid(),
  player_id bigint,
  player_name text,
  action text,
  confidence int,
  score_5gw int,
  reasons jsonb,
  evidence_videos jsonb,
  updated_at timestamptz
);

create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text,
  started_at timestamptz,
  finished_at timestamptz,
  status text
);

create table if not exists pipeline_events (
  id uuid primary key default gen_random_uuid(),
  run_id text,
  level text,
  message text,
  created_at timestamptz
);
