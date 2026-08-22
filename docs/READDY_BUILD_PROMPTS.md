# Readdy build prompts — Résumé upload + AI interview personas

Paste each block into Readdy as a build request. Both use the **same backend and
the same signed-in user's auth token** that your existing Login/Register already
use (`Authorization: Bearer <access_token>`), and the API base URL you already
set (`VITE_PUBLIC_API_BASE_URL`). Endpoints are live now.

---

## Prompt 1 — Résumé upload & manager (build this first)

> Add a **Résumés** page to the dashboard where the signed-in user can upload and
> manage their résumé. Use the same API base URL and bearer token as Login.
>
> - **Upload:** a file picker + an "Upload résumé" button. On submit, send the
>   chosen file (PDF, DOCX, or Markdown) as **multipart/form-data** with the field
>   name **`file`** to **`POST /api/v1/resumes/upload`** with the
>   `Authorization: Bearer <token>` header. On success (201) show a confirmation
>   and refresh the list.
> - **List:** on page load, call **`GET /api/v1/resumes`** (same auth header) and
>   list each résumé by name (use `original_filename`, else `target_role`, else
>   "Résumé"). Each row has a **Delete** button calling
>   **`DELETE /api/v1/resumes/{id}`**.
> - **Empty state:** "No résumé yet — upload one so your job matches and interview
>   questions are tailored to your experience."

---

## Prompt 2 — AI interviews: persona gallery + interview room

> Build an **AI Interviews** page. Use the same API base URL and bearer token as Login.
>
> **1. Résumé check (top of page).** Call **`GET /api/v1/resumes`**. If the array
> is **empty**, show a highlighted banner: *"Upload your résumé first so your
> interview questions match your experience,"* with a button linking to the
> Résumés page. If it's non-empty, show a small "Tailored to your résumé ✓".
>
> **2. Persona gallery.** Call **`GET /api/v1/interview/personas`** → an array of
> interviewers, each with: `id`, `name`, `role`, `company`, `bio`, `difficulty`
> (`"easy"` | `"normal"` | `"hard"`), and **`avatar_url`** (an image URL). Render a
> responsive grid of **cards**, one per interviewer:
> - the avatar image (`<img src={avatar_url}>`),
> - the `name` and `role`,
> - the `bio` (one-line description),
> - a **difficulty badge**: green for easy, amber for normal, red for hard,
> - a **"Start interview"** button.
>
> **3. Start an interview.** Clicking "Start interview" sends
> **`POST /api/v1/interview/mock/start`** with JSON
> `{ "persona_id": <that card's id>, "resume_id": <the user's most recent résumé id, if any>, "max_questions": 5 }`
> and the auth header. It returns a **session** object with: `id`, `persona`,
> `plan` (array of question strings), `turns` (array), and `status`. Navigate to an
> **Interview Room**.
>
> **4. Interview room.** Show the chosen persona (avatar + name + role) and the
> interviewer's first question (the last `turns` item whose `speaker` is
> `"interviewer"`, or `plan[0]`). Provide a text box + **Send**. Sending calls
> **`POST /api/v1/interview/mock/{sessionId}/reply`** with `{ "answer": <text> }` +
> auth header; it returns the updated session (new `turns`: an interviewer
> follow-up and your answer's `feedback`, plus `status`). Append the new turns as a
> chat. When `status` becomes `"completed"`, show the session `summary`.

---

## Notes to give Readdy if it asks
- **Base URL & auth:** identical to the working Login flow — reuse them; don't hardcode a new URL.
- **Difficulty colors:** easy = green, normal = amber, hard = red.
- **The avatar images are ready-made URLs** — just render them; no avatar generation needed.
- If a call returns **401**, refresh the token via `POST /api/v1/auth/refresh` and retry (same as the rest of the app).
