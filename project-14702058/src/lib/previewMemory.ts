import type { PreviewChange } from "./diffHighlight";

/**
 * A stable identity for a single preview change, based on its wording on both
 * sides of the diff. Two changes that read the same (same original → same
 * replacement) share a signature, so a keep/revert decision made once can be
 * recognized when the same change reappears in a later preview.
 */
export function changeSignature(change: PreviewChange): string {
  return `${change.originalText}\u0000${change.previewText}`;
}

/** Map of change signature → reverted? (absent means "kept"). */
export type PreviewDecisionMap = Record<string, boolean>;

/**
 * Read the remembered keep/revert decisions for one document. Returns an empty
 * map when nothing is stored or storage is unavailable.
 */
export function readPreviewDecisions(key: string): PreviewDecisionMap {
  if (!key) return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: PreviewDecisionMap = {};
    for (const [sig, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "boolean") out[sig] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist the remembered keep/revert decisions for one document. */
export function writePreviewDecisions(key: string, map: PreviewDecisionMap): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Ignore storage failures — the decision still applies for this session.
  }
}