/**
 * Remembers whether the dashboard's left navigation is left collapsed as a
 * narrow icon rail or pinned open to show labels. Best-effort: storage
 * failures are swallowed and fall back to the collapsed default.
 */

const KEY = "hirewave_nav_rail_collapsed";

/** Whether the rail should start collapsed (icon-only). Defaults to collapsed. */
export function readNavRailCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

/** Persist the pinned / collapsed choice for the navigation rail. */
export function writeNavRailCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore storage failures — the choice still applies for this session.
  }
}