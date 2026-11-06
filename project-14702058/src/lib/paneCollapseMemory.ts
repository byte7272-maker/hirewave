/**
 * Remembers whether a document editor's pinned workspace pane (the résumé /
 * cover-letter preview column) is collapsed, so a document reopens the way the
 * user left it. Collapsing hides the pane on large screens and lets the side
 * controls take the full width.
 */

const STORAGE_PREFIX = "hirewave_pane_collapsed_";

/** Read the remembered collapsed state for a document (e.g. `resume_42`). */
export function readPaneCollapsed(key: string): boolean {
  if (!key) return false;
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

/** Persist the collapsed state for a document. */
export function writePaneCollapsed(key: string, collapsed: boolean): void {
  if (!key) return;
  try {
    if (collapsed) localStorage.setItem(STORAGE_PREFIX + key, "1");
    else localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* Storage may be unavailable — the toggle still works for this session. */
  }
}