/**
 * Remembers which saved versions came out of an "Improve with AI" run, so the
 * editor can show an "AI-improved" chip on the current version and hand the user
 * straight into Edit mode after an improvement is accepted. Best-effort and
 * scoped to localStorage; failures are swallowed.
 */

const PREFIX = "hirewave_improved_versions_";

function keyFor(kind: string, id: string | number): string {
  return `${PREFIX}${kind}_${id}`;
}

function readVersions(kind: string, id: string | number): string[] {
  try {
    const raw = localStorage.getItem(keyFor(kind, id));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

/** Record that a saved version was produced by Improve. */
export function markImprovedVersion(
  kind: string,
  id: string | number,
  version: string | number
): void {
  if (version === "" || version === null || version === undefined) return;
  try {
    const existing = readVersions(kind, id);
    const value = String(version);
    if (existing.includes(value)) return;
    localStorage.setItem(keyFor(kind, id), JSON.stringify([...existing, value]));
  } catch {
    // Ignore storage failures — the chip is a nicety, not core behavior.
  }
}

/** Whether a given version came from Improve. */
export function isImprovedVersion(
  kind: string,
  id: string | number,
  version: string | number | null | undefined
): boolean {
  if (version === "" || version === null || version === undefined) return false;
  return readVersions(kind, id).includes(String(version));
}