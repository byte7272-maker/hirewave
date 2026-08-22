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

**Step keys → copy** (you supply the UI text/icons):
| key | title | one-liner |
|-----|-------|-----------|
| profile | Set up your profile | Add your résumé so everything is tailored to you |
| find_jobs | Find your first jobs | Run a search and see your AI-ranked matches |
| apply | Apply with AI | Generate a tailored résumé + cover letter and submit |
| interview | Practice an interview | Do a mock interview with an AI persona |

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
> - Below the core steps, a collapsed "**More to explore**" section lists the
>   non-core steps (highlights, auto_apply, security) as simple links to those
>   pages — no full wizard needed.
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

## Notes for Readdy
- The **hub never needs to tell the backend a step is done** for the auto-detected
  cases — it computes `done` from real data. Only call `PUT /onboarding/{step}` for
  **Skip** (dismissed) or to force-complete a step you can't detect.
- Keep each wizard **short (3–5 steps)** and always allow **Skip** and **Back**.
- Re-fetch `GET /api/v1/onboarding` after any wizard closes so the checklist and
  progress bar update immediately.
- These four are the beginner core; `highlights`, `auto_apply`, and `security` are
  linked from "More to explore" and get lighter treatment for now.
