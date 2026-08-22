# Readdy fix prompts — audit findings

Paste each numbered block into Readdy as a fix request. All use the same API base
URL and bearer token (`Authorization: Bearer <access_token>`) the rest of the app
already uses. Fixes are ordered by impact.

---

## Fix 1 — Wire the interview room to the backend (highest priority)

> On the **AI Interviews** page, the persona gallery works, but the **interview
> room is not wired** — starting an interview shows a hardcoded first question and
> answering hangs on "Waiting for the next question…". Rewire it to use the
> backend (the endpoints work and return real GPT answers + feedback):
>
> - **On "Start interview"** (a persona card): call
>   **`POST /api/v1/interview/mock/start`** with JSON
>   `{ "persona_id": <that card's id>, "resume_id": <the user's most recent résumé id, if any>, "max_questions": 5 }`
>   and the auth header. Store the returned **`id`** as the session id. Show the
>   **first question from the response** — the last item in `turns` whose
>   `speaker` is `"interviewer"` (use its `question`), or `plan[0]`. Do **not** use
>   a hardcoded question.
> - **On "Send"** (an answer): call
>   **`POST /api/v1/interview/mock/{sessionId}/reply`** with `{ "answer": <text> }`
>   and the auth header. The response is the updated session. Append the new
>   `turns`: the candidate's answer, its `feedback` (show the score/strengths/
>   improvements), and the interviewer's next `question`. Clear the input. Only
>   show "Waiting…" while the request is actually in flight.
> - **When `status` becomes `"completed"`**, stop asking questions and show the
>   `summary` (overall score, strengths, improvements), and disable the input.
> - If any call returns 401, refresh the token via `POST /api/v1/auth/refresh` and retry.

---

## Fix 2 — Wire the profile menu (top-right avatar dropdown)

> In the **top-right profile/avatar dropdown**, the items **Profile**, **Settings**,
> and **Help center** currently do nothing when clicked (only "Sign out" works).
> Wire them:
>
> - **Profile** → navigate to **`/dashboard/profile`**
> - **Settings** → navigate to **`/dashboard/settings`**
> - **Help center** → open a Help/Support page (or, if there isn't one, a `mailto:`
>   support link) — or remove this item if there's no help content yet.
> - **Sign out** already works — leave it.

---

## Fix 3 — Remove the fake data on "Saved jobs"

> The **Saved jobs** page (`/dashboard/saved`) shows **hardcoded placeholder jobs**
> (e.g. "Product Designer @ Anthropic", "Design Engineer @ Vercel", "6 saved") even
> for a brand-new account. There is **no saved-jobs backend endpoint**, so this
> data is fabricated. Please **either**:
> - **remove the "Saved jobs" page and its sidebar link** entirely (cleanest, since
>   there's no backend for it), **or**
> - replace the fake list with a real empty state and hide it until a saved-jobs
>   API exists.
> (Do not show invented job listings as if they were the user's real saved jobs.)

---

## Fix 4 — Replace the fake dashboard stats with real numbers

> The **dashboard home** shows hardcoded figures like "5 new matches" and "3
> interviews" that don't match reality (the Matches page correctly shows 0).
> Replace them with real counts from the backend, using the auth header:
> - **Matches:** length of the array from **`GET /api/v1/jobs/matches`**
> - **Applications:** length of **`GET /api/v1/applications`** (and/or counts by status)
> - **Interviews:** count from **`GET /api/v1/interview/mock`**
> If a count can't be fetched, show **0**, never an invented number.

---

## Also worth fixing (minor)
- **Inbox forwarding address** uses the placeholder domain `inbox.hirewave.test`.
  This is a backend config value (`JOBSEARCH_INBOX_DOMAIN`) — real email forwarding
  won't work until it's set to a real domain you control.
- **Settings** duplicates fields that already exist on **Profile** and **Reminders**;
  consider consolidating so users edit each thing in one place.
