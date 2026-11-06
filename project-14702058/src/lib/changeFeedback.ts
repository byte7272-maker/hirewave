import { ApiError } from "./api";

/**
 * The ONE message shown whenever a change request comes back with nothing to
 * apply — a no-op rewrite, or a result identical to what's already on screen.
 * Used verbatim everywhere so the wording never drifts between surfaces.
 */
export const UNCHANGED_MESSAGE =
  "No change was made — try rephrasing, or use Find & replace for an exact edit.";

/** True when the failure means the session is gone and the user must sign in again. */
export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/**
 * A plain-language, status-carrying message for any failed change action — so a
 * red toast always names the HTTP status (or says the request never went through
 * on a network error) instead of failing silently.
 */
export function changeErrorMessage(err: unknown, kindLabel: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Your session expired — please sign in again.";
    if (err.status) {
      return `Couldn't update your ${kindLabel} (${err.status} — ${err.message}).`;
    }
    return `Couldn't update your ${kindLabel} — the request didn't go through. Please try again.`;
  }
  const detail = err instanceof Error && err.message ? ` — ${err.message}` : "";
  return `Couldn't update your ${kindLabel}${detail}. Please try again.`;
}