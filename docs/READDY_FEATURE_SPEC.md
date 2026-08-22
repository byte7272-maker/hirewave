# Hirewave — feature & API spec for Readdy

Paste this into Readdy as the build reference. It describes every feature the
backend already supports, the screens to build, and the exact API endpoint each
screen calls. The backend is live and CORS-enabled for the Readdy site.

## Global setup

- **API base URL:** `https://hirewave-production-3db3.up.railway.app`
  (store it as the env var `VITE_PUBLIC_API_BASE_URL`; prefix every path below with it).
- **Auth model (JWT):**
  - Sign up → `POST /api/v1/auth/register` `{email, password, full_name}` → then log in.
  - Log in → `POST /api/v1/auth/login` `{email, password}` → returns `{access_token, refresh_token}`.
  - Send `Authorization: Bearer <access_token>` on every other request.
  - On a `401`, call `POST /api/v1/auth/refresh` `{refresh_token}` for new tokens, then retry.
  - Log out → `DELETE /api/v1/auth/logout` `{refresh_token}`.
- **Errors:** non-2xx responses return `{"detail": "message"}`.
- **The logged-in user's name** comes from `GET /api/v1/users/me` (`full_name`) —
  greet them with that, never a placeholder.

---

## 1. Account & profile
Screens: **Sign up / Log in**, **Profile**, **Job preferences**.
- `GET /api/v1/users/me` → `{id, email, full_name, location}` (who's logged in).
- `PUT /api/v1/users/me` → update name/location/phone.
- `GET /api/v1/users/me/profile` → headline, summary, skills[], work_experience[], education[].
- `GET·PUT /api/v1/users/me/preferences` → job_type, salary_range, remote_ok, target_roles[], target_locations[], seniority.

## 2. Résumé & cover letters  ← (currently missing on Readdy)
Screens: **Documents / Résumé manager** — upload, generate, edit, download.
- `POST /api/v1/resumes/upload` → **multipart file upload** (PDF/DOCX/MD). This is the résumé upload section.
- `GET /api/v1/resumes` → list the user's résumés.
- `POST /api/v1/resumes/generate` `{job_posting_id, tone, format}` → AI-tailored résumé for a job.
- `GET /api/v1/resumes/{id}` · `PUT /api/v1/resumes/{id}` · `DELETE /api/v1/resumes/{id}`.
- `GET /api/v1/resumes/{id}/file` → download the file.
- `POST /api/v1/cover-letters/generate` `{job_posting_id, resume_id?, tone}` → AI cover letter.
- `GET·PUT /api/v1/cover-letters/{id}`.

## 2b. Work-experience highlights  ← (NEW — build this section)
Screen: **My Work Highlights** (a card list under Documents or Profile, or its own sidebar item).

**What it is (show this framing to users):** a place to bring in richer narrative
work material than a résumé's bullets — accomplishment **highlights**, STAR-style
**stories**, **project** write-ups, **analyses**, notable **interactions**. The
content is either **self-written** or **produced by an AI agent inside the user's
own work environment** (e.g. Microsoft 365 Copilot, Glean, a Teams/email
assistant) — a tool with legitimate access to their real work email, chats, and
software that can surface past projects, results, and interactions they'd
forgotten. **The platform never connects to those work tools or handles work
credentials** — the user runs their own work agent, then pastes or uploads the
finished summary here and attests to it. These highlights automatically enrich
interview prep (below): suggested answers can then reference real work the
candidate might not have recalled.

- `GET /api/v1/experience` → list the user's highlights (newest first). Each:
  `{id, title, content, kind, source, source_tool, skills[], company, period,
  original_filename, created_at}`.
  - `kind` ∈ `highlight | story | project | analysis | interaction | achievement`
  - `source` ∈ `self_written | ai_generated | imported`
  - `source_tool` = free text label of the AI tool that wrote it (e.g. "Microsoft
    365 Copilot") — show it as a small provenance chip on ai_generated items.
- `POST /api/v1/experience` `{content, title?, kind?, source?, source_tool?, skills?[], company?, period?}`
  → add a pasted highlight (content min 10 chars, else 400). **Give users a
  "paste from your work AI assistant" text box + a source picker (self-written /
  AI-generated) + an optional "which tool?" field.**
- `POST /api/v1/experience/upload` → **multipart file** (PDF/DOCX/MD/TXT) an AI
  agent exported; text is extracted and stored. Form fields: `title, kind, source
  (default imported), source_tool, company, period`.
- `GET /api/v1/experience/{id}` · `PUT /api/v1/experience/{id}` (edit any field) ·
  `DELETE /api/v1/experience/{id}`.
- ⚠️ **Do NOT** offer to connect to the user's work email/Teams/etc. from here —
  that stays inside their employer's environment. This section only accepts the
  content they bring.

## 3. Job search & AI matches
Screens: **Search jobs**, **Matches (ranked)**, **Job detail**.
- `POST /api/v1/job-search/run` `{role, location, remote, sources[]}` → aggregate jobs from multiple sites.
- `GET /api/v1/jobs` → all ingested jobs. `GET /api/v1/jobs/{id}` → one job.
- `GET /api/v1/jobs/matches` → **AI-ranked matches** for the user (`{job_id, title, company, score, matching_skills[], gap_skills[], authenticity_score}`). Show as a ranked list with fit score.
- `GET /api/v1/jobs/matches/export` → export matches (PDF shortlist).
- **Saved searches (agent):** `GET·POST /api/v1/job-search/searches`, `PUT·DELETE /searches/{id}`, `POST /searches/{id}/run`. The agent re-runs them and finds new roles.

## 4. Job authenticity (real vs. scam)
Screen: **Trust/authenticity badge on each job + a "Flagged jobs" list.**
- `GET /api/v1/jobs/{id}/verification` and `GET /api/v1/authenticity/job/{id}` → authenticity score + flags.
- `POST /api/v1/authenticity/job/{id}/report` → user reports a dubious job.
- `POST /api/v1/authenticity/job/{id}/verify-employer` → check against the employer's real site.
- `GET /api/v1/authenticity/flagged` → community list of fake/dubious postings.

## 5. Applications pipeline
Screens: **Applications board** (Draft → Submitted → Interviewing → Offer).
- `GET /api/v1/applications` (list) · `POST` (create) · `GET /{id}`.
- `PUT /api/v1/applications/{id}/submit` → submit an application.
- `PUT /api/v1/applications/{id}/status` `{status}` → move it along the pipeline.
- `DELETE /api/v1/applications/{id}`.

## 6. AI mock interviews & personas  ← (currently missing on Readdy)
Screens: **Persona gallery / pick an interviewer**, **Mock interview room**, **Interview prep**.

### Persona gallery (build this page)
- `GET /api/v1/interview/personas` → an **array of interviewer characters**. Each has
  `id`, `name`, `role`, `company`, `bio` (a 1-sentence **description**), `difficulty`
  (`easy` | `normal` | `hard`), `style`, `initials`, `gender`, and **`avatar_url`**
  (a ready image URL — render `<img src={avatar_url}>`).
- **Render a card per persona:** avatar image, name + role, the `bio`, and a
  **difficulty badge** (easy = green, normal = amber, hard = red — some are gentle
  warm-ups, others grill you). Clicking a card starts an interview with it.
- **Résumé-first indicator:** above the gallery, call `GET /api/v1/resumes`. If it
  returns an **empty array**, show a banner: *"Upload your résumé first so your
  questions match your experience"* (link to §2). If non-empty, show "Using your
  résumé: <name>". Questions are grounded in the **résumé + the job's industry**,
  so this genuinely changes them.

### Running an interview
- `POST /api/v1/interview/mock/start` `{persona_id, resume_id?, job_posting_id?, max_questions}`
  → start with the chosen persona; pass `resume_id` + `job_posting_id` for tailored
  questions. (`difficulty` is optional — defaults to the persona's own.)
- `POST /api/v1/interview/mock/{id}/reply` `{answer, response_seconds?}` → the persona's
  follow-up + per-answer feedback; `status` becomes `completed` with a `summary` at the end.
- `GET /api/v1/interview/mock/{id}` (transcript) · `GET /api/v1/interview/mock` (past sessions).

### Prep + media
- `POST /api/v1/interview/prep` `{resume_id?, job_posting_id?, count}` → likely questions +
  suggested answers (grounded in résumé + job **+ the user's work-experience
  highlights from §2b** — no extra params needed; the backend folds them in
  automatically). `based_on_document: true` when answers were grounded in the
  résumé or highlights.
- `GET /api/v1/interview/media/capabilities` → `{tts, video, personas}` (persona count).
- `POST /api/v1/interview/tts` `{text, voice}` → interviewer voice audio (when configured).
- `POST /api/v1/interview/video` `{text, persona}` → talking-avatar video (when configured).

### Vocabulary analysis (recorded / live-transcribed answers)
- `POST /api/v1/interview/vocabulary` `{text, rewrite?}` → analyzes the words in a
  spoken answer and suggests replacements. **Use this on the transcript of a
  recorded response, or on the running text from live speech-to-text** (it's
  deterministic and fast — safe to call as the candidate speaks, e.g. debounced
  every ~1–2s). Response:
  - `score` (0–100 vocabulary strength), `summary` (one-line coaching takeaway).
  - `word_count`, `unique_words`, `vocabulary_richness` (0–1), `filler_count`,
    `filler_ratio`.
  - `suggestions[]` — each `{original, kind, count, suggestions[], note}` where
    `kind` is `"filler"` | `"weak"` | `"overused"`. For `weak` items, `suggestions`
    holds stronger word choices (e.g. "responsible for" → owned / led / drove);
    for `filler`/`overused`, `suggestions` may be empty and `note` explains the fix.
    **Render these as inline word-replacement chips** (tap a suggestion to swap it
    into the transcript), and show the score + filler count as live meters.
  - `polished` — only when `rewrite: true` is sent **and** an LLM is configured: a
    full rewrite of the answer with the stronger wording (use for a one-tap
    "Polish my answer" button, not on every keystroke).

## 7. Crowdsourced interview questions
Screen: **Community questions** (search by job title, contribute, upvote).
- `GET /api/v1/questions/search?job_title=…` · `GET /questions/titles` · `GET /questions/mine`.
- `POST /api/v1/questions` `{job_title, question, category, tips}` → contribute.
- `POST /api/v1/questions/{id}/vote` · `POST /questions/{id}/flag`.

## 8. Automation assistant (permission-gated)
Screens: **Assistant settings** (toggles + activity log), **Auto-fill preview**.
- `GET·PUT /api/v1/assistant/consent` → per-feature permission toggles (all off by default).
- `GET /api/v1/assistant/actions` → audit log of what the assistant did.
- `POST /api/v1/assistant/prepare-drafts` → auto-prepare résumé+cover drafts for strong matches.
- `POST /api/v1/assistant/autofill/{job_id}` → preview how it would fill an application (credentials always refused).
- `POST /api/v1/assistant/autofill/{job_id}/execute` `{submit}` → fill (and optionally submit).

## 9. Standing auto-apply
Screens: **Connected sessions**, **Auto-apply rules**, **Apply queue**.
- Sessions: `GET·POST /api/v1/auto-apply/sessions`, `DELETE /sessions/{provider}` (connect a provider session; password never handled).
- Rules (grants): `GET·POST /api/v1/auto-apply/grants`, `GET·PATCH·DELETE /grants/{id}`, `POST /grants/{id}/run` `{dry_run, limit}`.
- `GET /api/v1/auto-apply/queue` → LinkedIn/assisted jobs awaiting a manual Apply click.
- `POST /api/v1/auto-apply/run-due` → run scheduled rules.

## 10. Reminders & notifications
Screens: **Notification bell**, **Reminder settings** (channels, quiet hours, digest).
- `GET /api/v1/notifications`, `PUT /notifications/read-all`, `PUT /{id}/read`.
- `GET·PUT /api/v1/reminders/prefs` → in-app/email/SMS/push toggles, phone, timezone, quiet hours (start/end), daily-digest hour, notify-on-apply.
- `POST /api/v1/reminders/push/subscribe` · `/unsubscribe` (web push).
- `POST /api/v1/reminders/test` → send a test reminder.

## 11. Networking & peer practice
Screens: **Connections & invites**, **Messages**, **Job boards/communities**, **Peer video practice**.
- Social: `POST /api/v1/social/invites` · `/invites/email` · `/invites/accept`, `GET /connections`, `GET /threads`, `GET /messages/{other_id}`, `POST /messages`.
- Boards: `GET /api/v1/boards` · `/discover`, `POST` (create) · `/join`, `GET /{id}/members` · `/{id}/posts`, `POST /{id}/posts`.
- Peer practice (video): `GET·POST /api/v1/practice`, `POST /{id}/accept` · `/end`, `GET /{id}/questions`, signalling `POST /{id}/signal` + `GET /{id}/signals`, plus `GET /api/v1/webrtc/ice-servers`.

## 12. Inbox (forwarded job alerts) & integrations
Screens: **Inbox**, **Integrations** (connect LinkedIn/Gmail/Indeed).
- Inbox: `GET /api/v1/inbox/address` (your forwarding address), `GET /inbox`, `POST /{id}/read`, `POST /inbox/sync-gmail`.
- Integrations: `POST /api/v1/integrations/connect/{provider}` → OAuth, `GET /integrations` (connected), `DELETE /{provider}`.
- LinkedIn import: `POST /api/v1/integrations/linkedin/import` / `/import-file`.

## 13. Security monitoring (exposure)
Screen: **Security** — monitor your email/identifiers for breaches.
- `POST /api/v1/monitoring/identifiers` (enroll) → `/verify`, `GET /identifiers`, `POST /scan`, `GET /findings`, `PUT /findings/{id}/acknowledge`.

---

## Suggested navigation (sidebar)
Dashboard · Matches · Search · Applications · Résumés · Interviews (AI) ·
Auto-apply · Community · Network · Inbox · Security · Assistant · Settings.

## Notes for the builder
- Everything after auth needs the `Authorization: Bearer` header.
- Greet users by their real `full_name` from `/users/me` — no placeholder names.
- List endpoints return arrays; show empty states ("No matches yet — run a search").
- The two features to prioritize (missing today): **Résumé upload (§2)** and **AI mock interviews with personas (§6)**.
