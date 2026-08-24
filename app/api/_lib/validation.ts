import { categories, models, tierMeta } from "../../data.ts";
import type { Tier } from "../../data.ts";
import type { BallotPlacements } from "./db.ts";

export const tiers = Object.keys(tierMeta) as Tier[];

export function validCategory(value: unknown): value is string {
  return typeof value === "string" && categories.some((category) => category.slug === value);
}

export function validatePlacements(value: unknown): { ok: true; placements: BallotPlacements; rankedCount: number } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "placements must be an object" };
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 500) return { ok: false, error: "A ballot cannot contain more than 500 models" };
  const placements: BallotPlacements = {};
  let rankedCount = 0;
  for (const [modelId, tier] of entries) {
    if (modelId.length > 200 || !/^[\w.:[\]/-]+$/.test(modelId)) return { ok: false, error: "Invalid model id" };
    // Models are allowed to come from the OpenRouter catalog, which may be
    // refreshed independently of the server bundle. Unknown ids are therefore
    // retained here; the catalog sync/admin layer decides visibility.
    if (tier !== null && (typeof tier !== "string" || !tiers.includes(tier as Tier))) return { ok: false, error: `Invalid tier for ${modelId}` };
    placements[modelId] = tier as string | null;
    if (tier !== null) rankedCount += 1;
  }
  return { ok: true, placements, rankedCount };
}

export type CatalogIdentity = { id: string; canonical_slug: string; api_id: string; default_model_id: string | null };

/** Resolve every accepted alias to one durable ballot ID and fail on ambiguity. */
export function normalizeCatalogPlacements(placements: BallotPlacements, catalog: CatalogIdentity[]) {
  const aliases = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const model of catalog) {
    const stableId = model.default_model_id ?? model.canonical_slug;
    for (const alias of [model.id, model.canonical_slug, model.api_id, model.default_model_id]) {
      if (!alias) continue;
      const existing = aliases.get(alias);
      if (existing && existing !== stableId) ambiguous.add(alias);
      else aliases.set(alias, stableId);
    }
  }
  const normalized: BallotPlacements = {};
  for (const [submittedId, tier] of Object.entries(placements)) {
    const stableId = aliases.get(submittedId);
    if (ambiguous.has(submittedId)) return { ok: false as const, error: `Ambiguous model alias: ${submittedId}` };
    if (!stableId) return { ok: false as const, error: `Unknown or inactive model: ${submittedId}` };
    if (stableId in normalized && normalized[stableId] !== tier) {
      return { ok: false as const, error: `Conflicting placements were submitted for aliases of ${stableId}` };
    }
    normalized[stableId] = tier;
  }
  return { ok: true as const, placements: normalized, rankedCount: Object.values(normalized).filter(Boolean).length };
}

export function validateText(value: unknown, field: string, max: number) {
  if (typeof value !== "string") return { ok: false as const, error: `${field} must be text` };
  const normalized = value.trim();
  if (!normalized) return { ok: false as const, error: `${field} is required` };
  if (normalized.length > max) return { ok: false as const, error: `${field} must be ${max} characters or fewer` };
  return { ok: true as const, value: normalized };
}

export function publicModelIds() {
  return new Set(models.map((model) => model.id));
}
