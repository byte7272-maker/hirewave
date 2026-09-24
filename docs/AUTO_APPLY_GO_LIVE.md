# Auto-Apply Go-Live Runbook

How to move standing auto-apply from **safe simulation** to **real autonomous
submission**, without firing a bad application on the way. Follow the phases in
order — each one is gated so nothing submits for real until you deliberately
enable it.

> TL;DR of the gates (all default to the safe value):
> - `JOBSEARCH_ASSISTANT_BROWSER=mock` → no real browser (simulated).
> - `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=false` → a live run fills but never clicks Submit.
> - `JOBSEARCH_SCHEDULER_ENABLED=false` → nothing runs on its own.
> You turn these on one at a time, validating between each.

## Safety model (what protects you)

- **Credentials are never entered.** Password/SSN/card/bank/passport/licence-number
  fields are detected and left blank; they are structurally excluded from what
  reaches the browser. The user authenticates with the provider themselves.
- **No CAPTCHA/login bypass.** A sign-in wall or human-check is detected and
  escalated; the connected session is marked expired. Never solved.
- **No fabrication.** Any required question we can't source from the user's data
  aborts the application to a manual fallback (`needs_input`) — it does not guess.
- **The plan is built from the real form.** Once the apply form is open, its
  actual fields are scraped and the fill plan is rebuilt from them.
- **Bounded grants.** Every grant has a total cap, a daily cap, an expiry, and a
  verified-only default. Runs are deduped and audited.
- **LinkedIn is always assisted** (queued for the user to click Apply) — never
  auto-submitted server-side, regardless of settings.

## 0. Preconditions

- Postgres is the backend (`/health` → `persistence: postgresql`).
- A **persistent** encryption key is set (`/health` → `encryption: persistent`).
  Without it, connected sessions don't survive a restart. Generate one:
  ```bash
  python -m jobsearch.security.crypto keygen   # set as JOBSEARCH_ENCRYPTION_KEY
  ```
- Playwright is installed in the API image (it is **not** bundled by default):
  ```bash
  pip install .[automation]
  playwright install chromium
  ```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `JOBSEARCH_ENCRYPTION_KEY` | _(ephemeral)_ | AES-256 key for sessions/tokens at rest. **Required** for real use. |
| `JOBSEARCH_ASSISTANT_BROWSER` | `mock` | `playwright` = drive a real browser. `mock` = simulate. |
| `JOBSEARCH_ASSISTANT_BROWSER_HEADLESS` | `true` | Set `false` during validation so you can watch the fill. |
| `JOBSEARCH_ASSISTANT_BROWSER_STORAGE_STATE` | _(empty)_ | Optional path to a single pre-auth session (for a smoke test). Normally each user connects their own. |
| `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT` | `false` | **The final-submit gate.** `false` = fill and stop at review; `true` = click Submit. |
| `JOBSEARCH_SCHEDULER_ENABLED` | `false` | `true` = the API runs due grants/searches/reminders on a cadence (no cron). |
| `JOBSEARCH_SCHEDULER_INTERVAL_SECONDS` | `900` | How often the in-process scheduler ticks. |

`/health` surfaces the live state: `encryption`, `scheduler`, `persistence`,
`automation_mode`.

---

## Phase 1 — Dry run (no side effects)

Confirm matching/eligibility before anything touches a browser. Leave all gates
at their defaults.

```bash
# Create a criteria grant (conservative caps), then dry-run it.
POST /api/v1/auto-apply/grants
  { "scope":"criteria", "criteria":{"title_keywords":["python"],"min_fit_score":60},
    "require_verified": true, "max_submits": 1, "daily_cap": 1 }

POST /api/v1/auto-apply/grants/{id}/run   { "dry_run": true }
```

Expect `outcomes[*].status == "would_submit"` for the right jobs, `submitted: 0`,
and **nothing** recorded in applications. If the wrong jobs match, fix the
criteria (note: `min_fit_score` is scored against **this user's** profile — a
sparse profile fails closed and nothing is eligible).

## Phase 2 — Live-fill validation, submit gate OFF

Prove the real browser fills correctly and the guardrails hold — **without ever
submitting**.

1. Set on the web service and redeploy:
   ```
   JOBSEARCH_ASSISTANT_BROWSER=playwright
   JOBSEARCH_ASSISTANT_BROWSER_HEADLESS=false     # watch it
   JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=false          # still gated
   ```
2. Connect a real provider session (cookies only — never a password) via the
   connect flow (the browser extension / `python -m jobsearch.connect`).
3. Run a grant for a single **non-LinkedIn** job (LinkedIn is always queued):
   ```bash
   POST /api/v1/auto-apply/grants/{id}/run   { "dry_run": false, "limit": 1 }
   ```
4. Expected outcome: `filled_pending_submit` (the gate held). Watch the browser:
   - factual fields are filled from the profile,
   - **credential fields stay empty**,
   - unknown required questions produce `needs_input` (not a guess).
5. Repeat **per provider** (Indeed, then any others) and per a few real postings
   until the fill is correct and the selectors don't drift. Selector drift shows
   up as `no_apply_button` or `needs_input`, which are safe (manual fallback),
   not bad submissions.

Do not proceed until Phase 2 is clean for the providers you intend to enable.

## Phase 3 — Canary real submission

Enable the final click for a tiny, controlled grant.

1. Set `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=true` (keep headless=false for the first one).
2. Create a **scope=jobs** grant with a single, verified job you're willing to
   really apply to: `max_submits: 1`, `daily_cap: 1`, `require_verified: true`,
   `mode: "auto"`.
3. Run it: `POST /grants/{id}/run { "dry_run": false }`.
4. Verify:
   - outcome `submitted`, a real confirmation string,
   - a new `Application` whose `platform_response.simulated == false` (a genuine
     submission — a simulated one would be `true`),
   - the grant counters advanced (`submits_used`, `submitted_today`).
5. Confirm on the provider's site that the application actually landed.

If anything looks wrong, **flip `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=false`** — live
runs immediately revert to fill-and-review.

## Phase 4 — Enable autonomous scheduling

Only after Phases 2–3 pass.

1. Give grants a cadence (`interval_minutes > 0`) and conservative caps.
2. Set on the **web** service (single instance):
   ```
   JOBSEARCH_SCHEDULER_ENABLED=true
   JOBSEARCH_SCHEDULER_INTERVAL_SECONDS=900
   ```
   `/health` should now read `scheduler: in-process`.
3. **Run exactly one scheduler.** Do not also run the `python -m jobsearch.scheduler`
   cron — pick the in-process loop **or** the cron, never both, or scheduled runs
   double up. Per-run double-submit within one process is prevented by a per-user
   lock; running two schedulers defeats it.
4. Widen caps gradually as you gain confidence.

---

## Monitoring

- `/health` → `encryption`, `scheduler`, `persistence`.
- Run results carry `simulated` (true = mock, not sent) and per-job `outcomes`
  with statuses: `submitted`, `filled_pending_submit`, `needs_session`,
  `needs_login`, `captcha`, `needs_input`, `no_apply_button`, `queued`, `skipped`,
  `error`.
- Every fill/submit is written to the automation **audit** trail; submissions
  also fire the user's notifications (in-app + any configured SMS/push/email).
- The apply **queue** (`GET /api/v1/auto-apply/queue`) holds assisted/LinkedIn
  jobs awaiting a human Apply click.

## Kill switches / rollback

| To stop… | Do this |
|---|---|
| One grant | `PATCH /grants/{id}` `{ "status": "paused" }` (or `"revoked"`) |
| All real submission | `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=false` (live runs revert to fill-only) |
| All autonomous runs | `JOBSEARCH_SCHEDULER_ENABLED=false` |
| A provider entirely | `DELETE /api/v1/auto-apply/sessions/{provider}` (disconnect the session) |
| Everything, hard | Set `JOBSEARCH_ASSISTANT_BROWSER=mock` (back to simulation) |

## Known limits (before you scale)

- **Single web instance for exactly-once.** The per-user run lock is in-process.
  Multiple API instances, or an in-process scheduler running alongside the cron,
  can still race. Multi-instance exactly-once needs a shared lock / a DB unique
  constraint on `(user, job)` — a follow-up before horizontal scaling.
- **Selector drift.** Provider DOM changes degrade to `needs_input` /
  `no_apply_button` (manual fallback), not wrong submissions — but re-validate
  (Phase 2) after any provider UI change.
- **LinkedIn stays assisted** by design.
- **`min_fit_score` needs a real profile** for the user; otherwise it fails closed.
