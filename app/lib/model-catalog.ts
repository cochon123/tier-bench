import { models } from "../data.ts";
import type { Model } from "../data.ts";
import { logoUrlForProvider } from "./openrouter-catalog.ts";

/** Public model shape returned by catalog-backed API endpoints. */
export type CatalogApiModel = {
  id: string;
  canonicalSlug: string;
  apiId: string;
  name: string;
  provider: string;
  releasedAt: string;
  contextWindow: string;
  pricing: string;
  description: string;
  status: string;
  isDefault: boolean;
  logoUrl?: string | null;
  inputModalities?: string[];
  outputModalities?: string[];
};

export type CatalogRow = {
  id: string;
  canonical_slug: string;
  api_id: string;
  default_model_id: string | null;
  name: string;
  provider: string;
  released_at: string | Date | null;
  context_length: number | null;
  context_window: string | null;
  pricing_json: Record<string, unknown> | null;
  pricing: string | null;
  description: string | null;
  status: string;
  logo_url?: string | null;
  input_modalities?: unknown;
  output_modalities?: unknown;
};

export const defaultModelIds = models.map((model) => model.id);
export const defaultModelIdSet = new Set(defaultModelIds);

function releaseTime(model: Model): number {
  const time = new Date(model.release).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function newestCatalogModel(candidates: Model[]): Model {
  return [...candidates].sort((left, right) => releaseTime(right) - releaseTime(left))[0] ?? models[0];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function dateOnly(value: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function catalogRowToApiModel(row: CatalogRow): CatalogApiModel {
  const id = row.default_model_id ?? row.canonical_slug;
  const pricing = row.pricing ?? (row.pricing_json && Object.keys(row.pricing_json).length ? JSON.stringify(row.pricing_json) : "");
  return {
    id,
    canonicalSlug: row.canonical_slug,
    apiId: row.api_id,
    name: row.name,
    provider: row.provider,
    releasedAt: dateOnly(row.released_at),
    contextWindow: row.context_window ?? (row.context_length ? String(row.context_length) : ""),
    pricing,
    description: row.description ?? "",
    status: row.status,
    isDefault: Boolean(row.default_model_id),
    logoUrl: row.logo_url ?? null,
    inputModalities: stringArray(row.input_modalities),
    outputModalities: stringArray(row.output_modalities),
  };
}

export function defaultCatalogApiModels(): CatalogApiModel[] {
  return models.map((model) => ({
    id: model.id,
    canonicalSlug: model.id,
    apiId: model.id,
    name: model.name,
    provider: model.maker,
    releasedAt: dateOnly(model.release),
    contextWindow: model.context,
    pricing: model.price,
    description: model.description,
    status: "active",
    isDefault: true,
    logoUrl: model.logo ?? null,
    inputModalities: model.inputModalities ?? ["text"],
    outputModalities: model.outputModalities ?? ["text"],
  }));
}

function isCatalogApiModel(value: unknown): value is CatalogApiModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<CatalogApiModel>;
  return typeof model.id === "string" && Boolean(model.id.trim())
    && typeof model.name === "string" && Boolean(model.name.trim())
    && typeof model.provider === "string";
}

export function catalogModel(model: CatalogApiModel): Model {
  const provider = model.provider.trim() || "Unknown";
  const mark = provider.split(/[\s._-]+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AI";
  let hash = 0;
  for (const character of provider) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return {
    id: model.id,
    name: model.name,
    maker: provider,
    mark,
    color: `hsl(${hash % 360} 45% 42%)`,
    release: model.releasedAt || "Release date unavailable",
    context: model.contextWindow || "Unavailable",
    price: model.pricing || "Unavailable",
    description: model.description || "Catalog model metadata is unavailable.",
    logo: model.logoUrl || logoUrlForProvider(provider) || undefined,
    inputModalities: stringArray(model.inputModalities),
    outputModalities: stringArray(model.outputModalities),
  };
}

/**
 * Merge catalog imports into the shipped product lines. The shipped 18 retain
 * their curated presentation, while catalog-only models become optional UI
 * choices and use the exact same render shape on every page.
 */
export function mergeCatalogModels(catalog: unknown, pinned: unknown = []): Model[] {
  const merged = new Map(models.map((model) => [model.id, model]));
  for (const source of [catalog, pinned]) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      if (!isCatalogApiModel(item) || defaultModelIdSet.has(item.id)) continue;
      merged.set(item.id, catalogModel(item));
    }
  }
  return [...merged.values()];
}
