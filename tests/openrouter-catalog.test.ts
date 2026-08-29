import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeCatalogReconciliation,
  buildCatalogSyncPlan,
  logoUrlForProvider,
} from "../app/lib/openrouter-catalog.ts";
import { enforceRetiredModelPolicy, normalizeCatalogPlacements, validatePlacements } from "../app/api/_lib/validation.ts";
import { boardsAcross } from "../app/api/v1/_lib/history.ts";

test("catalog keeps text models, creation time, and canonical identity", () => {
  const plan = buildCatalogSyncPlan([
    { id: "acme/chat", canonical_slug: "acme/chat", name: "Chat", created: 1_700_000_000, architecture: { output_modalities: ["text"] } },
    { id: "acme/chat:alias", canonical_slug: "acme/chat", name: "Chat alias", created: 1_700_000_001, architecture: { output_modalities: ["text"] } },
    { id: "acme/image", name: "Image generation", architecture: { output_modalities: ["image"] } },
  ], 3);
  assert.equal(plan.fetchedCount, 3);
  assert.equal(plan.textModelCount, 1);
  assert.equal(plan.models[0].canonicalSlug, "acme/chat");
  assert.equal(plan.models[0].apiId, "acme/chat:alias");
  assert.equal(plan.models[0].createdAt, "2023-11-14T22:13:21.000Z");
});

test("catalog removes the manufacturer prefix and keeps its logo metadata", () => {
  const plan = buildCatalogSyncPlan([{ id: "z-ai/glm-5.3-flash", canonical_slug: "z-ai/glm-5.3-flash-20260826", name: "Z.ai: GLM 5.3 Flash", architecture: { output_modalities: ["text"] } }], 1);
  assert.equal(plan.models[0].name, "GLM 5.3 Flash");
  assert.equal(plan.models[0].provider, "Z.ai");
  assert.equal(plan.models[0].logoUrl, "/logos/zai.png");
  assert.equal(logoUrlForProvider("Unknown New Lab"), null);
});

test("catalog reconciliation refuses a truncated upstream response", () => {
  const plan = { models: [], fetchedCount: 70, textModelCount: 65, skippedNonTextCount: 5 };
  assert.throws(() => assertSafeCatalogReconciliation(plan, {
    activeOpenRouterCount: 100,
    previousFetchedCount: 110,
    previousTextModelCount: 100,
  }), /reconciliation refused/);
});

test("catalog import refuses cross-model canonical and alias collisions", () => {
  assert.throws(() => buildCatalogSyncPlan([
    { id: "vendor/shared", canonical_slug: "vendor/first", architecture: { output_modalities: ["text"] } },
    { id: "vendor/second", canonical_slug: "vendor/shared", architecture: { output_modalities: ["text"] } },
  ], 2), /identity collision/);
});

test("ballot aliases collapse to one stable canonical identity", () => {
  const catalog = [{ id: "vendor/model", canonical_slug: "vendor/model", api_id: "vendor/model:latest", default_model_id: null }];
  assert.deepEqual(normalizeCatalogPlacements({ "vendor/model:latest": "S" }, catalog), {
    ok: true, placements: { "vendor/model": "S" }, rankedCount: 1,
  });
  assert.match(normalizeCatalogPlacements({ "vendor/model": "S", "vendor/model:latest": "A" }, catalog).error ?? "", /Conflicting placements/);
  const collision = [...catalog, { id: "other", canonical_slug: "other", api_id: "vendor/model:latest", default_model_id: null }];
  assert.match(normalizeCatalogPlacements({ "vendor/model:latest": "S" }, collision).error ?? "", /Ambiguous model alias/);
});

test("ballot parsing accepts opaque OpenRouter IDs before catalog validation", () => {
  const result = validatePlacements({
    "~z-ai/glm-latest": "S",
    "vendor/model@preview+fast": "A",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.placements, {
    "~z-ai/glm-latest": "S",
    "vendor/model@preview+fast": "A",
  });
  assert.equal(result.rankedCount, 2);
});

test("ballot parsing still rejects unsafe structural IDs", () => {
  for (const placements of [{ "": "S" }, { "vendor/model\u0000suffix": "S" }, { ["x".repeat(201)]: "S" }]) {
    const result = validatePlacements(placements);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Invalid model id/);
  }
});

test("ballot parsing treats prototype-shaped IDs as ordinary data", () => {
  const result = validatePlacements(JSON.parse('{"__proto__":"S"}'));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(Object.hasOwn(result.placements, "__proto__"), true);
  assert.equal(result.placements.__proto__, "S");
});

test("a maximum multi-category history request executes one database query", async () => {
  let calls = 0;
  const execute = async () => { calls += 1; return []; };
  const boards = await boardsAcross(["overall", "chatting", "math", "code-quality", "steerability", "most-value"], "2026-01-01", "2026-04-01", "day", execute);
  assert.equal(calls, 1);
  assert.equal(boards.length, 6 * 91);
});

test("an ancient history range is rejected arithmetically before allocation or database access", async () => {
  let calls = 0;
  const execute = async () => { calls += 1; return []; };
  await assert.rejects(boardsAcross(["overall"], "0001-01-01", "2026-08-24", "day", execute), RangeError);
  assert.equal(calls, 0);
});

test("retired ballot models can remain unchanged or be removed, but cannot be newly ranked", () => {
  const active = new Set(["active/model"]);
  assert.deepEqual(enforceRetiredModelPolicy({ "active/model": "S", "retired/model": "A" }, { "retired/model": "A" }, active), {
    ok: true, placements: { "active/model": "S", "retired/model": "A" }, rankedCount: 2,
  });
  assert.deepEqual(enforceRetiredModelPolicy({ "active/model": "S", "retired/model": null }, { "retired/model": "A" }, active), {
    ok: true, placements: { "active/model": "S" }, rankedCount: 1,
  });
  assert.match(enforceRetiredModelPolicy({ "retired/model": "S" }, { "retired/model": "A" }, active).error ?? "", /not newly ranked/);
  assert.match(enforceRetiredModelPolicy({ "retired/model": "S" }, {}, active).error ?? "", /not newly ranked/);
});
