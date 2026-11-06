/**
 * One-time flag for the "Connect extension ready" confirmation toast. The toast
 * gives instant, install-time feedback the first moment the extension announces
 * itself on the app origin — then never nags again across sessions.
 */

export const EXTENSION_ANNOUNCE_SEEN_KEY = "hirewave_extension_announce_seen";

/** Whether the one-time extension confirmation toast has already been shown. */
export function hasSeenExtensionAnnounce(): boolean {
  try {
    return localStorage.getItem(EXTENSION_ANNOUNCE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember that the one-time extension confirmation toast was shown. */
export function markExtensionAnnounceSeen(): void {
  try {
    localStorage.setItem(EXTENSION_ANNOUNCE_SEEN_KEY, "1");
  } catch {
    /* storage may be unavailable — the toast still hides for this session */
  }
}