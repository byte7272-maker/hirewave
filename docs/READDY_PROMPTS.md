# Readdy prompts — outstanding frontend work (current)

All backend endpoints referenced here are LIVE on `https://hirewave-production-3db3.up.railway.app`.
Every call uses the signed-in user's Bearer token. Work top to bottom; P0 first.
Verify against the **published** site in a real browser — the Readdy preview can't make
cross-origin calls, so it always looks "offline" there (not real).

Backend is confirmed healthy and CORS is correct for `https://hlrtlg.readdy.co`. Do not
build around the backend being down, and never substitute demo/sample data for a logged-in
user's real documents.

> **Current direction — read [P7](#p7--unified-résumé--cover-letter-workspace-supersedes-the-split-documents-editor--my-work-highlights) first.** The "Documents editor" and "My Work Highlights"
> pages are being **merged into one Workspace** (one shared preview + a tabbed side panel).
> P7 is the consolidation spec; the earlier editor/Highlights prompts marked _(folded into
> P7)_ remain as the detailed behavior for each tab, but their separate pages/nav go away.

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

**Part 4 — Timeouts (no infinite spinners):**
- Every request has a timeout via `AbortController` (~15 s; ~45 s for known-slow AI calls:
  improve/suggest-edits/apply-edits). On timeout/abort/network error, resolve the UI into an
  **error + Retry** state — never leave a spinner (e.g. the viewer's "Rendering this version…",
  marquee thumbnails, lightbox). A timeout is not a 401 — surface retry, don't refresh on it.

Acceptance: signed in, `.../resumes/res_b63126de9afb421eb4a6ed60be59464d` renders ("Williams,
Bayete, IT Director", 14 versions) and still works after 35+ min idle.

---

## P1 — Editor core

### P1.1 — Two clear change-actions (+ Find & replace)  _(folded into P7)_
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

### P2.1 — Versions marquee (Dashboard + Editor)  _(folded into P7)_
A horizontal, scrollable strip of all saved versions (incl. the Original), with rendered
thumbnails, hover zoom, nicknames, activate, and delete. Same component on Dashboard and Editor.
Data from `GET /resumes/{id}` (`versions[]` each with `label`, `content`, `source`,
`created_at`; `active_version`) — no extra list call.

- **Rendered thumbnail:** render each card from that version's own content (scaled down) — a true
  mini-preview, not sample text. Use `GET /resumes/{id}/versions/{version}/render?template_id=`
  (server-authoritative) or that version's `content` from `versions[]`; never `rendered_text`.
  Lazy-render as cards scroll into view.
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

### P2.3 — "My Work Highlights" (consolidated hub)  _(folded into P7 — becomes the "My Work Highlights" tab)_
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

**Document viewer — version sync + scroll/layout (required):**
- **Single source of truth:** one `selectedVersion` drives the viewer, the marquee "Current"
  highlight, AND the lightbox. Render the preview from **that version's own content** — NOT the
  résumé's `rendered_text` (which can lag). Preferred (server-authoritative):
  `GET /resumes/{id}/versions/{version}/render?template_id=<current>` → `{ template, data }`,
  render `data` with `template.style`. Or fetch the version's text via
  `GET /resumes/{id}/versions/{version}` and render its `content`. Selecting a version shows
  exactly that version. After activate, set `selectedVersion` from the response's `active_version`
  and re-render so all three stay in sync.
- **Two explicit scroll regions:** the page scrolls normally; the document preview is in a
  bounded-height container with `overflow:auto` + a visible scrollbar + `overscroll-behavior:
  contain` (so it scrolls independently and doesn't hijack page scroll).
- **Lightbox fits the viewport:** `max-height: calc(100vh - margins)`, internal `overflow:auto`
  (document scrolls inside the modal); lock the background (`body{overflow:hidden}`) while open;
  the modal header/toolbar (title + "Open in full editor" + close) is **sticky and always visible**;
  the modal's top is always on-screen (never clipped above the fold).
- **Nothing stuck above the fold:** no off-screen/negative-offset controls; sticky section
  toolbars inside their scroll container; main content starts below any fixed app header (top
  padding = header height) so the first controls aren't hidden behind it. Mobile: single column,
  bounded viewer height, near-fullscreen lightbox with internal scroll.

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

### P2.4 — Design chooser (in-editor, live preview)  _(folded into P7 — the "Design" tab)_
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

---

## P0b — "Ask AI to change it": dedup silently swallows repeat instructions

**CORRECTION (re-verified 2026-10-08 on the published site, build with the new copy live).** The
submit *is* wired correctly: a **new** instruction fires `POST /resumes/{id}/ai-edit` (200),
applies immediately, bumps the version (confirmed v14→v15 "Make the Summary one sentence shorter",
then v15→v16 for a novel unbold instruction), then re-scores via `POST /review` and re-renders via
`/structured` + `/preview.*`. No accept step; Undo reverts. That part is **working** — the earlier
"fires zero backend calls" note here was wrong (it came from testing with *duplicate* wording plus
an unreliable post-navigate network capture).

**Real bug #1 — dedup swallows repeated instructions.** Re-submitting an instruction whose text
already exists in the saved history/Recent (e.g. "remove the bold font from the Education section",
present 4× in Recent) fires **no** request at all: the box just clears, no toast, no version. This
is why every *retry of the same wording* looked permanently broken — only the first use of a given
string ever reaches the backend. Fix:
- Do **not** skip a submit because the instruction matches a past/Recent entry. Each **Apply
  change** / **Enter** must POST `/ai-edit` regardless of history. Recent is a convenience list,
  not a guard.
- If a submit genuinely results in no change (backend returns the doc unchanged / no new version),
  say so explicitly inline ("No change was made — try rewording"), never clear silently.
- Empty box → keep text + inline "Enter an instruction." (already done ✅).

**Real bug #2 (backend/edit-quality) — formatting edits don't take.** The novel instruction
"Unbold the school name and the degree line in the Education section…" returned `/ai-edit` **200**
and created **v16**, but the two Education lines (`**Master of Science … Mercy College**`,
`**Bachelor of Science … Mercy College**`) are **still bold** — the model (gpt-4o-mini via
`targeted_edits_text`) didn't strip the `**…**` markers even though the HTML renderer bolds *only*
from `**`. This is a backend prompt/targeting gap for pure-formatting instructions, not a Readdy
issue. **(Backend TODO — see below; not a Readdy prompt.)**

Subtitle copy is already updated to "Applies a targeted change right away — use Undo to revert." ✅

Acceptance: submitting the *same* instruction text twice in a row issues **two** `POST …/ai-edit`
calls (not one); a no-op edit shows an inline "no change" message instead of clearing silently.

---

## P0c — My Work Highlights: review → accept → save (not auto-append)

The point of pasting the output from the user's work AI is to improve the **current** résumé with
stronger, more specific wording from their real history — surfacing things they didn't think to
include — and the user must **accept and save** the result. Backend endpoints are live; wire this
flow (replaces any auto-append behavior):

1. After the user pastes the output, analyze it into **grouped concepts**:
   `POST /api/v1/resumes/{id}/evidence/synthesize { text: <paste> }`
   → `{ groups: [{ theme, summary, points: [source points] }] }` — a few overarching statements,
   not a line-by-line list. Empty paste → **400** "paste the output from your work AI first".
   Render each group with its `theme`, the `summary` (overarching statement), and the supporting
   `points` collapsed under it. **The `summary` is editable** — the user can reword it, and pick
   which groups to use. (Quick path: skip straight to step 2 with the raw paste.)
2. Turn the chosen (edited) statements into reviewable résumé edits:
   `POST /api/v1/resumes/{id}/suggest-edits { context: "<the edited group summaries, one per line>" }`
   → `{ suggestions: [{ action: "add"|"remove"|"reword", section, before, after, rationale }] }`.
   (Or the one-shot `POST /api/v1/resumes/{id}/highlights/suggest { text: <paste> }`, which
   synthesizes internally and returns the same shape.)
3. Render each suggestion as an **editable review card**: action badge (Add / Remove / Reword),
   target section, rationale. For reword/remove show `before → after` as a diff; for add show the new
   bullet. **Every field is editable** — the user can reword `after`, adjust `before`/`section`,
   change the action, or add their own suggestion — plus a per-card **Accept / Reject** (default
   accept). Send the user's *edited* objects, not the originals.
4. `POST /api/v1/resumes/{id}/apply-edits { suggestions: <only the accepted, edited ones> }` →
   `{ rendered_text, applied, skipped }`. Apply is deterministic — it applies exactly what you send,
   including edited wording and user-added items. Show `rendered_text` as a **full-résumé preview**
   (still nothing saved). `skipped` = edits whose `before` text was no longer found (e.g. an edited
   `before` that no longer matches) — surface those so the user can fix them.
5. Require an explicit **"Accept & Save"**: `POST /api/v1/resumes/{id}/versions { content: <the
   preview rendered_text> }` → new active version. Then re-fetch the doc + previews (no-store);
   Undo = switch versions.

The résumé view must stay **unchanged until step 5** — nothing is persisted before the user saves.

Prompt generation + concise-answer guidance: `POST /api/v1/resumes/{id}/evidence-prompts` returns the
categorized prompts to run in the work AI (each already tells that AI to keep its answer to one short
line per item, no markdown, under ~400 words so it imports cleanly).

Acceptance: pasting output yields grouped concepts with editable overarching statements, then
editable Add/Remove/Reword cards; a user-edited suggestion applies with the user's exact wording;
the résumé is byte-for-byte unchanged until "Accept & Save"; after saving, a new version appears and
Undo restores the prior one.

---

## P1b — Manual editor: hidden-by-default, deterministic formatting controls  _(folded into P7 — the "Manual edit" tab)_

Basic formatting (bold / italic / bullets / headings) is deterministic and should never
route through the AI's "interpretation." Add a **manual editor** to the résumé and
cover-letter editor, **hidden/collapsed by default**, for precise edits without the AI.

**Invoking it:** add a small, clearly-labeled **"Edit manually"** control next to the
"Ask AI to change it" box (and a keyboard shortcut). It stays hidden until invoked;
invoking it opens an editable view of the document's **current saved body**.

**What it edits:** the document body is **Markdown** — the editor reads and writes that same
Markdown (do NOT convert to HTML or any other representation). It must round-trip exactly:
`**bold**`, `*italic*`, `<u>underline</u>`, `[text](url)` links, `- ` bullet lines, `## ` section
headings, `### ` entry headings. **The rendered preview must honor inline `<u>…</u>` and Markdown
links** (enable raw-HTML/link rendering in the preview renderer) — otherwise underline won't show.

**Formatting toolbar** (acts on the current text selection, toggling the Markdown markers):
- **Bold** (`**…**`) — Ctrl/Cmd+B
- **Italic** (`*…*`) — Ctrl/Cmd+I
- **Underline** (`<u>…</u>`) — Ctrl/Cmd+U
- **Link** — wrap the selection as `[selection](url)`, prompting for the URL; if the selection is
  itself a bare URL or email, auto-fill it (email → `mailto:`). A second click on an existing link
  unlinks it (`[text](url)` → `text`).
- **Bullet list** — prefix the selected lines with `- `, or remove the prefix if already bulleted (toggle)
- **Heading** — toggle a line between a section heading (`## `) and plain text
- **Clear formatting** — strip bold/italic/underline/link/heading/bullet markers from the selection

**Saving:** a **Save** button writes the edited Markdown as a **new version** through the SAME
`POST /api/v1/resumes/{id}/versions { content }` endpoint the AI edits use (so manual edits are
versioned and undoable exactly like AI edits). **Cancel** discards without saving. On save, the
preview, the version indicator, and any thumbnails must **visibly re-render** from the new saved
body (reuse the same refresh the AI-edit success path triggers), and briefly flash the preview so
the change is unmistakable.

**Scope:** manual editing only — never call the AI from this editor. Keep it identical in the full
editor and the quick preview.

Acceptance: the manual editor is hidden until invoked; selecting text and clicking Bold/Italic (or
Ctrl/Cmd+B/I) toggles the exact Markdown markers; Save creates a new version and the preview visibly
re-renders; Cancel changes nothing; reopening shows the current saved body (round-trips cleanly).

---

## P1c — Replace a whole bullet / line (point or describe → paste → optionally improve)  _(folded into P7)_

A fast, deterministic way to swap out a complete bullet or line without the AI guessing which one
you mean. Lives in the manual editor (P1b) and the quick preview.

**1. Pick the target line** two ways:
   - **Point:** click a bullet/line in the editor to select it as the target (its full text shows
     in a "Replacing:" field).
   - **Describe:** type a few words into a "find a line…" box; fuzzy-match against the document's
     bullets/lines and show the ranked candidates, each as its full text — the user picks the right
     one. (Matching is client-side substring/keyword ranking, not the AI — no guessing applied
     silently; the user always confirms which line.)

**2. Paste the replacement.** A textarea pre-filled with the target's current text; the user
pastes/edits the **full new line**. Show a live `before → after` diff of the single line.

**3. Replace.** Swap that exact line in the Markdown body for the new text (whole-line replace,
other lines untouched), then **Save as a new version** via `POST /api/v1/resumes/{id}/versions
{ content }`. The preview + version indicator visibly re-render (reuse the P0/P1b refresh) and the
changed line briefly flashes.

**4. "Improve this line" (optional).** After replacing (or on the pasted text before saving), a
one-tap **Improve this line with AI** runs `POST /api/v1/resumes/{id}/ai-edit` with an instruction
that targets only that line's wording (e.g. "rewrite this bullet to be stronger and quantified:
<line>") — so the pasted line is *subject to improvement* but only when the user asks. The result
saves as its own version (undoable).

**Scope:** steps 1–3 are fully deterministic (no AI); step 4 is the only AI call and is opt-in.
Keep behavior identical in the full editor and the quick preview.

Acceptance: a user can click a bullet (or describe it and pick from candidates), paste a new line,
and Replace swaps exactly that line and saves a new version with a visible re-render; the optional
"Improve this line" rewrites only that line and saves a separate, undoable version; no other lines
change.

---

## P2a — Smart Add-vs-Replace in the My Work Highlights review  _(folded into P7)_

Adding every suggested bullet creates duplicates when a suggestion is really a *stronger
version* of a bullet already on the résumé. Use the new matcher so each suggestion knows
whether to **Replace** an existing bullet or **Add** as new.

**Backend (live):** `POST /api/v1/resumes/{id}/match-bullets { candidates: [<bullet text>...] }`
→ `{ matches: [{ candidate, recommend: "replace"|"add", best_score,
replace: { line, text, score } | null, alternatives: [{ line, text, score }...] }] }`.
Deterministic (topic-term overlap), instant, no AI. `line` is the exact existing bullet to swap.

**UI (Review zone / Zone C):**
1. When suggestions load (or on first paste→edits), send all suggestion bullets as `candidates`
   to `match-bullets` once.
2. On each suggestion card, show a small **Add / Replace** toggle:
   - `recommend === "replace"` → **default to Replace**, and show the matched existing bullet
     inline: *"Replaces: '{replace.text}'"* with the new text under it (a tiny before→after).
   - `recommend === "add"` → **default to Add as new**.
3. Let the user flip the toggle, and when replacing, pick a **different** existing bullet from
   `alternatives` (a dropdown of the close matches) — nothing is ever swapped blindly.
4. On **Accept & Save**, build the edit list and apply via the existing
   `/apply-edits` → `/versions` path:
   - **Add** → an `add` edit (`{ action:"add", section:"Experience", after:<candidate> }`).
   - **Replace** → a `reword` edit (`{ action:"reword", before:<chosen existing line>, after:<candidate> }`).
   Preview the merged résumé, then save as a new version. Visible re-render as usual.

Acceptance: a highlight that restates an existing bullet defaults to **Replace** and shows which
bullet it swaps; an unrelated highlight defaults to **Add**; the user can flip either and choose a
different target; saving produces one new version with the chosen adds + replaces and no duplicates.

---

## P2b — Click-to-replace a bullet on the résumé

A general, always-available way to swap any bullet for a stronger one — intuitive: click the
bullet you want to replace.

**UI:**
1. Make each résumé bullet in the preview **clickable** (hover affordance: "Replace this bullet").
2. Clicking opens a **"Replace this bullet"** popover with three ways to supply the replacement:
   - **Pick a match** — call `POST /api/v1/resumes/{id}/match-bullets
     { candidates: [<the clicked bullet text>], targets: [<your saved highlight bullets>] }`;
     the returned `alternatives` are the saved highlights that best fit this bullet — list them to pick from.
   - **Rewrite with AI** — one tap runs `POST /api/v1/resumes/{id}/ai-edit` with an instruction that
     targets only this line (e.g. "rewrite this bullet to be stronger and quantified: <line>").
   - **Type / paste** your own replacement.
3. Show a **before → after** of just that line, then **Replace** applies a `reword` edit
   (`before:<clicked bullet's exact line>, after:<chosen text>`) via `/apply-edits` → `/versions`,
   saving a new version. The preview + version indicator visibly re-render and the changed line flashes.

**Scope:** steps are deterministic except the opt-in "Rewrite with AI". Keep it identical in the
full editor and the quick preview.

Acceptance: clicking a bullet offers pick-a-match / rewrite / type, shows a one-line before→after,
and Replace swaps exactly that bullet into a new, undoable version; no other lines change.

---

## P3a — One consistent document preview everywhere (Highlights must mirror Documents)  _(folded into P7 — the shared preview; mirroring is now automatic since there is one workspace)_

The résumé preview looks and behaves differently depending on where it appears. On the
**Documents** page it's the standard "DOCUMENT" preview (Fit width + zoom, Expand, Read full
size, Reload from source). In **My Work Highlights** ("The document you're improving") it's a
different layout — a "Change version" selector with version **check-marks underneath**, a
"Server render · Modern · Cobalt · Inter" badge, and no zoom/fit controls — and it doesn't
guarantee the same version is shown. Unify them.

1. **One shared preview component.** Render the résumé the same way in every location — the
   Documents list/detail AND the My Work Highlights workspace (and anywhere else a résumé
   preview appears). Same header ("DOCUMENT"), same controls: **Fit width + zoom %, Expand,
   Read full size, Reload from source**. Same iframe render path, same template, same scaling.

2. **Same version, everywhere.** Every preview shows the document's **current active version**
   by default. Opening the same résumé from Documents and from My Work Highlights must show the
   identical version rendered identically — never version N in one place and a different version
   in another.

3. **Version-switching: keep it, but as ONE standard control.** Version-switching stays — it's
   useful while improving — but it becomes part of the shared preview component as a single,
   consistent **Version** control: a compact dropdown/menu that shows the current version and lets
   you switch to view another. It is the **same** control in every location (Documents and My Work
   Highlights) and defaults to the document's current active version. Remove the Highlights-only
   presentation: the separate "Change version / Now showing Version N" selector, the version
   **check-mark strip underneath**, and the "Server render · <template>" badge. Their
   version-switching is now just the standard Version control.

Acceptance: open the same résumé from the Documents page and from My Work Highlights → both show
the same version by default, the same header, the same zoom / Expand / Read-full-size / Reload
controls, the **same single Version dropdown** (switching works identically in both), and the
identical rendered page. No version check-mark strip or "Server render" badge unique to Highlights.

---

## P2c — My Work Highlights: complement existing + prior bullets (don't duplicate)  _(folded into P7)_

When the user pastes a NEW batch of data (e.g. general company info) into My Work Highlights, the
suggestions should COMPLEMENT what's already there — the résumé's current bullets AND the bullets
suggested/edited in a PREVIOUS intake — rather than repeating them.

**Backend (live):** `POST /resumes/{id}/evidence/synthesize`, `/highlights/suggest`, and
`/suggest-edits` now accept an optional **`avoid: string[]`** — bullets to complement, not
duplicate. The résumé's own bullets are added automatically server-side; you pass the PRIOR-run
bullets. The LLM is told to fill gaps, and any suggestion that still merely restates an existing or
prior bullet is dropped server-side (deterministic overlap check).

**UI:** keep a small per-résumé memory of the bullet texts the user **kept / edited / accepted in
previous intake runs**. When generating suggestions from a new paste (the "Turn into edits" /
highlights-suggest call), pass that list as **`avoid`**. (You don't need to include the résumé's
own current bullets — the backend adds those itself.)

Acceptance: pasting a second batch of data produces suggestions that add NEW
accomplishments/dimensions and never re-suggest something already on the résumé or already
suggested/edited in a prior run; without any prior runs, behavior is unchanged.

---

## P2d — My Work Highlights review: scrollable list, visible accept/reject, paste history  _(folded into P7)_

Three fixes to the "Review your suggested edits" zone.

**1. Make the suggestion list independently scrollable.** The list of suggestion cards has no
scroll container, so a long list pushes the running count and "Preview changes" button off-screen.
Put the cards in a container with a sensible `max-height` and `overflow-y: auto` so the LIST scrolls
on its own, while the zone header (the "N of M accepted" count + Accept all / Reject all) and the
"Preview changes (N)" footer stay visible (sticky) above/below it.

**2. Make Accept / Reject give clear, immediate feedback.** The buttons already work (they toggle
state and update the count), but the ONLY visible change on Reject is the card dimming to
opacity 0.7 — and with the count scrolled off-screen, it reads as "nothing happened." Make each
card's state unmistakable:
- **Rejected:** strike through the bullet text, dim the card further, show a clear **"Rejected"**
  label, and turn the Reject button into an active/pressed state with an **Undo** (clicking Accept
  re-includes it).
- **Accepted (default):** clearly the "will be added" state (a subtle check/accent), Accept active.
- Keep the running **"N of M accepted"** count visible at all times (sticky header from #1) so every
  click visibly changes it.

**3. Remember previous pastes/prompts and let the user go back.** Keep a small per-résumé history of
the previous pastes the user turned into bullets (the raw text + a timestamp/label). Show a
**"Recent"** list; selecting one **restores that paste** into the box (and/or reopens its review
set) so a prior prompt can be revisited or re-run. "Reset this run" must not erase this history.

Acceptance: a long suggestion list scrolls within its own area with the count + Preview button
always visible; clicking Accept/Reject on any card produces an obvious per-card state change
(strikethrough / label / Undo) and visibly updates the count; the user can reopen a previous paste
from a Recent list.

---

## P4a — Drag-to-reorder résumé bullets as moveable cards

Let the user guide where each bullet sits by dragging it, instead of hand-editing Markdown.

**1. Auto-detect the bullets as cards.** In the editor/preview, render each résumé **bullet line** as
a distinct, draggable **card** with a drag handle. Detect them from the résumé's Markdown body
(`rendered_text`): every line matching a bullet (`- `, `* `, `• `) is a card; headings (`#`/`##`/`###`)
and entry titles are NOT draggable — use them to GROUP the cards visually by section/entry.

**2. Drag to reorder.** Dragging a card reorders bullets WITHIN their entry/section (primary), and
ideally moves a bullet to another entry/section (stretch). Show a clear drop indicator; add
keyboard move-up/move-down for accessibility.

**3. Apply LOSSLESSLY, then re-render.** On drop, reorder at the **Markdown line level** — move that
exact bullet line to its new position and leave every other line byte-for-byte unchanged (do NOT
round-trip through structured data, which can alter other content like a linked email). Save the
reordered body as a new version (`POST /resumes/{id}/versions { content }`); the preview re-renders
in the new order and the version indicator updates (same save/refresh path as other edits). A drag
that doesn't change the order creates no version. Undoable via version history.

**4. UX.** Deterministic, no AI. Available in both the editor and the quick preview. Cards look
clearly draggable (handle + hover/active state); the drop target is obvious.

Acceptance: each résumé bullet shows as a draggable card grouped under its section/entry; dragging
one to a new spot reorders exactly that line, saves a new version, and the preview re-renders in the
new order; all other content is unchanged; the reorder is undoable.

---

## P4b — Visible "what changed" indication on the résumé preview

Small text changes are easy to miss. When the résumé preview updates (after ANY change — AI edit,
manual editor Save, Accept & Save from Highlights, bullet reorder, or switching versions), make the
change VISIBLE. This is purely additive: do NOT alter any existing edit/save/render behavior.

**1. Clear update cue (baseline).** On every change, show an unmistakable **"Updated — N change(s)"**
cue near the preview with the new version number (a toast or a badge that appears and auto-dismisses
after a few seconds), plus a brief glow/outline flash on the preview frame. Not tiny inline text.

**2. Highlight the changed content (better).** When the preview re-renders, compute a line-level diff
between the previous and new document body (both available client-side) and briefly **highlight the
added/changed lines** in the rendered preview — added lines a green highlight, changed lines a
yellow one — **fading out after ~4–5 seconds**. This draws the eye straight to the difference even
when it's only a few words.

**3. Covers every change path.** AI "Ask AI to change it", manual editor Save, Accept & Save,
bullet reorder, and version switches all trigger the same cue + highlight, so the user always sees
that — and what — changed.

**4. Non-intrusive.** Visual layer only: must not block interaction, change the saved document, or
persist. A no-op change shows nothing.

Acceptance: after any edit the preview shows a clear "Updated — N changes (vN)" cue and briefly
highlights the added/changed lines (fading); a one-word change is obvious at a glance; existing
editing behavior is unchanged.

---

## P4c — Résumé bullet editing board: drag cards to edit / remove / substitute (+ undo)

Supersedes P4a. Turn the résumé's bullets into a drag-and-drop editing board so the user can shape
the résumé directly — including company-CONTRIBUTION bullets (which belong on a résumé where
applicable, to show value in the company's success, not just skills).

**Layout (two zones).**
- **The résumé** (editor/preview): every bullet line renders as a draggable **card** with a drag
  handle (detect bullets from the Markdown body; headings/entry titles aren't draggable — use them
  to group cards by section/entry).
- A side **"Editing" list** (right panel): a workspace the user drags cards into.

**Interactions.**
1. **Reorder** — drag a card to a new position within its entry/section (and ideally across).
2. **Drag a bullet to the Editing list** to work on it there: **edit** its text inline, or **remove**
   it from the résumé. The Editing list clearly shows what's staged before it's applied.
3. **Substitute** — drop an edited card, a different bullet (a Highlights suggestion), or a newly
   typed bullet back onto the résumé in a removed card's place, swapping it in.
4. **Apply & re-render** — each change edits the Markdown body at the **line level** (lossless — move
   /edit/remove the exact line, leave everything else byte-identical; do NOT round-trip through
   structured data) and saves a new version; the preview re-renders.
5. **Undo / redo** — EVERY action (reorder, edit, remove, substitute) is undoable via an Undo control
   (with redo), without needing a page reload, and is also backed by version history.

**UX.** Clear drag handles + drop indicators; the Editing list shows staged edits/removals distinctly;
keyboard-accessible (move/edit/remove/undo). Deterministic — no AI.

Acceptance: a user can drag a résumé bullet into the Editing list, edit or remove it, drag in a
substitute, and the résumé re-renders with the change saved as a new version; all other content is
unchanged; every step is undoable (and redoable).

---

## P0e — CRITICAL: preview silently reverts to an old version after every save

Root cause of "the résumé preview never shows my changes." The app stores the viewed version in
localStorage (`hirewave_viewed_version_resume_<id>`) and **re-pins it on every page load**, overriding
the document's active version. But it **never advances that key when a new version is saved** — so a
save creates version N+1 correctly, then the next render/reload reverts the view to the old pinned
version, and the change appears to do nothing. (Confirmed live: a saved version 29 kept rendering as
27 until the key was set to 29.)

**Fix:** whenever a new version is created — AI "Ask AI to change it", manual editor Save,
Accept & Save from Highlights, bullet reorder, restore-as-copy, ANY path — **update
`hirewave_viewed_version_resume_<id>` (and whatever in-memory "current version" state mirrors it) to
the new version number**, so the preview immediately shows the save and still shows it after a reload.
On load, prefer the document's actual active version when it's newer than the stored viewed version
(don't downgrade a fresh save). Never pin a stale version over a newer saved one.

Acceptance: make any edit and save → the preview shows it immediately AND after a hard reload; the
version indicator matches what's rendered; no save ever "disappears" from the preview.

---

## P4d — Bullet editing in the FULL-SCREEN view + click-a-line selection (refines P4c/P2b)

The bullet replace / swap / reorder (P2b click-to-replace, P4c editing board) must also work in the
**full-screen "Read full size" view**, and picking a line to act on should be as simple as clicking
it on the page. Make the whole selection flow more intuitive.

1. **Works full-screen.** The "Read full size" / expanded résumé gets the same selectable, draggable
   bullet cards as the small preview — selecting bullets to replace, swap, or reorder works there
   too, not only in the compact view.

2. **Click the line to select it (primary, easy path).** In BOTH the normal and full-screen views,
   the main way to pick a bullet is to **click it directly in the résumé**. It highlights as
   clearly selected, and a compact action bar appears on/near it: **Replace · Swap · Move up/down ·
   Edit · Remove**. No hunting through a separate list to find the matching line.

3. **Easy swap / reorder.** A selected line can be swapped (replace with a Highlights suggestion or
   typed text) or reordered (drag, or Move up/down buttons for precision). Line-level + lossless;
   saves a new version — which now shows immediately (P0e). Undo/redo every action.

4. **Simpler bullet pane.** Where a separate bullet/editing pane exists, make its rows easy to pick:
   big click targets, an obvious selected state, and **two-way sync** — selecting a line in the
   résumé highlights its row in the pane and vice-versa, so it's always clear which line is active.

Acceptance: in the full-screen résumé, the user can click any bullet to select it and immediately
swap or reorder it with an obvious selected state; selecting from the bullet pane is easy and stays
in sync with the résumé; changes save and show right away; everything is undoable.

---

## P4 — Interactive résumé bullet editor (CONSOLIDATED — supersedes P2b, P4a, P4c, P4d)  _(folded into P7 — the "Bullets" tab)_

Let the user shape the résumé by directly manipulating its bullets — select, reorder, swap/replace,
edit, remove — in BOTH the normal preview and the full-screen view, intuitively and with undo.

**0. Rendering note (important).** The preview renders the résumé as static HTML inside an **iframe**,
so its `<li>` elements can't carry handlers. Render the bullets as **React bullet cards** (or an
interactive overlay aligned to the rendered lines) in BOTH the normal preview AND the full-screen
"Read full size" view — the same component in both. Detect bullets from the Markdown body (lines
starting `- `/`* `/`• `); headings and entry titles are not bullets (use them to group cards).

**1. Select by clicking the line (primary, easy path).** The main way to act on a bullet is to
**click it directly in the résumé**. It highlights as clearly selected, and a compact action bar
appears on/near it: **Replace · Swap · Move up/down · Edit · Remove**. Identical in normal and
full-screen views. No hunting through a separate list to find the matching line.

**2. Reorder.** Drag a card to a new spot within its entry/section (across sections = bonus), or use
**Move up/down** for precision. Clear drop indicator; keyboard-accessible (select + move).

**3. Swap / Replace — including drag RIGHT → LEFT.** The new/suggested bullets live in a **right-hand
pane**; the selected résumé bullets are the **left-hand focus editor**. The user can replace a line
two ways, both supported: (a) **drag a bullet card from the right pane onto a focused bullet on the
left** → it **replaces that line** (drop between bullets to insert instead); and (b) with a line
selected, pick a replacement from a Highlights suggestion (call `POST /resumes/{id}/match-bullets`
for closest fits), a different existing bullet, or **typed/pasted** text. Show a one-line
before→after. A dragged-in bullet lands in the left editor where it can then be **manually edited**
before saving.

**4. Edit / Remove.** Edit any left-side (focused) bullet's text inline; remove it from the résumé.

**5. Optional Editing pane with two-way sync.** If a side bullet/editing pane exists, make its rows
easy to pick (big click targets, obvious selected state) and keep it **in sync both ways** — selecting
a line in the résumé highlights its row in the pane and vice-versa.

**6. Apply losslessly + show immediately.** Every change edits the Markdown **at the line level**
(move/edit/remove the exact line; leave all other content byte-identical; do NOT round-trip through
structured data — that can alter things like a linked email). Save a new version via
`POST /resumes/{id}/versions`; it shows immediately now that P0e advances the viewed-version. A no-op
change saves nothing. No new backend is needed.

**7. Undo / redo.** Every action (reorder, swap, edit, remove) is undoable via an Undo control (with
redo), and is also backed by version history.

**8. Smart scroll synchronization across panes.** Audit and fix the scrolling of ALL panes (the
résumé/left focus editor, the right suggestions pane, the review list, and the full-screen view) so
they feel coordinated, not independent and disorienting:
- Each pane scrolls **within its own area** (no pane should push page-level scroll or hide the
  header/footer actions), and long lists get their own scrollbar.
- **Selecting a bullet scrolls it into view in every pane that shows it** — click a line on the
  left and its matching row in the right/review pane scrolls into view (and vice-versa), so the two
  sides never drift out of context.
- **Auto-scroll while dragging:** dragging a card near the top/bottom edge of a pane (or across from
  the right pane toward a left bullet that's off-screen) auto-scrolls that pane so the drop target is
  reachable.
- Keep the **selected line and its action bar visible** after any scroll or edit; never let a save or
  reorder jump the user to the top.
- Sticky headers/footers (counts, Preview/Save, Undo) stay pinned while the list scrolls under them.

**Scope.** Deterministic — no AI (the only AI is an opt-in "rewrite this line," if you add it). Same
behavior in normal + full-screen.

Acceptance: in BOTH the normal and full-screen résumé, the user can click any bullet to select it
(obvious selected state + action bar) and reorder, swap, edit, or remove it; changes are lossless,
save, and appear immediately; a side pane (if present) stays in sync; every action is undoable.

---

## P5 — Scan a mailbox for job email → pull into results + auto-advance the tracker

Give the user a one-click way to pull **only** job email from an authorized mailbox into Hirewave.
It is deliberately **one-way**: retrieve → classify → categorize → ingest postings → advance the
applications tracker. Nothing is ever sent, and no reply is composed. The whole feature is backed by
endpoints that are already LIVE — **no new backend is needed**.

**0. The privacy promise (say it in the UI).** The scanner classifies every message first and keeps
**only job-related mail**; personal email is dropped before anything is read in. Show this plainly
near the Scan button ("We only read job email — nothing personal is imported"). A **dedicated job
inbox** is the best-privacy option because it holds only job mail to begin with.

**1. Two sources (a small toggle).**
- **My Gmail** — `POST /api/v1/inbox/scan?source=gmail`. Requires the user's Gmail connection
  (reuse the existing Integrations/connect-Gmail flow; if the call returns **400 "connect Gmail
  first"**, surface a "Connect Gmail" CTA instead of an error).
- **Dedicated job inbox** — `POST /api/v1/inbox/scan?source=mailbox` (the default). Scans the
  service-configured dedicated account. If it returns `fetched: 0`, show "No dedicated inbox
  connected yet" with a short explainer (a dedicated `jobs@…` account, connected by IMAP) rather
  than an empty table.
- Also keep/point to the existing **forwarding address** path (`GET /api/v1/inbox/address` → the
  user's `jobs+<token>@…` address) as a third, zero-setup way to get alerts in — it feeds the same
  pipeline.

**2. Run the scan (no infinite spinner).** POST with the Bearer token and an `AbortController`
(~30 s). On success render the result; on timeout/network error resolve to an **error + Retry**
state. The response shape:
```
{ source, fetched, job_found, ingested,
  by_kind: { alert, application, interview, offer, rejection, recruiter },
  tracker: { routed, created, advanced, unchanged, skipped, by_status,
             applications: [ { application_id, job_posting_id, company, role, kind,
                               status, action, from_status } ] },
  emails: [ { kind, status, company, role, link, subject, from, confidence } ] }
```

**3. Results, grouped by kind.** Show the `emails[]` as cards/rows **grouped by `kind`** in this
order: **Offer · Interview · Application · Recruiter · Alert** (most actionable first). Per row:
- a **kind chip** (color-coded: offer=green, interview=blue, application=slate, rejection=gray,
  recruiter=purple, alert=neutral);
- **company** and **role** when present (fall back gracefully to the subject when both are blank —
  do **not** invent them);
- the **subject**, the sender domain (`from`), and a **confidence** meter (0–1);
- if `link` is present, an **"Open posting"** external link (new tab, `rel="noopener"`).
Summarize the counts at the top from `by_kind` ("3 applications · 1 interview · 1 rejection").

**4. Tracker routing feedback (the headline).** The four **progress kinds**
(application/interview/offer/rejection) are auto-routed into the applications tracker server-side:
an existing application **advances** (never downgrades — a stale email can't drag an offer back), or
a new row is **created** when the email ties to a known posting. Render a short "Applications
updated" summary from `tracker`:
- a line like **"Advanced 2 · Created 1 · No change 1"** from `routed/created/advanced/unchanged`;
- per `tracker.applications[]`, a one-line receipt: **`{role} at {company}` — {from_status} →
  {status}** for `action:"advanced"`, **"Added to tracker as {status}"** for `action:"created"`,
  and a muted **"Already {status}"** for `action:"unchanged"`.
- Link each receipt to its row in the applications view (`GET /api/v1/applications`; match by
  `application_id`). After a scan, **refresh the applications list** so the board reflects it.
- `skipped` means a progress email didn't match any tracked role and had no known posting — don't
  show it as an error; omit or footnote it ("2 messages had no matching application").

**5. Status mapping (so the UI reads right).** `application → submitted`, `interview →
interviewing`, `offer → offered`, `rejection → rejected`. `alert`/`recruiter` are **leads, not
applications** — they appear in the results list but are never routed to the tracker.

**6. Empty / zero states.** `job_found: 0` → "No job email found in this mailbox" (not an error).
Never substitute sample emails for a real scan. A `rejection` card should be calm and neutral, not
alarming.

**Scope.** Read-only retrieval + server-side routing; deterministic, no AI, no sending. Reuse the
existing Gmail-connect UI; everything else is display of the `/inbox/scan` response.

Acceptance: signed in, "Scan for job email" calls `/inbox/scan`, shows job email grouped by kind
with company/role/link/confidence, and an "Applications updated" summary; the applications board
reflects advanced/created rows immediately; a personal (non-job) message in the mailbox never
appears; no reply or send is ever offered.

---

## P6 — Documents editor: show the last generated bullets + prompt by default  _(folded into P7 — default state of the "Ask AI" tab)_

In the Documents **editable preview** (the view with the AI-prompt box and the right-side AI
functions), the bullets the editor generated **last session** and **the prompt that produced
them** must appear **by default on load** — the user should not have to re-run the AI to see what
they already made. The backend now persists every generated run; this is wiring it into the UI. All
endpoints are **LIVE**, no new backend.

**1. Load the latest on open.** When the editor/preview mounts for a résumé, call
**`GET /api/v1/resumes/{id}/highlights/latest`**. Response:
```
{ latest: { id, mode, prompt, job_posting_id, items, item_states, created_at, updated_at } | null,
  recent_prompts: [ "…", "…" ] }    // newest first, de-duplicated, up to 10
```
If `latest` is non-null, render its bullets in the AI-suggestions area **immediately** — the same
component that renders a fresh generation. If `latest` is null (never generated), keep today's empty
state. Never show a spinner-forever; this call is fast.

**2. Render `items` by `mode`.**
- `mode: "suggest"` or `"highlights"` → `items` are **edit suggestions**: `{ action
  (add|remove|reword), section, before, after, rationale }`. Render each as a reviewable bullet
  with its action chip (same as a live suggest-edits review).
- `mode: "synthesize"` → `items` are **evidence groups**: `{ theme, summary, points[] }`. Render the
  summary as the headline bullet with its supporting points.

**3. Show the last prompt, and recent prompts.** Display `latest.prompt` in/above the prompt box as
"Last prompt" (with a **Re-use** button that drops it back into the input, and a **Copy**). Offer
`recent_prompts` as a small "Recent prompts" dropdown/list for one-click re-use. This is the
"remember previous prompts" behavior — now backed by the server, so it survives a new session/device.

**4. Truncate long bullet lists — "Show more".** Don't dump a long list on the page. Show the first
**~3–5** bullets and a **"Show more (N)"** link that expands the rest (and "Show less" to collapse).
Default collapsed when there are more than the cap. Keep the most actionable items first.

**5. Remember accept/reject across sessions.** `latest.item_states` is a map of the item's index (as
a string) → `"accepted"` / `"rejected"`. Apply it on load so previously-accepted/rejected bullets
show their state. When the user accepts/rejects a bullet, persist it with **`POST
/api/v1/resumes/{id}/highlights/runs/{run_id}/state`** with body `{ "states": { "0": "accepted", "2":
"rejected" } }` (send `"pending"` or "" to clear one). It merges server-side and returns the updated
run. (This does not change the résumé — applying an accepted bullet still goes through the existing
apply-edits → save-version path.)

**6. Prior runs (optional, nice).** `GET /api/v1/resumes/{id}/highlights/runs?limit=12` returns the
recent runs (newest first) with their bullets — use it for a "Previous results" list if you want the
user to reopen an earlier generation, not just the latest.

**7. Start fresh.** A small "Clear saved suggestions" affordance calls **`DELETE
/api/v1/resumes/{id}/highlights`** (204) and returns the area to the empty state. Confirm before
clearing.

**8. Keep generation writing-through.** No change needed to the generate calls themselves — every
`POST /suggest-edits`, `/highlights/suggest`, and `/evidence/synthesize` now auto-saves its result
server-side, so after any generation the "latest" is already up to date. Just make sure that after a
fresh generation you render it (and it will also be what `latest` returns on the next load).

**Scope.** Display + persistence wiring only; deterministic, no new AI calls on load. Lives in the
Documents editable-preview and its right-side AI panel.

Acceptance: open a résumé you generated bullets for in a previous session → the bullets and the last
prompt are shown by default without re-running; a long list is collapsed behind "Show more";
accept/reject state persists across reloads; "Re-use" refills the prompt; "Clear saved suggestions"
empties it.

---

## P7 — Unified résumé & cover-letter workspace (SUPERSEDES the split Documents editor + My Work Highlights)

**Why.** "Documents" and "My Work Highlights" have become two editors for the *same* résumé — same
preview, same versions, same bullet editing, same save. That's redundant and confusing. Collapse
them into **one Workspace**. The backend is already a single résumé with one save path
(`POST /resumes/{id}/versions`), so this is a **frontend/IA change only — no new backend**. Every
endpoint below is already LIVE. This prompt supersedes the layout/navigation of P1.1, P1b, P1c, P2.1,
P2.3, P2.4, P2a, P2c, P2d, P3a, P4, and P6 — their bodies remain the detailed spec for each tab's
behavior; P7 only changes where they live and how they're arranged.

### A. Information architecture (what changes)

- **Documents = the library (keep).** The Documents list still picks, uploads, archives/flags, and
  deletes résumés and cover letters, and shows the versions marquee (P2.1). Opening any document
  navigates into the **Workspace**.
- **Workspace = the one editor (new).** Reached by opening a document. It **replaces both** the old
  standalone "Documents editor" page and the standalone "My Work Highlights" page.
- **Remove the top-level "My Work Highlights" nav entry.** It becomes a **tab** inside the Workspace.
  There must be exactly one place to edit a document. Remove the duplicate editor/preview and the
  Highlights-only preview chrome (the version check-mark strip and the "Server render · …" badge from
  P3a) — the Workspace has one standard preview.
- Keep the existing entry CTAs working by routing them to the Workspace (and preselecting the right
  tab): dashboard "Strengthen your résumé" → Workspace, **My Work Highlights** tab; editor "Add my
  own content" → **My Work Highlights** tab.

### B. Layout — one shared preview + a tabbed side panel

**Left — the single shared preview** (this is the P3a "one preview everywhere," now automatic because
there is only one workspace):
- One `selectedVersion` is the single source of truth; render the preview from **that version's own
  content**, not the résumé's `rendered_text` (which can lag). Standard DOCUMENT chrome: fit-width /
  zoom, Expand, **Read full size**, Reload from source.
- The interactive **bullet overlay** (P4) renders as React cards over the preview in **both** the
  normal and full-screen views, with the "Updated — N change(s)" cue (P4b).
- The preview is identical whether the document was opened from the Documents list or any tab.

**Right — a tabbed panel** (one tab visible at a time; nothing from either old surface is lost). For a
**résumé**, the tabs are:

1. **Ask AI** — instruction-driven, applied immediately, Undo = version switch (P1.1 "Ask AI", P0b).
   `POST /resumes/{id}/ai-edit`, `POST /resumes/{id}/improve-structured`. **Default state shows the
   last generated bullets + the prompt that made them** (P6): on open call
   `GET /resumes/{id}/highlights/latest` and render `latest` (by `mode`) + `recent_prompts`
   (Re-use/Copy), list prior runs via `GET /resumes/{id}/highlights/runs`, persist accept/reject via
   `POST /resumes/{id}/highlights/runs/{run_id}/state`, Clear via `DELETE /resumes/{id}/highlights`.
   Long lists collapse behind "Show more."
2. **My Work Highlights** — the paste-driven, accept-before-save pipeline (P2.3 zones A–D, P0c):
   generate prompts for your work AI (`POST /resumes/{id}/evidence-prompts`) → paste & extract
   (`POST /resumes/{id}/evidence/extract`) → synthesize into concepts
   (`POST /resumes/{id}/evidence/synthesize`) → reviewable suggestions
   (`POST /resumes/{id}/highlights/suggest` or `/suggest-edits`) with **smart Add/Replace** (P2a,
   `POST /resumes/{id}/match-bullets`), a **scrollable list with sticky header/footer, visible
   accept/reject + Undo** (P2d), and **complement/avoid dedup** (P2c, the `avoid` param). Accept →
   `POST /resumes/{id}/apply-edits` → preview → `POST /resumes/{id}/versions`. The **persistent
   experience library** lives here (`GET/POST/PUT/DELETE /api/v1/experience`, `/experience/upload`),
   feeding `POST /resumes/{id}/incorporate`. The résumé view stays unchanged until the user saves.
3. **Bullets** — the interactive bullet board (P4): select, reorder (drag / Move up-down), edit,
   remove, substitute, **drag a suggestion right→left to replace a line**, undo/redo. Lossless
   line-level edits. `POST /resumes/{id}/match-bullets`, `POST /resumes/{id}/versions`.
4. **Manual edit** — hidden-by-default markdown editor + toolbar (P1b: bold/italic/underline/link/
   bullet/heading/clear; preview honors `<u>` and links), replace a whole line (P1c), and **Find &
   replace** (P1.1, `POST /resumes/{id}/replace`). Save via `POST /resumes/{id}/versions { content }`.
5. **Design** — template/design chooser with live preview (P2.4). `GET /api/v1/resume-templates`
   (+ `/categories`), `POST /api/v1/resume-templates/generate`, `PUT /resumes/{id} { template_id }`,
   optional `GET /resumes/{id}/render?template_id=`.
6. **Versions** — the versions marquee (P2.1): list, rename, activate, delete.
   `GET /resumes/{id}` (`versions[]`, `active_version`), `GET /resumes/{id}/versions/{v}/render`,
   `PATCH /resumes/{id}/versions/{v}`, `POST /resumes/{id}/versions/{v}/activate`,
   `DELETE /resumes/{id}/versions/{v}`.

**Shared across tabs:** the single save path (`/versions`), Undo = switch to the previous version, the
"what changed" cue (P4b), and the global P0 rules (token refresh, null-safe render on 200, error+Retry
instead of infinite spinners). Switching tabs never loses the current preview, `selectedVersion`, or an
in-progress review.

### C. Cover letters (same Workspace, reduced tabs)

Opening a **cover letter** opens the same Workspace shell with the shared preview pointed at the cover
letter and a **reduced tab set**: **Ask AI** (`POST /cover-letters/{id}/ai-edit`), **Manual edit**
(update + versions), **Design** (if templates apply), **Versions**. Hide the résumé-only tabs
(My Work Highlights evidence pipeline, Bullets board) for cover letters. Same save/Undo model.

### D. Scope

IA + layout only; reuse every existing control's behavior from the prompts listed above. Deterministic
where those prompts were deterministic; the only AI is the same AI those tabs already call. No new
backend, no new endpoints.

Acceptance: there is **one** place to edit a document. Opening a résumé from the Documents list lands
in the Workspace showing the **same version** the list showed, with a left preview + a right tabbed
panel (Ask AI · My Work Highlights · Bullets · Manual edit · Design · Versions). Each tab performs its
function against its live endpoint; saving in any tab creates a new version and the preview updates
immediately. There is **no** separate "My Work Highlights" nav entry, and the preview looks identical
from every entry point. Opening a cover letter shows the reduced-tab Workspace.

---

## P8 — Declutter the editor: frameless bullet bubbles (drag onto the preview) + fix the popover

Audit of the live editor (`/dashboard/documents/resumes/{id}`) found it **overloaded and confusing**:
too many overlapping controls, a broken hover "zoom" bubble, and no simple way to just work with the
bullets. This prompt fixes those three things. It is UI/UX cleanup only — **no new backend**, and it
refines P7 (apply P7's tab model, then this trims it).

### 1. Fix the bullet "ZOOMED LINE" popover (two concrete bugs)

Hovering a bullet in the preview shows a "ZOOMED LINE" card with a "Click to edit" / "press E" action.
Today it is broken in two ways — fix both:

- **Anchor it over the line it's zooming.** The card currently renders offset and covers the *next*
  bullets. It must appear **directly over its own source line** — same left edge and width as that
  bullet, vertically centered on it (or immediately above with a pointer to it) — so it's obvious
  which line it represents and it never hides the lines below it.
- **Don't auto-tear-down before it can be used.** It's hover-only, so moving the mouse toward its
  "Click to edit" button dismisses it — the action is unreachable. Make it **click-to-open and
  pinned**: click a bullet → the card opens and **stays** until the user clicks elsewhere, presses
  Esc, or picks an action. (If you keep a hover affordance, it must be hover-*intent* with a short
  close delay and a hit-area bridge to the card, but click-to-pin is the required behavior.) The
  card's actions (Edit, and any Replace/Remove) must be fully clickable.
- Also fix the **detached dark tooltip** (e.g. "Source / revision") that floats mispositioned in the
  top-left — same root cause: anchor tooltips to their trigger, or remove them.
- A clicked, pinned preview line is the **"activated bubble"** — besides being editable in place, it is
  the **drop target** for a bullet dragged from the right-side list (see §2c).

### 2. Bullets as a plain list of bubbles — no frames, no button clusters, drag onto the preview

This is the core of the redesign. Today the generated bullets (Highlights "Review your suggested
edits", ZONE C) are heavy **cards**, each wrapped in a frame and loaded with buttons — `+ Add`,
`Accepted`, `Experience`, `Accept`, `Reject`, a trash icon, an `Add as new / Replace` toggle, and
`Why this was suggested`. That is far too busy. Replace it with the simplest possible direct-
manipulation model, used for **both** the generated suggestions (right) and the résumé's own bullets:

**a. Right side = a plain, frameless list — show ALL the options.** Drop the card frames and the
per-item button rows. Show the generated bullets as a bare **list of lines** — just the text, one per
row, nothing around them. No Accept/Reject/Add/Replace/Experience/trash buttons sitting on every row.
Surface the **full set** the AI produced, not a handful — a rich paste now yields many (the backend was
raised to up to ~14–20 suggestions). The list **scrolls** to hold them all; only collapse for length
with a "Show more", and default to showing plenty, so the user has a real pool to choose from.

**b. Hover zooms a line into a bubble.** Hovering a line lifts it into a readable **bubble** (the
zoomed form) — the same bubble treatment used in the preview — so the user can read the full text
without a cramped card. The bubble is the handle: it can be **picked up and dragged**, and **reordered**
within the list by dragging.

**c. Drag a bubble onto the left preview to assign/replace/add.** The user drags a right-side bubble
onto the **left document preview**:
- Drop it **onto a bullet that has been clicked "active"** (see §1 — a clicked preview line becomes an
  editable "bubble zoom") → it **replaces** that line with the dragged bullet.
- Drop it **between lines** (or onto a section) → it **adds** there (assign to that spot/section).
The left active bubble remains **editable in place** after a drop, so the user can tweak the wording,
then it saves as a new version. This is the P4 "drag a suggestion right→left to replace a line" gesture,
now the primary interaction instead of buttons.

**d. Keep only the one action that drag can't express.** A bullet the user doesn't want is removed by a
single small affordance that appears **only on the hovered bubble** (e.g. a tiny ✕ on the bubble), not a
permanent button row. Everything else (accept = drag it in; reject = ignore/dismiss it; reorder = drag)
is a gesture. Remove `Add as new / Replace` toggles, the `Experience`/`Accepted` pills and `Why this was
suggested` from the row (move "why" to a hover/long-press reveal if kept at all).

**e. The résumé's own bullets use the exact same list.** The P7 **Bullets** tab is this same plain
bubble list for the lines already on the résumé — hover to zoom, drag to reorder, click a preview line
to edit it, drop a suggestion to replace it. Make this the **default** landing view, not a buried tab.

**f. Zoom the preview lines *while* dragging, so the target is easy to pick (fixes the confusing part).**
Dragging a bubble from the right onto the left preview must make choosing the line to replace effortless:
- As a dragged bubble **hovers over the preview, magnify the line(s) under the cursor** — the preview
  text the bubble is over zooms up so the user can clearly read and aim at the exact line to swap. The
  nearest drop-target line highlights (pure-swap target per the confirmed behavior).
- Keep the **preview's own zoom reachable during the drag** — don't lock or hide the zoom/fit control
  while a right→left drag is in progress; a user who zoomed in stays zoomed, and can still zoom while
  the panels are in "toggle" mode. The preview should be comfortably zoomable at any point in the
  interaction, not only before it starts.
- Auto-scroll the preview when the dragged bubble nears its top/bottom edge, so an off-screen target
  line can be reached without dropping the bubble.

Every change is line-level lossless and saves through the one existing path
(`POST /resumes/{id}/apply-edits` where a suggestion is applied → `POST /resumes/{id}/versions`; smart
replace vs add uses `POST /resumes/{id}/match-bullets`); Undo = version switch. No AI is needed to drag,
reorder, edit or remove.

### 3. Remove the duplicate / unnecessary controls (declutter)

The editor currently shows the same actions in several places. Collapse to **one** of each:

- **One navigation, not two.** There is a top button row (Browse documents · My Work Highlights ·
  Preview · Shortcuts · Templates · Design) **and** a tab bar (Ask AI · My Work Highlights · Bullets ·
  Manual edit · Design · Versions) — with "My Work Highlights" and "Design" duplicated across them.
  Keep **only the tab bar** (P7): **Bullets (default) · Ask AI · Highlights · Manual edit · Design ·
  Versions**. Move "Browse documents" to a simple back link, and put **Shortcuts** and **Templates**
  into a single overflow/"⋯ More" menu.
- **One preview with one set of zoom controls.** Zoom/fit controls currently appear ~3 times (a top
  "ZOOM 43% · Fit page · Fit width · 100%", a mid "Pane · Fit · 50% · 75%", and a preview "68% · Fit
  width · 100%"). Keep a single zoom/fit control on the preview and delete the others.
- **Strip the stack of bars over the preview (audit, current build).** Directly above the document
  preview there are now ~6–7 stacked rows — far too many. Collapse them to a **single slim preview
  header + one zoom row**:
  - **Two "Preview" buttons:** the Edit⇄Preview toggle **and** a separate "Preview · Original file ·
    Download" group both say Preview. Keep the Edit⇄Preview toggle; move **Original file** and
    **Download** into a single "Download ▾" (or the ⋯ More menu). Remove the second "Preview".
  - **Two version indicators:** a top "v33 · Updated Oct 17" chip (with ‹ › and ⋯ More) **and** a
    "Version 33 ▾" selector on the zoom row. Keep **one** — the top chip with prev/next; drop the
    second selector (full browsing lives in the Versions tab).
  - **Two collapse/panel icons** stacked in the header — keep one.
  - **Delete the "Page thumbnail — click to download the image" row** entirely (niche; if kept, put it
    under Download ▾).
  - **The "DOCUMENT · Hover a line to zoom · click it to edit · Click the page for a full readable
    view" bar** is a verbose instruction, not a control — shrink to a one-time, dismissible hint (or a
    small "?" tooltip), not a permanent bar.
  - Keep, once: **Undo · Redo**, the small **"Improve weak lines (N)"** action, **one** zoom/fit
    control (− 58% + · Fit), and **one** "Full size" affordance. Rename the **REVISION** tag to
    **Edited** (P9). Net result over the preview: title + "Edited {date}" + one version chip · Undo/Redo
    · one zoom/fit · Full size — nothing repeated.
- **One way to preview / go full-screen.** "Preview", "Read full size", "Expand", and the Edit/Preview
  toggle overlap — keep the Edit⇄Preview toggle plus a single "Full size" affordance; drop the rest.
- **One way to edit.** "Open editor", "Edit", "press E to edit", and "Edit manually" all open editing —
  keep the Bullets list (inline) + the Manual edit tab; remove the redundant buttons.
- **Tame the Versions real-estate.** The full 31-card versions marquee is shown inline **and** there's
  a Versions tab. Keep the **Versions tab** as the home for version browsing; on the main editor show
  only a compact "Version N · Updated …" chip with prev/next, not the whole carousel.
- **Fix the "Tailor to a role" picker.** It lists dozens of junk entries (e.g. "Subsea Kelp Logistics
  Lead 1788824848", "senior data engineer z1788415338"). Make it a **searchable, typeahead** selector
  showing a few recent/relevant roles — and separately prune those test job postings from the account
  (they are test data, not real saved jobs).

### Scope

Declutter + the two popover fixes + the bullet list as default. Reuse every existing endpoint and
behavior; remove duplicate UI, don't add features. No backend changes.

Acceptance: the generated bullets show as a **plain frameless list** (no per-row button clusters);
hovering a line **zooms it into a bubble**; the bubble can be **reordered by dragging** and **dragged
onto the left preview** — onto a clicked/active line to **replace** it, or between lines to **add** —
and the dropped line is then **editable in place** and saves as a new version. A clicked preview line
opens an edit card **anchored over that exact line** that **stays open** long enough to use it. The only
per-bullet button is a small remove ✕ on the hovered bubble. Each control (navigation, zoom, preview,
edit) appears **once**; the Versions carousel is not duplicated; the role picker is searchable and free
of junk entries.

---

## P9 — One-accent color system + plain language (calm, non-intimidating)

The brand's design system is good — **keep it**. The problem is the app (especially the editor) doesn't
follow it: harmless controls are colored red, four or five accent colors fight on one screen, and labels
read like engineering jargon. This makes the product feel busy and intimidating to non-technical users.
This prompt **enforces the existing system**; it does not restyle the brand. CSS/label changes only, **no
backend**.

### Keep (do not change)
- **Type:** `Fraunces` (serif) for headings, `Plus Jakarta Sans` for body.
- **Canvas:** warm off-white background `oklch(0.985 0.006 85)`, near-black warm text
  `oklch(0.1 0.006 55)`.
- **Shape tokens:** `--radius-card: 1rem`, `--radius-tile: .75rem`, `--radius-control: .5rem`,
  `--card-padding: 1.25rem`, `--tile-size: 2.75rem` — use them everywhere instead of ad-hoc values.
- The **dashboard / landing** look (serif headline, generous whitespace, one clear green action) is the
  target. Make every other screen feel like that.

### 1. One accent for actions; red means only "negative"
The palette has green `oklch(0.56 0.14 158)` and coral/red `oklch(0.68 0.185 28)`. Today red is applied
to **benign** controls — **"Fit width"**, **"Replace weak bullets"**, **"Replace"** — so the UI looks
full of warnings. Fix the semantics, app-wide:
- **Green** = the single "do this / primary" action on a view (Save, Apply, Run, the main CTA). At most
  **one** green primary per view; everything else secondary.
- **Red/coral** = **only** destructive or negative actions: **Delete / Remove / Reject**. Nothing else.
- **Neutral (gray / outline, the `oklch(0.895 0.012 82)` warm gray or a plain bordered button)** = every
  neutral control: **zoom, Fit width/Fit page, Replace a line, Preview, Original file, Reload, tabs**.
  Replacing a bullet is a normal edit → neutral, not red.
- Coral may still appear as a **brand accent** in marketing/hero art, but **never on an app control**
  that isn't removing/rejecting something.

### 2. Cut the color/badge noise to a calm minimum
A single editor screen currently shows green pills, red pills, a green "Adds a new bullet" dot, an amber
"Replaces an existing bullet" dot, "N of M accepted" counters and "REVISION" tags — 4–5 accents at once.
Reduce every screen to: **near-black text · off-white bg · one green accent · one neutral gray**
(+ red only when a destructive control is present). Specifically:
- Drop the amber/orange status dot and the per-row "Adds a new / Replaces" labels (P8 removes these with
  the bubble redesign anyway).
- Keep at most **one** small, muted status chip per card, not a row of them.
- Status by **icon + text in a muted gray**, not by filling things with color.

### 3. Carry the dashboard's calm into every screen (space + fewer frames)
- Use `--card-padding` and `--radius-card` consistently; stop nesting boxes inside boxes (the editor has
  cards within cards within cards). Prefer whitespace and a single hairline divider over another border.
- Bigger hit targets (min ~40px tall controls), more line-height and gap in lists — easier for
  non-technical and touch users.
- One weight of shadow/elevation, used sparingly.

### 4. Plain language instead of jargon
Rename engineering-speak to friendly, human copy, e.g.:
- "ZONE A / ZONE B / ZONE C" → **"Step 1: Get prompts · Step 2: Paste results · Step 3: Review"**.
- "Replace weak bullets" → **"Improve weak lines"**; "REVISION" tag → **"Edited"**.
- "Adds a new bullet / Replaces an existing bullet" → **"New line / Swaps a line"** (only if a label is
  needed at all).
- Prefer verbs the user understands (Save, Improve, Undo) over system terms (apply-edits, synthesize).

### 5. Dark mode
There's a light/dark toggle — apply the same restraint in dark mode: one green accent, red only for
destructive, neutral grays for the rest; keep contrast AA or better. Don't introduce extra accent colors
in dark mode.

### Scope
Color-role, spacing, and label changes that enforce the existing design tokens. No new components, no
new features, no backend. Do not change the typefaces, the brand green, or the warm off-white canvas.

Acceptance: on any screen, there is **one** green primary action; **red appears only on
delete/remove/reject**; a benign control (zoom, Fit width, Replace a line, Preview) is never red; no
screen shows more than two accent colors at once; nested card-in-card framing is gone in favor of
whitespace; and step/label copy reads in plain language, not "ZONE A"/"REVISION"/"apply-edits".

---

## P10 — BUG: pressing Enter on an AI / bullet change doesn't save

**Report:** in the résumé editor, an AI bullet change is **not saved when the user presses Enter** —
the user edits (an AI "Ask AI to change it" instruction, or a bullet's text) and hits Enter, and
nothing persists. Enter is advertised ("**Enter to apply**") but doesn't actually apply + save. Fix
every place Enter is offered so it reliably **applies the change AND saves a new version**, then shows
it. All endpoints already exist — this is a frontend key-handling/persistence bug.

### Make Enter commit everywhere it's offered
1. **"Ask AI to change it" box.** `Enter` (without Shift) submits the instruction → `POST
   /resumes/{id}/ai-edit` → apply immediately → **new version saved**. `Shift+Enter` = newline. Don't
   let Enter just insert a newline or get swallowed. (Tie-in to P0b: the dedup guard must **not** block
   a resubmit — every Enter/Apply POSTs even if the text repeats; show "No change was made" inline
   rather than silently doing nothing.)
2. **Inline bullet reword** (click a bullet's text to edit it, per P8). `Enter` **commits** the edited
   text: build a `reword` edit {before: original line, after: new text} → `POST /resumes/{id}/apply-edits`
   → `POST /resumes/{id}/versions`. Today the edit appears to change locally but **never POSTs**, so it
   is lost on reload — that's the bug. `Esc` cancels; **blur (click away) also commits** (don't drop an
   edit just because the user clicked elsewhere instead of pressing Enter).
3. **Dragging a suggestion onto the preview to replace/add** (P8) must likewise **persist** (new
   version), not only update the on-screen preview.

### Confirm it actually saved (so the user can trust Enter)
- After any Enter/commit, **advance the viewed version** (P0e) and re-render the preview from the new
  version so the change is visible immediately, and show the "**Updated — N change(s)**" cue (P4b).
- The saved version must survive a **page reload** (the real test: edit → Enter → refresh → the change
  is still there). If it isn't after reload, the POST didn't happen — that's the defect.
- Never show a success state without a 2xx from `/versions` (or `/ai-edit`). On failure, surface a
  small "Couldn't save — retry," never a silent no-op.

### Scope
Frontend key-handling + persistence only; reuse `ai-edit` / `apply-edits` / `versions`. No backend
changes.

Acceptance: typing an instruction in "Ask AI to change it" and pressing **Enter** applies it and saves
a new version; editing a bullet's text and pressing **Enter** (or clicking away) saves it; in both
cases the change **survives a page reload**; `Shift+Enter` makes a newline; a repeated instruction
still POSTs and reports "No change was made" instead of doing nothing silently.
