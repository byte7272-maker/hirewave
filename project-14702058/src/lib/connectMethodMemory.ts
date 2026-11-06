/**
 * Remembers the API's link `method` per provider, so the "how it was linked" tag
 * stays the same on every device. The value stored is the server-reported method
 * (`oauth` | `browser_session`), which is inherently consistent across devices —
 * it is only used as a fallback for rows that arrive without a `method`.
 *
 * Best-effort and scoped to localStorage; storage failures are swallowed.
 */

export type ConnectMethod = "oauth" | "browser_session";

const PREFIX = "hirewave_connect_method_";

/** Read the remembered API method for one provider, or null when unknown. */
export function readConnectMethod(provider: string): ConnectMethod | null {
  if (!provider) return null;
  try {
    const raw = localStorage.getItem(PREFIX + provider.toLowerCase());
    return raw === "oauth" || raw === "browser_session" ? raw : null;
  } catch {
    return null;
  }
}

/** Persist the API method observed for one provider. */
export function writeConnectMethod(provider: string, method: ConnectMethod): void {
  if (!provider) return;
  try {
    localStorage.setItem(PREFIX + provider.toLowerCase(), method);
  } catch {
    // Ignore storage failures — the tag just won't persist.
  }
}