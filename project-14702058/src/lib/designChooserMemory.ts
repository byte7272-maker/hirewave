/**
 * Remembers the last category chip a user picked in the in-context Design
 * chooser, per document kind, so reopening the chooser lands on the same
 * filtered gallery instead of always resetting to "All".
 *
 * Storage: one short string per kind in localStorage. Never throws.
 */

export type DesignChooserKind = "resume" | "cover-letter";

const PREFIX = "hirewave_design_category_";

/** The remembered category for a chooser, or "All" when nothing is stored. */
export function readDesignCategory(kind: DesignChooserKind): string {
  try {
    return localStorage.getItem(PREFIX + kind) || "All";
  } catch {
    return "All";
  }
}

/** Remember the category the user last filtered the chooser by. */
export function saveDesignCategory(kind: DesignChooserKind, category: string): void {
  try {
    localStorage.setItem(PREFIX + kind, category || "All");
  } catch {
    /* storage unavailable — the filter still applies for this session */
  }
}