import assert from "node:assert/strict";
import test from "node:test";
import { ballotImageSize, ballotImageWidth } from "../app/rank/ballot-image.ts";

const emptyRows = [
  { tier: "S", color: "#ff625f", models: [] },
  { tier: "A", color: "#ff9f45", models: [] },
  { tier: "B", color: "#ffd36b", models: [] },
  { tier: "C", color: "#69cfa0", models: [] },
  { tier: "D", color: "#ae74ec", models: [] },
  { tier: "F", color: "#ec64aa", models: [] },
];

test("ballot image grows with extra models in a tier", () => {
  const empty = ballotImageSize(emptyRows);
  const crowded = ballotImageSize(emptyRows.map((row) => row.tier === "C"
    ? { ...row, models: Array.from({ length: 12 }, (_, index) => ({ name: `Model ${index}`, color: "#69cfa0", mark: "M", maker: "Meta" })) }
    : row));
  assert.equal(empty.width, ballotImageWidth);
  assert.ok(crowded.height > empty.height);
});
