export type BallotPlacements = Record<string, string | null>;

export const excludedModelStorageKey = (category: string) => `tier-bench:ballot-excluded:${category}`;
export const ballotDraftOriginStorageKey = (category: string) => `tier-bench:ballot-origin:${category}`;
export const authoredBallotOrigin = "authored";
export const serverBallotOrigin = "server";

export function parseExcludedModelIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === "string"))];
  } catch {
    return [];
  }
}

export function hasAuthoredLocalBallot(placements: BallotPlacements, storedOrigin: string | null): boolean {
  if (storedOrigin === authoredBallotOrigin) return true;
  if (storedOrigin === serverBallotOrigin) return false;
  // Ballots saved before origin tracking existed are treated as authored so an
  // upgrade cannot silently replace a visitor's work. Exclusions alone are not
  // ballot placements and therefore never suppress a signed-in server ballot.
  return Object.keys(placements).length > 0;
}

export function omitExcludedPlacements<T extends BallotPlacements>(placements: T, excludedModelIds: Iterable<string>): T {
  const next = { ...placements };
  for (const id of excludedModelIds) delete next[id];
  return next;
}

export function restoreExcludedPlacements<T extends BallotPlacements>(saved: T, source: T, excludedModelIds: Iterable<string>): T {
  const next = { ...saved };
  for (const id of excludedModelIds) {
    if (Object.prototype.hasOwnProperty.call(source, id)) next[id] = source[id];
  }
  return next;
}

export function countRankedPlacements(placements: BallotPlacements, excludedModelIds: Iterable<string>): number {
  const excluded = new Set(excludedModelIds);
  return Object.entries(placements).filter(([id, tier]) => tier && !excluded.has(id)).length;
}

export function ballotOriginAfterUndo(hadPlacement: boolean, currentOrigin: string | null): string | null {
  return hadPlacement ? authoredBallotOrigin : currentOrigin;
}
