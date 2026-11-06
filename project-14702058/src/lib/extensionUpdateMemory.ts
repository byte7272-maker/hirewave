/**
 * One-time flag for the "update your extension" nudge on the dashboard home.
 * It's keyed by the target version, so it fires once per outdated build — if a
 * later version ships and the user is still behind, they get nudged again.
 */

export const EXTENSION_UPDATE_NOTIFIED_KEY = "hirewave_extension_update_notified";

/** The latest version we've already nudged about, or null if never nudged. */
export function getUpdateNotifiedVersion(): string | null {
  try {
    return localStorage.getItem(EXTENSION_UPDATE_NOTIFIED_KEY);
  } catch {
    return null;
  }
}

/** Remember that we nudged the user to update to this version. */
export function markUpdateNotified(version: string): void {
  try {
    localStorage.setItem(EXTENSION_UPDATE_NOTIFIED_KEY, version);
  } catch {
    /* storage may be unavailable — the nudge still hides for this session */
  }
}