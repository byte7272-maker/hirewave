/**
 * Remembers when the Connected sites list was last refreshed, so the panel can
 * show its recency and loudly flag a stale list when you return to it (or when a
 * refresh fails and it's still showing older data).
 */

const REFRESHED_KEY = "hirewave_connected_sites_refreshed_at";

/** How long a remembered refresh stays "fresh" before it's called stale. */
export const SESSIONS_STALE_MS = 15 * 60 * 1000;

/** Timestamp (epoch ms) of the last successful Connected sites refresh, or null. */
export function getSessionsRefreshedAt(): number | null {
  try {
    const raw = localStorage.getItem(REFRESHED_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Record a refresh and return the stored timestamp. */
export function markSessionsRefreshed(at: number = Date.now()): number {
  try {
    localStorage.setItem(REFRESHED_KEY, String(at));
  } catch {
    /* storage may be unavailable — the in-memory value still drives the UI */
  }
  return at;
}

/** Whether a remembered refresh is missing or old enough to be called stale. */
export function isSessionsRefreshStale(at: number | null, now: number = Date.now()): boolean {
  if (!at) return true;
  return now - at > SESSIONS_STALE_MS;
}