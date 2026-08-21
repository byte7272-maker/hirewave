// Session keep-alive: proactive silent refresh + refresh-on-focus.
//
// The access token lives ~30 min and the refresh token ~7 days (rotated on every
// refresh, so refreshing resets the 7-day window). Reactively refreshing on a 401
// works, but a long-open page (e.g. running scheduled auto-apply) is smoother if
// we refresh *before* expiry and immediately when the tab regains focus after
// the browser throttled/suspended its timers.
import { clearTokens, getAccess, getRefresh, getReviewedAt, markReviewed, setTokens } from "./tokens";

const REFRESH_URL = "/api/v1/auth/refresh";
const LEAD_MS = 5 * 60 * 1000;      // refresh this long before the access token expires
const MIN_DELAY_MS = 10 * 1000;     // never schedule a refresh sooner than this
const FALLBACK_MS = 25 * 60 * 1000; // if exp can't be read, assume a ~30 min token
const RETRY_MS = 60 * 1000;         // after a failed (likely transient) refresh

// The refresh token lives 7 days; we ask the user to review + renew at the
// halfway mark. Until they do, the session stops sliding forward and background
// automation pauses — so nothing runs unattended for more than ~half the window.
const REVIEW_INTERVAL_MS = 3.5 * 24 * 60 * 60 * 1000; // 3.5 days

/** True once it's been ≥ half the refresh-token life since the last explicit
 *  sign-in / renewal — time to ask the user to review and renew. */
export function isReviewDue(now: number = Date.now()): boolean {
  return now - getReviewedAt() >= REVIEW_INTERVAL_MS;
}

let inFlight: Promise<boolean> | null = null;

/** Refresh the access token, rotating the refresh token. Single-flight: concurrent
 *  callers (401 retry + proactive timer) share one in-flight request. Returns false
 *  on a transient error WITHOUT clearing tokens — only a real 401 path clears them. */
export function refreshAccess(): Promise<boolean> {
  if (inFlight) return inFlight;
  const refresh = getRefresh();
  if (!refresh) return Promise.resolve(false);
  inFlight = (async () => {
    try {
      const res = await fetch(REFRESH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false; // network blip — keep tokens, try again later
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Epoch-ms expiry from a JWT's `exp` claim, or null if it can't be read. */
export function decodeExpMs(token: string | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const payload = JSON.parse(atob(b64 + pad));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Start keeping the session warm while the app is open. Returns a cleanup fn.
 *  `onExpired` fires when the refresh token itself has lapsed (the 7-day ceiling).
 *  `onReviewDue` fires at the halfway checkpoint — the caller should prompt the
 *  user to review + renew; until then we stop sliding the session forward. */
export function startSessionKeepAlive(onExpired?: () => void, onReviewDue?: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reviewTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  // Anchor the review clock on first run if we don't have one yet.
  if (!getReviewedAt()) markReviewed();

  const schedule = () => {
    if (stopped) return;
    // Past the halfway checkpoint: stop the silent slide and ask for renewal.
    if (isReviewDue()) { onReviewDue?.(); return; }
    const expMs = decodeExpMs(getAccess());
    const delay = expMs ? Math.max(MIN_DELAY_MS, expMs - Date.now() - LEAD_MS) : FALLBACK_MS;
    clearTimeout(timer);
    timer = setTimeout(tick, delay);
    // Also wake exactly when review comes due (may be sooner than the next refresh).
    const untilReview = getReviewedAt() + REVIEW_INTERVAL_MS - Date.now();
    clearTimeout(reviewTimer);
    reviewTimer = setTimeout(() => { if (!stopped && isReviewDue()) onReviewDue?.(); }, Math.max(MIN_DELAY_MS, untilReview));
  };

  const tick = async () => {
    if (stopped) return;
    if (isReviewDue()) { onReviewDue?.(); return; }
    // Refresh token gone or provably expired → the 7-day session ceiling.
    const refreshExp = decodeExpMs(getRefresh());
    if (!getRefresh() || (refreshExp !== null && refreshExp <= Date.now())) {
      clearTokens();
      onExpired?.();
      return;
    }
    const ok = await refreshAccess();
    if (stopped) return;
    if (ok) schedule();
    else {
      clearTimeout(timer);
      timer = setTimeout(tick, RETRY_MS); // transient failure — retry soon, keep tokens
    }
  };

  // On regaining focus / network, refresh now if the token is due or expired.
  const maybeRefreshNow = async () => {
    if (stopped) return;
    if (isReviewDue()) { onReviewDue?.(); return; }
    const expMs = decodeExpMs(getAccess());
    if (expMs === null || expMs - Date.now() < LEAD_MS) await refreshAccess();
    schedule();
  };
  const onVisible = () => { if (document.visibilityState === "visible") void maybeRefreshNow(); };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("online", onVisible);
  schedule();

  return () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(reviewTimer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("online", onVisible);
  };
}
