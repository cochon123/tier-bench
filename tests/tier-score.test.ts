import assert from "node:assert/strict";
import test from "node:test";

import { tierForScore, tierMeta } from "../app/data.ts";

test("a single ballot round-trips every tier without shifting", () => {
  for (const [tier, metadata] of Object.entries(tierMeta)) {
    assert.equal(tierForScore(metadata.score), tier);
  }
});

test("mean scores change tier at the midpoint between adjacent tiers", () => {
  assert.equal(tierForScore(5.5), "S");
  assert.equal(tierForScore(4.5), "A");
  assert.equal(tierForScore(3.5), "B");
  assert.equal(tierForScore(2.5), "C");
  assert.equal(tierForScore(1.5), "D");
  assert.equal(tierForScore(1.49), "F");
});
