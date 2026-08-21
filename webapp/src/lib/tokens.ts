const ACCESS = "hw_access";
const REFRESH = "hw_refresh";
const REVIEWED = "hw_reviewed_at"; // ms epoch of the last explicit consent/renewal

export function getAccess(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS);
}
export function getRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH);
}
export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
}
export function clearTokens(): void {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
  localStorage.removeItem(REVIEWED);
}

/** Timestamp (ms) of the last explicit sign-in or renewal, or 0 if unknown. */
export function getReviewedAt(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(REVIEWED)) || 0;
}
/** Record an explicit human consent point (sign-in / renewal) as "now". */
export function markReviewed(at: number = Date.now()): void {
  localStorage.setItem(REVIEWED, String(at));
}
