import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface CurrentUser {
  full_name: string;
  email?: string;
}

// Module-level cache so Topbar, Sidebar, and the greeting share one fetch
// instead of each firing a duplicate GET /users/me request.
let cached: CurrentUser | null = null;
let inflight: Promise<CurrentUser> | null = null;

function loadCurrentUser(): Promise<CurrentUser> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api<CurrentUser>("/api/v1/users/me", { auth: true })
      .then((user) => {
        cached = user;
        return user;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Drop the cached user (and any in-flight fetch) so the next reader re-fetches.
 * Called on logout / clean session teardown, so a different account signing in
 * never briefly renders the previous user's name.
 */
export function clearCurrentUserCache(): void {
  cached = null;
  inflight = null;
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function getFirstName(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? "";
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(cached);
  const [loading, setLoading] = useState<boolean>(!cached);

  useEffect(() => {
    let mounted = true;
    loadCurrentUser()
      .then((u) => {
        if (mounted) setUser(u);
      })
      .catch(() => {
        // Leave user as null — callers render a neutral fallback, never a placeholder.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { user, loading };
}