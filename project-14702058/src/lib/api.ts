// Typed fetch wrapper for the Project Harbor API.
import {
  clearTokens,
  getAccess,
  getRefresh,
  isAccessExpiringSoon,
  setTokens,
} from "./tokens";
import { notifySessionExpired, notifySessionRefreshed, runSessionTeardown } from "./session";
import { reportApiReachable, reportApiUnreachable } from "./apiReachability";
import { clearSessionRefreshLog, markSessionRefreshed } from "./sessionRefreshLog";

// Point this at your hosted FastAPI backend once it's live, e.g. "https://api.yourdomain.com".
// Leave empty to keep same-origin /api/v1 (matches your original Vite dev proxy setup).
const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  /** The request path that failed (e.g. "/api/v1/resumes/123"), when known. */
  path?: string;
  /** True when the call was abandoned by our own timeout, not a server error. */
  timedOut?: boolean;
  constructor(
    status: number,
    message: string,
    meta?: { path?: string; timedOut?: boolean },
  ) {
    super(message);
    this.status = status;
    this.path = meta?.path;
    this.timedOut = meta?.timedOut;
  }
}

/**
 * True when the failure means the backend couldn't be reached — a network error
 * (fetch rejects with a TypeError) or a 5xx response. Used to gracefully fall
 * back to demo data instead of leaving a page empty when the API is offline.
 */
export function isBackendUnreachable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 0 || err.status >= 500;
  return err instanceof TypeError;
}

/** True for a 401 — the session is missing, expired, or invalid. */
export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/**
 * True only for a genuine transport failure — `fetch` rejected because the
 * server couldn't be reached at all (offline, DNS, CORS preflight, etc.).
 */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

/**
 * The bucket a thrown error falls into, used to choose the user-facing state:
 *  - "auth"      → session expired; send the user to sign in (never demo data)
 *  - "not-found" → the record is gone or not theirs; show a real not-found state
 *  - "network"   → couldn't reach the server; offer a non-destructive Retry
 *  - "other"     → anything else; show the server's message with a retry
 * A 5xx is treated as "network" (a retryable server/transport problem).
 */
export type ApiErrorKind = "auth" | "not-found" | "network" | "other";

export function classifyApiError(err: unknown): ApiErrorKind {
  if (err instanceof ApiError) {
    if (err.status === 401) return "auth";
    if (err.status === 404) return "not-found";
    // status 0 = a transport failure (e.g. a request that timed out) — retryable.
    if (err.status === 0 || err.status >= 500) return "network";
    return "other";
  }
  if (err instanceof TypeError) return "network";
  return "other";
}

/** Extra context to make a diagnostics block read clearly when the error is thin. */
export interface DiagnosticsContext {
  /** A human label for what was being loaded, e.g. "résumé res_123". */
  label?: string;
  /** Fallback request path when the error itself doesn't carry one. */
  path?: string;
}

/**
 * Build a plain-text diagnostics block for a failed load — the failing request
 * path, the HTTP status (or a clear TIMEOUT / NO-RESPONSE marker), the error
 * bucket, and the surface it happened on. Meant to be copied and handed to the
 * backend team so an unreachable-server problem is easy to trace.
 */
export function buildApiDiagnostics(
  err: unknown,
  context: DiagnosticsContext = {},
): string {
  const lines: string[] = [];
  lines.push("Project Harbor — load diagnostics");
  lines.push(`Time: ${new Date().toISOString()}`);
  if (context.label) lines.push(`Surface: ${context.label}`);

  const path = (err instanceof ApiError && err.path) || context.path;
  if (path) lines.push(`Request: ${path}`);

  if (err instanceof ApiError && err.timedOut) {
    lines.push("Result: TIMEOUT — request abandoned, no response received");
  } else {
    const status = err instanceof ApiError ? err.status : undefined;
    if (typeof status === "number") {
      lines.push(
        status === 0
          ? "Result: NO RESPONSE — network/transport failure (offline, DNS, or blocked preflight)"
          : `Result: HTTP ${status}`,
      );
    } else if (err instanceof TypeError) {
      lines.push("Result: NO RESPONSE — network/transport failure");
    } else {
      lines.push("Result: unknown");
    }
  }

  lines.push(`Kind: ${classifyApiError(err)}`);
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (message) lines.push(`Message: ${message}`);
  lines.push(`API base: ${API_BASE_URL || "(same origin)"}`);
  if (typeof window !== "undefined") lines.push(`Page: ${window.location.href}`);
  return lines.join("\n");
}

/**
 * Outcome of a refresh attempt:
 *  - "refreshed"   → new tokens stored; safe to retry the original request
 *  - "invalid"     → the refresh token is rejected/missing; the session is dead
 *  - "unreachable" → the server couldn't be reached; we can't conclude the
 *                    session is dead, so we must NOT sign the user out yet
 */
export type RefreshResult = "refreshed" | "invalid" | "unreachable";

// Single-flight: concurrent 401s share ONE refresh call. Without this, parallel
// refreshes race — and with rotating refresh tokens, all but the first get
// rejected, which would kill an otherwise-fine session.
let refreshInFlight: Promise<RefreshResult> | null = null;

async function runRefresh(): Promise<RefreshResult> {
  const refresh = getRefresh();
  if (!refresh) return "invalid";

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
  } catch {
    // Network drop / blocked preflight — inconclusive about the session.
    reportApiUnreachable();
    return "unreachable";
  }
  // Any response at all means the host reached the server.
  reportApiReachable();

  if (res.status === 401 || res.status === 403) return "invalid";
  if (!res.ok) return "unreachable";

  let data: { access_token?: string; refresh_token?: string };
  try {
    data = await res.json();
  } catch {
    return "invalid";
  }
  if (!data.access_token) return "invalid";

  // Only overwrite the refresh token when the server actually rotated it;
  // otherwise keep the existing one so the chain survives to the next refresh.
  setTokens(data.access_token, data.refresh_token ?? getRefresh());
  // Announce the silent recovery so the UI can confirm the session was renewed.
  notifySessionRefreshed();
  // Persist the moment so the recovery stays inspectable after the toast fades.
  markSessionRefreshed();
  return "refreshed";
}

/** Refresh the access token, deduping concurrent attempts into one request. */
function refreshAccess(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Proactively refresh when the access token is about to expire (~1 min out),
 * so ordinary calls never have to eat a 401 mid-session. Best-effort: if it
 * fails we simply proceed and let the reactive 401 path handle things.
 */
async function refreshIfExpiring(): Promise<void> {
  if (!isAccessExpiringSoon()) return;
  await refreshAccess();
}

/**
 * End a dead session cleanly: wipe local tokens, run the registered clean logout
 * (Firebase sign-out + cached-credential cleanup), then signal the app shell to
 * return the user to sign-in. Used the moment a refresh is definitively rejected,
 * so a dead session is fully torn down — not merely redirected by a toast.
 */
async function endSession(): Promise<void> {
  clearTokens();
  await runSessionTeardown();
  clearSessionRefreshLog();
  notifySessionExpired();
}

/**
 * Force a token refresh right now, ignoring the "expiring soon" gate — the manual
 * "Refresh now" escape hatch on the Documents page. Single-flight, so it shares
 * any refresh already in progress. A definitive rejection tears the session down.
 */
export async function refreshSessionNow(): Promise<RefreshResult> {
  const result = await refreshAccess();
  if (result === "invalid") await endSession();
  return result;
}

/**
 * Ensure the access token is fresh, refreshing ahead of expiry when needed, and
 * return the current token. Use this before handing a token to a code path that
 * does NOT go through the `api()` wrapper (e.g. the Connect extension bridge),
 * so an idle session never hands over an already-expired token.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  await refreshIfExpiring();
  return getAccess();
}

/**
 * A one-shot reachability probe for the manual "Try again now" affordance.
 *
 * Fires a single small GET at a known lightweight endpoint to test whether the
 * current host can reach the API *right now*. It runs through the exact same
 * cross-origin path the rest of the app depends on and reports through the
 * shared reachability signal — so a success genuinely means the app can load
 * again, and the unreachable banner hides immediately. Never throws: it returns
 * whether the host replied at all (any response — even a 401/404/500 — counts).
 */
export async function pingApi(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`${API_BASE_URL}/api/v1/branding`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    // Any response means the host reached the server — clear the banner.
    reportApiReachable();
    return true;
  } catch {
    reportApiUnreachable();
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function extractError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail))
      return data.detail
        .map((d: { loc?: string[]; msg?: string }) => `${d.loc?.slice(1).join(".") ?? ""}: ${d.msg ?? ""}`.trim())
        .join("; ");
    return JSON.stringify(data);
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

interface Options {
  method?: string;
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
  /** Optional abort signal so callers (e.g. live polling) can cancel in flight. */
  signal?: AbortSignal;
  /**
   * Milliseconds before the request is abandoned. When it elapses the call
   * fails like a network drop (a retryable "can't reach the server" error)
   * instead of hanging forever. Omit to use the wrapper's default (a short cap
   * for reads, a longer one for writes); pass `0` to disable the cap entirely
   * for a call that legitimately runs very long.
   */
  timeoutMs?: number;
  /**
   * How many extra times to re-run the request after a stalled / dropped
   * attempt. Defaults to 1 for idempotent reads (GET/HEAD) and 0 for writes, so
   * a create or an AI call is never silently duplicated.
   */
  retries?: number;
}

/**
 * Bind an optional timeout — plus any caller-supplied abort signal — onto one
 * AbortController, so a stalled request (e.g. a CORS preflight that never
 * returns) resolves into a real, retryable failure rather than a spinner that
 * never finishes. Returns the combined signal, a probe for whether WE timed it
 * out, and a cleanup that always clears the timer.
 */
function withRequestTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): { signal: AbortSignal | undefined; timedOut: () => boolean; cleanup: () => void } {
  if (!timeoutMs || timeoutMs <= 0) {
    return { signal, timedOut: () => false, cleanup: () => {} };
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => clearTimeout(timer),
  };
}

/**
 * Transport bounds the wrapper applies on its OWN, so no request — not just the
 * ones that opt in — can hang forever and leave a spinner running. Reads are
 * abandoned quickly (a stalled GET is exactly what froze the version viewer);
 * writes get a much longer leash because AI improve / tailor / review run for a
 * while, but they are still bounded. Any call may override via `timeoutMs`, or
 * disable the cap with `timeoutMs: 0`.
 */
const DEFAULT_READ_TIMEOUT_MS = 20000;
const DEFAULT_WRITE_TIMEOUT_MS = 120000;
/** Multipart uploads move real bytes, so they get their own generous ceiling. */
const DEFAULT_UPLOAD_TIMEOUT_MS = 120000;

/** Resolve the effective timeout for a call, honoring an explicit override. */
function resolveTimeout(method: string, timeoutMs: number | undefined): number {
  if (timeoutMs !== undefined) return timeoutMs;
  const isRead = method === "GET" || method === "HEAD";
  return isRead ? DEFAULT_READ_TIMEOUT_MS : DEFAULT_WRITE_TIMEOUT_MS;
}

/** Only the idempotent verbs are ever safe to replay automatically. */
function isIdempotent(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

/** A short pause before a transport retry. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const {
    method = "GET",
    body,
    auth = true,
    retry = true,
    signal,
    timeoutMs,
    retries,
  } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    // Refresh ahead of expiry so a normal call never 401s at the ~30-min mark.
    await refreshIfExpiring();
    const token = getAccess();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const effectiveTimeout = resolveTimeout(method, timeoutMs);
  const retriesLeft = retries ?? (isIdempotent(method) ? 1 : 0);

  const guard = withRequestTimeout(signal, effectiveTimeout);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: guard.signal,
    });
  } catch (err) {
    const didTimeout = guard.timedOut();
    const isTransport = err instanceof TypeError;
    // A stalled or dropped read gets one more shot before we surface the error,
    // so a single flaky attempt doesn't have to bubble up as a failure. Never
    // retry once the caller has aborted us on purpose.
    if ((didTimeout || isTransport) && retriesLeft > 0 && !signal?.aborted) {
      guard.cleanup();
      await sleep(400);
      return api<T>(path, { ...opts, retries: retriesLeft - 1 });
    }
    if (didTimeout) {
      reportApiUnreachable();
      throw new ApiError(0, "The server took too long to respond. Check your connection and try again.", {
        path,
        timedOut: true,
      });
    }
    // A TypeError is a genuine transport failure (DNS, blocked preflight, offline).
    if (isTransport) reportApiUnreachable();
    throw err;
  } finally {
    guard.cleanup();
  }

  // We got a response — the host can reach the server regardless of its status.
  reportApiReachable();

  if (res.status === 401 && auth && retry) {
    const result = await refreshAccess();
    if (result === "refreshed") return api<T>(path, { ...opts, retry: false });
    if (result === "unreachable") {
      // We couldn't confirm the session is dead — surface a retryable error
      // instead of signing the user out over a transient network problem.
      throw new ApiError(0, "Couldn't verify your session — the server is unreachable. Try again.", {
        path,
      });
    }
    await endSession();
    throw new ApiError(401, "Session expired — please sign in again.", { path });
  }
  if (!res.ok) throw new ApiError(res.status, await extractError(res), { path });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Resolve a path or absolute URL against the API base. */
function resolveUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

/** Fetch a binary blob (e.g. audio/mpeg) with bearer auth + one refresh retry. */
export async function apiBlob(
  path: string,
  opts: { method?: string; body?: unknown; retry?: boolean; timeoutMs?: number; retries?: number } = {},
): Promise<Blob> {
  const { method = "GET", body, retry = true, timeoutMs, retries } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  await refreshIfExpiring();
  const token = getAccess();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const effectiveTimeout = resolveTimeout(method, timeoutMs);
  const retriesLeft = retries ?? (isIdempotent(method) ? 1 : 0);
  const guard = withRequestTimeout(undefined, effectiveTimeout);
  let res: Response;
  try {
    res = await fetch(resolveUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: guard.signal,
    });
  } catch (err) {
    const didTimeout = guard.timedOut();
    const isTransport = err instanceof TypeError;
    // Retry a stalled / dropped read once before surfacing the failure.
    if ((didTimeout || isTransport) && retriesLeft > 0) {
      guard.cleanup();
      await sleep(400);
      return apiBlob(path, { ...opts, retries: retriesLeft - 1 });
    }
    if (didTimeout) {
      reportApiUnreachable();
      throw new ApiError(0, "The server took too long to respond. Check your connection and try again.", {
        path,
        timedOut: true,
      });
    }
    if (isTransport) reportApiUnreachable();
    throw err;
  } finally {
    guard.cleanup();
  }

  reportApiReachable();

  if (res.status === 401 && retry) {
    const result = await refreshAccess();
    if (result === "refreshed") return apiBlob(path, { ...opts, retry: false });
    if (result === "unreachable") {
      throw new ApiError(0, "Couldn't verify your session — the server is unreachable. Try again.", {
        path,
      });
    }
    await endSession();
    throw new ApiError(401, "Session expired — please sign in again.", { path });
  }
  if (!res.ok) throw new ApiError(res.status, await extractError(res), { path });
  return await res.blob();
}

/** Multipart upload with bearer + one refresh retry. */
export async function apiUpload<T>(path: string, form: FormData, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  await refreshIfExpiring();
  const token = getAccess();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Uploads are writes, so they get the long write leash (and no auto-retry).
  const guard = withRequestTimeout(undefined, DEFAULT_UPLOAD_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: form,
      signal: guard.signal,
    });
  } catch (err) {
    if (guard.timedOut()) {
      reportApiUnreachable();
      throw new ApiError(0, "The upload took too long to finish. Check your connection and try again.", {
        path,
        timedOut: true,
      });
    }
    if (err instanceof TypeError) reportApiUnreachable();
    throw err;
  } finally {
    guard.cleanup();
  }
  reportApiReachable();
  if (res.status === 401 && retry) {
    const result = await refreshAccess();
    if (result === "refreshed") return apiUpload<T>(path, form, false);
    if (result === "unreachable") {
      throw new ApiError(0, "Couldn't verify your session — the server is unreachable. Try again.", {
        path,
      });
    }
    await endSession();
    throw new ApiError(401, "Session expired — please sign in again.", { path });
  }
  if (!res.ok) throw new ApiError(res.status, await extractError(res));
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}