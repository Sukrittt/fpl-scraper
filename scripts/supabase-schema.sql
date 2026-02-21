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
  run_id text,
  player_id bigint,
  player_name text,
  action text,
  confidence int,
  score_5gw int,
  template_ownership_pct numeric,
  template_gap_score int,
  momentum_signal numeric,
  risk_tier text,
  team_fit_reason text,
  reasons jsonb,
  evidence_videos jsonb,
  updated_at timestamptz
);

create table if not exists elite_managers_snapshot (
  id uuid primary key default gen_random_uuid(),
  snapshot_gw int,
  manager_entry_id bigint,
  overall_rank bigint,
  total_points int,
  captain_player_id bigint,
  formation text,
  created_at timestamptz default now()
);

create table if not exists elite_manager_picks_snapshot (
  id uuid primary key default gen_random_uuid(),
  snapshot_gw int,
  manager_entry_id bigint,
  player_id bigint,
  position_slot int,
  is_captain boolean default false,
  is_vice_captain boolean default false,
  created_at timestamptz default now()
);

create table if not exists elite_template_snapshot (
  id uuid primary key default gen_random_uuid(),
  snapshot_gw int,
  player_id bigint,
  template_ownership_pct numeric,
  captain_pct numeric,
  vice_pct numeric,
  buy_momentum numeric,
  sell_momentum numeric,
  created_at timestamptz default now()
);

create table if not exists team_strategy_insights (
  id uuid primary key default gen_random_uuid(),
  snapshot_gw int,
  entry_id bigint,
  risk_profile text,
  recommended_in jsonb,
  recommended_out jsonb,
  confidence int,
  diagnostic_code text,
  why text,
  evidence jsonb,
  created_at timestamptz default now()
);

create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
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

alter table if exists recommendations_snapshot add column if not exists run_id text;
alter table if exists team_strategy_insights add column if not exists diagnostic_code text;
alter table if exists pipeline_runs alter column run_id set not null;

with ranked_runs as (
  select
    id,
    row_number() over (
      partition by run_id
      order by
        case
          when status = 'completed' then 3
          when status = 'failed' then 2
          else 1
        end desc,
        coalesce(finished_at, started_at) desc,
        id desc
    ) as rn
  from pipeline_runs
)
delete from pipeline_runs p
using ranked_runs rr
where p.id = rr.id
  and rr.rn > 1;

create unique index if not exists pipeline_runs_run_id_uidx on pipeline_runs (run_id);
