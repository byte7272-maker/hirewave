import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { api } from "./api";
import { auth } from "./firebase";
import { clearTokens, getRefresh, setTokens } from "./tokens";
import { registerSessionTeardown } from "./session";
import { clearSessionRefreshLog } from "./sessionRefreshLog";
import { clearCurrentUserCache } from "@/hooks/useCurrentUser";

interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

const REVIEWED_AT_KEY = "hw_reviewed_at";

/**
 * Sign in with Google and exchange the Firebase ID token for backend session tokens.
 * Stores the resulting tokens and marks the session as reviewed.
 * The invite code is always sent when provided — the backend ignores it for
 * returning users and requires it for first-time users when signup is gated.
 */
export async function signInWithGoogle(inviteCode?: string): Promise<void> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken();
  const tokens = await api<AuthTokens>("/api/v1/auth/firebase", {
    method: "POST",
    body: { id_token: idToken, invite_code: inviteCode ?? "" },
    auth: false,
  });
  setTokens(tokens.access_token, tokens.refresh_token);
  localStorage.setItem(REVIEWED_AT_KEY, String(Date.now()));
}

/**
 * Tear a rejected session down locally: sign out of Firebase and clear every
 * cached credential so a dead session is never left half-cleared. No network
 * call — the refresh token is already invalid server-side, so there is nothing
 * to revoke. Registered below so the API layer can run it on a definitive
 * refresh rejection without importing this module.
 */
export async function cleanUpSession(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // Ignore — the user may not have signed in via Firebase.
  }
  clearTokens();
  clearCurrentUserCache();
  clearSessionRefreshLog();
  try {
    localStorage.removeItem(REVIEWED_AT_KEY);
  } catch {
    /* storage may be unavailable */
  }
}

registerSessionTeardown(cleanUpSession);

/**
 * Best-effort logout: sign out of Firebase, then DELETE /api/v1/auth/logout.
 * Always clears local tokens and cached credentials regardless of the response.
 */
export async function logout(): Promise<void> {
  const refreshToken = getRefresh();
  try {
    await signOut(auth);
  } catch {
    // Ignore — the user may not have signed in via Firebase.
  }
  try {
    if (refreshToken) {
      await api("/api/v1/auth/logout", {
        method: "DELETE",
        body: { refresh_token: refreshToken },
        auth: false,
        // Never let a stalled/bocked request keep the user stuck on screen.
        timeoutMs: 8000,
      });
    }
  } catch {
    // Ignore server errors — local token cleanup still happens below.
  } finally {
    clearTokens();
    clearCurrentUserCache();
    clearSessionRefreshLog();
    try {
      localStorage.removeItem(REVIEWED_AT_KEY);
    } catch {
      /* storage may be unavailable */
    }
  }
}