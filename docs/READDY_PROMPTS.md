# Readdy prompts — outstanding frontend work (one batch)

All backend endpoints referenced here are live on `https://hirewave-production-3db3.up.railway.app`.
Every call uses the signed-in user's Bearer token. Work top to bottom; P0 first.
Verify against the **published** site in a real browser — the Readdy preview can't make
cross-origin calls, so it always looks "offline" there (not real).

---

## P0 — Unblock: keep the session alive + render on 200

**Fix "documents won't load": token refresh + null-safe rendering.**

Two confirmed causes: the 30-minute access token expires with nothing renewing it (every
call then 401s and pages break), and the Documents renderer throws on a valid 200 when
optional fields (e.g. `updated_at`) are null.

Part 1 — Token refresh (global fetch wrapper/interceptor):
- `POST /api/v1/auth/login` returns both `access_token` and `refresh_token`. Store BOTH
  (`hw_access`, `hw_refresh`). Send `Authorization: Bearer <access_token>` on every call.
- On any **401**: `POST /api/v1/auth/refresh` with `{ "refresh_token": "<hw_refresh>" }`,
  save the new `access_token` (and `refresh_token` if returned), **retry the original
  request once**. Only if refresh also fails → sign-in. Never fall back to demo data on 401.
- Ideal: refresh proactively ~1 min before the JWT `exp`.

Part 2 — Null-safe Documents rendering (a 200 must always render):
- Never format a null date. If `updated_at` is null → newest version's `created_at` →
  résumé `created_at` → hide the line. Title fallback: `target_role` → `original_filename`
  → "Untitled résumé". Null-guard every `.map`/format over optional arrays.
- Render from `rendered_text`/`structured` whenever the response is 200.

Part 3 — Correct error handling (replace the blanket demo fallback):
- 401 → refresh/sign-in (Part 1). 404 from a reachable server → real "not found" state
  (never a sample under the real id). True network failure only → "Can't reach server —
  Retry" banner. No editable/downloadable demo docs for a logged-in user.

Acceptance: signed in, open the résumé URL `.../resumes/res_b63126de9afb421eb4a6ed60be59464d`
— it must render ("Williams, Bayete, IT Director", 14 versions). Idle 35+ min, act again —
must keep working (auto-refresh), not break.

---

## P1 — Editor: collapse change-controls into two clear actions

**Reorganize the résumé editor's "change" controls into exactly two named actions + one
utility. Removes the overlap that caused instructions to be written onto the résumé.**

Retire these overlapping labels/controls: "Notes and instructions", "Add your own
improvements", "Incorporate ideas", "Quick refine". Replace with:

- **Action 1 — "Ask AI to change it"** (instruction box). Placeholder: "e.g. make my
  summary punchier, or use present tense for my current role."
  On submit: `POST /api/v1/resumes/{resume_id}/improve-structured` with
  `{ "content": "<current editor text>", "instruction": "<box text>" }`. This EXECUTES the
  instruction — NEVER insert the instruction text into the résumé; do NOT call
  `/incorporate` or send it as `ideas`/`notes`. Show a diff preview; on Accept persist via
  `POST /resumes/{id}/versions` and re-render from the response. Clear the box.
- **Action 2 — "Add my own content"** (real accomplishments, written in verbatim):
  - "+ Add bullet": insert the typed text verbatim into the chosen section, save via
    `PUT /api/v1/resumes/{resume_id}` `{ "rendered_text": "<updated text>" }`.
  - "Find my accomplishments": the evidence flow (see P2.3).
  - ONLY these write content into the résumé.
- **Utility — "Find & replace"**: `POST /api/v1/resumes/{resume_id}/replace`
  `{ find, replace, all, case_sensitive }` → `{ rendered_text, count }`. Render on
  `count>0`, else "No matches for '{find}'." Empty `find` → 400.

Use these exact names everywhere. One name per concept.

---

## P1 — Route edits to the fastest correct path

**Don't send every edit through the AI.**
- Literal replacement ("replace X with Y", "change A to B") → **Find & replace**
  (`/resumes/{id}/replace`), instant & exact, returns `count`.
- Skills layout (comma vs bullets) → a **template/display toggle**, re-rendered locally;
  never an LLM call.
- Reserve `/improve-structured` (LLM) for genuine rewrites (tone, concision, tense, tailoring).
- Debounce the résumé review; don't re-run on every keystroke — only on demand / after save.

---

## P1 — Always preview, re-render, show status

**Every change action gives visible feedback and updates the document in place.**
- Spinner/skeleton on the triggering control while in flight — never a button that seems to
  do nothing.
- On success, show a **diff preview** + one explicit **Accept**; on Accept, persist, then
  **re-render the editor from the API response** (not a cached copy).
- Unchanged result → "No change was made — try rephrasing, or use Find & replace."
- Any error → red toast with status/message; 401 → handled by P0 refresh.

---

## P1 — Skills section renders inline (comma-separated)

**Render the Skills section as one comma-separated inline list, not bullet-per-skill**, in
both the live view and preview, matching storage and exports. De-dupe, preserve order.
Optional: a "Skills layout: Comma list / Bullets" toggle (default Comma list), persisted and
honored in view + exports. Applies to Skills only; Experience bullets unchanged.

---

## P2.1 — Versions marquee (Dashboard + Editor)

**A horizontal, scrollable strip of all saved versions (incl. the Original), with per-card
activate and delete.** Data from the résumé you already fetch (`GET /resumes/{id}` →
`versions[]`, `active_version`); no extra list call. Same component on Dashboard and Editor.

Card: title = `source==="original"` → "Original", else `job_title` → `label` → "Version {n}";
subtitle = `change_summary`; small null-safe date from `created_at`; "Current" badge when
`version===active_version`; source chip (Original/Tailored/Revision).

- Click card → `POST /resumes/{id}/versions/{version}/activate`; re-render from response.
- Delete (×) → confirm → `DELETE /resumes/{id}/versions/{version}`; re-render from response.
  Hide/disable delete when only one version remains (API returns 400 for the last one). If
  the active version is deleted, the API reassigns active to the newest remaining — just
  re-render from the response.
- Scroll rail (not an auto-animating ticker); ~4 cards visible; null-safe; spinner per card;
  error toast; 401 → P0.

---

## P2.2 — Approvals view (+ Approve all)

**Where the user gives final OK before any application is sent.** Nav item + pending-count
badge; dashboard banner when count > 0.
- `GET /api/v1/auto-apply/approvals` → `[{application_id, job_posting_id, title, company,
  provider, created_at}]`.
- Card: title, company, provider chip, relative `created_at`. Fallbacks for empty title/company.
- **Approve** (requires a confirm dialog "Submit to {company} for {title}? This sends it for
  real."): `POST /api/v1/auto-apply/approvals/{id}/approve` → `{status, simulated, detail}`.
  `submitted`+`simulated:false` = real send (toast, remove card); `submitted`+`simulated:true`
  = simulated; `filled_pending_submit`/`needs_login`/`captcha`/`needs_input`/`error` = keep
  card with inline note.
- **Reject**: `POST /api/v1/auto-apply/approvals/{id}/reject` (204) → remove card.
- **Approve all** (shown when count > 1): ONE confirm dialog listing what will be sent, then
  `POST /api/v1/auto-apply/approvals/approve-all` → `{approved, total, results[]}`; toast
  "Submitted {approved} of {total}"; keep any non-submitted with inline notes.
- No silent bulk submit; never one-click. Empty state: "You're all caught up."

---

## P2.3 — "Find my accomplishments" (evidence mining)

**Pull real accomplishments from the user's company AI, then polish into bullets.** 3-step
panel from an editor button "Find my accomplishments". App never touches company data.
1. `POST /api/v1/resumes/{resume_id}/evidence-prompts` `{ job_posting_id? }` →
   `{prompts:[{category,title,prompt}], guidance}`. Show `guidance`; list prompts by category
   with Copy buttons.
2. Textarea → `POST /api/v1/resumes/{resume_id}/evidence/extract` `{text, job_posting_id?}` →
   `{data_points:[...]}`. Empty paste → 400.
3. Show data points as checkable/editable rows → `POST /api/v1/resumes/{resume_id}/incorporate`
   `{ideas:[selected], job_posting_id?}` → `{structured, markdown, flagged_metrics}`; preview,
   accept via `/versions`, surface `flagged_metrics`.

---

## P2.4 — Design chooser (in-editor, live preview)

**Replace the busy templates page with an in-editor "Design" chooser.** Persistent "Design"
button in the editor/preview opens a side panel.
- Fetch once: `GET /api/v1/resume-templates` (each includes full `style`: `accent_color`,
  `font_family` sans/serif/mono, `heading_style` underline/bar/plain/caps). Render the user's
  already-loaded résumé `data` locally in each style for instant thumbnails/preview — no
  per-template server call. Filter via `GET /api/v1/resume-templates/categories`.
- "Current" badge on the applied `template_id`. Advanced (community templates, AI-generate via
  `POST /resume-templates/generate`) behind a disclosure.
- Preview is non-destructive; **"Use this template"** → `PUT /api/v1/resumes/{resume_id}`
  `{ template_id }`; exports already follow it. Optional server-truth preview:
  `GET /api/v1/resumes/{resume_id}/render?template_id=<id>`.
- Lazy-render thumbnails; spinner only on apply.

---

## P2.5 — Connected sites panel

**See/manage the job-site sessions the extension connects.** Settings/dashboard section.
- `GET /api/v1/auto-apply/sessions` → `[{provider, label, status, created_at, updated_at,
  last_used_at, expires_at}]`. Row: provider, label, status chip, "last used", expiry warning.
- **Disconnect** (confirm) → `DELETE /api/v1/auto-apply/sessions/{provider}` (204) → remove row.
- `status==="expired"` → **Reconnect** affordance pointing back to the connect flow.
- Empty state: "No sites connected yet. Install the extension, sign in to a job site, then
  Connect." Never show any session secret. 401 → P0.

---

## P3.1 — Extension install CTA (published)

**Flip the homepage "Browser extension" section to a live install CTA.**
- Primary button **"Add to Chrome"** → `https://chromewebstore.google.com/detail/project-harbor-connect/apojagpcjhjfplfjfpcmlplhmokoandj`
  (new tab, `rel="noopener"`; no `?authuser`/`?hl`).
- Keep supporting copy ("no pairing codes", "cookies only, never your password", "stays
  signed in"). Remove "coming soon"; keep email capture only as a non-Chromium fallback.
- Smart state: if `document.documentElement.dataset.harborConnect` is set (or the
  `harbor-connect-ready` event fired), show "✓ Extension installed" instead of the button.
- Note: it's published for **testers** — only allowlisted Google accounts can install.

---

## P3.2 — First-run checklist + consistent safety microcopy

- First-run checklist: Upload résumé → Connect a site → Review matches → Approve first apply
  (with progress), dismissible.
- Use one consistent safety line in-app (match the homepage): "You approve every apply.
  Cookies only, never your password."
- In-app "You're a tester" banner during private beta.
- Keep the approval gate visible at the moment of apply, not just on the marketing page.
