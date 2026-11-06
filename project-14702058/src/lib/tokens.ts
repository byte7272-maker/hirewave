const ACCESS = "hw_access";
const REFRESH = "hw_refresh";

/** localStorage can end up holding these strings when a missing value was written. */
function clean(value: string | null): string | null {
  if (!value || value === "undefined" || value === "null") return null;
  return value;
}

export function getAccess(): string | null {
  if (typeof window === "undefined") return null;
  return clean(localStorage.getItem(ACCESS));
}

export function getRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return clean(localStorage.getItem(REFRESH));
}

/**
 * Persist session tokens. The refresh token is optional: when the server only
 * returns a new access token (no rotation), we keep the existing refresh token
 * instead of clobbering it with `undefined` — which would silently break the
 * whole refresh chain and end the session at the next expiry.
 */
export function setTokens(access: string, refresh?: string | null): void {
  if (access) localStorage.setItem(ACCESS, access);
  if (refresh) localStorage.setItem(REFRESH, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

/** Epoch-ms expiry of the current access token, read from its JWT `exp` claim. */
export function getAccessExpiry(): number | null {
  const token = getAccess();
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const json = JSON.parse(atob(padded)) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    // Not a decodable JWT (e.g. an opaque token) — we simply can't refresh
    // proactively and rely on the reactive 401 path instead.
    return null;
  }
}

/** How long before expiry we proactively refresh. */
export const REFRESH_SKEW_MS = 60_000;

/**
 * True when the access token is missing expiry info we can read, or is within
 * {@link REFRESH_SKEW_MS} of expiring — i.e. worth refreshing before we send
 * the request rather than letting it 401 mid-session.
 */
export function isAccessExpiringSoon(skewMs: number = REFRESH_SKEW_MS): boolean {
  const exp = getAccessExpiry();
  if (exp === null) return false;
  return Date.now() >= exp - skewMs;
}