# Readdy build prompt — functional, user-friendly Résumé section

Turn the Résumés area on the Documents page (`/dashboard/documents`) into a real
workspace: **preview** the document, **review it with AI** (suggested changes),
and **revise it under prompt control** (AI edits you approve). The backend is
live; all calls use the existing API base + `Authorization: Bearer <token>`
(401 → refresh → retry). Auth-scoped file endpoints must be **fetched with the
bearer header → blob URL** (a plain link 401s).

---

## Prompt — Résumé detail view with preview + AI review + prompt-controlled revise

> Give each résumé a **detail view** (open from the résumé list). It has three
> areas: a **Preview**, an **AI Review** panel, and an **Improve with AI** panel.
>
> ### 1. Preview the document
> - `GET /api/v1/resumes/{id}` returns the résumé, incl. `rendered_text` (extracted
>   text), `format`, `original_filename`, `source` (`uploaded`/`generated`),
>   `ats_score`, `approved`, and `file_url`.
> - Show the **`rendered_text`** in a clean, readable panel (monospace or document
>   styling), editable in place — save edits via `PUT /api/v1/resumes/{id}
>   { rendered_text }`.
> - If `file_url` is set and the file is a **PDF**, also offer "View original" that
>   **fetches `GET /api/v1/resumes/{id}/file` with the bearer header → blob URL →
>   shows it in an `<iframe>`/PDF viewer**. For DOCX, offer Download instead (browsers
>   can't render DOCX inline). Show `original_filename` + a source badge.
>
> ### 2. Summary & narrative
> - At the top of the preview, show a **Summary** block. Populate it from the AI
>   review's `summary` (see below) — a one-paragraph assessment of the résumé — and
>   let the user keep their own **narrative/notes** field (store it in
>   `rendered_text` or a notes area; there's no separate backend field, so if you
>   want a persistent narrative, prepend/append it to `rendered_text` on save).
> - Show the **`ats_score`** (0–100) as a small meter when present.
>
> ### 3. AI Review — "Suggest changes"
> - A **"Review résumé"** button → `POST /api/v1/resumes/{id}/review` with
>   `{ "job_posting_id": <optional — pass a job id to tailor the review to it> }`.
>   Response:
>   ```json
>   {
>     "resume_id": "...", "score": 74, "word_count": 420,
>     "summary": "one-paragraph assessment",
>     "strengths": ["Uses concrete metrics to show impact.", "..."],
>     "suggestions": [
>       {"category":"impact","severity":"important","title":"Quantify your impact","detail":"..."},
>       {"category":"keywords","severity":"critical","title":"Cover the job's key requirements","detail":"..."}
>     ],
>     "missing_keywords": ["Rust","Kubernetes"]
>   }
>   ```
> - Render: the **score** as a dial/meter, **strengths** as green ticks, and
>   **suggestions** as cards grouped/sorted by `severity` (critical → important →
>   suggestion) with a category chip (`impact`/`keywords`/`clarity`/`length`/
>   `structure`) and the `detail` text. Show **`missing_keywords`** as red chips
>   ("add if you have it"). Optionally add a job dropdown so the user can review
>   against a specific match (passes `job_posting_id`).
>
> ### 4. Improve with AI — prompt-controlled revise
> - An **"Improve with AI"** box: a text input where the user types an instruction
>   in plain language (with a few **preset chips** to click: "Make it more concise",
>   "Emphasize leadership", "Stronger action verbs", "Tailor to this job", "Fix
>   grammar & tighten"). On submit → `POST /api/v1/resumes/{id}/revise` with
>   `{ "instruction": <text>, "job_posting_id": <optional> }`. Response:
>   `{ "resume_id", "instruction", "preview": "<the revised résumé text>" }`.
> - **Show the `preview` as a proposed new version next to the current text** (a
>   side-by-side or diff view if you can). Two actions:
>   - **"Apply"** → `PUT /api/v1/resumes/{id} { rendered_text: <preview> }` (this is
>     the human-in-the-loop step — nothing was saved until the user applies), then
>     re-fetch the résumé and re-run the review.
>   - **"Discard"** → drop the preview, keep the current text.
> - Handle `400` (empty instruction / empty résumé) and `502` (revise service
>   unavailable) with a friendly message; on `502`, keep the current text.
>
> **Flow to make obvious:** upload/generate → preview → **Review** (see score +
> suggestions) → **Improve with AI** with a prompt → review the proposed change →
> **Apply** → score updates. Keep it approachable for beginners (clear buttons,
> preset instruction chips, plain-language suggestion cards).

---

## Notes for Readdy
- **Nothing is destructive without an explicit action:** `review` changes nothing;
  `revise` returns a preview only; the change is saved only when the user clicks
  **Apply** (a `PUT`). Preserve that — don't auto-apply a revision.
- **Auth-fetch-to-blob** is required for the PDF preview and any file download (the
  file endpoint needs the bearer token; a plain `<iframe src=file_url>` will 401).
- `review` and `revise` both accept an optional `job_posting_id` — wiring a job
  dropdown makes both job-aware (keyword gaps, tailored rewrite) but it's optional.
- This pairs with the beginner **profile wizard** (Getting Started): the wizard can
  deep-link into this detail view's Review panel after a résumé is added.
