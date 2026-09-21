// Drop-in Firebase login for the Hirewave Readdy frontend.
//
// Flow: user signs in with Firebase (email or Google) → we get a Firebase ID
// token → exchange it at the FastAPI backend for the app's own session tokens →
// store them where the existing api client expects (hw_access / hw_refresh).
// After that, every existing API call + the session keep-alive work unchanged.
//
//   npm i firebase
//
import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut as fbSignOut,
} from "firebase/auth";

// From Firebase Console → Project settings → Your apps → Web (public values).
// (No Analytics here — it's not needed for auth and would require a consent flow.)
const app = initializeApp({
  apiKey: "AIzaSyCeppbkyWPesQ3TGvssw9jS1Sl0q1hFUB4",
  authDomain: "hirewave-2de48.firebaseapp.com",
  projectId: "hirewave-2de48",
  storageBucket: "hirewave-2de48.firebasestorage.app",
  messagingSenderId: "295095231258",
  appId: "1:295095231258:web:72e36bde1c6a17be6242a3",
});
const auth = getAuth(app);

// Backend base URL — reads the SAME setting the rest of the frontend uses, so
// there's one source of truth. Defaults to same-origin (calls hit /api/v1/… via
// your host's proxy). Set VITE_PUBLIC_API_BASE_URL to the deployed FastAPI origin
// (e.g. https://api.hirewave.com) once the backend is live. Trailing slash trimmed.
const API_BASE = (import.meta.env.VITE_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

// Where the existing api client reads tokens (matches the app's tokens.ts).
function storeSession(access: string, refresh: string) {
  localStorage.setItem("hw_access", access);
  localStorage.setItem("hw_refresh", refresh);
  localStorage.setItem("hw_reviewed_at", String(Date.now())); // fresh consent point
}

// Thrown when the backend rejects a NEW account because signups are gated
// (signup_mode=invite/closed). The login UI can catch this and prompt for a code.
export class InviteRequiredError extends Error {
  constructor(msg = "An invite code is required to create an account.") {
    super(msg);
    this.name = "InviteRequiredError";
  }
}

// Exchange a Firebase ID token for the app's session tokens. `inviteCode` is only
// needed the first time an account is created while signups are gated; it's ignored
// for existing users, so it's safe to always pass it through when you have one.
async function exchange(idToken: string, inviteCode = "") {
  const res = await fetch(`${API_BASE}/api/v1/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken, invite_code: inviteCode }),
  });
  if (res.status === 403) throw new InviteRequiredError();
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  const { access_token, refresh_token } = await res.json();
  storeSession(access_token, refresh_token);
}

// --- Public actions for your login screen ---------------------------------
// Pass the invite code (when your signup form collects one) — required for a NEW
// account while signups are gated, ignored for returning users.
export async function signInWithGoogle(inviteCode = "") {
  const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
  await exchange(await user.getIdToken(), inviteCode);
}

export async function signInWithEmail(email: string, password: string) {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  await exchange(await user.getIdToken()); // returning user — no invite needed
}

export async function signUpWithEmail(email: string, password: string, inviteCode = "") {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await exchange(await user.getIdToken(), inviteCode); // backend creates the account on first exchange
}

export async function signOut() {
  await fbSignOut(auth).catch(() => {});
  const refresh = localStorage.getItem("hw_refresh");
  if (refresh) {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    }).catch(() => {});
  }
  ["hw_access", "hw_refresh", "hw_reviewed_at"].forEach((k) => localStorage.removeItem(k));
}
