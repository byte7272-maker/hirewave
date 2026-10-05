# Readdy prompts — outstanding frontend work (current)

All backend endpoints referenced here are LIVE on `https://hirewave-production-3db3.up.railway.app`.
Every call uses the signed-in user's Bearer token. Work top to bottom; P0 first.
Verify against the **published** site in a real browser — the Readdy preview can't make
cross-origin calls, so it always looks "offline" there (not real).

Backend is confirmed healthy and CORS is correct for `https://hlrtlg.readdy.co`. Do not
build around the backend being down, and never substitute demo/sample data for a logged-in
user's real documents.

---

## P0 — Unblock: keep the session alive + render on 200

Two confirmed causes of "documents won't load": the 30-minute access token expires with
nothing renewing it (every call then 401s), and the Documents renderer throws on a valid 200
when optional fields (e.g. `updated_at`) are null.

**Part 1 — Token refresh (global fetch wrapper/interceptor):**
- `POST /api/v1/auth/login` returns both `access_token` and `refresh_token`. Store BOTH
  (`hw_access`, `hw_refresh`). Send `Authorization: Bearer <access_token>` on every call.
- On any **401**: `POST /api/v1/auth/refresh` with `{ "refresh_token": "<hw_refresh>" }`, save
  the new tokens, **retry the original request once**. Only if refresh also fails → sign-in.
- Ideal: refresh proactively ~1 min before the JWT `exp`. Never fall back to demo data on 401.

**Part 2 — Null-safe rendering (a 200 must always render):**
- Never format a null date. `updated_at` null → newest version's `created_at` → résumé
  `created_at` → hide the line. Title fallback: `target_role` → `original_filename` →
  "Untitled résumé". Null-guard every `.map`/format over optional arrays.
- Render from `rendered_text`/`structured` whenever the response is 200.

**Part 3 — Error handling (replace the blanket demo fallback):**
- 401 → refresh/sign-in. 404 from a reachable server → real "not found" (never a sample under
  the real id). True network failure only → "Can't reach server — Retry" banner.

Acceptance: signed in, `.../resumes/res_b63126de9afb421eb4a6ed60be59464d` renders ("Williams,
Bayete, IT Director", 14 versions) and still works after 35+ min idle.

---

## P1 — Editor core

### P1.1 — Two clear change-actions (+ Find & replace)
Retire overlapping labels ("Notes and instructions", "Add your own improvements", "Incorporate
ideas", "Quick refine"). Replace with:
- **"Ask AI to change it"** (instruction box) → `POST /resumes/{id}/improve-structured`
  `{ content: "<current editor text>", instruction: "<box text>" }`. EXECUTES the instruction;
  NEVER inserts the instruction text into the résumé; do NOT call `/incorporate` or send it as
  `ideas`/`notes`. Diff preview → Accept → `POST /resumes/{id}/versions` → re-render. Clear box.
- **"Add my own content"** (writes content in): "+ Add bullet" (verbatim → `PUT /resumes/{id}`
  `{ rendered_text }`) and "My Work Highlights" (see P2.3). ONLY these write content.
- **"Find & replace"**: `POST /resumes/{id}/replace` `{ find, replace, all, case_sensitive }` →
  `{ rendered_text, count }`. Render on `count>0`, else "No matches for '{find}'." Empty find → 400.

Use these exact names everywhere. One name per concept.

### P1.2 — Route edits to the fastest correct path
- Literal "replace X with Y" → **Find & replace** (`/replace`), instant & exact, returns `count`.
- Skills layout (comma vs bullets) → a **template/display toggle**, re-rendered locally; never an LLM call.
- Reserve `/improve-structured` (LLM) for genuine rewrites (tone, concision, tense, tailoring).
- Debounce the résumé review; run only on demand / after save.

### P1.3 — Always preview, re-render, show status
- Spinner/skeleton on the triggering control; never a button that seems to do nothing.
- On success show a **diff preview** + one explicit **Accept**; on Accept persist, then
  **re-render from the API response** (not a cached copy).
- Unchanged result → "No change was made — try rephrasing, or use Find & replace."
- Any error → red toast; 401 → P0 refresh.

### P1.4 — Skills section renders inline (comma-separated)
Render Skills as one comma-separated inline list (not bullet-per-skill) in view + preview,
matching storage/exports. De-dupe, preserve order. Optional "Comma list / Bullets" toggle
(default Comma list), persisted and honored in view + exports. Skills only.

---

## P2 — Features

### P2.1 — Versions marquee (Dashboard + Editor)
A horizontal, scrollable strip of all saved versions (incl. the Original), with rendered
thumbnails, hover zoom, nicknames, activate, and delete. Same component on Dashboard and Editor.
Data from `GET /resumes/{id}` (`versions[]` each with `label`, `content`, `source`,
`created_at`; `active_version`) — no extra list call.

- **Rendered thumbnail:** render each card from that version's `content` through the same résumé
  renderer/template (scaled down) — a true mini-preview, not sample text. Lazy-render as cards
  scroll into view.
- **Hover/focus → larger preview:** a floating popover rendering that version at readable size;
  dismiss on leave/blur; keyboard-accessible.
- **Nickname:** show the version's `label` as its title when set; otherwise `source==="original"`
  → "Original", else `job_title` → "Version {n}". Inline **✎ rename** (or double-click title) →
  `PATCH /resumes/{id}/versions/{version}` `{ label }` (trim, ≤80, empty clears) → re-render.
- **Current** badge when `version===active_version`; source chip.
- **Click card** → `POST /resumes/{id}/versions/{version}/activate`; re-render from response.
- **Delete (×)** → confirm → `DELETE /resumes/{id}/versions/{version}`; re-render. Hide/disable
  when only one remains (API 400s). If the active version is deleted the API reassigns active to
  the newest remaining — just re-render from the response.
- Scroll rail (not an auto-ticker); ~4 visible; null-safe dates; per-card spinner; 401 → P0.

### P2.2 — Approvals view (+ Approve all)
Where the user gives final OK before any application is sent. Nav item + pending-count badge;
dashboard banner when count > 0.
- `GET /auto-apply/approvals` → `[{application_id, job_posting_id, title, company, provider,
  created_at}]`. Card: title, company, provider chip, relative date (fallbacks for empty).
- **Approve** (confirm dialog "Submit to {company} for {title}? This sends it for real.") →
  `POST /auto-apply/approvals/{id}/approve` → `{status, simulated, detail}`. `submitted`+
  `simulated:false` = real send; `simulated:true` = simulated; `filled_pending_submit`/
  `needs_login`/`captcha`/`needs_input`/`error` = keep card with inline note.
- **Reject** → `POST /auto-apply/approvals/{id}/reject` (204) → remove card.
- **Approve all** (shown when count>1): ONE confirm dialog listing what sends, then
  `POST /auto-apply/approvals/approve-all` → `{approved, total, results[]}`; toast "Submitted
  {approved} of {total}"; keep non-submitted with inline notes. No silent/one-click submit.
- Empty state: "You're all caught up."

### P2.3 — "My Work Highlights" (consolidated hub)
One self-contained workspace. (Renamed from "Find my accomplishments".) Everything on one page —
no modal-hopping. One **"Tailor to a role"** selector at the top feeds prompts, incorporation,
and suggest-edits.

**Document viewer (top of the page):**
- Show a rendered preview of the **currently active** version (`GET /resumes/{id}` → render active
  `content` with the template style; null-safe). Caption with its nickname/label + "Current".
- **"Change version"** opens the Versions marquee (reuse P2.1) inline/overlay to pick, rename, or
  delete a version; re-render the viewer from the response.
- **Click the document image → lightbox** of that version at readable size (scroll if long; Esc/
  overlay to close; keyboard-accessible). In it, **"Open in full editor"** → activate that version
  (`POST …/versions/{version}/activate`) and navigate to the editor on that version.

**Zone A — Generate prompts for your work AI (on this page):**
- `POST /resumes/{id}/evidence-prompts` `{ job_posting_id? }` → `{ prompts:[{category,title,
  prompt}], guidance }`. Show `guidance`; list prompts by category with Copy buttons. These are
  what the user pastes into their company AI (Copilot/Teams).

**Zone B — Paste results & extract:**
- Textarea → `POST /resumes/{id}/evidence/extract` `{ text, job_posting_id? }` → `{ data_points }`.
  Empty paste → 400.

**Zone C — Review, edit, add + persistent library:**
- Data points as checkable/editable rows; a "+ Add your own highlight" manual input.
- **Persist** highlights to the user's account via `/api/v1/experience`:
  `POST /api/v1/experience` `{ content, title?, source:"imported", source_tool?, company?,
  period?, skills? }` (file import: `POST /api/v1/experience/upload`). Show a **"Your highlights"
  library** section: `GET /api/v1/experience` (list), `PUT /api/v1/experience/{id}` (edit),
  `DELETE /api/v1/experience/{id}` (remove). Offer "Save to library" on extracted/manual items;
  library items are reusable on any résumé.
- **Add selected to résumé** → `POST /resumes/{id}/incorporate` `{ ideas:[selected], job_posting_id? }`
  → `{ structured, markdown, flagged_metrics }` → diff preview → Accept via `/versions`.

**Zone D — Paste-to-AI résumé reviewer (approve add/remove/reword):**
- Textarea "Paste anything to improve this résumé" (notes, a job description, feedback, raw work
  data) → `POST /resumes/{id}/suggest-edits` `{ context, job_posting_id? }` → `{ suggestions:
  [{action:"add"|"remove"|"reword", section, before, after, rationale}] }`. Empty → 400.
- Render each as an approvable row: action chip, `rationale`, a **before → after** diff; checkbox.
  Nothing applies until approved.
- **Apply approved** → `POST /resumes/{id}/apply-edits` `{ suggestions:[approved] }` →
  `{ rendered_text, applied, skipped }`. Show preview; if `skipped>0` note "N couldn't be
  matched." On **Accept**, save via `/resumes/{id}/versions` + re-render. Nothing saves without accept.

**Entry points** all land here: editor's "Add my own content", the dashboard "Strengthen your
résumé" CTA, and the review's "Add from My Work Highlights" remedy (scrolled to Zone C).

### P2.4 — Design chooser (in-editor, live preview)
Persistent "Design" button opens a side panel. `GET /api/v1/resume-templates` (each includes full
`style`: `accent_color`, `font_family` sans/serif/mono, `heading_style` underline/bar/plain/caps)
— render the user's already-loaded résumé `data` locally in each style for instant thumbnails/
preview (no per-template call). Filter via `/resume-templates/categories`. "Current" badge on the
applied `template_id`. Advanced (community templates, `POST /resume-templates/generate`) behind a
disclosure. Preview is non-destructive; **"Use this template"** → `PUT /resumes/{id}`
`{ template_id }` (exports follow it). Optional server-truth preview:
`GET /resumes/{id}/render?template_id=<id>`. Spinner only on apply.

### P2.5 — Connected sites panel (+ counter fix)
A connected site is a `BrowserSession` whose `status` is **`active | expired | revoked`** — there
is NO `"connected"` status on a session. The dashboard "sites connected" counter must NOT filter
for `"connected"` (that's why it shows 0 when there are 2).
- `GET /api/v1/auto-apply/sessions` → `[{provider, label, status, created_at, updated_at,
  last_used_at, expires_at}]`.
- **Connected count = sessions with `status === "active"`.** Count `"expired"` separately and show
  them flagged "Needs reconnect"; ignore `"revoked"`. Dashboard counter and this panel use the
  same logic. Fetch fresh; 401 → P0 (never read as "0 connected").
- Row: provider, label, status chip, "last used", expiry warning. **Disconnect** (confirm) →
  `DELETE /api/v1/auto-apply/sessions/{provider}` (204) → remove row. `expired` → **Reconnect**
  affordance. Empty state: "No sites connected yet…". Never show a session secret.

### P2.6 — Dashboard stat cards (bordered, labeled)
Turn the floating summary numbers into contained **StatCard**s: large number + clear **label**
(what it counts) + optional sub-context (trend/timeframe). No naked numbers. Visible border/surface,
consistent padding/radius (reuse the shared card tokens, accent `#2563eb`). Organize into an aligned
grid; reflow 2-up/1-up on mobile; align baselines. Make each actionable where it maps to a
destination (e.g. "Awaiting approval" → Approvals). Label programmatically associated; AA contrast.

---

## P3 — Extension & polish

### P3.1 — Extension install CTA (published)
Flip the homepage "Browser extension" section to a live CTA. Primary **"Add to Chrome"** →
`https://chromewebstore.google.com/detail/project-harbor-connect/apojagpcjhjfplfjfpcmlplhmokoandj`
(new tab, `rel="noopener"`; no `?authuser`/`?hl`). Keep supporting copy; remove "coming soon";
keep email capture only as a non-Chromium fallback. Smart state: if
`document.documentElement.dataset.harborConnect` is set (or `harbor-connect-ready` fired), show
"✓ Extension installed". Published for **testers** — only allowlisted Google accounts can install.

### P3.2 — First-run checklist + consistent safety microcopy
First-run checklist: Upload résumé → Add your work highlights → Review matches → Approve first
apply (with progress), dismissible. One consistent safety line in-app matching the homepage: "You
approve every apply. Cookies only, never your password." In-app "You're a tester" banner during
private beta. Keep the approval gate visible at the moment of apply.

### P3.3 — Design-system propagation (first-two-dashboard-cards theme)
Make the top two Dashboard cards the canonical visual language. Extract their card anatomy (radius,
border/shadow, surface, padding, header/number/label styles), color (accent `#2563eb` + tints/
surfaces/text hierarchy + semantic colors), typography scale, icon style, data/visual treatment,
and motion into CSS variables + shared components (Card, StatCard, Badge, SectionHeader, Button
variants, ListRow, EmptyState). Re-skin every surface from them (editor, marquee, matches,
applications/kanban, approvals, settings, forms, modals, toasts, empty/loading/error states),
adapting (not copy-pasting). Guardrails: WCAG AA contrast; clear hover/focus/active/disabled;
fully responsive; visual-only (no behavior/data change); support dark mode if present.
