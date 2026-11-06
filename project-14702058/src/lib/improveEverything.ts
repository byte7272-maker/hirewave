/**
 * The instruction behind the dedicated "Improve everything" button on the Ask-AI
 * panel — a full-document rewrite that keeps the OLD preview-and-accept flow
 * (unlike a single targeted "Ask AI to change it" command via `…/ai-edit`).
 *
 * It is a generic directive: sharpen every section, keep every fact intact. The
 * callers send it to the `/improve-structured` endpoint, which returns a preview
 * the user reviews (and selectively keeps) before anything is saved.
 */
export const IMPROVE_EVERYTHING_INSTRUCTION =
  "Improve the whole document in one pass: sharpen every section, tighten the wording, strengthen the verbs, and make the impact clearer and more concise. Keep every fact, date, name, and figure exactly as it is, and do not invent anything new.";

/** Short helper line shown under the button, so the trade-off is obvious. */
export const IMPROVE_EVERYTHING_HINT =
  "Applies a targeted change right away — use Undo to revert.";