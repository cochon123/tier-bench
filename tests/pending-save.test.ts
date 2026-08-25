import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPendingBallotSave,
  pendingBallotSaveKey,
  pendingBallotSaveLifetimeMs,
  readPendingBallotSave,
  storePendingBallotSave,
} from "../app/rank/pending-save.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test("a pending ballot survives an auth redirect and can be consumed", () => {
  const storage = memoryStorage();
  const pending = { category: "overall", placements: { alpha: "S" as const, beta: null }, requestedAt: 1_000 };
  storePendingBallotSave(storage, pending);

  assert.deepEqual(readPendingBallotSave(storage, 2_000), pending);
  clearPendingBallotSave(storage);
  assert.equal(readPendingBallotSave(storage, 2_000), null);
});

test("expired or malformed pending ballots cannot publish later", () => {
  const storage = memoryStorage();
  storePendingBallotSave(storage, { category: "overall", placements: { alpha: "S" }, requestedAt: 1_000 });
  assert.equal(readPendingBallotSave(storage, 1_000 + pendingBallotSaveLifetimeMs + 1), null);
  assert.equal(storage.getItem(pendingBallotSaveKey), null);

  storage.setItem(pendingBallotSaveKey, JSON.stringify({ category: "overall", placements: ["S"], requestedAt: 3_000 }));
  assert.equal(readPendingBallotSave(storage, 3_001), null);
  assert.equal(storage.getItem(pendingBallotSaveKey), null);
});
