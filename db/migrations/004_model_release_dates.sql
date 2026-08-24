-- Release dates are product metadata, not catalog insertion timestamps.
-- Keep them separate so a migrated or re-synced catalog does not make an old
-- model appear newly released.
alter table model_catalog add column if not exists released_at timestamptz;

-- OpenRouter creation timestamps were stored in created_at before released_at
-- existed. Preserve those upstream release dates for already imported rows.
update model_catalog
set released_at = created_at
where released_at is null and source = 'openrouter';

-- The shipped defaults have manually curated release dates in app/data.ts.
-- Seed them explicitly rather than inheriting the time this migration runs.
update model_catalog as catalog
set released_at = defaults.released_at
from (values
  ('claude-fable-5', '2026-08-18T00:00:00Z'::timestamptz),
  ('claude-mythos-5', '2026-08-14T00:00:00Z'::timestamptz),
  ('claude-opus-5', '2026-08-11T00:00:00Z'::timestamptz),
  ('claude-sonnet-5', '2026-08-08T00:00:00Z'::timestamptz),
  ('gpt-5-6-terra', '2026-08-16T00:00:00Z'::timestamptz),
  ('gpt-5-6-luna', '2026-08-16T00:00:00Z'::timestamptz),
  ('gpt-5-6-sol', '2026-08-16T00:00:00Z'::timestamptz),
  ('glm-5-3', '2026-08-12T00:00:00Z'::timestamptz),
  ('deepseek-v4-pro', '2026-08-13T00:00:00Z'::timestamptz),
  ('mimo-v2-5-pro', '2026-08-09T00:00:00Z'::timestamptz),
  ('mistral-large', '2026-08-02T00:00:00Z'::timestamptz),
  ('qwen-3-8-27b', '2026-08-15T00:00:00Z'::timestamptz),
  ('qwen-3-8-max', '2026-08-15T00:00:00Z'::timestamptz),
  ('muse-glimmer', '2026-08-06T00:00:00Z'::timestamptz),
  ('gemini-3-1-pro', '2026-08-04T00:00:00Z'::timestamptz),
  ('gemini-3-7-flash', '2026-08-17T00:00:00Z'::timestamptz),
  ('kimi-k3', '2026-08-10T00:00:00Z'::timestamptz),
  ('grok-4-6', '2026-08-07T00:00:00Z'::timestamptz)
) as defaults(id, released_at)
where catalog.id = defaults.id;

-- Append released_at to the existing view without changing the established
-- column order consumed by other API queries.
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
  (m.default_model_id is not null) as is_default,
  c.released_at
from model_catalog c
left join model_default_mappings m on m.canonical_slug = c.canonical_slug and m.active
where c.active and c.status = 'active';
