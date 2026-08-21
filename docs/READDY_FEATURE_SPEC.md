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
Screens: **Interview prep**, **Mock interview room with an AI interviewer persona** (avatar + voice).
- `GET /api/v1/interview/personas` → the AI interviewer characters (name, role, style, avatar).
- `POST /api/v1/interview/prep` `{resume_id?, job_posting_id?, count}` → likely questions to study.
- `POST /api/v1/interview/mock/start` `{persona_id?, style?, difficulty?, max_questions, job_posting_id?}` → start a session.
- `POST /api/v1/interview/mock/{id}/reply` `{answer, response_seconds?}` → answer; returns the persona's follow-up + feedback.
- `GET /api/v1/interview/mock/{id}` (transcript) · `GET /api/v1/interview/mock` (past sessions).
- `GET /api/v1/interview/media/capabilities` → whether voice/video are enabled.
- `POST /api/v1/interview/tts` `{text, voice}` → natural voice audio for the interviewer.
- `POST /api/v1/interview/video` `{text, persona}` → talking-avatar video (when configured).

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
