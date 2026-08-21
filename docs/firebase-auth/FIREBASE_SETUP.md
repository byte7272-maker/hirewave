# Hirewave — Firebase Auth setup (login only; backend stays FastAPI)

Firebase handles **sign-in** (email + Google). The Readdy frontend logs the user
in with Firebase, then hands the resulting **ID token** to the FastAPI backend,
which verifies it and issues its own session tokens. Your app never sees a
password — that goes to Firebase/Google directly.

> You do these steps yourself (they need your Google login + choices). Everything
> the code needs is already built — this just produces the values to paste in.

## 1. Create the Firebase project

1. Sign in at <https://console.firebase.google.com> with your Google account.
2. **Add project** → name it `Hirewave` → (Google Analytics optional; you can
   turn it off) → **Create project**.

## 2. Turn on the sign-in methods

1. Left nav → **Build → Authentication → Get started**.
2. **Sign-in method** tab → enable:
   - **Email/Password**
   - **Google** (pick a support email when prompted)
   *(Add Apple/GitHub/etc. later the same way — no code change needed.)*

## 3. Authorize your domains

**Authentication → Settings → Authorized domains → Add domain** for each place
the frontend runs:
- your Readdy domain, e.g. `your-hirewave.readdy.app`
- `localhost` (for local testing)

Without this, Firebase login is blocked from that origin.

## 4. Get the web config (for the Readdy frontend)

1. Gear icon → **Project settings → General**.
2. Scroll to **Your apps** → click the **Web** icon `</>` → register an app
   named `Hirewave web` (skip Firebase Hosting — Readdy hosts you).
3. Copy the **`firebaseConfig`** object it shows. Paste it into
   [`firebase-login.ts`](firebase-login.ts) (see [READDY_FRONTEND.md](READDY_FRONTEND.md)).
   These values are **public** and safe to ship in the frontend.

## 5. Let the backend verify tokens

The FastAPI backend must verify Firebase ID tokens. Two things:

1. **Service account credential:** Project settings → **Service accounts** →
   **Generate new private key** → download the JSON. Put it on the API server
   (e.g. `/opt/hirewave/firebase-service-account.json`) — keep it secret, never
   commit it.
2. **Environment** on the API (add to your `.env`):
   ```
   JOBSEARCH_FIREBASE_AUTH=live
   JOBSEARCH_FIREBASE_PROJECT_ID=hirewave-2de48
   JOBSEARCH_FIREBASE_CREDENTIALS_FILE=/opt/hirewave/firebase-service-account.json
   # allow the Readdy origin to call the API:
   JOBSEARCH_CORS_ORIGINS=https://hlrtlg.readdy.co
   ```
3. Install the verifier in the API image/venv:
   ```bash
   pip install firebase-admin
   ```
   (In Docker, add `firebase-admin` to the image — it's an optional dependency.)

With `JOBSEARCH_FIREBASE_AUTH` unset (or `mock`), the backend accepts a dev token
(a plain email) so you can test the whole flow offline before wiring the real
project.

## 6. Costs

Email + Google sign-in on the **Spark (free)** plan is **free with no limit** —
you don't need billing enabled for this. (Only *phone/SMS* auth or Identity
Platform's advanced features cost money.) The FastAPI backend keeps running where
it already does (Cloud Run / your Hetzner VPS); Firebase adds no hosting cost.

## What you'll hand off

- The **`firebaseConfig`** (step 4) → into the Readdy frontend.
- The **service-account JSON + env vars** (step 5) → onto the API server.

Then follow [READDY_FRONTEND.md](READDY_FRONTEND.md) to wire the login screen.
