/**
 * Local progress memory for "My Work Highlights".
 *
 * Records how many imported highlights have actually been woven into each
 * résumé — incremented only when the incorporate preview for a work-highlights
 * run is ACCEPTED (a preview that is discarded never counts). The résumé list
 * reads it to show a small "N highlights imported" badge, so the feature's
 * payoff is visible at a glance instead of being invisible once the wizard closes.
 *
 * It also keeps a small snapshot of the MOST RECENT accepted import (the version
 * that was active before it, the version it created, and how many highlights it
 * added) so the workspace can offer a one-click "Undo last import" that
 * re-activates the previous version and un-counts those highlights.
 *
 * Local-only, like the rest of the highlights scratch state (the wizard draft and
 * the one-shot hand-off), because it is progress tied to this device.
 */

const PREFIX = "hirewave_work_highlights_imported";
const LAST_PREFIX = "hirewave_work_highlights_last_import";

function storageKey(resumeId: string | number): string {
  return `${PREFIX}_${resumeId}`;
}

function lastKey(resumeId: string | number): string {
  return `${LAST_PREFIX}_${resumeId}`;
}

/** How many highlights have been imported into a résumé (0 when none). */
export function readWorkHighlightsImported(resumeId: string | number): number {
  try {
    const raw = localStorage.getItem(storageKey(resumeId));
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Add `count` imported highlights to a résumé's running total, returning the new
 * total. A non-positive / non-finite count is ignored so an empty run never
 * touches storage.
 */
export function recordWorkHighlightsImported(
  resumeId: string | number,
  count: number
): number {
  if (!Number.isFinite(count) || count <= 0) {
    return readWorkHighlightsImported(resumeId);
  }
  const next = readWorkHighlightsImported(resumeId) + count;
  try {
    localStorage.setItem(storageKey(resumeId), String(next));
  } catch {
    /* storage unavailable — the total still applies for this session */
  }
  return next;
}

/** Forget a résumé's imported-highlights total. */
export function clearWorkHighlightsImported(resumeId: string | number): void {
  try {
    localStorage.removeItem(storageKey(resumeId));
  } catch {
    /* best-effort */
  }
}

/**
 * Nudge a résumé's imported-highlights total by `delta` (negative to roll a run
 * back), clamped at zero, returning the new total. Used by "Undo last import" to
 * un-count the highlights an accidental import added.
 */
export function adjustWorkHighlightsImported(
  resumeId: string | number,
  delta: number
): number {
  if (!Number.isFinite(delta) || delta === 0) {
    return readWorkHighlightsImported(resumeId);
  }
  const next = Math.max(0, readWorkHighlightsImported(resumeId) + delta);
  try {
    localStorage.setItem(storageKey(resumeId), String(next));
  } catch {
    /* storage unavailable — the total still applies for this session */
  }
  return next;
}

/** Snapshot of the most recent accepted import, so it can be undone in one click. */
export interface LastWorkHighlightsImport {
  /** The version that was active BEFORE the import — undo re-activates it. */
  previousVersion: string | number | null;
  /** The version the import created — the one an undo rolls back from. */
  importedVersion: string | number | null;
  /** How many highlights that import added — un-counted on undo. */
  count: number;
  /** When it happened (ISO). */
  at: string;
}

/** The most recent accepted import for a résumé, or null when there is none. */
export function readLastWorkHighlightsImport(
  resumeId: string | number
): LastWorkHighlightsImport | null {
  try {
    const raw = localStorage.getItem(lastKey(resumeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastWorkHighlightsImport>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      previousVersion: parsed.previousVersion ?? null,
      importedVersion: parsed.importedVersion ?? null,
      count: typeof parsed.count === "number" && parsed.count > 0 ? parsed.count : 0,
      at: typeof parsed.at === "string" ? parsed.at : "",
    };
  } catch {
    return null;
  }
}

/** Record the snapshot of an accepted import so it can be undone later. */
export function recordLastWorkHighlightsImport(
  resumeId: string | number,
  entry: Omit<LastWorkHighlightsImport, "at">
): void {
  try {
    localStorage.setItem(lastKey(resumeId), JSON.stringify({ ...entry, at: new Date().toISOString() }));
  } catch {
    /* storage unavailable — undo just won't be offered this session */
  }
}

/** Forget a résumé's last-import snapshot (after an undo, or once it's stale). */
export function clearLastWorkHighlightsImport(resumeId: string | number): void {
  try {
    localStorage.removeItem(lastKey(resumeId));
  } catch {
    /* best-effort */
  }
}