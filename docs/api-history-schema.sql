-- Production shape for durable model-evolution timelines.
-- Snapshots are append-only: corrections create a new snapshot, never mutate history.
create table leaderboard_snapshots (
  id bigint generated always as identity primary key,
  category_slug text not null,
  captured_at timestamptz not null,
  algorithm_version text not null,
  category_baseline numeric(5, 3) not null,
  ballot_count integer not null check (ballot_count >= 0),
  unique (category_slug, captured_at, algorithm_version)
);
create table leaderboard_snapshot_entries (
  snapshot_id bigint not null references leaderboard_snapshots(id),
  model_id text not null,
  rank integer not null check (rank > 0),
  tier text not null check (tier in ('S', 'A', 'B', 'C', 'D', 'F')),
  score numeric(5, 3) not null check (score between 0 and 6),
  observed_mean numeric(5, 3) not null check (observed_mean between 0 and 6),
  voter_count integer not null check (voter_count >= 0),
  confidence_low numeric(5, 3) not null,
  confidence_high numeric(5, 3) not null,
  distribution jsonb not null,
  primary key (snapshot_id, model_id)
);
create index leaderboard_snapshots_timeline_idx on leaderboard_snapshots (category_slug, captured_at desc);
create index leaderboard_entries_model_idx on leaderboard_snapshot_entries (model_id, snapshot_id);
create table model_events (
  id bigint generated always as identity primary key,
  model_id text not null,
  happened_at timestamptz not null,
  event_type text not null check (event_type in ('announced', 'released', 'price_changed', 'context_changed', 'deprecated', 'renamed')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  source_url text
);
create index model_events_timeline_idx on model_events (model_id, happened_at);
