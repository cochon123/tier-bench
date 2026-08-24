-- Durable application state. Apply with your migration runner (or psql) before
-- enabling writes. All timestamps are UTC and all user ids are Clerk ids.
create table if not exists model_catalog (
  id text primary key,
  name text not null,
  provider text not null,
  context_window text,
  pricing text,
  description text,
  logo_url text,
  metadata jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists model_catalog_one_default on model_catalog (is_default) where is_default;

create table if not exists ballots (
  id bigint generated always as identity primary key,
  user_id text not null,
  category_slug text not null,
  placements jsonb not null,
  ranked_count integer not null check (ranked_count between 0 and 500),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_slug)
);
create index if not exists ballots_category_idx on ballots (category_slug, updated_at desc);

create table if not exists ballot_revisions (
  id bigint generated always as identity primary key,
  ballot_id bigint not null references ballots(id) on delete cascade,
  user_id text not null,
  category_slug text not null,
  revision integer not null check (revision > 0),
  placements jsonb not null,
  ranked_count integer not null check (ranked_count between 0 and 500),
  created_at timestamptz not null default now(),
  unique (ballot_id, revision)
);
create index if not exists ballot_revisions_share_idx on ballot_revisions (id);

create table if not exists share_snapshots (
  id text primary key,
  ballot_id bigint references ballots(id) on delete set null,
  user_id text not null,
  category_slug text not null,
  revision integer not null,
  placements jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists share_snapshots_created_idx on share_snapshots (created_at desc);

create table if not exists proposals (
  id bigint generated always as identity primary key,
  author_user_id text not null,
  title text not null check (char_length(title) between 1 and 60),
  description text not null check (char_length(description) between 1 and 220),
  status text not null default 'Open' check (status in ('Open', 'Under review', 'Needs clarification', 'Accepted', 'Rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proposals_sort_idx on proposals (created_at desc);

create table if not exists proposal_votes (
  proposal_id bigint not null references proposals(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);
create index if not exists proposal_votes_user_idx on proposal_votes (user_id);

create table if not exists model_comments (
  id bigint generated always as identity primary key,
  model_id text not null,
  user_id text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists model_comments_model_idx on model_comments (model_id, created_at desc);

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
