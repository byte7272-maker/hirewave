import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { clearTokens, getAccess, getRefresh, markReviewed, setTokens } from "./tokens";
import { refreshAccess, startSessionKeepAlive } from "./session";
import { syncRenew } from "./reminders";

export interface User {
  id: string;
  email: string;
  full_name: string;
  location: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  /** Sign in by exchanging a Firebase ID token for an app session. In mock mode
   *  the backend accepts a plain email as the token (dev/testing). */
  firebaseLogin: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** True at the periodic checkpoint — the user must review + renew to keep the
   *  session alive and background automation running. */
  reviewDue: boolean;
  /** Re-affirm consent: reset the checkpoint clock and resume. */
  renew: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewDue, setReviewDue] = useState(false);

  const loadUser = useCallback(async () => {
    if (!getAccess()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>("/api/v1/users/me"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // While signed in, keep the session warm: refresh the access token before it
  // expires and immediately when the tab regains focus (browsers throttle timers
  // in background tabs). If the refresh token itself lapses (7-day ceiling), drop
  // to signed-out. At the halfway checkpoint, stop sliding and ask to renew.
  useEffect(() => {
    if (!user) return;
    return startSessionKeepAlive(
      () => { clearTokens(); setUser(null); },
      () => setReviewDue(true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, reviewDue]);

  const login = useCallback(
    async (email: string, password: string) => {
      const t = await api<{ access_token: string; refresh_token: string }>("/api/v1/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password },
      });
      setTokens(t.access_token, t.refresh_token);
      markReviewed(); // signing in is an explicit consent point
      setReviewDue(false);
      await loadUser();
      void syncRenew(); // keep the server-side reminder anchor in sync
    },
    [loadUser]
  );

  const firebaseLogin = useCallback(
    async (idToken: string) => {
      const t = await api<{ access_token: string; refresh_token: string }>("/api/v1/auth/firebase", {
        method: "POST",
        auth: false,
        body: { id_token: idToken },
      });
      setTokens(t.access_token, t.refresh_token);
      markReviewed();
      setReviewDue(false);
      await loadUser();
      void syncRenew();
    },
    [loadUser]
  );

  const register = useCallback(
    async (email: string, password: string, fullName: string) => {
      await api("/api/v1/auth/register", {
        method: "POST",
        auth: false,
        body: { email, password, full_name: fullName },
      });
      await login(email, password);
    },
    [login]
  );

  const logout = useCallback(async () => {
    const refresh = getRefresh();
    if (refresh) {
      try {
        await api("/api/v1/auth/logout", { method: "DELETE", body: { refresh_token: refresh } });
      } catch {
        /* best-effort */
      }
    }
    clearTokens();
    setUser(null);
  }, []);

  const renew = useCallback(async () => {
    markReviewed();       // reset the local checkpoint clock
    await refreshAccess(); // slide the token window forward now
    void syncRenew();     // reset the server-side reminder anchor too
    setReviewDue(false);  // resume keep-alive + automation (effect re-runs)
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, firebaseLogin, logout, refreshUser: loadUser, reviewDue, renew }),
    [user, loading, login, register, firebaseLogin, logout, loadUser, reviewDue, renew]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function initials(name: string, email: string): string {
  const n = (name || "").trim();
  if (n) return n.split(/\s+/).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (email[0] || "U").toUpperCase();
}
