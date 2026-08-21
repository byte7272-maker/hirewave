# Firebase Console — comprehensive walkthrough (Hirewave Auth)

A screen-by-screen guide to configuring the **`hirewave`** Firebase project for
**login only** (Google + email). The job-search backend stays FastAPI; Firebase
just authenticates users, and the app exchanges the Firebase token for its own
session. You never handle a password.

Console: <https://console.firebase.google.com> → click the **hirewave** project.

---

## 0. Orient yourself in the console

- **Top bar:** the project name (`hirewave`) with a dropdown to switch projects.
- **Left sidebar:** grouped as **Project shortcuts** and product categories —
  **Build**, **Run**, **Release & monitor**, **Analytics**, **Engage**.
  Everything you need is under **Build → Authentication**.
- **⚙ gear icon** (top-left, next to *Project Overview*) → **Project settings** —
  this is where the config values and service account live.

You'll touch exactly three areas: **Authentication**, **Project settings →
General** (web config), and **Project settings → Service accounts** (backend key).

---

## 1. Enable the sign-in methods

1. Left sidebar → **Build → Authentication**.
2. If it's a fresh project, click **Get started** (one time).
3. Open the **Sign-in method** tab.
4. **Email/Password:**
   - Click **Email/Password** in the providers list.
   - Toggle **Enable** on. (Leave "Email link / passwordless" off unless you want it.)
   - **Save**.
5. **Google:**
   - Click **Add new provider** (or find **Google** in the list) → **Google**.
   - Toggle **Enable** on.
   - Set **Project public-facing name** (what users see on the Google consent
     screen, e.g. `Hirewave`) and **Project support email** (pick your email
     from the dropdown).
   - **Save**.

You'll now see both providers marked **Enabled** on the Sign-in method tab.

> Add Apple/GitHub/Microsoft later the same way — each is just another provider
> toggle. No backend or frontend code change is needed; they all produce the same
> kind of ID token.

---

## 2. Authorize the domains that may sign users in

Still in **Authentication → Settings** tab → **Authorized domains**.

1. Two entries usually exist by default: `localhost` and
   `hirewave-xxxxx.firebaseapp.com`.
2. Click **Add domain** and add your **Readdy site domain** (exactly as the site
   is served, e.g. `your-hirewave.readdy.app` — no `https://`, no path).
3. Keep **`localhost`** so you can test locally.

If you skip this, Google sign-in fails from that site with
`auth/unauthorized-domain`.

---

## 3. Get the Web app config (for the Readdy frontend)

1. **⚙ → Project settings → General** tab.
2. Scroll to **Your apps**.
   - **No app yet?** Click the **Web** icon `</>`. Give it a nickname
     (`Hirewave web`). **Do NOT check "Also set up Firebase Hosting"** — Readdy
     hosts you. Click **Register app**.
   - **App already there?** Click it, then **SDK setup and configuration** →
     select **Config**.
3. You'll see a `firebaseConfig` object. Copy these values — they are **public**
   and safe to put in frontend code:
   ```js
   const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "hirewave-xxxxx.firebaseapp.com",
     projectId: "hirewave-xxxxx",
     storageBucket: "hirewave-xxxxx.appspot.com",
     messagingSenderId: "…",
     appId: "1:…:web:…",
   };
   ```
4. These go into `firebase-login.ts` (the drop-in for Readdy). See
   [READDY_FRONTEND.md](READDY_FRONTEND.md).

> The `apiKey` is **not a secret** — it only identifies the project to Google.
> Your data is protected by sign-in + (for the FastAPI side) token verification,
> not by hiding this key.

Note the **`projectId`** exactly (e.g. `hirewave-3f2a1`) — the backend needs it.

---

## 4. Create the backend service-account key (for token verification)

The FastAPI backend verifies each Firebase ID token with the Admin SDK, which
needs a service-account credential.

1. **⚙ → Project settings → Service accounts** tab.
2. Leave "Firebase Admin SDK" selected; click **Generate new private key** →
   confirm **Generate key**. A JSON file downloads.
3. **This file is a SECRET** (it can mint tokens for your project). Treat it like
   a password:
   - Put it on the API server only, e.g. `/opt/hirewave/firebase-sa.json`
     (`chmod 600`).
   - **Never** commit it, paste it into chat, or ship it in the frontend.
4. The same tab shows Admin SDK snippets — you can ignore them; the app already
   has the verification code.

---

## 5. Confirm plan & set a budget alert

- **Authentication → Usage** tab shows monthly active users. **Email + Google
  sign-in are free with no cap** on the **Spark** plan — you don't need billing
  enabled for this.
- Only **Phone/SMS** auth or **Identity Platform** advanced features cost money.
- If you *do* enable billing (Blaze) for other reasons: **⚙ → Usage and billing
  → Details & settings → Budgets & alerts → Create budget**, and set an email
  alert. Firebase has **no hard spend cap** — the alert is your safety net.

---

## 6. (Recommended) App Check — block abuse of your API

App Check attests that requests come from *your* real app, not a script. Worth
turning on before launch since your login endpoint is public.

1. **Build → App Check**.
2. Under **Apps**, click your **Web app** → **reCAPTCHA v3** (or Enterprise) →
   follow the prompts to get a site key.
3. Add the App Check init to the frontend later; enforce it on services when
   you're confident it works. This is optional for launch — skip if you want to
   ship first.

---

## 7. Where each value goes (console → code)

| From the console | Goes into | File / setting |
|---|---|---|
| Web `firebaseConfig` (apiKey, authDomain, projectId, appId) | Frontend | `firebase-login.ts` in the Readdy site |
| `projectId` | Backend env | `JOBSEARCH_FIREBASE_PROJECT_ID` |
| Service-account JSON path | Backend env | `JOBSEARCH_FIREBASE_CREDENTIALS_FILE` |
| — (turn on live verification) | Backend env | `JOBSEARCH_FIREBASE_AUTH=live` |
| Readdy site origin | Backend env | add to `JOBSEARCH_CORS_ORIGINS` |

Backend also needs the verifier installed: `pip install firebase-admin`.

---

## 8. Verify it end-to-end

1. **Backend:** set the four env vars above + `pip install firebase-admin`, redeploy.
2. **Frontend:** paste the config into `firebase-login.ts`, add it to the Readdy
   site, swap the mock line for `await user.getIdToken()`.
3. Sign in on the Readdy site with Google → you should land in the dashboard.
4. Back in the console → **Authentication → Users** tab: the new account appears
   there (that confirms Firebase saw the sign-in).

Until you flip `JOBSEARCH_FIREBASE_AUTH=live`, the backend stays in **mock** mode
(accepts a plain email as the token), so you can test the whole flow before
touching the real project.

---

## 9. Troubleshooting (console-related)

| Symptom | Fix |
|---|---|
| `auth/unauthorized-domain` | Add the site's domain in **Authentication → Settings → Authorized domains** (step 2). |
| Google popup closes instantly / blocked | Allow popups; ensure the domain is authorized; make sure a **support email** is set on the Google provider. |
| Backend 401 "invalid Firebase token" | `projectId` mismatch, wrong/missing service-account file, or clock skew on the server. Confirm `JOBSEARCH_FIREBASE_PROJECT_ID` matches the console exactly. |
| Browser CORS error calling the API | Add the Readdy origin to `JOBSEARCH_CORS_ORIGINS` and redeploy the backend. |
| Users can sign in but see no data | Expected on a fresh account — the app creates the user on first `/auth/firebase` call; load jobs / run a search to populate. |

---

### The two values I need from you to wire the code

Paste me (safe — public): **apiKey**, **authDomain**, **projectId**, **appId**
from step 3. I'll drop them into `firebase-login.ts` and give you the exact
backend `.env` lines. Keep the **service-account JSON** to yourself (step 4).
