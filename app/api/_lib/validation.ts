import { categories, models, Tier, tierMeta } from "../../data";
import type { BallotPlacements } from "./db";

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
