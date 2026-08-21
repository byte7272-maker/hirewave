"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "./api";
import { clearTokens, getAccess, getRefresh, setTokens } from "./tokens";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
    location: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  const login = useCallback(
    async (email: string, password: string) => {
      const t = await api<{ access_token: string; refresh_token: string }>(
        "/api/v1/auth/login",
        { method: "POST", body: { email, password }, auth: false }
      );
      setTokens(t.access_token, t.refresh_token);
      await loadUser();
    },
    [loadUser]
  );

  const register = useCallback(
    async (email: string, password: string, fullName: string, location: string) => {
      await api("/api/v1/auth/register", {
        method: "POST",
        auth: false,
        body: { email, password, full_name: fullName, location },
      });
      await login(email, password);
    },
    [login]
  );

  const logout = useCallback(async () => {
    const refresh = getRefresh();
    if (refresh) {
      try {
        await api("/api/v1/auth/logout", {
          method: "DELETE",
          body: { refresh_token: refresh },
        });
      } catch {
        /* best-effort */
      }
    }
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser: loadUser }),
    [user, loading, login, register, logout, loadUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
