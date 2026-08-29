import assert from "node:assert/strict";
import test from "node:test";
import {
  authoredBallotOrigin,
  ballotOriginAfterUndo,
  countRankedPlacements,
  hasAuthoredLocalBallot,
  omitExcludedPlacements,
  parseExcludedModelIds,
  serverBallotOrigin,
} from "../app/rank/ballot-exclusions.ts";

test("exclusions alone do not suppress a signed-in server ballot", () => {
  assert.equal(hasAuthoredLocalBallot({}, null), false);
  assert.equal(hasAuthoredLocalBallot({}, serverBallotOrigin), false);
});

test("an explicitly authored empty ballot preserves deletion of the only server placement", () => {
  assert.equal(hasAuthoredLocalBallot({}, authoredBallotOrigin), true);
});

test("origin metadata distinguishes server cache from authored and legacy placements", () => {
  const placements = { "model/ranked": "S" };
  assert.equal(hasAuthoredLocalBallot(placements, serverBallotOrigin), false);
  assert.equal(hasAuthoredLocalBallot(placements, authoredBallotOrigin), true);
  assert.equal(hasAuthoredLocalBallot(placements, null), true);
});

test("undoing removal of a placement becomes an authored local edit", () => {
  assert.equal(ballotOriginAfterUndo(true, serverBallotOrigin), authoredBallotOrigin);
  assert.equal(ballotOriginAfterUndo(false, serverBallotOrigin), serverBallotOrigin);
  assert.equal(ballotOriginAfterUndo(false, null), null);
});

test("excluded placements are omitted from counts and saves", () => {
  const placements = { "model/removed": "S", "model/kept": "A", "model/bench": null };
  assert.equal(countRankedPlacements(placements, ["model/removed"]), 1);
  assert.deepEqual(omitExcludedPlacements(placements, ["model/removed"]), {
    "model/kept": "A",
    "model/bench": null,
  });
  assert.deepEqual(placements, { "model/removed": "S", "model/kept": "A", "model/bench": null });
});

test("stored excluded IDs are safely parsed and de-duplicated", () => {
  assert.deepEqual(parseExcludedModelIds('["one","two","one",3]'), ["one", "two"]);
  assert.deepEqual(parseExcludedModelIds("not json"), []);
  assert.deepEqual(parseExcludedModelIds('{"one":true}'), []);
});
