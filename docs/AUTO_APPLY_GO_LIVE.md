# Auto-Apply Go-Live Runbook

How to move standing auto-apply from **safe simulation** to **real assisted
submission**, without firing a bad application on the way. Follow the phases in
order — each one is gated so nothing submits for real until you deliberately
enable it.

> **Hard rule (enforced in code, not by a toggle): an autonomous run NEVER
> submits a real application.** When a scheduled/standing run reaches a live form
> it stops and **queues the application for the user's explicit per-application
> approval** (`pending_approval`). The application is sent only when the user
> approves that specific one via `POST /auto-apply/approvals/{id}/approve` — the
> single real-submit path. There is no setting that makes a run submit on its own.

> TL;DR of the gates (all default to the safe value):
> - `JOBSEARCH_ASSISTANT_BROWSER=mock` → no real browser (simulated).
> - `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=false` → even an **approved** application
>   stops at review instead of clicking Submit. `true` lets an approval submit.
> - `JOBSEARCH_SCHEDULER_ENABLED=false` → nothing runs on its own.
> You turn these on one at a time, validating between each. Note the live-submit
> gate only affects the **approval** step — a run itself never submits regardless.

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
- **Mandatory per-application approval.** No run — dry, live, or scheduled —
  submits a real application. A live run prepares it and parks it in
  `pending_approval`; only the user's explicit approval of that individual
  application submits it. This is enforced in `auto_apply.py`, not by a config
  flag, so it holds even with every gate turned on.

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
| `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT` | `false` | **The final-submit gate, applied at the approval step only.** `false` = an approved application fills and stops at review; `true` = an approved application clicks Submit. Never lets a *run* submit — a run always queues for approval first. |
| `JOBSEARCH_SCHEDULER_ENABLED` | `false` | `true` = the API runs due grants/searches/reminders on a cadence (no cron). |
| `JOBSEARCH_SCHEDULER_INTERVAL_SECONDS` | `900` | How often the in-process scheduler ticks. |

`/health` surfaces the live state: `encryption`, `scheduler`, `persistence`,
`automation_mode`.

## Deployment topology (two services)

Real submission runs in a **separate automation worker**, not the web dyno:

| Service | Image | Role | Browser | Real submits? |
|---|---|---|---|---|
| **web** | `./Dockerfile` (lean) | API + UI. Handles `/grants`, dry-runs, connect, queue. | none | **No** — always simulates (no Chromium; keep the gate off). |
| **worker** | `./Dockerfile.worker` (Playwright + Chromium) | Runs the scheduler loop (`python -m jobsearch.worker`): due grants, saved searches, reminders. | Chromium | **Yes** — the only process that can. |

Both are the **same repo**, sharing `JOBSEARCH_DATABASE_URL` and
`JOBSEARCH_ENCRYPTION_KEY`.

**Railway setup (dashboard UI — Config as Code is deprecated for new services):**
- **web** — the existing service builds `./Dockerfile` (auto-detected); unchanged.
- **worker** — add a second service from the same repo, then in **Settings** set:
  - **Build →** Builder **Dockerfile**, Dockerfile Path **`Dockerfile.worker`**.
  - **Deploy →** Start Command `python -m jobsearch.worker`, **Replicas 1**.
  - **Networking →** no public domain (it serves no HTTP).
  - **Variables →** the same `JOBSEARCH_DATABASE_URL` and `JOBSEARCH_ENCRYPTION_KEY`
    as web (the encryption key MUST match, or the worker can't decrypt sessions the
    web stored).
  The worker Dockerfile uses Microsoft's prebuilt Playwright image, so Chromium is
  already baked in — no browser-install step to fail at build time.

Keep the worker at **one replica** — it's the single real-submit runner, and the
per-user lock that prevents double-submits is in-process.

Why this shape: Chromium never competes with API requests; and because only the
worker has a browser **and** the submit gate, there's a single real-submit
runner — so the per-user run lock is sufficient and manual `/run` calls on the
web service can't race it into a duplicate (they can only ever simulate there).

**Env split** (set per service):

| Variable | web | worker |
|---|---|---|
| `JOBSEARCH_DATABASE_URL` | shared | shared (same DB) |
| `JOBSEARCH_ENCRYPTION_KEY` | shared | shared (same key) |
| `JOBSEARCH_ASSISTANT_BROWSER` | `mock` (default) | `playwright` (when validating/live) |
| `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT` | `false` (leave off) | `false` → `true` at go-live |
| `JOBSEARCH_SCHEDULER_ENABLED` | `false` (worker owns scheduling) | n/a — the worker process runs the loop itself |
| `JOBSEARCH_SCHEDULER_INTERVAL_SECONDS` | — | e.g. `900` |
| `JOBSEARCH_ASSISTANT_BROWSER_HEADLESS` | — | `false` while validating, `true` in prod |

> Do **not** set `JOBSEARCH_SCHEDULER_ENABLED=true` on web while the worker runs —
> that would double the scheduled runs. The worker is the single scheduler.

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

## Phase 2 — Live-fill validation (a run only ever queues for approval)

Prove the real browser fills correctly and the guardrails hold — **without ever
submitting**. A live run never submits; it parks each job in `pending_approval`.

1. Deploy the **worker** service (`Dockerfile.worker`) and set on it:
   ```
   JOBSEARCH_ASSISTANT_BROWSER=playwright
   JOBSEARCH_ASSISTANT_BROWSER_HEADLESS=false     # watch it
   JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=false          # approval-step gate, still off
   JOBSEARCH_SCHEDULER_INTERVAL_SECONDS=120        # tick often while validating
   ```
2. Connect a real provider session (cookies only — never a password) via the
   connect flow (the browser extension / `python -m jobsearch.connect`).
3. Create a grant (via the web API) with a cadence so the worker picks it up, for
   a single **non-LinkedIn** job (LinkedIn is always queued):
   ```bash
   POST /api/v1/auto-apply/grants
     { "scope":"jobs", "job_ids":["<verified job id>"], "interval_minutes": 2,
       "max_submits": 1, "daily_cap": 1, "require_verified": true }
   ```
   The worker runs it on its next tick. (You can also dry-run from the web API to
   preview, but web can't fill live — only the worker has a browser.)
4. Watch the **worker logs**; expected run outcome: `pending_approval` — the run
   prepared the application and stopped, submitting nothing. A `pending_approval`
   `Application` now exists (`submitted_at` null).
5. Then exercise the **approval preview** from the web API (the gate is still off,
   so this fills-and-holds without submitting):
   ```bash
   GET  /api/v1/auto-apply/approvals                 # the parked application(s)
   POST /api/v1/auto-apply/approvals/{id}/approve     # gate OFF -> filled_pending_submit
   ```
   Watch the browser during the approve:
   - factual fields are filled from the profile,
   - **credential fields stay empty**,
   - unknown required questions produce `needs_input` (not a guess),
   - with the gate off the approve returns `filled_pending_submit` (nothing sent).
6. Repeat **per provider** (Indeed, then any others) and per a few real postings
   until the fill is correct and the selectors don't drift. Selector drift shows
   up as `no_apply_button` or `needs_input`, which are safe (manual fallback),
   not bad submissions.

Do not proceed until Phase 2 is clean for the providers you intend to enable.

## Phase 3 — Canary real submission (approve one, gate on)

Enable the final click **for the approval step**, then approve a single parked
application yourself. The run still only queues — you are the one who submits.

1. On the **worker** service set `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=true` (keep
   `HEADLESS=false` for the first one) and redeploy. (This gate governs the
   approve endpoint; it does **not** make any run submit.)
2. Create a **scope=jobs** grant with a single, verified job you're willing to
   really apply to: `max_submits: 1`, `daily_cap: 1`, `require_verified: true`,
   `mode: "auto"`, `interval_minutes: 2`. Let the worker run it — it parks a
   `pending_approval` application (outcome `pending_approval`, nothing sent).
3. Review it, then give your explicit OK for that one application:
   ```bash
   GET  /api/v1/auto-apply/approvals
   POST /api/v1/auto-apply/approvals/{id}/approve      # the sole real-submit path
   ```
4. Verify:
   - the approve returns `{"status":"submitted","simulated":false}` with a real
     confirmation string,
   - the `Application` flips to `submitted`, `platform_response.simulated == false`
     (a genuine submission — a simulated one would be `true`), `submitted_at` set,
   - the grant counters advanced (`submits_used`, `submitted_today`).
5. Confirm on the provider's site that the application actually landed.

If anything looks wrong, **flip the worker's `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=false`**
— approvals immediately revert to fill-and-review, and runs were never submitting
anyway. Reject a parked application with
`POST /api/v1/auto-apply/approvals/{id}/reject`.

## Phase 4 — Go autonomous (runs queue; you approve)

Only after Phases 2–3 pass. "Autonomous" here means the worker autonomously
**prepares and queues** applications on a cadence — it never submits on its own.
Every real send still requires the user to approve that specific application.

1. On the worker, set production cadence + headless:
   ```
   JOBSEARCH_ASSISTANT_BROWSER_HEADLESS=true
   JOBSEARCH_SCHEDULER_INTERVAL_SECONDS=900
   JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=true          # so approvals can submit
   ```
2. Give real grants a cadence (`interval_minutes > 0`) with **conservative caps**
   (`max_submits`, `daily_cap`) and `require_verified: true`. Widen gradually. As
   they run, applications pile up in `pending_approval` for the user to review and
   approve (or reject) in the app — nothing is ever sent without that approval.
3. **One scheduler only.** The worker is it. Do not set
   `JOBSEARCH_SCHEDULER_ENABLED=true` on web, and do not also run the
   `python -m jobsearch.scheduler` cron — any second scheduler doubles runs and
   defeats the per-user lock.

---

## Monitoring

- **Worker heartbeat:** `GET /health/worker` (web) reports the worker's liveness
  from the shared DB — `status` is `never` (no tick yet), `ok`, or `stale` (last
  tick older than ~3× the tick interval, i.e. the worker may be down), plus
  `last_tick_at`, `seconds_since`, `ticks`, and the `last_summary` counts. Wire it
  to your uptime monitor.
- **Worker logs** are the detailed signal for scheduled runs (each tick logs a
  summary; submissions log per grant). `/health` (web) → `encryption`,
  `scheduler`, `persistence`.
- Run results carry `simulated` (true = mock, not sent) and per-job `outcomes`
  with statuses: `pending_approval` (live run parked it for your OK — the normal
  live outcome), `submitted` (mock/simulated inside a run, or a real send from an
  approval), `needs_session`, `needs_login`, `captcha`, `needs_input`,
  `no_apply_button`, `queued`, `skipped`, `error`. `filled_pending_submit` appears
  from the **approve** endpoint when the live-submit gate is off.
- **Approvals:** `GET /api/v1/auto-apply/approvals` lists applications parked by a
  run awaiting the user's OK; `POST .../approvals/{id}/approve` is the only path
  that submits a real application; `.../reject` declines one (never sent).
- Every fill/submit is written to the automation **audit** trail; submissions
  also fire the user's notifications (in-app + any configured SMS/push/email).
- The apply **queue** (`GET /api/v1/auto-apply/queue`) holds assisted/LinkedIn
  jobs awaiting a human Apply click.

## Kill switches / rollback

| To stop… | Do this |
|---|---|
| One grant | `PATCH /grants/{id}` `{ "status": "paused" }` (or `"revoked"`) |
| All real submission | Worker `JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT=false` (approvals revert to fill-only; runs never submitted) — or simply stop approving |
| All autonomous runs (queuing) | Stop / scale-to-zero the **worker** service |
| A single parked application | `POST /api/v1/auto-apply/approvals/{id}/reject` |
| A provider entirely | `DELETE /api/v1/auto-apply/sessions/{provider}` (disconnect the session) |
| Everything, hard | Worker `JOBSEARCH_ASSISTANT_BROWSER=mock` (back to simulation) |

## Known limits (before you scale)

- **Single worker instance for exactly-once.** The per-user run lock is
  in-process, and the worker is the only real-submit runner — so keep the worker
  at **one replica**. Scaling the worker to >1, or adding a second scheduler
  (web in-process loop or the cron), can race. Multi-replica exactly-once needs a
  shared lock / a DB unique constraint on `(user, job)` — a follow-up before
  scaling the worker horizontally.
- **Selector drift.** Provider DOM changes degrade to `needs_input` /
  `no_apply_button` (manual fallback), not wrong submissions — but re-validate
  (Phase 2) after any provider UI change.
- **LinkedIn stays assisted** by design.
- **`min_fit_score` needs a real profile** for the user; otherwise it fails closed.
