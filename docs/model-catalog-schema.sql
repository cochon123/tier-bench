-- Durable OpenRouter catalog.
--
-- Every eligible text-output model returned by OpenRouter is stored here. The
-- `model_default_mappings` table is deliberately separate: importing a model
-- must never put it on a ballot by accident. Only mappings created from the
-- existing product-line seed are defaults.

create table if not exists model_catalog (
  canonical_slug text primary key,
  api_id text not null,
  provider text not null,
  name text not null,
  description text,
  released_at timestamptz,
  created_at timestamptz,
  context_length integer check (context_length is null or context_length > 0),
  modality text,
  input_modalities jsonb not null default '[]'::jsonb,
  output_modalities jsonb not null default '[]'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  top_provider jsonb not null default '{}'::jsonb,
  per_request_limits jsonb not null default '{}'::jsonb,
  supported_parameters jsonb not null default '[]'::jsonb,
  source text not null default 'openrouter' check (source in ('openrouter', 'manual')),
  status text not null default 'active' check (status in ('active', 'hidden', 'deprecated')),
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists model_catalog_api_id_idx on model_catalog (api_id);
create index if not exists model_catalog_provider_idx on model_catalog (provider, name);
create index if not exists model_catalog_status_idx on model_catalog (status, created_at desc);

-- `default_model_id` is the stable application ID already used by app/data.ts
-- (for example `gpt-5-6-sol`). It is not replaced when OpenRouter changes an
-- alias. `canonical_slug` can be filled when a reliable upstream match exists;
-- NULL is valid for a manually maintained exception such as Mythos.
create table if not exists model_default_mappings (
  default_model_id text primary key,
  canonical_slug text references model_catalog(canonical_slug) on delete set null,
  display_order integer not null default 0,
  active boolean not null default true,
  automatic_release_detection boolean not null default true,
  trusted_auto_publish boolean not null default false,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists model_default_mappings_active_idx
  on model_default_mappings (active, display_order, default_model_id);

-- Alias history allows the current OpenRouter API ID to move without losing
-- the canonical release identity or breaking old history URLs.
create table if not exists model_catalog_aliases (
  canonical_slug text not null references model_catalog(canonical_slug) on delete cascade,
  api_id text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (canonical_slug, api_id),
  unique (api_id)
);

create table if not exists model_catalog_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  fetched_count integer not null default 0 check (fetched_count >= 0),
  text_model_count integer not null default 0 check (text_model_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  error text
);

create index if not exists model_catalog_sync_runs_recent_idx
  on model_catalog_sync_runs (started_at desc);

-- This view is the only catalog shape the ballot picker should read. Notice
-- that an imported OpenRouter model remains non-default unless it is attached
-- to one of the explicitly configured existing default lines.
create or replace view active_model_catalog as
select
  c.*,
  coalesce(m.active, false) as is_default,
  m.default_model_id
from model_catalog c
left join model_default_mappings m on m.canonical_slug = c.canonical_slug and m.active
where c.status = 'active';
