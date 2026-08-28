/**
 * OpenRouter's public model catalog adapter.
 *
 * This module intentionally contains no database code.  Keeping fetching,
 * validation, filtering, and normalization here makes the scheduled sync
 * easy to retry and lets the database layer use one deterministic contract.
 */

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export type OpenRouterModel = {
  id: string;
  canonical_slug?: string | null;
  name?: string | null;
  created?: number | string | null;
  description?: string | null;
  context_length?: number | null;
  architecture?: {
    modality?: string | null;
    input_modalities?: string[] | null;
    output_modalities?: string[] | null;
    tokenizer?: string | null;
    instruct_type?: string | null;
  } | null;
  pricing?: Record<string, string | number | null> | null;
  top_provider?: Record<string, unknown> | null;
  per_request_limits?: Record<string, unknown> | null;
  supported_parameters?: string[] | null;
};

export type NormalizedCatalogModel = {
  /** Stable identity. Prefer canonical_slug because OpenRouter aliases IDs. */
  canonicalSlug: string;
  /** Current API ID, which may change when an alias is updated. */
  apiId: string;
  name: string;
  provider: string;
  logoUrl: string | null;
  description: string | null;
  createdAt: string | null;
  contextLength: number | null;
  modality: string | null;
  inputModalities: string[];
  outputModalities: string[];
  pricing: Record<string, string | number | null>;
  topProvider: Record<string, unknown>;
  perRequestLimits: Record<string, unknown>;
  supportedParameters: string[];
  source: "openrouter";
  raw: OpenRouterModel;
};

export type CatalogSyncPlan = {
  models: NormalizedCatalogModel[];
  fetchedCount: number;
  textModelCount: number;
  skippedNonTextCount: number;
};

export type CatalogCompletenessBaseline = {
  activeOpenRouterCount: number;
  previousFetchedCount: number;
  previousTextModelCount: number;
};

const DEFAULT_MIN_CATALOG_SIZE = 10;

/**
 * OpenRouter lists more than text chat models (image generation, embeddings,
 * speech, etc.).  A model is eligible when it declares text output.  Older
 * or unusual records without architecture metadata are retained unless their
 * identifier/name is an unambiguous non-LLM modality.
 */
export function isTextModel(model: Pick<OpenRouterModel, "id" | "name" | "architecture">): boolean {
  const architecture = model.architecture;
  const output = architecture?.output_modalities?.map((value) => value.toLowerCase()) ?? [];
  const modality = architecture?.modality?.toLowerCase() ?? "";
  if (output.length > 0) return output.includes("text");
  if (modality) {
    const outputSide = modality.split("->").at(-1)?.trim() ?? "";
    if (outputSide) return outputSide.split("+").includes("text");
  }

  const haystack = `${model.id} ${model.name ?? ""}`.toLowerCase();
  return !/(^|[\/-_])(embedding|embed|rerank|moderation|whisper|tts|speech|audio|video)([\/-_]|$)/.test(haystack)
    && !/(text-to-image|image-generation|image-generation|stable-diffusion|dall-e|flux|imagen)/.test(haystack);
}

function parseCreatedAt(created: OpenRouterModel["created"]): string | null {
  if (created === null || created === undefined || created === "") return null;
  const numeric = typeof created === "number" ? created : Number(created);
  if (Number.isFinite(numeric)) {
    const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(String(created));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function splitModelName(model: OpenRouterModel): { provider: string; name: string } {
  const rawName = typeof model.name === "string" && model.name.trim() ? model.name.trim() : model.id.trim();
  const prefix = rawName.match(/^([^:]{2,48}):\s+(.+)$/);
  if (prefix) return { provider: prefix[1].trim(), name: prefix[2].trim() };
  const providerSlug = model.canonical_slug?.split("/", 1)[0]?.trim() || model.id.split("/", 1)[0]?.trim();
  return { provider: providerSlug || "unknown", name: rawName };
}

const localProviderLogos: Record<string, string> = {
  anthropic: "/logos/claude-color.png", openai: "/logos/openai.svg", google: "/logos/google.svg",
  deepseek: "/logos/deepseek.svg", meta: "/logos/meta.svg", xai: "/logos/x.svg",
  mistral: "/logos/mistralai.svg", qwen: "/logos/qwen-avatar.jpg", "moonshot ai": "/logos/kimi-avatar.png",
  moonshotai: "/logos/kimi-avatar.png", xiaomi: "/logos/xiaomi.svg", "z.ai": "/logos/zai.png", zai: "/logos/zai.png",
};

export function logoUrlForProvider(provider: string): string | null {
  const key = provider.trim().toLowerCase();
  if (!key || key === "unknown") return null;
  if (localProviderLogos[key]) return localProviderLogos[key];
  const slug = key.replace(/[^a-z0-9]+/g, "").replace(/ai$/, "");
  return slug ? `https://cdn.simpleicons.org/${slug}` : null;
}

function stringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function record(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" ? value : {};
}

function pricingRecord(value: OpenRouterModel["pricing"]): Record<string, string | number | null> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item === null || typeof item === "string" || typeof item === "number"));
}

export function normalizeModel(model: OpenRouterModel): NormalizedCatalogModel | null {
  if (!model || typeof model.id !== "string" || !model.id.trim()) return null;
  const canonicalSlug = (typeof model.canonical_slug === "string" && model.canonical_slug.trim()) || model.id.trim();
  const display = splitModelName(model);
  return {
    canonicalSlug,
    apiId: model.id.trim(),
    name: display.name,
    provider: display.provider,
    logoUrl: logoUrlForProvider(display.provider),
    description: typeof model.description === "string" ? model.description : null,
    createdAt: parseCreatedAt(model.created),
    contextLength: typeof model.context_length === "number" && Number.isFinite(model.context_length) ? model.context_length : null,
    modality: typeof model.architecture?.modality === "string" ? model.architecture.modality : null,
    inputModalities: stringArray(model.architecture?.input_modalities),
    outputModalities: stringArray(model.architecture?.output_modalities),
    pricing: pricingRecord(model.pricing),
    topProvider: record(model.top_provider),
    perRequestLimits: record(model.per_request_limits),
    supportedParameters: stringArray(model.supported_parameters),
    source: "openrouter",
    raw: model,
  };
}

function createdTime(model: NormalizedCatalogModel): number {
  return model.createdAt ? new Date(model.createdAt).getTime() : 0;
}

/**
 * Collapse aliases that point at one canonical release.  When an upstream
 * response contains both the canonical ID and an alias, keep the newest
 * record, preferring the canonical ID on equal timestamps.
 */
export function deduplicateCanonicalModels(models: NormalizedCatalogModel[]): NormalizedCatalogModel[] {
  const byCanonical = new Map<string, NormalizedCatalogModel>();
  for (const model of models) {
    const existing = byCanonical.get(model.canonicalSlug);
    if (!existing || createdTime(model) > createdTime(existing) || (createdTime(model) === createdTime(existing) && model.apiId === model.canonicalSlug)) {
      byCanonical.set(model.canonicalSlug, model);
    }
  }
  return [...byCanonical.values()].sort((a, b) => a.canonicalSlug.localeCompare(b.canonicalSlug));
}

export function assertCompleteCatalog(models: unknown, minimum = DEFAULT_MIN_CATALOG_SIZE): asserts models is OpenRouterModel[] {
  if (!Array.isArray(models) || models.length < minimum) {
    throw new Error(`OpenRouter catalog appears incomplete (received ${Array.isArray(models) ? models.length : 0}, expected at least ${minimum})`);
  }
  if (models.some((model) => !model || typeof model !== "object" || typeof (model as OpenRouterModel).id !== "string" || !(model as OpenRouterModel).id.trim())) {
    throw new Error("OpenRouter catalog contains an invalid model record");
  }
}

/**
 * An upstream model disappearing is meaningful only when the response is
 * plausibly complete. Compare it with both the current database and the last
 * successful fetch so a truncated-but-valid JSON response cannot retire most
 * of the catalog. Large legitimate removals require an operator to investigate
 * and establish a new baseline instead of being applied silently.
 */
export function assertSafeCatalogReconciliation(
  plan: CatalogSyncPlan,
  baseline: CatalogCompletenessBaseline,
  maximumDropFraction = 0.2,
): void {
  if (!Number.isFinite(maximumDropFraction) || maximumDropFraction < 0 || maximumDropFraction >= 1) {
    throw new Error("Catalog reconciliation drop fraction must be between 0 and 1");
  }
  const retainedFraction = 1 - maximumDropFraction;
  const expectedFetched = Math.max(0, baseline.previousFetchedCount);
  const expectedText = Math.max(0, baseline.previousTextModelCount, baseline.activeOpenRouterCount);
  const minimumFetched = Math.ceil(expectedFetched * retainedFraction);
  const minimumText = Math.ceil(expectedText * retainedFraction);

  if (expectedFetched > 0 && plan.fetchedCount < minimumFetched) {
    throw new Error(`OpenRouter catalog reconciliation refused: fetched count dropped from ${expectedFetched} to ${plan.fetchedCount}`);
  }
  if (expectedText > 0 && plan.textModelCount < minimumText) {
    throw new Error(`OpenRouter catalog reconciliation refused: text model count dropped from ${expectedText} to ${plan.textModelCount}`);
  }
}

export async function fetchOpenRouterCatalog(options: { fetcher?: typeof fetch; minimumModels?: number; signal?: AbortSignal } = {}): Promise<OpenRouterModel[]> {
  const response = await (options.fetcher ?? fetch)(OPENROUTER_MODELS_URL, {
    headers: { Accept: "application/json" },
    signal: options.signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OpenRouter catalog request failed (${response.status})`);
  const body: unknown = await response.json();
  const models = body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
    ? (body as { data: OpenRouterModel[] }).data
    : body;
  assertCompleteCatalog(models, options.minimumModels ?? DEFAULT_MIN_CATALOG_SIZE);
  return models;
}

export function buildCatalogSyncPlan(models: OpenRouterModel[], minimumModels = DEFAULT_MIN_CATALOG_SIZE): CatalogSyncPlan {
  assertCompleteCatalog(models, minimumModels);
  const normalized = models.filter((model) => isTextModel(model)).map(normalizeModel).filter((model): model is NormalizedCatalogModel => Boolean(model));
  const deduplicated = deduplicateCanonicalModels(normalized);
  if (!deduplicated.length) throw new Error("OpenRouter catalog contained no text-output models");
  const identities = new Map<string, string>();
  for (const model of deduplicated) {
    for (const identity of [model.canonicalSlug, model.apiId]) {
      const owner = identities.get(identity);
      if (owner && owner !== model.canonicalSlug) throw new Error(`OpenRouter catalog identity collision for ${identity}`);
      identities.set(identity, model.canonicalSlug);
    }
  }
  return {
    models: deduplicated,
    fetchedCount: models.length,
    textModelCount: deduplicated.length,
    skippedNonTextCount: models.length - normalized.length,
  };
}
