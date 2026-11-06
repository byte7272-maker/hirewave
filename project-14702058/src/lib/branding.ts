import { api, ApiError } from "./api";

export type SignupMode = "open" | "invite" | "closed";

export interface Branding {
  name: string;
  signup_mode: SignupMode;
  /** "stealth" (codename shown) or "public" (real brand shown). Display-only for now. */
  brand_mode?: string;
}

/** Codename fallback used until the real branding loads (and if the endpoint is down). */
export const DEFAULT_BRANDING: Branding = {
  name: "Project Harbor",
  signup_mode: "open",
};

let cache: Branding | null = null;
let inflight: Promise<Branding> | null = null;

/** Backoff delays (ms) between branding attempts — absorbs a transient network blip. */
const BRANDING_RETRY_DELAYS_MS = [500, 1500];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET /api/v1/branding, retrying a couple of times on network errors or 5xx. */
async function requestBranding(): Promise<{
  name?: unknown;
  brand_mode?: unknown;
  signup_mode?: unknown;
}> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= BRANDING_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await api<{ name?: unknown; brand_mode?: unknown; signup_mode?: unknown }>(
        "/api/v1/branding",
        { auth: false },
      );
    } catch (err) {
      lastErr = err;
      const status = err instanceof ApiError ? err.status : 0;
      const retryable = status === 0 || status >= 500;
      const delay = BRANDING_RETRY_DELAYS_MS[attempt];
      if (!retryable || delay === undefined) break;
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Fetch branding once and cache it for the lifetime of the app.
 * Returns the real name (production) or codename (dev) with no redeploy needed.
 */
export async function fetchBranding(): Promise<Branding> {
  if (cache) return cache;
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const data = await requestBranding();
      // Use the server-provided brand name when present so a backend-only launch flip
      // (JOBSEARCH_BRAND_MODE=public) instantly shows the real brand with no frontend edit.
      const name =
        typeof data?.name === "string" && data.name.trim()
          ? data.name.trim()
          : DEFAULT_BRANDING.name;
      const brand_mode =
        typeof data?.brand_mode === "string" ? data.brand_mode : undefined;
      const signup_mode: SignupMode =
        data?.signup_mode === "invite" || data?.signup_mode === "closed"
          ? data.signup_mode
          : "open";
      cache = { name, signup_mode, brand_mode };
      return cache;
    } catch {
      // Still failed after retries — hand back the codename WITHOUT caching it, so a
      // later app load can pick up the real brand instead of being stuck on it.
      return { ...DEFAULT_BRANDING };
    } finally {
      inflight = null;
    }
  })();

  inflight = promise;
  return promise;
}