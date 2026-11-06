/**
 * "Seen it" flag for the installed-users notice on the extension landing page.
 * Once an installed user ticks the checkbox, the page stops showing the
 * "you're already set up" prompt on future visits.
 */

export const EXTENSION_SEEN_KEY = "hirewave_extension_seen";

/** Whether the installed-users notice has been dismissed ("seen it"). */
export function hasSeenExtension(): boolean {
  try {
    return localStorage.getItem(EXTENSION_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember that the installed-users notice was acknowledged. */
export function markExtensionSeen(): void {
  try {
    localStorage.setItem(EXTENSION_SEEN_KEY, "1");
  } catch {
    /* storage may be unavailable — the notice still hides for this session */
  }
}

/** Forget the acknowledgement so the installed-users notice shows again. */
export function clearExtensionSeen(): void {
  try {
    localStorage.removeItem(EXTENSION_SEEN_KEY);
  } catch {
    /* storage may be unavailable — nothing to clear */
  }
}