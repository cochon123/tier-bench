-- OpenRouter catalog and explicit default-line configuration.
-- This follows 001_persistence.sql so existing ballot tables are untouched.

-- 001 has a compact local catalog shape. Extend it in place rather than
-- replacing rows: a production deploy may already have run 001.
alter table model_catalog add column if not exists canonical_slug text;
alter table model_catalog add column if not exists api_id text;
alter table model_catalog add column if not exists context_length integer;
alter table model_catalog add column if not exists modality text;
alter table model_catalog add column if not exists input_modalities jsonb not null default '[]'::jsonb;
alter table model_catalog add column if not exists output_modalities jsonb not null default '[]'::jsonb;
alter table model_catalog add column if not exists pricing_json jsonb not null default '{}'::jsonb;
alter table model_catalog add column if not exists top_provider jsonb not null default '{}'::jsonb;
alter table model_catalog add column if not exists per_request_limits jsonb not null default '{}'::jsonb;
alter table model_catalog add column if not exists supported_parameters jsonb not null default '[]'::jsonb;
alter table model_catalog add column if not exists source text not null default 'openrouter';
alter table model_catalog add column if not exists status text not null default 'active';
alter table model_catalog add column if not exists raw jsonb not null default '{}'::jsonb;
alter table model_catalog add column if not exists first_seen_at timestamptz not null default now();
alter table model_catalog add column if not exists last_seen_at timestamptz not null default now();

update model_catalog set canonical_slug = id where canonical_slug is null;
update model_catalog set api_id = id where api_id is null;
alter table model_catalog alter column canonical_slug set not null;
alter table model_catalog alter column api_id set not null;

drop index if exists model_catalog_one_default;
create unique index if not exists model_catalog_canonical_slug_idx on model_catalog (canonical_slug);
create unique index if not exists model_catalog_api_id_idx on model_catalog (api_id);
create index if not exists model_catalog_status_idx on model_catalog (status, created_at desc);

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

-- These are the only defaults at launch. They intentionally use the stable
-- IDs already shipped in app/data.ts. A later admin match may attach a
-- canonical OpenRouter slug without changing the ballot-facing ID.
insert into model_default_mappings (default_model_id, display_order, trusted_auto_publish)
values
  ('claude-fable-5', 1, true),
  ('claude-mythos-5', 2, false),
  ('claude-opus-5', 3, true),
  ('claude-sonnet-5', 4, true),
  ('gpt-5-6-terra', 5, true),
  ('gpt-5-6-luna', 6, true),
  ('gpt-5-6-sol', 7, true),
  ('glm-5-3', 8, true),
  ('deepseek-v4-pro', 9, true),
  ('mimo-v2-5-pro', 10, true),
  ('mistral-large', 11, true),
  ('qwen-3-8-27b', 12, true),
  ('qwen-3-8-max', 13, true),
  ('muse-glimmer', 14, true),
  ('gemini-3-1-pro', 15, true),
  ('gemini-3-7-flash', 16, true),
  ('kimi-k3', 17, true),
  ('grok-4-6', 18, true)
on conflict (default_model_id) do nothing;

-- Seed the shipped product-line rows so the database-backed catalog and the
-- ballot picker agree from the first boot. These rows are explicit defaults;
-- every later OpenRouter import is non-default unless an admin maps it here.
insert into model_catalog (id, canonical_slug, api_id, name, provider, context_window, pricing, description, source, status, active)
values
  ('claude-fable-5', 'claude-fable-5', 'claude-fable-5', 'Claude Fable 5', 'Anthropic', '256K', '$2 / $10', 'A fast, expressive general model tuned for everyday work and conversation.', 'manual', 'active', true),
  ('claude-mythos-5', 'claude-mythos-5', 'claude-mythos-5', 'Claude Mythos 5', 'Anthropic', '256K', 'Limited access', 'Anthropic’s limited-access frontier reasoning release.', 'manual', 'active', true),
  ('claude-opus-5', 'claude-opus-5', 'claude-opus-5', 'Claude Opus 5', 'Anthropic', '256K', '$15 / $75', 'A high-capability model for difficult research, writing, and software tasks.', 'manual', 'active', true),
  ('claude-sonnet-5', 'claude-sonnet-5', 'claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic', '256K', '$3 / $15', 'A balanced model for coding and knowledge work.', 'manual', 'active', true),
  ('gpt-5-6-terra', 'gpt-5-6-terra', 'gpt-5-6-terra', 'GPT-5.6 Terra', 'OpenAI', '400K', '$1.50 / $8', 'A grounded general-purpose model with strong tool use and instruction following.', 'manual', 'active', true),
  ('gpt-5-6-luna', 'gpt-5-6-luna', 'gpt-5-6-luna', 'GPT-5.6 Luna', 'OpenAI', '400K', '$3 / $18', 'A creative reasoning model with a strong balance of speed and depth.', 'manual', 'active', true),
  ('gpt-5-6-sol', 'gpt-5-6-sol', 'gpt-5-6-sol', 'GPT-5.6 Sol', 'OpenAI', '400K', '$8 / $40', 'OpenAI’s most capable model for demanding, long-running work.', 'manual', 'active', true),
  ('glm-5-3', 'glm-5-3', 'glm-5-3', 'GLM 5.3', 'Z.ai', '200K', '$0.80 / $2.80', 'An efficient multilingual reasoning and coding model.', 'manual', 'active', true),
  ('deepseek-v4-pro', 'deepseek-v4-pro', 'deepseek-v4-pro', 'DeepSeek V4 Pro', 'DeepSeek', '164K', '$0.70 / $2.50', 'DeepSeek’s flagship reasoning model for code, math, and research.', 'manual', 'active', true),
  ('mimo-v2-5-pro', 'mimo-v2-5-pro', 'mimo-v2-5-pro', 'MiMo V2.5 Pro', 'Xiaomi', '128K', '$0.40 / $1.60', 'A compact, fast multilingual model with broad general capability.', 'manual', 'active', true),
  ('mistral-large', 'mistral-large', 'mistral-large', 'Mistral Large', 'Mistral', '128K', '$2 / $6', 'Mistral’s flagship open-weight-adjacent general model.', 'manual', 'active', true),
  ('qwen-3-8-27b', 'qwen-3-8-27b', 'qwen-3-8-27b', 'Qwen3.8 27B', 'Qwen', '128K', '$0.20 / $0.80', 'A nimble open model with strong multilingual and coding performance.', 'manual', 'active', true),
  ('qwen-3-8-max', 'qwen-3-8-max', 'qwen-3-8-max', 'Qwen3.8 Max', 'Qwen', '256K', '$1.20 / $5', 'Qwen’s largest general reasoning release.', 'manual', 'active', true),
  ('muse-glimmer', 'muse-glimmer', 'muse-glimmer', 'Muse Glimmer 30B', 'Meta', '128K', '$0.18 / $0.60', 'An open creative model tuned for ideation and natural conversation.', 'manual', 'active', true),
  ('gemini-3-1-pro', 'gemini-3-1-pro', 'gemini-3-1-pro', 'Gemini 3.1 Pro', 'Google', '1M', '$2 / $12', 'Google’s multimodal flagship for long-context work.', 'manual', 'active', true),
  ('gemini-3-7-flash', 'gemini-3-7-flash', 'gemini-3-7-flash', 'Gemini 3.7 Flash', 'Google', '1M', '$0.35 / $1.50', 'A fast, inexpensive multimodal model for high-volume work.', 'manual', 'active', true),
  ('kimi-k3', 'kimi-k3', 'kimi-k3', 'Kimi K3', 'Moonshot AI', '256K', '$0.60 / $2.40', 'A long-context agentic model with strong research and coding skills.', 'manual', 'active', true),
  ('grok-4-6', 'grok-4-6', 'grok-4-6', 'Grok 4.6', 'xAI', '256K', '$3 / $15', 'xAI’s conversational reasoning model with real-time knowledge in hosted use.', 'manual', 'active', true)
on conflict (id) do update set
  canonical_slug = excluded.canonical_slug,
  api_id = excluded.api_id,
  name = excluded.name,
  provider = excluded.provider,
  context_window = excluded.context_window,
  pricing = excluded.pricing,
  description = excluded.description,
  source = 'manual',
  status = 'active',
  active = true,
  is_default = false,
  updated_at = now();

update model_default_mappings
set canonical_slug = default_model_id, updated_at = now()
where canonical_slug is null;

create or replace view active_model_catalog as
select
  c.id,
  c.canonical_slug,
  c.api_id,
  c.name,
  c.provider,
  c.context_window,
  c.context_length,
  c.pricing,
  c.pricing_json,
  c.description,
  c.logo_url,
  c.metadata,
  c.modality,
  c.input_modalities,
  c.output_modalities,
  c.status,
  c.created_at,
  c.updated_at,
  c.last_seen_at,
  m.default_model_id,
  (m.default_model_id is not null) as is_default
from model_catalog c
left join model_default_mappings m on m.canonical_slug = c.canonical_slug and m.active
where c.active and c.status = 'active';
