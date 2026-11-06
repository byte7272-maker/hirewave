/**
 * Records when the session access token was last renewed, so the silent
 * 35-minute recovery is inspectable after the fact — not only a fleeting toast.
 *
 * The API layer refreshes the access token quietly ahead of expiry (or right
 * after an idle spell). That's invisible by design; this module persists the
 * moment it last happened and notifies subscribers, so the account menu and the
 * Settings page can show a small session-status chip — plus a short history line
 * of the most recent refreshes — that stays truthful and updates live.
 */

const LAST_REFRESH_KEY = "hw_session_last_refresh";
const HISTORY_KEY = "hw_session_refresh_history";

/** How many recent refreshes to keep around for the history line. */
export const SESSION_REFRESH_HISTORY_LIMIT = 8;

type Listener = (at: number | null) => void;

const listeners = new Set<Listener>();

function readHistory(): number[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function writeHistory(history: number[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* storage may be unavailable — the in-memory listeners still update */
  }
}

/** Epoch-ms of the last successful token refresh this browser saw, or null. */
export function getLastSessionRefresh(): number | null {
  try {
    const raw = localStorage.getItem(LAST_REFRESH_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Recent successful refreshes, newest first (bounded to the history limit). */
export function getSessionRefreshHistory(): number[] {
  return readHistory();
}

/** Record a successful refresh and notify subscribers. Returns the timestamp. */
export function markSessionRefreshed(at: number = Date.now()): number {
  try {
    localStorage.setItem(LAST_REFRESH_KEY, String(at));
  } catch {
    /* storage may be unavailable — subscribers still update from the argument */
  }
  // Prepend to the bounded history, dropping any immediate duplicate of this time.
  const history = readHistory().filter((t) => t !== at);
  history.unshift(at);
  writeHistory(history.slice(0, SESSION_REFRESH_HISTORY_LIMIT));
  for (const listener of Array.from(listeners)) {
    try {
      listener(at);
    } catch {
      /* a bad listener must never break the others */
    }
  }
  return at;
}

/** Forget the last refresh (called on sign-out so a new session starts clean). */
export function clearSessionRefreshLog(): void {
  try {
    localStorage.removeItem(LAST_REFRESH_KEY);
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* storage may be unavailable */
  }
  for (const listener of Array.from(listeners)) {
    try {
      listener(null);
    } catch {
      /* a bad listener must never break the others */
    }
  }
}

/**
 * Subscribe to refresh-log changes. The listener is invoked immediately with the
 * current value, then again on every change. Returns an unsubscribe function.
 */
export function subscribeSessionRefreshLog(listener: Listener): () => void {
  listeners.add(listener);
  listener(getLastSessionRefresh());
  return () => {
    listeners.delete(listener);
  };
}