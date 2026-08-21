# Bayete — Frontend (Next.js)

The web client for the Job-Search Automation Platform (plan Layer 1). Next.js
App Router + TypeScript, talking to the FastAPI backend. SSR-ready, keyboard-
accessible (skip link, visible focus, labelled controls, ARIA live regions).

## Run

Start the backend first (from the repo root):

```bash
PYTHONPATH=src python -m jobsearch.api          # http://127.0.0.1:8000
```

Then the frontend:

```bash
cd frontend
npm install
npm run dev                                     # http://localhost:3000
```

The Next server **proxies `/api/*` and `/health` to the backend** (see
`next.config.mjs`), so the browser is always same-origin — no CORS, tokens stay
first-party. Point at a different backend with `API_PROXY_TARGET`.

```bash
npm run build && npm run start                  # production build
```

## What's here

| Route | Purpose |
|-------|---------|
| `/login`, `/register` | JWT auth (tokens in localStorage, auto-refresh on 401) |
| `/dashboard` | Overview: match/document/application counts + unread notifications |
| `/matches` | Load sample jobs, AI-ranked matches with authenticity badges, skill match/gap chips, "Prepare application" |
| `/documents` | Generated resumes with ATS score; **approve** (human-in-the-loop gate) |
| `/applications` | Approve linked docs → submit; status, confirmation, manual-fallback steps |
| `/integrations` | Connect/revoke the 6 OAuth providers |
| `/profile` | Edit profile + job preferences (re-ranks matches) |
| `/notifications` | Read / mark-read |

## Architecture

- **`src/lib/api.ts`** — typed fetch wrapper; attaches the bearer token,
  transparently refreshes once on `401`, surfaces API `detail` as error messages.
- **`src/lib/auth.tsx`** — `AuthProvider` context (login/register/logout, current user).
- **`src/lib/useApi.ts`** — small data-loading hook (`data/loading/error/reload`).
- **`src/lib/types.ts`** — TypeScript mirror of the API DTOs.
- **`src/app/(app)/layout.tsx`** — auth guard + dashboard shell (redirects to `/login`).
- **`src/components/`** — `Sidebar`, `Toast`, and presentational `ui` helpers
  (score meter, verification/status badges).
- **`src/app/globals.css`** — a single design-system stylesheet (dark theme,
  tokens, accessible focus styles). No CSS framework dependency.

## Verified flow

register → dashboard → load sample jobs (scam posting auto-filtered by the
verification engine) → prepare application (generates resume + cover letter) →
approval gate blocks submit → approve → submit → status "submitted" +
notification. All exercised end-to-end against the live backend.

## Notes

- OAuth "Connect" completes the mock flow inline (backend runs the mock token
  exchanger offline). With real provider credentials + `HttpxTokenExchanger`,
  the button would instead redirect the user to the provider consent screen.
- No test/lint deps are installed to keep the tree small; `npm run build`
  type-checks the whole app.
