/**
 * Session-expiry signalling.
 *
 * When an authenticated API call fails with a 401 and the refresh token can't
 * recover it, the local session is dead. `api.ts` fires `notifySessionExpired()`
 * once per failure; the app shell listens and sends the user to sign-in,
 * remembering where they were so they land back there after signing in.
 *
 * This is intentionally NOT a data-fallback mechanism — an expired session is
 * never answered with sample/demo content.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to session-expired events (returns an unsubscribe fn). */
export function subscribeSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fire a session-expired event. Safe to call repeatedly / with no listeners. */
export function notifySessionExpired(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* a bad listener must never break the others */
    }
  }
}

/**
 * Session-refreshed signalling.
 *
 * The access token refreshes silently ahead of expiry (proactively near the
 * ~30-min mark, or reactively after an idle spell). That recovery is invisible
 * by design — this event lets the app raise a one-off, subtle confirmation that
 * the session was quietly renewed, so "it just kept working" reads as intentional
 * rather than mysterious.
 */
type RefreshListener = () => void;

const refreshListeners = new Set<RefreshListener>();

/** Subscribe to session-refreshed events (returns an unsubscribe fn). */
export function subscribeSessionRefreshed(listener: RefreshListener): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

/** Fire a session-refreshed event. Safe to call repeatedly / with no listeners. */
export function notifySessionRefreshed(): void {
  for (const listener of Array.from(refreshListeners)) {
    try {
      listener();
    } catch {
      /* a bad listener must never break the others */
    }
  }
}

/**
 * A registered "clean logout" routine — signing out of Firebase and wiping every
 * cached credential. Registered by the auth module so the API layer can perform
 * a full teardown on a definitive refresh rejection WITHOUT importing auth (which
 * would create a circular dependency).
 */
type SessionTeardown = () => void | Promise<void>;

let teardownHandler: SessionTeardown | null = null;

/** Register the routine that performs a full local session teardown. */
export function registerSessionTeardown(handler: SessionTeardown): void {
  teardownHandler = handler;
}

/**
 * Run the registered session teardown (the clean logout). Returns `true` when a
 * handler ran, `false` when none is registered so the caller can fall back to a
 * bare token wipe. Never throws — teardown is best-effort.
 */
export async function runSessionTeardown(): Promise<boolean> {
  const handler = teardownHandler;
  if (!handler) return false;
  try {
    await handler();
  } catch {
    /* best-effort — the caller clears local tokens regardless */
  }
  return true;
}

const RETURN_TO_KEY = "hw_return_to";

/** Remember the in-app path to return to after the user signs back in. */
export function rememberReturnTo(path: string): void {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    /* storage may be unavailable — the user simply lands on the dashboard */
  }
}

/** Read and clear the remembered return path (null when none). */
export function takeReturnTo(): string | null {
  try {
    const value = sessionStorage.getItem(RETURN_TO_KEY);
    if (value) sessionStorage.removeItem(RETURN_TO_KEY);
    return value && value.startsWith("/") ? value : null;
  } catch {
    return null;
  }
}