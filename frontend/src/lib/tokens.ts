// Token storage shared by the API client and the auth context.
// Persisted to localStorage so a refresh survives a page reload.

const ACCESS = "jsp_access";
const REFRESH = "jsp_refresh";

export function getAccess(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS);
}

export function getRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH);
}

export function setTokens(access: string, refresh: string): void {
  window.localStorage.setItem(ACCESS, access);
  window.localStorage.setItem(REFRESH, refresh);
}

export function clearTokens(): void {
  window.localStorage.removeItem(ACCESS);
  window.localStorage.removeItem(REFRESH);
}
