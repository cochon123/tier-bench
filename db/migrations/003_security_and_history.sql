-- Shared rate limiting and indexes required by honest, revision-backed history.
create table if not exists rate_limit_buckets (
  key text not null,
  window_id bigint not null,
  count integer not null check (count > 0),
  expires_at timestamptz not null,
  primary key (key, window_id)
);
create index if not exists rate_limit_buckets_expiry_idx on rate_limit_buckets (expires_at);

create index if not exists ballot_revisions_history_idx
  on ballot_revisions (category_slug, created_at, ballot_id, revision desc);
