/**
 * Per-version "review findings addressed" memory.
 *
 * When an improvement is accepted we record which AI Review findings (the
 * suggestion titles ticked as focus_points) that saved version was asked to fix.
 * Re-opening the version later re-shows exactly what it addressed, so a
 * document's revision history stays traceable — mirroring the per-version
 * coverage + figure memory used elsewhere on the Documents surface.
 */

export type VersionFindingsMap = Record<string, string[]>;

const PREFIX = "hirewave_version_findings_";

function storageKey(kind: string, docId: string | number): string {
  return `${PREFIX}${kind}_${docId}`;
}

/** Read the full version -> findings map for a document (safe against bad/absent data). */
export function readVersionFindingsMap(
  kind: string,
  docId: string | number
): VersionFindingsMap {
  try {
    const raw = localStorage.getItem(storageKey(kind, docId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: VersionFindingsMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        out[key] = value.filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0
        );
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist a version's addressed findings and return the updated map. */
export function saveVersionFindings(
  kind: string,
  docId: string | number,
  version: string | number,
  findings: string[]
): VersionFindingsMap {
  const map = readVersionFindingsMap(kind, docId);
  const clean = findings.filter((f) => f.trim().length > 0);
  if (clean.length) map[String(version)] = clean;
  else delete map[String(version)];
  try {
    localStorage.setItem(storageKey(kind, docId), JSON.stringify(map));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
  return map;
}

/** Look up one version's addressed findings (empty array when none are recorded). */
export function getVersionFindings(
  kind: string,
  docId: string | number,
  version: string | number | null | undefined
): string[] {
  if (version === null || version === undefined) return [];
  return readVersionFindingsMap(kind, docId)[String(version)] ?? [];
}