import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeCatalogReconciliation,
  buildCatalogSyncPlan,
} from "../app/lib/openrouter-catalog.ts";

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

test("catalog reconciliation refuses a truncated upstream response", () => {
  const plan = { models: [], fetchedCount: 70, textModelCount: 65, skippedNonTextCount: 5 };
  assert.throws(() => assertSafeCatalogReconciliation(plan, {
    activeOpenRouterCount: 100,
    previousFetchedCount: 110,
    previousTextModelCount: 100,
  }), /reconciliation refused/);
});
