/**
 * Persisted memory for the structured improve preview's "applied" decisions.
 *
 * A structured change (an AI edit) is applied once the user accepts it into the
 * revision. From that moment it renders as normal body text — no pending
 * highlight — and it stays un-highlighted if the exact same edit comes back in a
 * later improve pass. Identity is the field path plus the resulting wording, so a
 * genuinely re-written field reads as a brand-new (pending, highlighted)
 * suggestion again, while an unchanged one stays applied.
 */

const PREFIX = "hirewave_structured_applied_";

/** Stable identity for one applied structured change: field path + new wording. */
export function structuredChangeSignature(path: string, after: string): string {
  return `${path}\u0000${after}`;
}

/**
 * Read the remembered applied-change signatures for one document (+ version).
 * Returns an empty set when nothing is stored or storage is unavailable.
 */
export function readAppliedChanges(key: string): Set<string> {
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

/** Persist the applied-change signatures for one document (+ version). */
export function writeAppliedChanges(key: string, signatures: Iterable<string>): void {
  if (!key) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify([...signatures]));
  } catch {
    // Ignore storage failures — the decision still applies for this session.
  }
}