import assert from "node:assert/strict";
import test from "node:test";
import { models } from "../app/data.ts";
import {
  catalogRowToApiModel,
  defaultCatalogApiModels,
  defaultModelIds,
  mergeCatalogModels,
  newestCatalogModel,
} from "../app/lib/model-catalog.ts";

test("the public catalog contract keeps canonical imported IDs and upstream aliases", () => {
  const model = catalogRowToApiModel({
    id: "acme/frontier",
    canonical_slug: "acme/frontier",
    api_id: "acme/frontier:latest",
    default_model_id: null,
    name: "Frontier",
    provider: "acme",
    released_at: "2026-08-20T12:00:00Z",
    context_length: 131072,
    context_window: null,
    pricing_json: { prompt: "0.000001" },
    pricing: null,
    description: "An imported model",
    status: "active",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  });

  assert.equal(model.id, "acme/frontier");
  assert.equal(model.canonicalSlug, "acme/frontier");
  assert.equal(model.apiId, "acme/frontier:latest");
  assert.equal(model.releasedAt, "2026-08-20");
  assert.equal(model.releasedAtTimestamp, "2026-08-20T12:00:00.000Z");
  assert.deepEqual(model.inputModalities, ["text", "image"]);
});

test("catalog imports are optional while the shipped 18 remain the defaults", () => {
  const defaults = defaultCatalogApiModels();
  assert.equal(defaultModelIds.length, 18);
  assert.equal(new Set(defaultModelIds).size, 18);
  assert.ok(defaults.every((model) => model.isDefault && model.id === model.canonicalSlug));

  const merged = mergeCatalogModels([{
    id: "acme/frontier",
    canonicalSlug: "acme/frontier",
    apiId: "acme/frontier:latest",
    name: "Frontier",
    provider: "Acme AI",
    releasedAt: "2026-08-20",
    contextWindow: "131072",
    pricing: "$1 / $3",
    description: "An imported model",
    status: "active",
    isDefault: false,
    inputModalities: ["text"],
    outputModalities: ["text"],
  }]);

  assert.equal(merged.length, 19);
  assert.equal(merged.find((model) => model.id === "claude-opus-5"), models.find((model) => model.id === "claude-opus-5"), "curated defaults must not be overwritten");
  assert.deepEqual(merged.find((model) => model.id === "acme/frontier"), {
    id: "acme/frontier",
    name: "Frontier",
    maker: "Acme AI",
    mark: "AA",
    color: merged.find((model) => model.id === "acme/frontier")?.color,
    release: "2026-08-20",
    context: "131072",
    price: "$1 / $3",
    description: "An imported model",
    logo: undefined,
    inputModalities: ["text"],
    outputModalities: ["text"],
  });
});

test("newest catalog model is selected from fetched release dates", () => {
  const newest = newestCatalogModel([
    { ...models[0], release: "Aug 18, 2026" },
    { ...models[0], id: "openrouter/new-model", name: "New Model", release: "Aug 28, 2026" },
  ]);
  assert.equal(newest.id, "openrouter/new-model");
});

test("newest catalog model preserves exact timestamps for same-day releases", () => {
  const newest = newestCatalogModel([
    { ...models[0], id: "earlier", release: "2026-08-28T09:00:00.000Z" },
    { ...models[0], id: "later", release: "2026-08-28T18:00:00.000Z" },
  ]);
  assert.equal(newest.id, "later");
});
