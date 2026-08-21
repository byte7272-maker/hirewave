# Wiring the Readdy frontend to Firebase login

The Readdy site keeps calling your FastAPI backend exactly as it does now — the
only change is **how the user signs in**. Instead of posting a password to
`/auth/login`, they sign in with Firebase, and we swap the Firebase token for the
same session tokens the app already uses.

## 1. Add the Firebase SDK + login helper

1. In the Readdy project, install the SDK: `npm i firebase`.
2. Add [`firebase-login.ts`](firebase-login.ts) to the codebase. The
   `firebaseConfig` is already filled in for the `hirewave-2de48` project. The
   backend URL is read from **`VITE_PUBLIC_API_BASE_URL`** (same setting the rest
   of the frontend uses) — set that env var to the deployed FastAPI origin once
   it's live; until then it defaults to same-origin `/api/v1`.

## 2. Point your login screen at the helpers

Replace the old email/password submit and add a Google button:

```tsx
import { signInWithEmail, signUpWithEmail, signInWithGoogle, signOut } from "./firebase-login";

// Sign in / up
await signInWithEmail(email, password);   // or signUpWithEmail(...)
await signInWithGoogle();                 // Google popup

// After any of these resolve, the app's session tokens are stored —
// navigate into the dashboard exactly as before.

// Log out
await signOut();
```

That's it. Once `signIn*` resolves, `hw_access` / `hw_refresh` are in
`localStorage`, so the existing API client, the session keep-alive, the review
checkpoint, and reminders all work with **no other changes**.

## 3. What does NOT change

- The whole rest of the app (`/api/v1/*` calls, tokens, refresh, keep-alive,
  auto-apply, reminders) is untouched — it runs on the app's own session tokens,
  which the exchange endpoint issues.
- You can **drop the old password sign-up/login UI** — Firebase owns that now, so
  the app never handles a password. (The `/auth/register` + `/auth/login`
  endpoints still exist; you just stop calling them from the frontend.)

## 4. Two gotchas

- **CORS:** the backend must allow the Readdy origin. Set
  `JOBSEARCH_CORS_ORIGINS=https://hlrtlg.readdy.co` on the API and redeploy
  (see FIREBASE_SETUP.md step 5).
- **Authorized domains:** add `hlrtlg.readdy.co` in Firebase (Auth → Settings →
  Authorized domains), or the Google popup will refuse to run there.

## 5. Test it before the real project exists

With the backend in `mock` Firebase mode (default), `/auth/firebase` accepts a
plain email as the "token", so you can exercise the exchange without a Firebase
project:

```bash
curl -X POST $API_BASE/api/v1/auth/firebase \
  -H "Content-Type: application/json" -d '{"id_token":"you@example.com"}'
# → { access_token, refresh_token }  (creates the account on first call)
```

Flip `JOBSEARCH_FIREBASE_AUTH=live` (+ project id + service-account file) when the
real project is ready — no frontend change needed.
