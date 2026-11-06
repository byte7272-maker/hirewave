/**
 * Remembers how the full-screen readable review was left — the highlight toggle,
 * the compare split, and which side (A/B) was showing — per document, so
 * reopening it restores exactly the same review state.
 *
 * Everything is best-effort and scoped to localStorage; storage failures are
 * swallowed so the view still works for the current session.
 */

export type ReadableReviewSide = "revision" | "comparison";

export interface ReadableReviewMemory {
  /** Whether the "Highlight changes" pen was on. */
  highlight: boolean;
  /** Whether the side-by-side compare split was open. */
  compare: boolean;
  /** Which side was showing: the revision (B) or the current version (A). */
  side: ReadableReviewSide;
}

const PREFIX = "hirewave_readable_review_";

/** Read the remembered review state for one document, or null when none/invalid. */
export function readReadableReview(key: string): ReadableReviewMemory | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReadableReviewMemory> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      highlight: parsed.highlight === true,
      compare: parsed.compare === true,
      side: parsed.side === "comparison" ? "comparison" : "revision",
    };
  } catch {
    return null;
  }
}

/** Persist the review state for one document. */
export function writeReadableReview(key: string, state: ReadableReviewMemory): void {
  if (!key) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(state));
  } catch {
    // Ignore storage failures — the choice still applies for this session.
  }
}