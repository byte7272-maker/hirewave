# Readdy build prompts — beginner "Getting Started" wizards

A guided onboarding for first-time users: a **Getting Started hub** (a checklist)
that opens a **focused step-by-step wizard** for each of the 4 core features. Every
wizard drives the *real* pages/APIs underneath — no fake flows. All calls use the
existing API base + `Authorization: Bearer <access_token>` (401 → refresh → retry).

## The onboarding API (backend — already live)

- `GET /api/v1/onboarding` → the checklist status:
  ```json
  {
    "dismissed": false,
    "core_total": 4,
    "core_completed": 1,
    "percent": 25,
    "steps": [
      {"key":"profile","core":true,"done":true,"detected":true,"marked":null},
      {"key":"find_jobs","core":true,"done":false,"detected":false,"marked":null},
      {"key":"apply","core":true,"done":false,"detected":false,"marked":null},
      {"key":"interview","core":true,"done":false,"detected":false,"marked":null},
      {"key":"highlights","core":false,"done":false,"detected":false,"marked":null},
      {"key":"auto_apply","core":false,"done":false,"detected":false,"marked":null},
      {"key":"security","core":false,"done":false,"detected":false,"marked":null}
    ]
  }
  ```
  `done` is **auto-detected** from real data (résumé uploaded, search run,
  application submitted, mock interview done…) OR explicitly marked. You don't have
  to tell the backend when a user finishes — just re-fetch and it updates.
- `PUT /api/v1/onboarding/{step}` body `{ "status": "completed" | "dismissed" | "started" }`
  → override a step (e.g. "Skip" = dismissed; mark done when the action isn't
  auto-detectable). Returns the updated view.
- `PUT /api/v1/onboarding` body `{ "dismissed": true }` → hide the whole hub
  (`false` restores it). Returns the updated view.

**Step keys → copy** (you supply the UI text/icons). The first four are the
beginner **core**; the last three are a second **"Go further"** group — each now
has its own full wizard too (Prompts 6–8):
| key | group | title | one-liner |
|-----|-------|-------|-----------|
| profile | core | Set up your profile | Add your résumé so everything is tailored to you |
| find_jobs | core | Find your first jobs | Run a search and see your AI-ranked matches |
| apply | core | Apply with AI | Generate a tailored résumé + cover letter and submit |
| interview | core | Practice an interview | Do a mock interview with an AI persona |
| highlights | go further | Add work highlights | Bring in stories/wins that sharpen your answers |
| auto_apply | go further | Turn on auto-apply | Let the agent apply for you — with your review |
| security | go further | Protect your info | Check if your email/passwords were exposed |

---

## Prompt 1 — Getting Started hub

> Add a **Getting Started** panel for new users. Show it at the top of the main
> **Dashboard** (and as a dismissible card), driven by `GET /api/v1/onboarding`.
>
> - Render a **progress bar** using `percent` and a "**{core_completed} of
>   {core_total} done**" label. When `percent === 100`, show a celebratory "You're
>   all set!" state and a small "Hide" control.
> - List the **core steps** (`steps` where `core === true`, in array order) as a
>   checklist: each row shows the step's title (from the table above), a check when
>   `done`, and a **Start / Resume** button that opens that step's wizard (Prompts
>   2–5). Completed rows show a ✓ and read-only.
> - Below the core steps, a **"Go further"** section lists the non-core steps
>   (highlights, auto_apply, security) as their own checklist rows, each opening a
>   full wizard (Prompts 6–8) — same treatment as the core rows (title, done-check,
>   Start/Resume). Keep it collapsed until the core 4 are done, then auto-expand.
> - A **"Dismiss"** on the panel calls `PUT /api/v1/onboarding {dismissed:true}`
>   and hides it; if `dismissed` is already true, don't show the panel at all (but
>   offer a small "Show getting-started" link in settings to restore via
>   `{dismissed:false}`).
> - **Re-fetch `GET /api/v1/onboarding`** whenever the user returns to the
>   dashboard or finishes a wizard, so checks light up automatically.

---

## Prompt 2 — Wizard: "Set up your profile" (step `profile`)

> A focused modal/panel wizard, opened from the hub's **profile** step. Steps:
> 1. **Welcome** — one line: "Let's tailor Hirewave to you. Add your résumé and
>    we'll ground your matches, applications, and interview answers in your real
>    experience." Primary: **Continue**.
> 2. **Add your résumé** — two choices: **Upload a file** (multipart
>    `POST /api/v1/resumes/upload`, PDF/DOCX/MD/TXT) **or** **Import from LinkedIn**
>    (`POST /api/v1/integrations/linkedin/import`, then let them review/apply).
>    Show a spinner during upload; on success go to step 3.
> 3. **Quick profile check** — pre-fill from `GET /api/v1/users/me/profile`; let
>    them confirm/edit headline + top skills, save via `PUT /api/v1/users/me/profile`
>    (or `/users/me` for name). Primary: **Finish**.
> 4. **Done** — "Your profile is set." On finish, the `profile` step auto-detects
>    as done (a résumé now exists); just close and re-fetch the hub. If they skip,
>    call `PUT /api/v1/onboarding/profile {status:"dismissed"}`.

---

## Prompt 3 — Wizard: "Find your first jobs" (step `find_jobs`)

> Opened from the hub's **find_jobs** step. Steps:
> 1. **Explain** — "Tell us what you're looking for and we'll search multiple job
>    sites, filter out scams, and rank the results by how well they fit you."
> 2. **Run a search** — a small form (role, location, remote?) → `POST /api/v1/job-search/run`
>    `{role, location, remote, sources?}`. Show a loading state.
> 3. **See your matches** — fetch `GET /api/v1/jobs/matches` and show the top 3 as
>    a preview, each with its **fit score** and **authenticity badge**, with a
>    one-line explainer of what those mean ("Fit = how well it matches your skills;
>    the shield = we checked it's a real posting"). Primary: **View all matches**
>    (navigate to /dashboard/matches).
> 4. On completion, `find_jobs` auto-detects done (a saved search / results exist).
>    Re-fetch the hub. "Skip" → `PUT /api/v1/onboarding/find_jobs {status:"dismissed"}`.

---

## Prompt 4 — Wizard: "Apply with AI" (step `apply`)

> Opened from the hub's **apply** step. Requires at least one match (if none, send
> the user to the find_jobs wizard first). Steps:
> 1. **Explain** — "We'll generate a résumé and cover letter tailored to one job,
>    let you review them, then submit. Nothing is sent until you approve it."
> 2. **Pick a job** — list the user's matches (`GET /api/v1/jobs/matches`); pick one.
> 3. **Generate documents** — `POST /api/v1/resumes/generate {job_posting_id, tone}`
>    and `POST /api/v1/cover-letters/generate {job_posting_id, resume_id, tone}`.
>    Show both for review.
> 4. **Approve + submit** — this is the human-in-the-loop gate: approve the résumé
>    and cover letter, then submit the application (the applications flow). Make the
>    approval explicit — the backend blocks submit until approved.
> 5. **Done** — "Application submitted." `apply` auto-detects done. Re-fetch the hub.

---

## Prompt 5 — Wizard: "Practice an interview" (step `interview`)

> Opened from the hub's **interview** step. Steps:
> 1. **Explain** — "Practice with an AI interviewer tailored to your background.
>    You'll get scored feedback on each answer." Note that voice/coaching are
>    available if those features are enabled.
> 2. **Pick an interviewer** — `GET /api/v1/interview/personas`; show 2–3 easy
>    personas first (difficulty `easy`) so beginners aren't intimidated. Selecting
>    one calls `POST /api/v1/interview/mock/start {persona_id, resume_id?, max_questions:3}`.
> 3. **Answer one question** — show the first question; let them type (or speak, if
>    STT is built) an answer → `POST /api/v1/interview/mock/{id}/reply {answer}`;
>    show the returned feedback/score for that answer.
> 4. **Done** — "Nice — that's how it works." Let them continue the full interview
>    or finish. `interview` auto-detects done (a mock session now exists). Re-fetch
>    the hub. "Skip" → `PUT /api/v1/onboarding/interview {status:"dismissed"}`.

---

## Prompt 6 — Wizard: "Add work highlights" (step `highlights`)

> Opened from the hub's **highlights** step. Steps:
> 1. **Explain** — "Bring in your best work — accomplishments, project stories, or
>    wins. You can write them yourself, or paste what an AI assistant in your own
>    work tools (Copilot, Glean, a Teams/email assistant) summarized for you. These
>    make your interview answers stronger and more specific." Note plainly: **we
>    never connect to your work email or accounts — you bring the finished text.**
> 2. **Add one highlight** — a big paste box + a source toggle (**I wrote this /
>    AI-generated**); if AI-generated, show an optional "Which tool?" field. Submit
>    to `POST /api/v1/experience` `{ content, title?, source, source_tool? }`
>    (content ≥ 10 chars, else `400`). Optionally allow a file upload via
>    `POST /api/v1/experience/upload` (multipart, PDF/DOCX/MD/TXT).
> 3. **Done** — "Added — this now feeds your interview prep." `highlights`
>    auto-detects done once one exists; re-fetch the hub. "Skip" →
>    `PUT /api/v1/onboarding/highlights {status:"dismissed"}`.

---

## Prompt 7 — Wizard: "Turn on auto-apply" (step `auto_apply`)

> Opened from the hub's **auto_apply** step. This sets up the agent to apply for
> the user — so **be explicit about consent and control at every step**. Steps:
> 1. **Explain + consent** — "Auto-apply can prepare and submit applications for
>    you to jobs that match your criteria. **You stay in control:** it only applies
>    to verified postings, respects daily limits, and you can review the queue and
>    pause it anytime. Nothing runs until you turn it on." A clear **"I understand
>    and want to enable auto-apply"** checkbox gates the Next button.
> 2. **Set safe limits** — simple fields with beginner-friendly defaults: a **name**,
>    **max total** applications, **daily cap**, and **only verified jobs** (on by
>    default). Keep it **manual-run by default** (`interval_minutes: 0`) so it never
>    fires on its own until they choose a cadence.
> 3. **Create the grant** — `POST /api/v1/auto-apply/grants` with
>    `{ name, scope:"criteria", criteria:{…}, require_verified:true, max_submits,
>    daily_cap, interval_minutes:0, mode:"auto" }`.
> 4. **Review the queue** — show `GET /api/v1/auto-apply/queue` (what *would* be
>    applied to) so they see it's their call, and point them to the Auto-apply page
>    to run or pause. Primary: **Done**.
> 5. **Done** — `auto_apply` auto-detects done once a grant exists; re-fetch the
>    hub. "Skip" → `PUT /api/v1/onboarding/auto_apply {status:"dismissed"}`.
> ⚠️ Do **not** auto-run applications from inside the wizard — creating the grant is
> enough; submitting stays a deliberate action on the Auto-apply page.

---

## Prompt 8 — Wizard: "Protect your info" (step `security`)

> Opened from the hub's **security** step. Two quick, privacy-safe checks. Steps:
> 1. **Explain** — "Job hunting means sharing your email around. Let's check if it
>    has shown up in known data breaches, and whether a password you use is exposed
>    — your password never leaves your browser."
> 2. **Monitor an email** — input an email → `POST /api/v1/monitoring/identifiers
>    { email }`. The response includes a **verification code** (in dev; production
>    emails it). Enter it → `POST /api/v1/monitoring/identifiers/{id}/verify
>    { code }`. Then **scan** → `POST /api/v1/monitoring/scan` and show any findings
>    (`GET /api/v1/monitoring/findings`) with severity badges. (Verification proves
>    the user owns the email before anything is scanned.)
> 3. **Check a password (optional)** — the k-anonymity check: SHA-1 the password in
>    the browser, send **only the first 5 hex chars** to
>    `GET /api/v1/monitoring/password-range/{prefix}`, match the returned suffixes
>    **locally**. Never send the password or full hash; clear the field after.
> 4. **Done** — "You're monitoring your email." `security` auto-detects done once an
>    identifier is enrolled; re-fetch the hub. "Skip" →
>    `PUT /api/v1/onboarding/security {status:"dismissed"}`.

---

## Notes for Readdy
- The **hub never needs to tell the backend a step is done** for the auto-detected
  cases — it computes `done` from real data. Only call `PUT /onboarding/{step}` for
  **Skip** (dismissed) or to force-complete a step you can't detect.
- Keep each wizard **short (3–5 steps)** and always allow **Skip** and **Back**.
- Re-fetch `GET /api/v1/onboarding` after any wizard closes so the checklist and
  progress bar update immediately.
- All **seven** steps now have full wizards: the **core 4** (Prompts 2–5) plus the
  **"Go further"** three (Prompts 6–8). The backend already tracks and
  auto-detects all seven — no backend change needed for the new three.
- The **auto_apply** wizard is the one to handle carefully: gate it behind an
  explicit consent checkbox, default to conservative limits + manual run, and never
  submit applications from inside the wizard.
