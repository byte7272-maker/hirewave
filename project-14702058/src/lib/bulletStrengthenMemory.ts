/**
 * Per-version "N bullets strengthened" memory.
 *
 * When a bulk strengthen pass (e.g. "Strengthen whole résumé") is accepted, we
 * record how many bullets it actually changed on the resulting version. Opening
 * that version later re-shows the tally, so whole-document AI passes stay
 * traceable — mirroring the per-version coverage + figure memory used elsewhere
 * on the Documents surface.
 */

export type VersionBulletStrengthenMap = Record<string, number>;

const PREFIX = "hirewave_version_bullets_strengthened_";

function storageKey(kind: string, docId: string | number): string {
  return `${PREFIX}${kind}_${docId}`;
}

/** Read the full version -> count map for a document (safe against bad/absent data). */
export function readBulletStrengthenMap(
  kind: string,
  docId: string | number
): VersionBulletStrengthenMap {
  try {
    const raw = localStorage.getItem(storageKey(kind, docId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: VersionBulletStrengthenMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && value > 0) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist a version's strengthened-bullet count and return the updated map. */
export function saveBulletStrengthen(
  kind: string,
  docId: string | number,
  version: string | number,
  count: number
): VersionBulletStrengthenMap {
  const map = readBulletStrengthenMap(kind, docId);
  if (count > 0) map[String(version)] = count;
  else delete map[String(version)];
  try {
    localStorage.setItem(storageKey(kind, docId), JSON.stringify(map));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
  return map;
}

/** Look up one version's strengthened-bullet count (0 when none is recorded). */
export function getBulletStrengthenCount(
  kind: string,
  docId: string | number,
  version: string | number | null | undefined
): number {
  if (version === null || version === undefined || version === "") return 0;
  return readBulletStrengthenMap(kind, docId)[String(version)] ?? 0;
}