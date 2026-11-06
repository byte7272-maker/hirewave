/**
 * When the extension was last detected on this browser. Written the moment the
 * shared install hook confirms the extension is present (tag on <html> or the
 * "ready" event), so the dashboard can show a truthful "last seen" time next to
 * the detected version.
 */

export const EXTENSION_LAST_SEEN_KEY = "hirewave_extension_last_seen";

/** Epoch ms of the last detection, or null when we've never seen the extension. */
export function getExtensionLastSeen(): number | null {
  try {
    const raw = localStorage.getItem(EXTENSION_LAST_SEEN_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Record "now" as the last detection and return the stored timestamp. */
export function markExtensionLastSeen(): number {
  const now = Date.now();
  try {
    localStorage.setItem(EXTENSION_LAST_SEEN_KEY, String(now));
  } catch {
    /* storage may be unavailable — the value still applies for this session */
  }
  return now;
}