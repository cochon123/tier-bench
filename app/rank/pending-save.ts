export type BallotTier = "S" | "A" | "B" | "C" | "D" | "F";

export type PendingBallotSave = {
  category: string;
  placements: Record<string, BallotTier | null>;
  requestedAt: number;
};

type BallotSaveStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export const pendingBallotSaveKey = "tier-bench:pending-ballot-save";
export const pendingBallotSaveLifetimeMs = 15 * 60_000;

const ballotTiers = new Set<unknown>(["S", "A", "B", "C", "D", "F"]);

function isPlacements(value: unknown): value is Record<string, BallotTier | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 500
    && entries.every(([modelId, tier]) => modelId.length > 0 && (tier === null || ballotTiers.has(tier)));
}

export function storePendingBallotSave(storage: BallotSaveStorage, pending: PendingBallotSave) {
  storage.setItem(pendingBallotSaveKey, JSON.stringify(pending));
}

export function readPendingBallotSave(storage: BallotSaveStorage, now = Date.now()): PendingBallotSave | null {
  const raw = storage.getItem(pendingBallotSaveKey);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as Partial<PendingBallotSave>;
    if (typeof pending.category !== "string" || !pending.category || typeof pending.requestedAt !== "number" || !isPlacements(pending.placements)) {
      storage.removeItem(pendingBallotSaveKey);
      return null;
    }
    if (pending.requestedAt > now || now - pending.requestedAt > pendingBallotSaveLifetimeMs) {
      storage.removeItem(pendingBallotSaveKey);
      return null;
    }
    return pending as PendingBallotSave;
  } catch {
    storage.removeItem(pendingBallotSaveKey);
    return null;
  }
}

export function clearPendingBallotSave(storage: BallotSaveStorage) {
  storage.removeItem(pendingBallotSaveKey);
}
