/**
 * The pinned "Jump back in" entry — the one thing the user wants kept as the
 * always-first pick on the dashboard, regardless of what they opened most
 * recently.
 *
 * The pin is stored as the rail's own `kind:ref_id` key (the same shape the
 * recently-viewed entries use), so it survives a reload and keeps working when
 * the underlying rail reorders.
 *
 * Note: this is device-local. A truly cross-device pin needs a small "pinned
 * entry" field on the account (the app's API has no such field yet), so this
 * module is intentionally the single place to change if that lands later.
 */

const KEY = "hirewave_jumpback_pin";

/** The pinned entry key (`kind:ref_id`), or null when nothing is pinned. */
export function readPinnedEntryKey(): string | null {
  try {
    const value = localStorage.getItem(KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

/** Pin an entry (pass its key) or clear the pin (pass null). */
export function writePinnedEntryKey(key: string | null): void {
  try {
    if (!key) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, key);
  } catch {
    /* storage unavailable — the pin just won't persist */
  }
}