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

## P7 — Unified résumé & cover-letter workspace (SUPERSEDES the split Documents editor + My Work Highlights)  _(layout superseded by P109, which reconciles this with P94/P96–P108; P7's tab map below is still the detailed spec P109 references)_

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
2. **Inline bullet reword** (click a bullet → it zooms to a "THIS LINE" bubble → click its text to get
   an editable textarea). **CONFIRMED on the live site:** typing a change and pressing **Enter does
   nothing at all** — no commit, no save; the bubble stays open and the edit is lost. And there is **no
   visible Save/✓ control** on the edit bubble, so Enter being dead means a reword **cannot be committed
   at all**. Fix:
   - `Enter` **commits**: build a `reword` edit {before: original line, after: new text} →
     `POST /resumes/{id}/apply-edits` → `POST /resumes/{id}/versions`, update the line, close the bubble.
   - `Shift+Enter` = newline (if the field is multi-line); **blur (click away) also commits** (don't
     drop the edit because the user clicked elsewhere); `Esc` cancels.
   - Add a small **✓ Save** affordance on the edit bubble as a visible fallback — and make sure its ✕ is
     clearly "remove line" vs a separate "close/cancel" (today the only ✕ deletes the bullet).
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

---

## P11 — Fresh matches, highlighted best, with "why it matches" reasons

Make the matches list feel **current and explained**: it's kept up to date from the connected job
boards **and** the connected email (server-side, on a schedule), and each match now carries
**plain-language reasons** so the user sees *why* it fits, not just a score. The backend changes are
**already shipped** — this is wiring the new fields into the matches UI.

### 1. What the backend now provides (already live)
- Matches are **reaped on a schedule** from the user's **saved searches / job boards** AND their
  **connected Gmail** (privacy-gated to job email only), ingested into the same pool, de-duplicated,
  verified, and scored. So the list stays reasonably fresh on its own — no user action needed.
- **`GET /api/v1/jobs/matches`** (ranked, best first; `?limit=N` for top-N) now returns, per match, in
  addition to `score`:
  - **`reasons`**: a ranked list of `{ label, detail, sentiment }` — the human "why this matches"
    (e.g. `{label:"Strong skill match", detail:"You have Python, AWS, Kubernetes", sentiment:"positive"}`),
    strongest first, with **at most one** `sentiment:"caution"` (a gap/mismatch).
  - **`breakdown`**: the six fit components as 0–100 ints — `semantic, skills, location, salary,
    seniority, recency` — for an optional score-detail popover.

### 2. Highlight the best matches
- The list is already sorted best-first. Give the **top few** (e.g. score ≥ 85, or the top 3) a clear
  **"Best match" treatment** — a subtle highlight/badge — so they stand out. One accent only (green,
  per P9); don't color every card.
- Show the **score** as a compact 0–100 with a small label ("fit"), not a loud ring on every row.

### 3. Show the reasons (the main ask)
- Under each match, render its **`reasons`** as short chips/lines: `label` bold + `detail` muted.
  Positives in neutral/green, the single caution in a muted amber/gray (not alarming — per P9).
- Show the **top 2–3 reasons inline**; the rest behind a small "why" expander that also reveals the
  **`breakdown`** bars (skills 92 · pay 80 · location 100 · level 90 …). Never invent reasons — render
  only what the API returns; if `reasons` is empty, show nothing (don't fabricate).

### 4. Freshness cue
- Show a light **"Updated {relative time}"** on the matches view (from the newest match's `posted_ago`
  or a header timestamp) and a manual **"Refresh"** that re-GETs `/matches`. Don't claim live/real-time
  — it's periodic ("checked recently"). A match pulled from email reads the same as any other; no
  separate list.

### Scope
Display of the new `reasons` / `breakdown` fields + a best-match highlight + a freshness cue. No new
endpoints; the scheduling and email reap are server-side already.

Acceptance: the matches list shows best-first with the top few highlighted; each card shows 2–3
plain-language reasons (and a caution when present) plus an expandable score breakdown; a freshness
"updated" cue and a Refresh are present; reasons/score come only from the API (nothing fabricated).

---

## P12 — Matches: run a search in place + show each match's age

Audit of the live Matches page found two rough edges: starting a search is heavier than it should be,
and you can't tell how old a match is. UI only, no backend (the API already returns `posted_ago`).

### 1. "Run new search" should run in place, not open a separate confusing screen
Today **"Run new search"** on the Matches page is a link that navigates to a whole **`/dashboard/search`**
page — a role/location builder **plus its own "Recent jobs" grid of 87 roles** that duplicates the
Matches list. That's a jarring second screen. Fix:
- The **primary action on Matches is "Refresh"** — re-pull now (what the schedule does) and update the
  list **in place** with a spinner, no navigation. Make this the obvious button.
- **"New search" is a lightweight inline form** (a small popover/drawer on the Matches page): Role,
  Location, Remote, Source toggles, "Rank by résumé" — then **Run** updates the Matches list in place
  and (optionally) offers **Save search** so the agent re-runs it on the schedule. Do **not** navigate
  to a separate page or show a second job grid.
- Retire the standalone `/dashboard/search` "Recent jobs" grid — it's the Matches list under another
  name. Keep only the **Saved searches** management (list, edit cadence, delete) if it needs a home;
  everything else lives on Matches. One list of jobs, one place.
- Don't show two near-identical actions ("Run new search" + "Refresh") with different behaviors — that's
  the confusion. One **Refresh** (re-pull) + one **New search** (define/track).

### 2. Show how old each match is (per card), not just an aggregate
Today only an aggregate **"Newest posting 1 month ago"** shows; individual cards don't say their age, so
a month-old leading match looks as fresh as a new one. The API returns **`posted_ago`** per match —
render it:
- On every match card show **"Posted {posted_ago}"** (e.g. "Posted 3 days ago" / "Posted 1 month ago").
  Empty `posted_ago` → show nothing (don't guess).
- **De-emphasize stale matches:** when a posting is old (say `posted_ago` implies > ~3 weeks), mute it
  and add a small **"Older"** tag, so fresh roles stand out and a month-old top match is visibly old.
- Make **"Sort by → Newest"** available (and consider surfacing fresher roles higher), so the user isn't
  stuck with a stale posting leading the list.

### 3. (Data note — not a UI task) Prune the test postings
The live match pool is full of **test/junk postings** — "Subsea Kelp Logistics Lead 1788824848",
"…z1788415338 / r1788414653", "IT Operations Director QQ", "Backend Engineer WW". These are seeded test
data, not real jobs, and they dominate the list. They should be **removed from the account's job pool**
(a data cleanup, separate from this UI prompt) so matches reflect real postings.

### Scope
Display + the inline search/refresh interaction; reuse the existing `/jobs/matches` (it already returns
`posted_ago`) and the saved-search endpoints. No new backend.

Acceptance: on Matches, **Refresh** re-pulls and updates the list in place (no navigation, no second job
grid); **New search** is a small inline form that updates the same list and can be saved; every match
card shows **"Posted {age}"** with stale ones muted/tagged "Older"; and there's a **Sort by Newest**.

---

## P13 — Connect email the right way (don't dump the user on Google's error page)

**BUG found live:** on Integrations, clicking Gmail **"Connect"** redirects to Google and lands on an
OAuth **error page** (the backend isn't configured for live OAuth, so `client_id` is empty). Fix the UI
so it never does that, and clearly offer the **two** ways to feed job email — the user-preference feed
(forwarding / scan) and, when set up, proactive Gmail. The backend now tells you which is available.

### 1. Only show "Connect" when it will actually work
- Read **`GET /api/v1/integrations/connected-apps`** — each provider now includes
  **`oauth_available`** (true only when the deployment has live OAuth + credentials).
- Gmail with **`oauth_available: false`** → **do NOT render a Connect button that redirects to Google.**
  Instead show a muted "**Gmail sign-in isn't set up yet**" state and surface the forwarding/scan option
  (below). If a Connect is ever clicked while unavailable and the API returns 400
  ("gmail OAuth is not configured"), show that message inline — never navigate to Google.
- Gmail with **`oauth_available: true`** → show **"Connect Gmail"** (the proactive option, §3).

### 2. The user-preference feed — forwarding address + Scan (always available)
This is the baseline way to feed job email, no Google app required. Present it on Integrations (and/or a
small "Email job alerts" card):
- **Forwarding address:** `GET /api/v1/inbox/address` → `jobs+<token>@…`. Show it with **Copy**, and a
  one-line "Forward your job alerts here and they'll show up in your matches."
- **Scan now:** a button calling **`POST /api/v1/inbox/scan?source=mailbox`** (or `?source=gmail` when
  Gmail is connected) — show the returned `fetched` / `job_found` / `ingested` counts and that new roles
  were added to matches. This is the P5 scan flow; reuse it. Make clear it reads **only job email**
  (privacy), nothing personal.

### 3. Proactive Gmail (only when `oauth_available`)
- **"Connect Gmail"** → `POST /api/v1/integrations/connect/gmail`, then redirect the browser to the
  returned `authorization_url` (real Google consent). On return, `connected-apps` shows gmail
  `status:"connected"`.
- Label it as the proactive option: "We'll check your Gmail for job alerts on a schedule." After
  connecting, matches refresh from email automatically (the freshness cue on Matches updates).

### 4. Status + disconnect
- Reflect `connected-apps` status per provider: *Not connected · Connected · Expired*, with a
  **Disconnect** (`DELETE /api/v1/integrations/{provider}`) when connected. For email specifically,
  distinguish "forwarding set up" / "Gmail connected (proactive)" so the user knows which feed is on.

### Scope
Display + the connect/scan calls above, gated by `oauth_available`. No new endpoints. Never redirect to
a provider when `oauth_available` is false.

Acceptance: with OAuth unset, the Gmail card shows "not set up" + the forwarding address and a working
**Scan now**, and there is **no** button that bounces to Google's error page; with OAuth set
(`oauth_available:true`), **Connect Gmail** runs the real consent flow and shows Connected.

---

## P14 — Integrations in the sidebar + friendly post-connect (toast + "pull now")

Two small gaps: the **Integrations page isn't reachable from the menu** (users have to type the URL),
and after connecting Gmail the browser lands on a raw `{"connected":"gmail"}` page instead of coming
back into the app. Make it clean and guided. Display + one scan call; no new endpoints.

### 1. Add "Integrations" to the sidebar
Add a left-nav item **Integrations** → `/dashboard/integrations` (an icon like a plug/link). Put it near
account/settings items. Note the existing **"Connections"** item is the *peer network* (social), which
is easy to confuse with connecting apps — consider renaming it **"People"** or **"Network"** so
"Integrations" is clearly the place to connect Gmail / job sites.

### 2. Come back into the app after connecting (not a JSON page)
The OAuth callback redirects to the configured success URL with `?connected=<provider>` or
`?error=<reason>` (the backend var `JOBSEARCH_OAUTH_SUCCESS_REDIRECT` points at
`https://hlrtlg.readdy.co/dashboard/integrations`). On the Integrations page:
- On **`?connected=gmail`** → show a success toast **"Gmail connected ✓"**, refresh the connected-apps
  state so the card flips to **Connected**, and strip the query param from the URL.
- On **`?error=...`** → show a friendly inline message (e.g. "Couldn't connect Gmail — try again"),
  not a stack trace; map `exchange_failed`/`invalid_state`/`access_denied` to plain language.

### 3. Prompt the first pull on connect (the key ask)
Immediately after a successful Gmail connect, **ask the user to run the first import** — don't make them
hunt for the Scan button:
- Show a small prompt/modal: **"Pull your job alerts from Gmail now?"** with a primary **"Pull now"** and
  a secondary "Later".
- **Pull now** → `POST /api/v1/inbox/scan?source=gmail` → show the result inline: **"Added N roles to
  your matches"** (from `ingested` / `job_found`), with a link to **Matches**. Make clear it reads only
  job email.
- "Later" → dismiss; the scheduled reap will pick it up anyway. Don't nag again automatically.

**Scope.** Sidebar entry + success/error handling of the redirect param + a one-time post-connect scan
prompt. No new backend (the scan + connected-apps endpoints exist; the redirect is a server env var).

Acceptance: **Integrations** is reachable from the sidebar; after Connect Gmail the user lands back on
the Integrations page with a "Connected ✓" toast (no JSON page) and is prompted **"Pull your job alerts
now?"**, which runs the scan and reports how many roles were added.

---

## P15 — Auto-apply: make the premiere feature simple (consolidate the 4-tab hub)

Auto-apply is the flagship feature but today its page is a **4-tab hub — Pipeline · Authenticated apps ·
Auto-apply rules · Apply queue** — that **duplicates other pages** and buries the actual automation.
Refocus it so the premiere action is obvious and the duplication is gone. Display/IA only; reuse
existing endpoints.

### The core idea
Auto-apply is **one promise**: *"Project Harbor applies to matching jobs for you — and never sends
without your approval."* The page should make exactly that easy, in a simple top-to-bottom flow, not a
tabbed everything-dashboard. Lead with the safety line prominently.

### 1. Reduce to three clear steps (no tabs)
Lay it out as a simple guided flow:
1. **Connect where you apply** — a compact status of the sites connected for auto-apply (LinkedIn,
   Indeed, …) with a **Connect** that deep-links to **Integrations** (don't rebuild site-connection UI
   here). Show "Connected ✓ / Not connected" per site, nothing more.
2. **Set your rule** — the heart of it: one clear rule builder — *"Auto-apply to roles matching
   {title/keywords}, {location/remote}, ≥ {salary}, fit ≥ {score}"* with a big **On/Off** and the
   standing-rule endpoints already in use. Show the rule in plain English ("On — applies to Senior
   Backend Engineer, remote, ≥$150k, with your approval").
3. **Approve & track** — the **Apply queue** (review → Approve/Skip each pending apply). This is the
   daily action; make it the most visible working area.

### 2. Remove the duplicates (link, don't re-render)
- **Pipeline tab** (Draft/Submitted/Interviewing/Offer + stage board) **duplicates the Applications
  tracker.** Drop the full board here; show at most a tiny summary ("12 in pipeline · 2 interviewing")
  that links to **Applications**. One place to track applications.
- **Authenticated apps tab** **duplicates Integrations/Connections.** Replace with the compact
  connected-sites status in step 1 that links to **Integrations**.
- **"Top matches to add"** **duplicates Matches.** Drop the re-ranked match cards; link to **Matches**
  ("Add more from your matches →").
- The separate **"Approvals"** sidebar item and the **Apply queue** are the same thing — keep **one**
  (the queue in step 3) and point the other at it.

### 3. Clean up the noise
- The **"Project Harbor Connect … update available"** banner is loud — make it a small, dismissible
  chip, not a headline.
- The pipeline/matches are full of **seeded test rows** (e.g. "…z1788415338", "Director of IT Operations
  XYZ" repeated) — those are test data to prune (data cleanup, separate from this UI).

### 4. Keep the trust front-and-center
Keep a persistent, plain line near the top: **"Nothing is submitted without your approval."** Auto-apply
prepares applications; the user approves each from the queue. This is the product's core promise — don't
bury it.

**Scope.** One simple page: connect (→ Integrations) · set rule · approve queue; everything else links to
its canonical page (Applications, Matches, Integrations). Reuse the existing auto-apply rule / queue /
connected-apps endpoints. No new backend.

Acceptance: opening Auto-apply shows a simple three-step flow (connect sites · set rule · approve queue)
with the "nothing sent without approval" promise visible; there are **no** duplicated Pipeline board,
site-connection UI, or match-ranking on the page (each links to Applications / Integrations / Matches);
the rule has one clear On/Off and reads in plain English; and the update banner is a small dismissible
chip.

---

## P16 — Matches: prominent source logo + freshness/added dates + show the real ingested data

Three fixes to the match cards. The backend now returns everything needed — this is display.

### 1. Make the source of each job prominent
Every match says where it came from via **`source_platform`** / **`source_display`** (e.g. `linkedin`,
`indeed`, `glassdoor`, or **`email`** for one surfaced from your connected inbox). Show it clearly on
the card:
- A recognizable **source badge/logo** for the board (LinkedIn / Indeed / Glassdoor / ZipRecruiter /
  Monster / Dice), using `source_platform` to pick the mark; label it with `source_display`.
- For **`source_platform: "email"`**, show a small **inbox badge — "From your inbox"** so the user
  knows it came from a connected email (recruiter outreach / alert), not a board scrape.
- Keep this distinct from the **company** logo (`company_logo`, which may be empty → fall back to a
  company lettermark). Company = who's hiring; source = where we found it. Show both, don't conflate.

### 2. Show both dates (freshness AND when it was added)
Cards currently show no dates. The API now returns two:
- **`posted_ago`** — how fresh the *posting* is ("Posted 3 days ago"). Empty when unknown → hide.
- **`added_ago`** — when it entered *your* matches / was ingested ("Added today", "Added 2 days ago").
Show them together, e.g. **"Posted 5 days ago · Added today"**. Mute an old `posted_ago` (> ~3 weeks)
and tag it "Older" (per P12), so a stale posting is obvious even if it was just ingested.

### 3. Show the real ingested data (nothing fabricated or stale)
- Render match cards **only** from the live `GET /api/v1/jobs/matches` response — never sample/placeholder
  cards, and don't cache a stale list across a refresh. What's on screen must equal what the API returns
  right now (after a scan/reap, the new roles appear on the next fetch/refresh).
- The pool still contains **seeded test postings** ("…z1788415338", "Director of IT Operations XYZ",
  "…QQ/WW/ZZ") that drown the real ones. Those must be **pruned from the account's job pool** (a data
  cleanup, separate from this UI) so the user sees their genuine matches — including the email-sourced
  ones — not test rows.

### Scope
Display of `source_platform`/`source_display`/`company_logo` + `posted_ago`/`added_ago`, straight from
`/jobs/matches`. No new endpoints.

Acceptance: each match card shows a clear **source badge** (board logo, or "From your inbox" for email),
the **company** mark separately, and **"Posted … · Added …"** dates; the list is exactly what
`/jobs/matches` returns (no sample data); and once test postings are pruned, the real ingested matches
(including inbox-sourced ones) are what's shown.

---

## P17 — Matches: show the source board's logo and link straight to it (Hirewave complements boards)

> **Superseded by [P18](#p18--matches-always-resolve-a-board-logo--a-direct-source-link).** P18 keeps
> everything here and fixes the two gaps that showed up live: the badge now uses the normalized
> **`source_slug`** (so Indeed's `match.*` digests read "Indeed", not "Match") and links via
> **`source_url`** (a direct posting link when known, else a board search), so the "go to the source"
> button is never dead. Read P18 for the current spec.

Hirewave surfaces and ranks jobs, but it should **credit and send traffic to the board the job lives on**
— it complements LinkedIn/Indeed/etc., it doesn't hide them. Today the source shows as a tiny 2-letter
chip and the card doesn't clearly go to the real posting. Fix it. Display only (the API now returns a
`source_logo` and the direct `url`).

### 1. Prominent, recognizable source logo
Each match returns **`source_logo`** (the board's logo image), **`source_display`** ("LinkedIn",
"Indeed", …) and **`source_platform`**:
- Show the **board logo** clearly on the card (a real mark, not "in"/"Id"/"Gd" text). Use `source_logo`
  as the image; on load error fall back to a clean text pill with `source_display`.
- Place it as a small, confident **"Via {source_display}"** badge with the logo — visible at a glance,
  not buried.
- Keep it **distinct from the company logo** (`company_logo`): company = who's hiring; source = which
  board we found it on. Show both.

### 2. Link straight to the real posting (the premium source)
- The badge (and the card's primary **"View"** / **"Apply"**) must open the posting's **`url`** — the
  actual listing on that board — in a **new tab** (`target="_blank" rel="noopener"`). This is the
  "send them to the source" behavior: Hirewave ranks it, the board owns the apply.
- Wording like **"View on {source_display}"** makes the destination obvious and gives the board credit.
- Never point "View/Apply" at a dead internal route when a real `url` exists.

### 3. Inbox-sourced matches
For a match surfaced from a connected inbox (`source_platform: "email"`, empty `source_logo`), show a
small **"From your inbox"** badge (an envelope icon) instead of a board logo. If that match has a `url`
(a link the recruiter/alert included), link to it; if not, don't fake a link — just show the badge and
the recruiter/company.

### Scope
Render `source_logo` / `source_display` as a prominent, clickable **"Via {board}"** badge that opens
`url` in a new tab; keep company vs source logos distinct; inbox items get an envelope badge. No new
endpoints.

Acceptance: every match card shows the **source board's logo** (or "From your inbox" for email),
clearly and separate from the company logo; clicking the source badge or **View** opens the real posting
on that board in a new tab; and nothing routes to a dead internal page when a `url` exists.

---

## P18 — Matches: always resolve a board logo + a direct source link

Finishes P16/P17. The source badge was showing the raw word **"Match"** with no logo and no working
link, because those jobs came from Indeed's "jobs that match you" digests (`source_platform: "match"`)
and had no individual posting URL. The backend now normalizes and resolves this for you — **this prompt
is display only**, no new endpoints. Each match (and each saved/applied job card) now returns:

- **`source_slug`** — the *canonical* board key, already de-aliased: `match` → `indeed`, `li` →
  `linkedin`, etc. **Use this (not `source_platform`) to pick the brand mark.** `"email"` means it came
  from the connected inbox.
- **`source_display`** — the clean board name for that slug ("LinkedIn", "Indeed", "Glassdoor",
  "Monster", "ZipRecruiter", "Dice", "CareerBuilder", "SimplyHired", …). Never shows a cryptic alias.
- **`source_logo`** — the board's logo image URL (empty only for inbox-sourced).
- **`source_url`** — **where to go to reach the source**: the direct posting link when we have one,
  otherwise a **board search for this exact role** on that board (e.g. an Indeed search for the title +
  company). This is **always populated for a known board**, so the "go to the source" action is never
  dead. (Empty only for inbox-sourced jobs with no link.)

### 1. Prominent, recognizable board logos
For the boards the user named and every other known board — **LinkedIn, Glassdoor, Indeed, Monster,
ZipRecruiter, Dice, CareerBuilder, SimplyHired, Wellfound, Greenhouse, Lever** — show a confident,
instantly recognizable brand badge on each card, keyed by **`source_slug`**. **Logo render order (three
tiers, in this priority):**
  1. **Crisp brand icon by `source_slug`** — a built-in brand-icon set (e.g. Simple Icons: `indeed`,
     `linkedin`, `glassdoor`, `monster`, `ziprecruiter`, `dice`, …) rendered in the board's brand color.
     Sharpest at small sizes; use it as the primary when the slug is in the set.
  2. **`source_logo` as an `<img>`** — the backend now returns a **working** logo URL (a real favicon PNG;
     we moved off the dead Clearbit endpoint, so these resolve with HTTP 200). Render it directly, and use
     it as the fallback when the slug isn't in your icon set, with `onerror` → tier 3.
  3. **Text pill** with **`source_display`** — last resort if both images fail.
- Never render the raw slug or a 2-letter stub ("ma", "Match", "li"), and don't leave the badge empty —
  one of the three tiers always produces something.
- Make it a **"Via {source_display}"** badge with the logo — prominent at a glance, placed consistently
  (e.g. top-right of the card or beside the title), not buried in small print.
- Keep it **distinct from the company logo** (`company_logo`): company = who's hiring; board = where
  Hirewave found it. Show both.

### 2. One obvious, always-working link to the premium source
- The source badge **and** a clear secondary action labeled **"View on {source_display}"** both open
  **`source_url`** in a **new tab** (`target="_blank" rel="noopener noreferrer"`).
- Because `source_url` falls back to a role-specific board search, this works even for digest/recruiter
  matches with no direct posting URL — the user still lands on that board, searching for this role.
- Treat this as Hirewave being **complementary, not adversarial**: Hirewave ranks and explains the match;
  the board owns the listing and the apply. Give the board the credit and the click.

### 3. Inbox-sourced matches (unchanged)
When `source_slug` is `"email"` (empty `source_logo`/`source_url`), show the small **"From your inbox"**
envelope badge instead of a board logo, and don't fabricate a link.

### Scope
Display of `source_slug` / `source_display` / `source_logo` / `source_url` (and the same four fields now
on saved/applied **job cards**) as a prominent, clickable **"Via {board}"** badge + a **"View on
{board}"** action opening `source_url` in a new tab. No new endpoints.

Acceptance: no match ever shows a raw/cryptic source word — Indeed `match.*` digests read **"Indeed"**
with the Indeed mark; every known board (LinkedIn/Glassdoor/Indeed/Monster/ZipRecruiter/Dice/…) shows a
recognizable logo distinct from the company logo; the source badge and **"View on {board}"** both open
`source_url` in a new tab and are never dead (digest/recruiter matches open a board search for the role);
inbox-sourced matches show the envelope badge with no fake link.

---

## P19 — Simplify the whole app: consolidate the 23-item menu, rename for humans, and make Community a real (basic) social network

Two jobs in one pass. **(A)** The left sidebar has grown to **23 flat, ungrouped destinations** — overwhelming, and several are two doors to the same feature. Consolidate to **~8 grouped items** and rename them in plain language. **(B)** Turn the scattered social pages into one **Community** hub that behaves like a basic social network: you choose who you connect with, you can chat and share only with accepted connections, and the crowdsourced interview questions live here too.

**This is a frontend / information-architecture change.** Every endpoint named below is already LIVE — **no new backend** (one small, clearly-marked optional follow-up at the end). Standard assumptions: verify on the **published** site (`hlrtlg.readdy.co`), Bearer token on every call, no infinite spinners, null-safe.

### A. The new top-level menu (23 → 8), grouped

Replace the flat list with these **grouped** sections (group headers are labels, not links):

**Find & apply**
1. **Dashboard** — `/dashboard` (home).
2. **Jobs** — `/dashboard/matches`. The single jobs home (see §D). Absorbs **Saved searches**, **Saved jobs**, **Flagged jobs** as tabs/filters — they are **removed as separate menu items**.
3. **Applications** — `/dashboard/applications` (the tracker).
4. **Auto-apply** ⭐ — `/dashboard/auto-apply`. Absorbs **Assistant** (see §E) — **Assistant is removed as a menu item**.

**Prepare**
5. **Documents** — `/dashboard/documents` (résumés + cover letters).
6. **Inbox** — `/dashboard/inbox` (the grouped job-email reader from P5).
7. **Practice interviews** — `/dashboard/interview` (the solo AI mock interview; rename from "Interviews (AI)").

**Connect**
8. **Community** — `/dashboard/community` (the social hub, see §C). Absorbs **People/Network**, **Messages**, **Boards**, **Community questions**, and **Peer practice** — all **removed as separate menu items** and become tabs inside Community.

**Bottom of sidebar (secondary, visually separated):**
- **Settings** — `/dashboard/settings`. Absorbs **Profile**, **Job preferences**, **Integrations**, **Reminders**, **Security**, **Tester program** as sections/sub-pages — all **removed from the primary menu** (see §F).

Keep the existing routes working (so deep links/bookmarks don't break) — this is about what appears in the **menu** and how pages are grouped, not deleting routes. Old routes can redirect to their new home (e.g. `/dashboard/network` → `/dashboard/community?tab=people`).

### B. Renaming map (plain-language labels)

| Old menu label | New label | Why |
|---|---|---|
| Interviews (AI) | **Practice interviews** | Drop the clunky "(AI)" parenthetical |
| Community (→ `/questions`) | *(moves into Community as the **Questions** tab)* | The label described a forum but opened a question bank |
| People | *(Community → **People** tab)* | "People" alone was ambiguous |
| Messages | *(Community → **Messages** tab)* | — |
| Boards | *(Community → **Groups** tab)* | "Boards" read as job-boards/kanban |
| Peer practice | *(Community → **Practice** tab)* | It needs a connection — inherently social |
| Assistant | *(removed → folded into Auto-apply)* | Duplicated Auto-apply |
| Saved searches / Saved jobs / Flagged jobs | *(Jobs tabs)* | All are views of jobs |
| Tester program | *(Settings)* | Not a primary destination |

### C. Community — a basic social network (the main build)

One page at `/dashboard/community` with a tab bar. **Consent is the spine: you only connect with people you invite or who invite you, and messaging/practice is limited to accepted connections.** Tabs:

**1. People** (connections + who may connect)
- Your connections: `GET /api/v1/social/connections`. On each, a kebab/overflow menu with **Remove** and **Block**.
- Pending invitations waiting on **your** approval, with **Accept**: `GET /api/v1/social/invites`, `POST /api/v1/social/invites/accept { code }`.
- Invite someone (you control who joins your circle): `POST /api/v1/social/invites` (returns a shareable code/link) and `POST /api/v1/social/invites/email { email }`.
- **Remove a connection:** `DELETE /api/v1/social/connections/{user_id}` — disconnects (either side can); they can reconnect later via a fresh invite. Confirm first ("Remove {name}? You can reconnect with a new invite.").
- **Block someone:** `POST /api/v1/social/blocks/{user_id}` — removes the connection *and* stops all messaging and reconnection until unblocked; it's **silent** (they aren't told). A **Blocked** sub-section lists `GET /api/v1/social/blocks` with an **Unblock** action (`DELETE /api/v1/social/blocks/{user_id}`; unblocking does not auto-reconnect). Confirm blocks too.
- Make it explicit in copy: *"You decide who connects. Requests wait for your approval, and only accepted connections can message you — and you can remove or block anyone, anytime."*

**2. Messages** (chat — connections only)
- Thread list: `GET /api/v1/social/threads`. Conversation: `GET /api/v1/social/messages/{other_id}`. Send: `POST /api/v1/social/messages { to_user_id, body, shared_job_id? }`.
- **Only show "Message" affordances for accepted connections.** Do not allow composing to a non-connection.
- **Sharing:** a message can carry a job (`shared_job_id`) — render the shared job as a little card in the bubble (title + company, link). Add a "Share to a connection" action on job cards that opens a compose-to-connection sheet.

**3. Groups** (formerly Boards — communities to share leads/referrals)
- Mine + discover: `GET /api/v1/boards`, `GET /api/v1/boards/discover`. Create/join/leave: `POST /api/v1/boards`, `POST /api/v1/boards/join { board_id | code }`, `DELETE /api/v1/boards/{id}/membership`.
- Inside a group: members `GET /api/v1/boards/{id}/members`; feed `GET /api/v1/boards/{id}/posts`; post `POST /api/v1/boards/{id}/posts { body, shared_job_id? }` (posts can share a job too).

**4. Questions** (the crowdsourced interview-question bank — moved here per request)
- Browse/search by job title: `GET /api/v1/questions/search?title=…`, titles `GET /api/v1/questions/titles`, mine `GET /api/v1/questions/mine`.
- Contribute: `POST /api/v1/questions { job_title, question, category, tips }`. Upvote / flag: `POST /api/v1/questions/{id}/vote`, `POST /api/v1/questions/{id}/flag`.
- Framing: *"Real interview questions shared by the community — study up, then pay it forward."*

**5. Practice** (live peer mock interview with a connection)
- Sessions `GET /api/v1/practice`; invite a **connection** `POST /api/v1/practice { guest_id }`; accept + live signalling via the existing practice/WebRTC endpoints. Only offer "Practice together" from an accepted connection.

**Community conventions:** one consistent empty state per tab ("Invite a friend to get started", etc.); a connection's mini-profile (name + a "Message"/"Practice together" action) is the hub that ties People ⇄ Messages ⇄ Practice together; never expose another user's email or ids in the UI.

### D. Jobs — one home, not four menu items
`/dashboard/matches` becomes **Jobs** with a simple filter/tab row: **Matches** (default), **Saved** (`GET /api/v1/jobs/saved`), **Flagged** (community-reported dubious postings — keep the safety framing), and **Manage searches** (the saved-search list + "Run now", pulled in from the old Saved-searches page). Running or editing a search happens here; it should never feel like a separate destination.

### E. Auto-apply absorbs Assistant
The **Assistant** page ("Automation assistant": auto-prepare drafts / auto-fill / auto-submit toggles + activity log) is the **settings + activity** half of **Auto-apply**. Fold it in:
- Its permission toggles become an **"Automation settings"** panel inside Auto-apply (keep "nothing is submitted without your approval" prominent).
- Its **activity log** becomes Auto-apply's history/activity view.
- "Prepare drafts now" is Auto-apply's prepare action. Endpoints: the existing `/api/v1/assistant/*` and `/api/v1/auto-apply/*` — just surfaced under one page. Remove the standalone Assistant menu item.

### F. Settings absorbs the account cluster
`/dashboard/settings` gets sections (tabs or a sub-nav): **Profile** (`/profile`), **Job preferences** (`/preferences`), **Integrations/Connections** (`/integrations` — the one true home for all connections; Auto-apply's "Manage connections" and Inbox's "Connect Gmail" link here instead of duplicating it), **Reminders** (`/reminders`), **Security & privacy** (`/security`), and **Tester program** (`/tester`). None of these appear in the primary menu anymore.

### Scope
Menu consolidation + grouping + renaming, Community assembled from the live `social`/`boards`/`questions`/`practice` endpoints, Jobs/Auto-apply/Settings regrouping. Keep old routes alive (redirect to new homes). **No new backend**, with one exception noted below.

Acceptance: the sidebar shows ~8 grouped items (not 23); there is no standalone **Assistant**, **Saved searches**, **Saved jobs**, **Flagged jobs**, **People**, **Messages**, **Boards**, **Community (questions)**, **Peer practice**, **Profile**, **Job preferences**, **Reminders**, **Security**, or **Tester** menu entry — each lives inside its new parent; **Community** opens a tabbed hub where the user can accept/decline connection requests, message and share a job **only** with accepted connections, join groups, browse/contribute interview questions, and start a peer practice with a connection; Jobs shows Matches/Saved/Flagged/Manage-searches as tabs; Auto-apply contains the former Assistant toggles + activity; Settings contains the six account sections; old deep links still resolve.

> **Backend note:** remove/block is now **built and live** (added after the first P19 build): `DELETE /api/v1/social/connections/{id}` (remove), `POST`/`DELETE /api/v1/social/blocks/{id}` (block/unblock), `GET /api/v1/social/blocks` (list). Blocking is symmetric (neither side can message or reconnect) and silent; only the blocker can unblock. If the Community page was built before these existed, apply the small **P19b** patch below to wire up the Remove/Block controls.

---

## P19b — Patch: wire Remove/Block into Community → People (endpoints now live)

Small follow-up to P19. The Community **People** tab already lists connections and pending invites; add member management now that the endpoints exist. Display only, no new backend.

On each row in **Your connections**, add an overflow (⋯) menu:
- **Remove** → `DELETE /api/v1/social/connections/{user_id}` (204). Confirm: *"Remove {name}? You can reconnect with a new invite."* On success drop the row; messaging to them stops.
- **Block** → `POST /api/v1/social/blocks/{user_id}` (204). Confirm: *"Block {name}? This removes the connection and stops all messages. They won't be told."* On success drop the row.

Add a **Blocked** sub-section (collapsed when empty):
- List: `GET /api/v1/social/blocks` → `[{ user_id, name }]`.
- **Unblock** on each → `DELETE /api/v1/social/blocks/{user_id}` (204). Note it does **not** reconnect — they re-invite as usual.

Rules: blocking/removing is instant and client-confirmed; blocking is **silent** (never notify the blocked user); only the blocker sees/unblocks their own blocks; a blocked pair can't accept each other's invites (the API returns 400 — surface it as *"You've blocked this person — unblock to reconnect."*). Acceptance: a user can remove or block any connection from People, see their Blocked list, and unblock; a removed person can be re-invited, a blocked one cannot until unblocked.

---

## P20 — Interview: "Suggest a response" (transcribed into the card) + a saved-answers library

Add a coach to the interview section that drafts a brief, résumé-grounded reply to any
question, **types it out live in the card**, and lets the user **save** answers to re-read
and print — so they learn effective phrasing and techniques. Backend is LIVE; this is display.

### 1. "Suggest a response" on a question
Anywhere a question is shown (the Question Bank in Community, interview prep, a custom
question the user types), add a **"Suggest a response"** button.
- Call **`POST /api/v1/interview/suggest-answer`** `{ question, resume_id?, job_posting_id? }`
  (pass the user's selected résumé id when known, so the answer is grounded in it; and the
  target job id when there's one). Response:
  `{ question, category, answer, tips, answer_seconds }`.
- The `answer` is a brief (3–5 sentence) reply grounded strictly in the user's résumé/profile
  — never fabricated. `category` is the question type (intro/behavioral/technical/…), `tips`
  is the technique for that type, `answer_seconds` is a spoken-answer time budget.

### 2. Transcribe it into the card (visible typing)
When the answer returns, **render it with a typewriter/transcription effect inside the card**
— reveal it progressively (e.g. a few characters or a word at a time, ~30–60 ms/word) with a
blinking caret while "typing," so it reads like it's being spoken/written out, not pasted.
- Show a subtle **"Suggesting…"** state while the request is in flight (AbortController ~30 s;
  on error → a Retry affordance, never an infinite spinner).
- Below/beside the answer, show the **category chip**, the **tips** line, and the
  **answer_seconds** as a "~90s" target badge.
- Keep it honest: label it a **suggestion** ("A starting point — make it yours"), and if the
  answer says the résumé lacks a relevant example, surface that plainly rather than hiding it.

### 3. Save answers to a personal library (read + print)
A **Save** action on the card keeps the answer for later study:
- **`POST /api/v1/interview/saved-answers`** `{ question, answer, category?, tips?, source, resume_id?, job_posting_id? }`
  where `source` = **"suggested"** (saved as-is), **"edited"** (user tweaked the text first), or
  **"own"** (user wrote it). Let the user lightly **edit the answer before saving** (so they can
  make it their own) — save with `source:"edited"` then.
- A **"Saved answers"** view/tab lists **`GET /api/v1/interview/saved-answers`** (most recent
  first): each shows the question, category chip, the answer, tips, and a source label.
- **Read & print:** each saved answer is readable in full; add a **Print** action (a clean
  print stylesheet, or `window.print()` on a print-friendly list) so the user can print their
  answers to study phrasing and techniques offline. **Remove** → `DELETE /api/v1/interview/saved-answers/{id}`.

### Scope
Display + the four live endpoints (`/interview/suggest-answer`, `POST`/`GET`/`DELETE`
`/interview/saved-answers`). The typewriter effect is purely client-side over the returned
text. No new backend.

Acceptance: "Suggest a response" on any question returns a grounded reply that **visibly types
itself into the card** with a category + tips + time badge; the user can edit it, **Save** it,
see it in a **Saved answers** list, **print** that list, and delete entries; saved answers are
private to the user and persist across sessions; nothing fabricates facts not in the résumé.

---

## P21 — Make "Sign in with Google" actually log the user in (backend OIDC flow)

The current "Continue with Google" button is wired to the Gmail-*connect* OAuth and never creates a session, so it always fails. Repoint it at the real **backend Google-login** flow (now LIVE). This is a full-page redirect flow — **no Firebase, no client-side Google SDK, no client secret in the browser.**

### 1. Start login = navigate to the backend
"Continue with Google" (on both the login and sign-up screens) should do a **full-page navigation** to:
```
GET {API_BASE}/api/v1/auth/google/login
```
(where `{API_BASE}` is the same backend origin the rest of the app calls). Don't `fetch()` it — it issues a 302 to Google; let the browser follow it. Don't build any Google URL yourself; the backend holds the state + PKCE.

### 2. Receive the session on return
After the user approves, the backend redirects the browser to your configured **callback route** with the session tokens in the **URL fragment**:
```
{login_success_redirect}#access_token=<JWT>&refresh_token=<JWT>&token_type=bearer
```
(On failure it's `{login_success_redirect}#error=<reason>` — e.g. `invalid_state`, `exchange_failed`, `signups_closed`.)

Build a small **callback route** (e.g. `/auth/callback`) that, on mount:
1. Parses `window.location.hash` (strip the leading `#`, read `access_token` / `refresh_token` / `error`).
2. On tokens: store them exactly where the app keeps them today (**`hw_access`** / **`hw_refresh`** in localStorage), **clear the hash** (`history.replaceState` so the tokens aren't left in the address bar/history), then redirect to `/dashboard`.
3. On `error`: redirect back to `/auth/login` and show "Google sign-in failed — {reason}".
4. Null-safe: if the hash has neither tokens nor error, send them to `/auth/login`.

This callback URL must equal the backend's `JOBSEARCH_LOGIN_SUCCESS_REDIRECT` env var (set to `https://hlrtlg.readdy.co/auth/callback`).

### 3. Keep email+password as-is
The existing email/password form already works — leave it. This only fixes the Google button.

### Scope
Repoint the Google button to `{API_BASE}/api/v1/auth/google/login` + add the fragment-reading `/auth/callback` route. No other backend calls; tokens arrive via the fragment.

Acceptance: clicking "Continue with Google" sends the user to Google, and after approving they land logged-in on the dashboard with `hw_access`/`hw_refresh` stored; the tokens are not left in the URL; a denied/failed sign-in returns to the login page with a readable message; email+password login is unaffected.

---

## P22 — Consistent experience across devices (hydrate preferences + UI state from the server)

The backend already persists per-user state server-side (profile + job preferences, saved jobs/searches, applications, documents, interview history, onboarding, **recently-viewed**, and a general **view-state** store). Make the frontend actually **read from and write to** those so a user who logs in on another device/browser picks up where they left off. **This is frontend wiring only — all endpoints are LIVE.**

### Principle
**Server is the source of truth; `localStorage` is only a per-device paint cache.** Keep the auth tokens (`hw_access`/`hw_refresh`) in `localStorage` (device-local is correct), but **do not** keep durable user state (preferences, filters, last tab, drafts) only in `localStorage` — it won't follow the user.

### 1. Hydrate on load (after auth)
Right after sign-in / app boot, fetch and apply:
- **Job preferences** from the profile (categories, locations, salary, seniority) → use them to set the Matches category chips, default filters, and search defaults.
- **View-state**: `GET /api/v1/view-state` (all) or `GET /api/v1/view-state/{view}` per page → restore that view's UI state (active tab, filters, sort, expanded/collapsed sections).
- **Recently-viewed**: `GET /api/v1/recently-viewed` → the "jump back in" rail.

### 2. Persist UI state as it changes
When the user changes a durable per-view setting (active tab, filter, sort order, selected résumé, collapsed panels), write it:
- `PUT /api/v1/view-state/{view}` with the view's state object (debounce ~500 ms; it's a small JSON blob per view). Optionally mirror to `localStorage` for instant repaint, but treat the server copy as authoritative and reconcile on load.
- `DELETE /api/v1/view-state/{view}` to reset a view.

### 3. Record opens for "jump back in"
When the user opens a résumé, match, application, or interview, record it:
- `POST /api/v1/recently-viewed` `{ kind, ref_id, title, subtitle, view }` so the rail is the same on every device.

### 4. Preferences are edited in one place, read everywhere
Saving job preferences (categories/locations/salary/seniority) must `PUT` them to the profile/preferences endpoint (not just local state), and every surface that filters (Matches, Jobs, saved searches) reads those same saved preferences — so changing them on a laptop changes them on a phone.

### Scope
Frontend hydration + persistence against the live `view-state`, `recently-viewed`, and profile/preferences endpoints. Tokens stay device-local. No backend changes.

Acceptance: set a filter/active-tab/sort and a category preference on one device, log in on another → the same preferences, view state, and recently-viewed rail are restored; changing preferences on either device reflects on both; nothing durable is lost by clearing one device's `localStorage` (it re-hydrates from the server).

---

## P23 — Auto-apply: a simple, pre-filled rule (stop making users fill a blank complex form)

Setting up an auto-apply rule is currently a complicated blank form, so nobody completes it. Make it **arrive pre-filled** from what we already know about the user, with advanced options tucked away. Backend is LIVE (new `GET /api/v1/auto-apply/suggested-criteria`).

### 1. Pre-fill the rule from the user's own data
When the user opens "Create rule" / "Set up auto-apply", first call:
```
GET /api/v1/auto-apply/suggested-criteria
```
→ `{ criteria: { title_keywords[], locations[], remote, sources[], min_fit_score }, suggested: { max_submits, daily_cap, mode, require_verified }, basis: { from_preferences, roles_ingested, top_categories[] } }`
These are derived from the user's **saved job preferences** and the **roles already ingested** into their matches. Use them as the **default field values** — the form opens populated (editable), not empty. Show a one-line note from `basis` like *"Based on your preferences and N roles in your matches"* (or *"Based on your matches"* when `from_preferences` is false).

### 2. One-click primary path
Lead with a single **"Create rule from my matches"** button that just POSTs the suggested values to `POST /api/v1/auto-apply/grants` (`scope: "criteria"`, the returned `criteria`, and the `suggested` caps/mode). Most users should finish in one click.

### 3. Collapse the complexity
Keep only the essentials visible: **title keywords**, **locations**, **remote**, **min fit**, and the **daily cap** (as a friendly "apply to up to N/day" stepper). Put everything else — companies allow/deny, sources, max total, expiry, auto-vs-assisted mode — behind an **"Advanced options"** disclosure, collapsed by default. Explain mode in plain words: **Assisted** = "prepares each application, you click submit" (recommended / required for LinkedIn); **Auto** = "submits automatically after it passes your rule," with the "nothing is sent without your approval" promise still shown.

### 4. Sensible defaults (not 10)
Default the cap to the endpoint's `suggested` values (**25 total / 10 per day**), not the old hard 10. Default **mode = assisted**. Keep `require_verified` on.

### Scope
Pre-fill the rule form from `/auto-apply/suggested-criteria`, add a one-click "from my matches" create, collapse advanced fields. The create call is the existing `POST /auto-apply/grants`. No other backend changes.

Acceptance: opening the rule form shows fields already populated from the user's preferences/matches with a plain-language basis note; "Create rule from my matches" makes a working grant in one click; advanced options are hidden by default; the default caps are higher than 10; mode defaults to assisted with a clear explanation.

---

## P24 — Fix the auto-apply rule card: status toggle + Run (stop the "status field required" error)

Two bugs on the saved auto-apply rule card. Backend is correct and unchanged — these are frontend request/display fixes.

### 1. The active/pause toggle must send `{ status }`
The toggle calls `PATCH /api/v1/auto-apply/grants/{grant_id}` **with a JSON body** `{"status": "active"}` to enable or `{"status": "paused"}` to pause (allowed values: `active`, `paused`, `revoked`). Right now it's sending no body (or the wrong key), so the API returns **422 "status field required"** — that's the red error the user sees. Fix: always send `{ status: "<new state>" }`, `Content-Type: application/json`. The response is the updated grant; use it to re-render the toggle.

### 2. Render the toggle from the grant's real `status`
A newly-created grant comes back with **`status: "active"`**, so the toggle must read the grant's **`status`** field and show **on when `status === "active"`**, off when `paused`. Don't default the control to off/disabled — that's why an active rule looked disabled. (If you were keying the toggle off some other field like `mode`, switch it to `status`.)

### 3. Run is a separate call — don't fire the status PATCH on Run
"Run" is `POST /api/v1/auto-apply/grants/{grant_id}/run` with body `{ "dry_run": false }` (or `{ "dry_run": true }` to preview) — both fields optional, an empty `{}` is valid. It returns a RunResult (`eligible`, `attempted`, `submitted`, `outcomes[]`) → show that as the success message. **Do not** also call the status PATCH as a side effect of Run (that's what produced the simultaneous green-success + red-"status field required"). Only the toggle calls PATCH, and only with a `status`.

### 4. Surface run results clearly
After Run, show the counts from the result (e.g. "Prepared 3 · 0 submitted" in assisted/simulate) and, if `submitted`/prepared > 0, point the user to the **approvals/queue** to approve. In assisted mode nothing is sent without approval.

### Scope
Frontend only: send `{status}` on the toggle PATCH, drive the toggle from the grant's `status`, keep Run independent. No backend change.

Acceptance: toggling a rule enables/pauses it with no error and the toggle reflects the saved `status`; a freshly-created rule shows as **active**; pressing Run shows only the run-result success (no "status field required"); approvals/queue reflect what a run prepared.

---

## P28 — Show which version went to which job, everywhere a document appears

Users keep several tailored versions of a résumé/cover letter; they need to see, at a glance, **which version was tailored for which job and which jobs each version was applied to** — wherever a document is previewed, or recorded as saved/applied. Backend is LIVE; display only.

### Data (new/updated endpoints)
- **Version usage:** `GET /api/v1/resumes/{id}/version-usage` and `GET /api/v1/cover-letters/{id}/version-usage` →
  `[{ version, label, change_summary, source, created_at, tailored_for: { job_posting_id, title, company } | null, applied_to: [ JobCard ] }]`.
  `tailored_for` = the job the version was created/tailored for; `applied_to` = every job that exact version was applied to.
- **Applications now record the version used:** each application (`GET /applications`, the tracker) includes **`resume_version`** and **`cover_letter_version`** (0 = the doc's live text, no explicit version).

### Where to show it
1. **Document preview / versions marquee (the editor).** For each version in the list, show its **label** + two badges: **"Tailored for {company}"** (from `tailored_for`) and **"Applied: {companies}"** (from `applied_to`, e.g. "Applied: Acme, Globex" or "Not applied yet"). The currently-previewed version highlights its own linkage. Make `applied_to`/`tailored_for` company chips click through to the job (its `job_posting_id` / the job's source link).
2. **Applications tracker (recorded as applied).** On each application row/card, show **which version** was used: "Résumé — {version label or 'v{resume_version}'}" and, if present, "Cover letter — v{cover_letter_version}". Link it to that version in the editor. This answers "what did I send to this job?"
3. **Saved jobs (recorded as saved).** If any version's `tailored_for` matches a saved job, surface a small **"Tailored résumé ready (v{n})"** hint on that saved-job card linking to the version; otherwise show nothing.
4. **Wherever a résumé/cover-letter preview is embedded** (tailor view, reuse suggestion, match "quick apply" sheet) — show the active version's label + its tailored-for/applied-to summary, so the linkage travels with the preview.

### Scope
Display of the live `version-usage` endpoints + the `resume_version`/`cover_letter_version` fields on applications. No new backend.

Acceptance: in the editor each version shows what it was tailored for and the jobs it was applied to; the applications tracker shows which version was sent to each job; saved jobs with a matching tailored version surface it; every embedded preview carries the same version↔job linkage. Nothing shows a version with no way to see where it went.

---

## P29 — One prominent Résumé ⇄ Cover letter toggle that drives the whole Workspace

Right now the only way to switch document type is the small "Résumés / Cover letters" chooser at the **bottom** of the versions marquee, and it only re-lists versions — the **preview, the AI summary, and the side-panel tabs stay on the résumé**. Users can't tell they're even looking at two different documents. Make the switch **one obvious control** that flips **everything in the Workspace at once**, so the editor information always follows the selected type. Both types already exist server-side (`/resumes/*` and `/cover-letters/*`); this is **layout/state only — no new backend**.

### A. The toggle
- A single **segmented toggle — `[ Résumé | Cover letter ]`** — placed at the **top of the Workspace**, above the shared preview (and mirrored in the versions-marquee header), where it's the first thing you see. Not buried under the marquee. Use the same control in both spots, bound to one shared state; remove the old bottom-only chooser (or make it the same bound control, not a second independent one).
- Each side shows a count when known (e.g. "Résumé · 1", "Cover letter · 2") and is disabled with a gentle "No cover letter yet — create one" affordance if the user has none, rather than switching to an empty editor.
- Keyboard + obvious active state (filled segment), works on mobile (full-width segmented control, large tap targets).

### B. What the toggle must switch — all together, as one `activeDocType`
Flipping the toggle re-points the **entire** Workspace at the chosen document, in one action:
1. **The shared preview** — renders the selected document's active version (`GET /{docType}/{id}` + `…/versions/{v}/render`), not the résumé's.
2. **The versions marquee** — lists that document's versions and its `version-usage` (P28) linkage.
3. **The right-hand tabbed panel** — swaps to that type's tab set and endpoints: résumé → Ask AI · My Work Highlights · Bullets · Manual edit · Design · Versions; **cover letter → the reduced set** (Ask AI · Manual edit · Design · Versions), per P7. Point every tab's calls at `/cover-letters/{id}/…` when a cover letter is active (`ai-edit`, `versions`, `replace`, templates), and hide the résumé-only tabs so no cover-letter action ever hits a résumé endpoint.
4. **The AI summary / "what changed" cue / header title** — all reflect the active document.

### C. State rules
- One source of truth: `activeDocType` ∈ { `resume`, `cover_letter` } plus the active id for each. Switching **preserves each side independently** — flip to cover letter, edit, flip back, and the résumé is exactly where you left it (same `selectedVersion`, same open tab, same in-progress review). Don't reset the résumé when you touch the cover letter.
- Remember the last-used type per session (so reopening the Workspace lands where the user was), null-safe: if the remembered cover letter was deleted, fall back to résumé without an error.
- Deep links / entry CTAs carry the type (opening a cover letter from the Documents list lands with the toggle already on "Cover letter"). Global P0 rules still apply (token refresh, null-safe render on 200, Retry not infinite spinners).

### D. Scope
Frontend state + layout only. No new endpoints — reuse the live `/resumes/*` and `/cover-letters/*` routes already wired by P7/P28. Deterministic; the only AI is the same per-tab AI already in use.

Acceptance: a single, clearly visible Résumé ⇄ Cover letter toggle sits above the preview and in the marquee header everywhere a document is shown; flipping it switches the preview, the versions marquee + P28 linkage, and the side-panel tabs/endpoints together in one action; cover letter shows the reduced tab set and never calls a résumé endpoint; each side keeps its own version/tab/review state across switches; and with no cover letter yet the control invites creating one instead of showing an empty editor.

---

## P30 — Fix the marquee card: constrain the preview to the page, pop it out on hover

The version cards in the marquee **auto-zoom the résumé thumbnail to fill the whole card**, so the page image bleeds down over the version info (label, "Tailored for …", "Applied: …", change summary, date) — making the new P28/P29 linkage **unreadable and un-clickable**. Fix the card so the preview occupies **only its own page-shaped box** and the info area is always clear and interactive, and let the card **pop out on hover** so the details read easily. Layout/CSS only — **no backend, no data changes**.

### A. Constrain the preview to the résumé's own dimensions
- The thumbnail renders at the **document's page aspect ratio** (letter/A4), inside a **fixed preview box at the top of the card** — not stretched to the card's remaining height. Use `object-fit: contain` (or scale by the smaller of width/height fit) so the whole page shows with **no overflow and no crop**; letterbox with the card background if the ratios don't match. The preview must **never paint outside its box** — clip it (`overflow: hidden`) so it can't cover the text below.
- Below the preview, a **dedicated info region** (its own flex row/stack, not overlapping the image) holds the label, the P28 badges ("Tailored for {company}", "Applied: …"), change summary, date, and the action buttons. This region is always fully visible and clickable; the preview never sits on top of it. Give the badges/links real hit targets (they're interactive per P28).
- Kill any transform/scale that was being applied to make the image "fill" the card. One consistent preview box size across all cards so the rail reads evenly.

### B. Pop out on hover (and on keyboard focus) to read it
- On **hover or focus**, the card **lifts and scales up** (e.g. a larger floating version of the same card, or an elevation + modest zoom) **above its neighbors** (raise `z-index`, soft shadow), revealing the full info — long "Applied:" lists, the full change summary, full label — at a comfortable size. It returns on mouse-out / blur.
- The pop-out must not clip at the rail's edges (render above the scroll container / use a portal-style layer) and must not steal the click: the buttons inside stay usable while popped. Keep it smooth (CSS transition), respect `prefers-reduced-motion` (fade/elevate without the scale), and keep it touch-friendly (tap to expand on mobile, where there's no hover).
- Don't shift the rail layout when a card pops (overlay, don't reflow neighbors).

### C. Scope
Pure presentation: card layout, the preview box aspect/clip, and the hover/focus pop-out. No endpoint, data, or state changes — the same version data (P2.1 marquee + P28 linkage) just becomes legible and clickable.

Acceptance: every marquee card shows the full résumé page inside a fixed, page-shaped box with no overflow onto the text; the version label, tailored-for/applied-to linkage, change summary, date and action buttons sit in a clear region below and are always clickable; hovering or focusing a card pops it out above its neighbors at a larger, easily readable size without clipping or blocking its buttons, and collapses again on leave; reduced-motion and touch are handled.

---

## P31 — Matches: pull the full job description (so tailoring has something to work with)

Many matches arrive from email alerts / board digests with **only a title, company and link** — their description is a one-line placeholder, so match scores, résumé review and cover-letter tailoring have nothing concrete to target. A new backend endpoint fetches each posting's own URL and extracts the **real** job description (schema.org JSON-LD first, then meta) — provider-agnostic. Wire it into Matches so users can fill in the detail. Backend is LIVE.

### Endpoint (new)
- `POST /api/v1/jobs/enrich-descriptions?limit={n}&job_ids={csv}` → `{ candidates, checked, enriched, enriched_job_ids, remaining }`.
  - No `job_ids` → enriches any of the user's matches that still have a placeholder/thin description (up to `limit`, default 25, max 100).
  - `job_ids` (comma-separated) → target specific cards.
  - Best-effort and idempotent: a card with a real description is left alone; an unreachable/auth-walled posting (e.g. a logged-out LinkedIn page) is simply skipped, not failed. `remaining > 0` means call again to continue.

### UX
1. **Matches header action — "Get full descriptions."** Shows when any visible match is missing a real description. Clicking calls `enrich-descriptions` (no `job_ids`), shows a quiet progress state, and when `remaining > 0` keeps calling until it reaches 0 or the user stops. On finish: a toast — "Added full descriptions to {enriched} jobs." Then refresh `GET /jobs/matches` so scores/snippets update.
2. **Per-card "Get description."** On a card whose description is still a placeholder, a small inline action calls the endpoint with that one `job_ids={id}`, then updates just that card. If it comes back not-enriched (board blocked), show a subtle "Couldn't load — open on {board}" linking to the source URL instead of an error.
3. **Auto-enrich after a pull.** Right after a mailbox scan (P5) or an extension board pull ingests new jobs, fire one `enrich-descriptions` pass in the background so the freshly added matches gain descriptions without the user asking. Never block the ingest UI on it.
4. Where a description now exists, the match card's snippet, the tailor/fit view, and the cover-letter "tailor for this job" flow all use it automatically (no extra wiring — they already read `job.description`).

### Scope
Display + a button that calls the live endpoint; no client-side scraping. Null-safe (missing/!200 → leave the card, offer the source link). Global P0 rules apply.

Acceptance: on Matches with placeholder-only jobs, "Get full descriptions" fills them in (looping until `remaining` is 0), the cards' snippets and the tailoring/fit views then show real detail, blocked postings degrade to a source link rather than an error, and a fresh scan/pull quietly enriches new matches on its own.

---

## P32 — Manage email sources: see the connected inbox, change it, add more

Scanning pulls job mail from the user's connected inbox, but today the UI never shows **which** inbox, and there's no easy way to change it or add another. The backend now supports **multiple Gmail inboxes per user**, each labeled by its address. Give Integrations a clear "Email sources" section to see, add, and remove them. Backend is LIVE.

### Data / endpoints (live)
- `GET /api/v1/integrations` → one row per connected inbox: `{ provider, account_email, scopes, connected_at, expires_at, expired }`. A user can now have several `provider: "gmail"` rows, each with a distinct `account_email` (older connections may have an empty `account_email` — show them as "Connected inbox").
- **Add / change an inbox:** `POST /api/v1/integrations/connect/gmail` → returns an `authorize_url`; send the user there. Google now shows an **account chooser**, so "Add another inbox" and "Change" use the *same* connect call — the user just picks a different Google account. On return the new inbox appears in the list.
- **Remove one inbox:** `DELETE /api/v1/integrations/gmail?account_email={email}` removes just that inbox. `DELETE /api/v1/integrations/gmail` (no query) disconnects **all** Gmail inboxes.
- After adding an inbox, offer "Scan now" (`POST /api/v1/inbox/scan?source=gmail`) — the scan already reads **every** connected inbox and merges the results.

### UX — an "Email sources" card in Integrations / Settings
1. **List each connected inbox** with its address (or "Connected inbox" when the address is blank), connected date, and an **Expired** badge when `expired` is true (with a "Reconnect" action that re-runs connect for that address).
2. **"+ Add email source"** → the connect flow (account chooser). Make it obvious a user can connect more than one. After return, toast "Added {email}" and refresh the list.
3. **Per-inbox "Remove"** → `DELETE …?account_email=`, with a confirm ("Stop scanning {email}?"); the other inboxes keep working. A separate "Disconnect all" for the no-query delete.
4. **"Change inbox"** for a single-inbox user = "+ Add email source" then remove the old one — or just present both and let them remove the one they don't want. Don't force a disconnect-first flow.
5. Show, near the scan button, how many inboxes will be scanned ("Scanning 2 inboxes").

### Scope
UI over the live endpoints; no client-side token handling (OAuth happens on the provider + backend). Null-safe: an empty list → an inviting "Connect your first email source" empty state. Global P0 rules (token refresh, Retry over infinite spinners) apply.

Acceptance: Integrations shows every connected inbox by address; "+ Add email source" connects an additional Gmail via the account chooser and it appears in the list; removing one inbox leaves the others scanning; a scan reads all connected inboxes; an expired inbox shows Reconnect; and a user with no inbox sees a clear connect prompt.

---

## P33 — Patch P29: the Résumé ⇄ Cover letter toggle must also switch the VERSIONS MARQUEE (and live next to it)

P29 shipped, but only half-works: flipping the toggle switches the **editor document** (preview + side panel) — good — yet the **versions marquee stays stuck on the résumé's versions**. It must switch to the **cover letter's** versions too. And the toggle is currently only reachable away from the marquee; put one **in or directly above the marquee card** so switching is easy right where the versions live. No backend — the cover-letter version endpoints are already LIVE.

### A. The marquee follows `activeDocType`
The versions marquee is bound to the **same** `activeDocType` as the rest of the Workspace (one shared state — never a second independent selector):
- **Résumé active** → marquee lists résumé versions: `GET /api/v1/resumes/{id}` (`versions[]`, `active_version`), thumbnails via `GET /resumes/{id}/versions/{v}/render`, linkage via `GET /resumes/{id}/version-usage` (P28).
- **Cover letter active** → marquee lists the **cover letter's** versions from the **cover-letter** endpoints: `GET /api/v1/cover-letters/{id}` (`versions[]`, `active_version`), `GET /cover-letters/{id}/versions/{v}/render`, `GET /cover-letters/{id}/version-usage`. Rename/activate/delete also hit the `/cover-letters/...` routes.
- The marquee **heading** reflects the type ("Your résumé · versions" ↔ "Your cover letter · versions"), and `selectedVersion` is tracked **per type** so flipping back to the résumé restores its selection (don't reset it).
- A freshly uploaded cover letter has at least its "Original" version — so switching to Cover letter must show that version, never an empty or résumé-populated rail.

### B. Put the toggle at the marquee
In addition to the toggle above the preview (P29), render the **same** segmented `[ Résumé | Cover letter ]` control **in the marquee card's header (or directly above it)**, bound to the one shared state so both toggles move together. Switching from either spot flips the preview, side panel, **and** the marquee in one action. Keep the "No cover letter yet — create one" affordance when the user has none.

### C. Scope
Frontend state wiring only — point the marquee's data source at the active document's version endpoints and add the second toggle instance. No new backend; reuse the live résumé and cover-letter version routes. Null-safe (missing/!200 → empty-but-labeled rail, not a spinner or the other type's data).

Acceptance: with the toggle on **Cover letter**, the versions marquee shows the **cover letter's** versions (heading says "cover letter", cards render cover-letter version content + P28 linkage), and flipping back to **Résumé** restores the résumé rail and its prior selection; a toggle sits in/above the marquee card and stays in sync with the one above the preview; and a just-uploaded cover letter shows its Original version in the rail rather than staying on the résumé's.

---

## P34 — Keep your résumé & cover letter in sync across the job boards

When a user updates their résumé here, the copies on their connected boards (LinkedIn, Indeed, …) go stale. Give them a clear "Sync to boards" panel that shows, per connected board, whether the current version is live there and how to update it. Backend is LIVE; honest about what each board supports.

### Endpoints (live)
- `GET /api/v1/documents/board-sync` (optional `?resume_id=&cover_letter_id=`) → `{ resume_id, cover_letter_id, drifted, automation_live, boards: [ { board, label, doc_type, supported, auto, active_version, live_version, in_sync, drifted, manage_url, steps[], reason } ] }`.
  - One row per connected board × document type it can hold. `supported:false` (e.g. Greenhouse, Workday — pure per-application ATS) carries a `reason` and should render as "No profile résumé to sync."
  - `drifted:true` = the board's copy is an older version (or none). `in_sync:true` = up to date. `live_version` is the version currently on that board (null = never synced).
- `POST /api/v1/documents/board-sync` `{ board, doc_type: "resume"|"cover_letter", resume_id?, cover_letter_id? }` → records that the board now holds the active version (call it after the user updates it on the board). Returns the refreshed row. 400 for an unsupported board.

### UX — a "Sync to boards" card (Documents or Settings → Integrations)
1. **One row per connected board** with its logo, the document type, and a status pill: **In sync** (green), **Needs update — v{active} vs v{live or "none"}** (amber), or **Not supported here** (muted, with the reason).
2. **Update action** on a drifted row → open `manage_url` in a new tab and show the numbered `steps`. When the user confirms they updated it (a "Mark as synced" button), POST board-sync and flip the row to In sync.
3. If `automation_live` is true, offer a one-click **"Sync automatically"** on `auto:true` rows (the backend push); otherwise show the guided manual flow. (Automated push is gated on the browser-automation runtime — until then it's guided.)
4. A header summary: "{drifted} board(s) out of date" with a single "Review" that expands the list; nothing when everything's in sync.
5. Re-check drift whenever the user saves a new résumé/cover-letter version (the active version changes → rows go amber until re-synced).

### Scope
UI over the live endpoints; no client-side automation. Null-safe (no connected boards → "Connect a board to keep your documents in sync"). Global P0 rules apply.

Acceptance: each connected board shows whether the current résumé/cover letter is live there; drifted boards offer a deep link + steps and a "Mark as synced" that clears the drift; unsupported ATS boards are shown honestly with a reason; and saving a new document version re-flags the boards as needing an update.

---

## P35 — Interview: surface "Suggest an answer", give every interviewer its own voice, and let users customize voices

Three gaps in the interview section: (a) the **"Suggest an answer"** helper (a model answer grounded in the user's résumé) isn't visible anywhere; (b) **every interviewer speaks in the same voice** — even the female personas sound male; (c) there's **no way to change an interviewer's voice**. All backends are LIVE (OpenAI neural TTS confirmed working with distinct voices).

### A. "Suggest an answer" — show it wherever a question appears
On any interview question — the question bank, prep questions, and the live mock session — add a **"Suggest an answer"** action.
- Call `POST /api/v1/interview/suggest-answer { question, resume_id?, job_posting_id? }` → `{ question, category, answer, tips[], answer_seconds }`.
- **Visibly print (transcribe) the `answer` into the card**, with the `tips` as short bullets and `answer_seconds` as a "~Ns spoken" hint. It's a model of what the user could say / the general direction — framed that way, not as "the" answer.
- **Save to a library:** a "Save answer" button → `POST /api/v1/interview/saved-answers { question, answer, ... }`; list via `GET /interview/saved-answers`; delete via `DELETE /interview/saved-answers/{id}`. A "My answers" view lets the user read and reuse them to learn good phrasing.
- In the live mock, offer it as a non-cheating study aid (e.g. after the user answers, or behind a "show a model answer" toggle) — the user still speaks their own answer.

### B. Each interviewer speaks in its OWN voice
- On entering the interview, fetch `GET /api/v1/interview/voices` → now returns one row **per persona** `{ persona_id, source, voice_id, voice_uri, rate, pitch, lang }` (the effective voice, defaults included). Build a `personaId → voice` map.
- When speaking an interviewer line, use **that persona's** voice: if `source: "server"` and `voice_id`, call `POST /api/v1/interview/tts { text, voice: voice_id }` and play the returned audio; if `source: "browser"`, speak with `speechSynthesis` using `voice_uri`/`rate`/`pitch`. Never speak every persona with one default voice.
- Female personas (Maya, Priya, Dr. Elena Rossi) must use their female neural voices (nova/shimmer/fable), males (Devon, Marcus) male (echo/onyx), so the voice matches the persona.

### C. Let users customize an interviewer's voice
- A **voice picker** per persona: choose among the neural voices (alloy, echo, fable, nova, onyx, shimmer) or a browser voice, with a **Preview** button (`POST /interview/tts` with a sample line).
- Save via `PUT /api/v1/interview/personas/{persona_id}/voice { source, voice_id | voice_uri, rate?, pitch?, lang? }`; reset via `DELETE /api/v1/interview/personas/{persona_id}/voice` (falls back to the derived default). Optionally upload a custom clip: `POST /interview/personas/{persona_id}/voice/upload`.

### Scope
UI over live endpoints; `GET /interview/media/capabilities` (`{tts, video, voice_clone}`) gates what to show (hide neural options when `tts:false`, fall back to browser voices). Null-safe; global P0 rules apply.

Acceptance: every question offers "Suggest an answer" that prints a résumé-grounded model answer + tips into the card and can be saved to a re-readable library; in a mock, each interviewer speaks in its own voice and female personas no longer sound male; and a user can change and preview any interviewer's voice and have it persist.

---

## P36 — A simple "answer voice" picker for the suggested-answer readout

The suggested answer (P35's "Suggest an answer" — the model of the user's ideal answer) should be readable aloud in a voice the **user picks themselves**, simply: male/female plus a few voice styles, usable in a couple of taps. This is one per-user voice, separate from the interviewer personas. Backend is LIVE.

### Endpoints (live)
- `GET /api/v1/interview/answer-voice/catalog` → `{ tts, voices: [ { voice_id, label, gender } ] }` — the selectable voices (e.g. male: Warm/Deep; female: Warm/Bright/Expressive; neutral: Neutral). `tts:false` → hide neural options, use browser voices.
- `GET /api/v1/interview/answer-voice` → the current choice `{ voice_id, source, voice_uri, rate, pitch, lang }` (a sensible default before the user picks).
- `PUT /api/v1/interview/answer-voice` — three easy ways:
  - **Just a gender:** `{ "gender": "male" | "female" | "neutral" }` → we pick a good neural voice.
  - **Exact style:** `{ "voice_id": "nova" }` from the catalog.
  - **Browser voice:** `{ "source": "browser", "voice_uri": "...", "rate": 1.1 }`.

### UX — keep it one-glance simple
1. In the interview section (near the suggested-answer card and/or in settings), a small **"Answer voice"** control: a **Male / Female** segmented toggle, then **2–3 style chips** for that gender (from the catalog's `label`s). One tap each.
2. A **Preview** (▶) button speaks a sample line in the chosen voice — `POST /api/v1/interview/tts { text: "Here's how I'd answer that.", voice: <voice_id> }`, play the audio. For a browser voice, use `speechSynthesis` with the saved `voice_uri`/`rate`.
3. Selecting a chip immediately `PUT`s the choice (optimistic) and shows a check — no separate save step.
4. **"More voices" → device voices (including Microsoft).** Below the quick chips, a "More voices" expander lists **every voice the browser/device offers** — enumerate `window.speechSynthesis.getVoices()` (call again on the `voiceschanged` event, since the list populates async). On Windows/Edge this includes the **Microsoft** voices (e.g. "Microsoft Ava Online (Natural) - English (United States)", "Microsoft Andrew Online (Natural)", "Microsoft Aria", "Microsoft Guy", "Microsoft Zira/David"). Show them grouped (a **Microsoft** group first when present), labelled by the voice's `name` + `lang`, and inferring male/female from the name where possible so the gender filter still applies. Picking one saves it as a browser voice: `PUT /api/v1/interview/answer-voice { source: "browser", voice_uri: <voice.voiceURI>, lang: <voice.lang>, rate?, pitch? }`. Make all of them selectable — don't cap the list.
5. **Preview + playback honor the source:** for a `server` voice use `/interview/tts`; for a `browser` voice (including Microsoft) speak with `speechSynthesis`, setting `utterance.voice` to the saved `voice_uri` and applying `rate`/`pitch`. Use it everywhere the suggested answer is read aloud; never reuse an interviewer persona's voice for the answer readout.
6. Default is fine out of the box (a clear, warm neural voice) so the feature works before the user touches it.

### Scope
UI over the live endpoints; `catalog.tts` gates whether to show the neural chips, but the **device/Microsoft browser voices are always offered** (they need no server TTS). Null-safe; global P0 rules apply. This is the answer readout only — interviewer voices stay P35.

Acceptance: a user can set the answer-readout voice in a tap or two (pick male/female, then a style) OR choose any device voice including every Microsoft voice the browser exposes; preview it; have it persist; and hear suggested answers read in that voice. With neural TTS off, the Microsoft/device voices still work.

---

## P37 — Label every interviewer/answer voice by name (no more "Neural voice")

Some personas show a generic **"Neural voice"** instead of their actual voice name (e.g. Dr. Elena Rossi = Coral, Jordan Blake = Sage) because the UI's voice-name map only knows the original six voices. Fix the label so **every** voice shows its name — and make it future-proof so new voices never fall back to the generic label. No backend change: `voice_id` is already on `GET /interview/personas` rows and on `GET /interview/voices` / `/answer-voice`.

### How to label a voice
For a **server (neural) voice**, show `"<Name> · neural"` where `<Name>` is a friendly name for the `voice_id`. Use this map, and for any id not in it, **capitalize the id itself** (so a brand-new voice shows "<Capitalized> · neural", never "Neural voice"):

```
alloy→Alloy, ash→Ash, ballad→Ballad, coral→Coral, echo→Echo, fable→Fable,
nova→Nova, onyx→Onyx, sage→Sage, shimmer→Shimmer, verse→Verse
```

For a **browser voice** (`source: "browser"`), show the device voice's own name (from `voice_uri` / the matching `speechSynthesis` voice), e.g. "Microsoft Ava (Natural)". Only when there is genuinely no voice id at all (no neural, no browser voice) fall back to a plain "Browser voice".

### Where to apply it
- The **persona gallery** cards ("Echo · neural", now also "Coral · neural", "Sage · neural").
- The **Voice** picker per persona and the **Answer voice** control (show the current pick's name).
- Anywhere a chosen voice is displayed.

### Scope
Pure labeling in the UI from data already returned by the API. Null-safe; global P0 rules apply.

Acceptance: every persona card and voice control shows the voice's real name (Coral, Sage, etc.); no card shows the generic "Neural voice"; and a voice id the UI hasn't seen before still renders a capitalized name rather than the generic fallback.

---

## P38 — Refine a suggested answer: tell the AI how to improve it + points to emphasize

After getting a suggested answer, the user should be able to **refine/recalculate** it with a quick instruction and optional topics to work in (e.g. "make it more concise", "emphasize my leadership", "add the AWS migration and the 40% cost savings") — without retyping the question. Backend is LIVE.

### Endpoint (new)
- `POST /api/v1/interview/refine-answer` `{ question, answer, instruction, points?: string[], resume_id?, job_posting_id? }` → same shape as suggest-answer: `{ question, category, answer, tips[], answer_seconds }`.
  - `answer` = the current draft to rework; `instruction` = how to change it; `points` = topics to emphasize (worked in only where the résumé supports them).
  - Stays grounded in the user's résumé (defaults to their most-recent one); never fabricates. 400 if question or instruction is empty.

### UX — a refine control under each suggested-answer card
1. Below a generated answer (next to Edit / Save / Try again), add **"Refine"**: a small input — "Tell the AI how to improve it" — with a send button. On submit, `POST /refine-answer` with the current `question` + the shown `answer` + the typed `instruction`, then replace the card's answer with the result (keep the previous draft one step back for Undo).
2. **Quick instruction chips** for one-tap refinements: "More concise", "More detail", "Emphasize leadership", "More confident tone", "Use STAR", "Add numbers/metrics". Tapping a chip sends it as the instruction.
3. **Points to emphasize:** an optional "Add a point…" field that collects a short list (chips the user can add/remove) sent as `points[]` — so the user can push the AI to include specific achievements or topics.
4. Show a subtle working state; on return, the answer updates in place, keeps its category/timing/tips, and can be re-refined again (iterative). Everything is still groundable + saveable (`/saved-answers`) and readable in the answer voice (P36).

### Scope
UI over the live endpoint; iterative refine with Undo; null-safe; global P0 rules apply.

Acceptance: under any suggested answer the user can type an instruction (or tap a chip) and add points to emphasize, get a reworked answer in place that reflects them while staying grounded in the résumé, refine again iteratively, and undo to the previous draft.

---

## P39 — One apply wizard (popup): add to pipeline → attach résumé/cover letter → start the automated apply (single or grouped)

Applying is too many clicks across too many pages (Matches → save → Applications → open Details → attach docs → Submit; auto-apply is a separate rule flow). Collapse the common goal into **one wizard dialog** launched from anywhere a job appears — for a **single job or a grouped action** — that in a few simple choices adds the job(s) to the pipeline, attaches a résumé and/or cover letter, and kicks off the automated application on the external site. A new backend endpoint does it all in one call.

### Endpoint (new, LIVE)
`POST /api/v1/applications/batch`
```
{ job_ids: string[], resume_id?, resume_version?, cover_letter_id?, cover_letter_version?, submit?: bool, platform? }
→ { results: [ { job_id, application_id, created, reused, submitted, requires_manual, fallback_url, message, error } ],
    created, submitted, manual, failed }
```
- Adds each job to the pipeline with the chosen documents; **idempotent** (a job already in Draft is updated, not duplicated → `reused:true`).
- `submit:true` also **starts the automated apply** on each site now; per-job `submitted` / `requires_manual` (+ `fallback_url`) / `error` come back so the wizard shows exactly what happened.
- Supporting data already live: `GET /resumes`, `GET /cover-letters` (pick docs), `POST /cover-letters/generate` (make one tailored), `GET /auto-apply/sessions` (which boards are connected).

### Launch points (a single "Apply" / "Quick apply" action)
- A match card, a saved job, a job detail, **and** a multi-select on Matches/Saved ("Apply to N selected") → opens the **same** wizard. On the Applications board, a draft card's "Submit" also opens it (prefilled). Replace the buried Details→attach→Submit path.

### The wizard — 3 light steps in a popup dialog
1. **Jobs** — show the job(s) being applied to (1, or a list for the grouped action; let the user deselect any). A one-line note of which board each is on.
2. **Documents** — pick a **résumé** (default: most-recent/active; dropdown of `GET /resumes`) and an optional **cover letter** (none / pick / **Generate tailored** via `/cover-letters/generate`). Applies the same choice to all jobs in a grouped action, with a small per-job override if they want. Show the version that will be recorded (P28).
3. **Start** — two clear buttons: **"Add to pipeline"** (`submit:false` → just tracks them) and **"Start automated apply"** (`submit:true`). If a target board isn't connected (`GET /auto-apply/sessions`), surface a one-click Connect inline rather than failing. Honor the approval model — never present auto-send as bypassing the user's confirmation.

### Results (in the dialog, then close)
Per job: ✅ Submitted · ⚠️ Needs a manual finish ("Open on {board}" → `fallback_url` + any steps) · ❌ Error (reason). A summary line ("2 applied · 1 needs you · 0 failed"), then the Applications board reflects the new/updated cards. Grouped actions show a compact progress list.

### Scope
UI (a reusable dialog) over the live endpoints — one `batch` call does add + attach + optional submit. Null-safe (no résumé yet → prompt to add/generate one; no connected board → offer Connect). Global P0 rules apply.

Acceptance: from a match/saved/detail card or a multi-select, one "Apply" opens a popup that, in ≤3 choices, adds the job(s) to the pipeline with a résumé (and optional cover letter) and can start the automated apply on each site; grouped actions apply the same choices to many jobs with per-job results; re-running doesn't create duplicate drafts; and a disconnected board offers Connect instead of erroring.

---

## P40 — Fix the interview session header: show the interviewer's avatar (remove the broken banner)

In a live practice interview, the interviewer **doesn't appear** — the session header shows a broken-image icon and a nearly-empty bar. Cause: the header uses a hardcoded, dead background image (`https://public.readdy.ai/ai/img_res/…​.webp`, which 404s / `naturalWidth:0`) as a full-bleed banner, and the interviewer's **name/role text is white** for that (now-missing) dark background, so it's invisible on the white fallback. The persona's real avatar (`avatar_url`) loads fine but is small and lost behind the broken banner. Backend is correct — this is layout only.

### Fix
1. **Remove the broken AI-image banner** (`public.readdy.ai/ai/img_res/*` as the header background). Do not reference that URL.
2. **Make the persona's avatar the header's focus:** render `persona.avatar_url` (from `GET /api/v1/interview/personas` — the mock session's persona) as a clear, appropriately-sized avatar (e.g. 56–72px, rounded), with an `onerror` fallback to the persona's `initials` in a colored circle so it never shows a broken-image icon.
3. **Fix text contrast:** the interviewer's **name** (e.g. "Devon Clark"), **role** ("Recruiter"), the difficulty badge ("Easy"), and the current **voice** (P37 label) must use normal foreground colors on the card background — not white — so they're clearly legible. Lay them out next to the avatar (avatar · name/role/voice · difficulty badge · End interview).
4. Apply the same header treatment anywhere the active interviewer is shown during the session.

### Realistic avatars (forward-looking)
The avatar comes from `persona.avatar_url`, which the backend already lets you override with real images (set `JOBSEARCH_PERSONA_AVATARS` or a per-persona `avatar_url`). So once realistic images are configured, this same header shows them with no further UI change — just keep rendering `avatar_url`.

### Scope
Frontend layout/CSS only: drop the dead banner image, render the persona avatar with an initials fallback, and fix the header text contrast. Null-safe; global P0 rules apply.

Acceptance: starting a practice interview shows the interviewer's avatar and their name/role/voice/difficulty clearly in the header; there is no broken-image icon and no invisible white-on-white text; if an avatar URL fails, a clean initials circle shows instead.

---

## P41 — Declutter the live interview session: one clear answer flow, obvious AI help

The practice-interview session is overloaded and confusing. The AI help ("Suggest an answer" → model answer, voice, and Refine) actually works, but it's **buried** under a busy control area with several low-value / duplicated buttons, and there are **two competing answer inputs**. Simplify to one clear flow. No backend change — same endpoints.

### The problems (observed in a live session)
- Low-value / confusing controls crowd the answer area: **Done vs Send** (two "finish" buttons), **Pause**, **Re-record**, **Sensitivity**, plus mode toggles **"Turn hands-free off and record manually"**, **"Turn practice mode on"**, **"Mute interviewer voice"** — all competing at the same level.
- The suggested-answer card and the **"Your answer appears here…"** textbox sit on top of each other, so it's unclear where the user is meant to act.
- The AI action feels hard to reach even though it works.

### Simplify to one answer flow
1. **One answer input.** Keep a single "Your answer" area (type or speak). While recording, show just a **Record / Stop** toggle and a live transcript — remove **Pause**, **Re-record**, and **Sensitivity** (fold Sensitivity into a small settings "⋯" if truly needed; most users never touch it).
2. **One finish button.** Replace **Done + Send** with a single primary **"Submit answer"**. (If "Done" only stops recording, merge it into Stop.)
3. **Move mode toggles out of the main bar.** Put "Hands-free", "Practice mode", and "Mute interviewer voice" in a small overflow menu (⋯) or a compact settings row — not as prominent buttons beside the answer.
4. **Make AI help the clear secondary action.** Keep **"Suggest an answer"** as a single obvious button near the question; once a model answer shows, keep its **Refine** (chips + "Tell the AI how to improve it…" + "Add a point") and voice controls — but collapse them tidily so the card isn't a wall of buttons (e.g. Refine and Voice behind small toggles that expand on demand).
5. Keep the right-column **Transcript** and **Vocabulary coach** as-is, but ensure they don't compete visually with the primary answer action.

### Result
A clean session: the **question**, one **answer input** with a single Record/Stop + **Submit answer**, an obvious **Suggest an answer** for AI help (with Refine/voice tucked neatly), and advanced/mode options behind a ⋯ menu. No duplicated finish buttons, no stray low-value controls.

### Scope
Frontend layout/consolidation over the existing endpoints (`/interview/suggest-answer`, `/refine-answer`, `/tts`, mock `reply`). Null-safe; global P0 rules apply. Don't remove functionality — relocate the rarely-used controls; just stop them crowding the primary flow.

Acceptance: in a live interview the user sees one answer input, a single Submit, and an obvious way to get + refine an AI suggestion; Pause/Re-record/Sensitivity/duplicate-finish buttons no longer crowd the bar (moved to a ⋯ menu or removed); and nothing about executing the AI prompt is ambiguous.

---

## P42 — Marquee: a clear trash control to delete a version (in the preview + full-size view)

Deleting a résumé/cover-letter version is hard to find. Put an obvious **trash icon** right on the version **preview** card and in the **full-size / zoom** view, so a user can remove a version in one click. Backend is LIVE.

### Endpoints (live)
- Résumé: `DELETE /api/v1/resumes/{id}/versions/{version}` — removes one saved version (keeps at least one; if the active version is deleted, the newest remaining becomes active).
- Cover letter: `DELETE /api/v1/cover-letters/{id}/versions/{version}`.

### UX
1. **On each marquee preview card**, show a small **trash icon** (top-right corner, visible on hover/focus, always visible on touch). Clicking asks a tiny inline confirm ("Delete v{n}?") then calls the delete endpoint and removes the card; the rail re-centers on the current version.
2. **In the full-size / zoom ("Read full size") view**, show the same trash control in the toolbar alongside the existing actions, so a user reviewing a version can delete it without leaving.
3. **Guard rails:** never allow deleting the **last remaining** version (hide/disable the trash with a tooltip "Keep at least one version"). After deleting the active version, reflect the new active version in the preview immediately (the API picks the newest remaining).
4. Keep the existing "Delete this version" action too, but the trash icon is the primary, obvious affordance. Undo isn't required (deletion is explicit + confirmed), but a brief toast ("Deleted v{n}") is nice.

### Scope
UI over the live delete endpoints; applies to both résumé and cover-letter marquees (P29/P33 toggle decides which). Null-safe; global P0 rules apply.

Acceptance: a trash icon appears on every version preview and in the full-size view; clicking it (with a quick confirm) deletes that version and updates the rail/preview; the last remaining version can't be deleted; works for both résumés and cover letters.

---

## P43 — Interviewers ask the common questions as realistic talking-head video

Make the interviewer feel like a real person: when the interviewer asks one of the **fixed common questions** (greeting, "tell me about yourself", "what are you looking for", the three behavioral prompts, the universal probe, and the closing), play a **pre-rendered talking-head video clip** of that persona speaking the line — instead of a still photo. For any other (job- or résumé-specific) question, keep the current behavior: show the persona photo and speak the line with neural TTS. Backend is LIVE.

### How it works (client)
For every interviewer line, the client already knows the persona and the text. Ask the backend for a clip:

- `POST /api/v1/interview/video` with `{ "text": "<the interviewer line>", "persona": { "id": "<persona_id>" } }`.
  - **200** → `{ "video_url": "<absolute url>", "source": "prerendered" | "live" }`. Render the interviewer as a `<video autoplay playsinline>` pointed at `video_url` (it's a plain MP4 at `/api/v1/interview/clip/{persona_id}/{line_id}`, served publicly — no auth header needed on the `<video>` tag). When the clip ends, freeze on the persona photo.
  - **501** (no video for this line) → fall back to the **persona photo + `POST /interview/tts`** audio exactly as today.
- Don't block the session waiting on video: if the clip 404s or stalls, drop back to photo + TTS. The photo (`persona.avatar_url`) is always the safe baseline.

### Persona ↔ clip
Clips are keyed by `(persona_id, line_id)`; the backend matches the spoken text to the right fixed `line_id` automatically (exact, alias, or substring), so the client only needs to send the **text + persona id** — no line ids to track. A persona only has clips once they've been pre-rendered on the backend (see operator note), so always keep the photo+TTS fallback wired.

### Operator note (not user-facing)
Clips are generated server-side via HeyGen, so the HeyGen key never reaches the browser:
- `GET /api/v1/interview/avatars/clips` → `{ total, built, remaining }` (how many persona × question clips exist). Add `?lines=greeting,intro` to scope the count to specific questions.
- `POST /api/v1/interview/avatars/build?limit=N` → renders up to N missing clips per call (call until `remaining` is 0); **501** if `HEYGEN_API_KEY` isn't set, **400** if `JOBSEARCH_HEYGEN_VOICE_ID` isn't set. Add `?lines=greeting,intro` to render only certain questions (a cheap starter set before committing to the full library). This is an admin action, not a user button.

### Scope
Frontend swaps the still interviewer image for a `<video>` whenever `/video` returns a clip, with a hard fallback to the existing photo + TTS path. Null-safe; no new user controls; global P0 rules apply.

Acceptance: during a mock interview, the common questions play as a short talking-head video of the chosen interviewer; job-specific questions still use photo + neural voice; if a clip is missing or fails, the session continues seamlessly on photo + TTS with no error shown.

---

## P44 — Stitched mock interview: play the question clips back-to-back

Turn the interviewer into a continuous experience: the chosen interviewer **plays each common question as a clip, waits for the candidate's answer, then plays the next** — a stitched, sequential mock interview. Works today even before real HeyGen clips exist, via a bundled placeholder clip and a photo + TTS fallback. Backend is LIVE.

### Get the script, then play it
- `GET /api/v1/interview/script?persona_id={id}` → the ordered interview:
  ```json
  {
    "persona": { "id": "...", "name": "...", "role": "...", "avatar_url": "..." },
    "tts_available": true,
    "steps": [
      { "line_id": "greeting", "text": "...", "caption": "...", "has_custom_caption": false, "expects_answer": false, "clip_url": "<url|null>", "has_clip": true },
      { "line_id": "intro",    "text": "...", "caption": "...", "has_custom_caption": false, "expects_answer": true,  "clip_url": "<url|null>", "has_clip": true },
      ...
    ]
  }
  ```
  Steps are in order: greeting → tell-me-about-yourself → motivation → three behavioral questions → closing.
  **Display `caption`, not `text`.** `caption` is what to show on screen for the step — it equals the canonical `text` unless a clip has a custom caption (its actual spoken wording), in which case `caption` is that override (`has_custom_caption: true`). Always render `caption`.

### Playback loop (client)
For each step, in order:
1. **Show the interviewer** in a prominent frame positioned next to the answer recorder (see P52 for placement). If `clip_url` is set, play it as a `<video autoplay playsinline>` (it's a plain MP4; no auth header needed on the tag). If `clip_url` is `null`, show `persona.avatar_url` and speak `text` via `POST /interview/tts` (fall back to the browser voice if `tts_available` is false).
2. **When the clip/audio ends**, if `expects_answer` is true, open the answer input (the P41 single answer flow) and wait for the candidate; "Suggest an answer" / Refine stay available. If `expects_answer` is false (the greeting), auto-advance.
3. **After the answer is submitted**, advance to the next step. At the end, show the summary/coach.
- **Don't snap the clip away.** When a `<video>` clip ends, **hold its last frame** (or fade back to the persona photo) and show a small **"▶ Replay"** control on the frame, so a short (~5s) clip isn't gone before the candidate notices it. Replay re-plays the same `clip_url`.
- Be robust: if a `<video>` errors or is a near-zero-length placeholder, don't stall the *interview* — the answer flow still opens on `ended`/`error` or a short timeout, and never block on a missing clip (but still hold the frame / show Replay where a real clip existed).

### Operator note (not user-facing)
- `POST /api/v1/interview/avatars/placeholder?on=true|false` — toggle the bundled placeholder so every question has a playable clip while you build/test; real clips always take precedence. (`?on=false` to turn off once real clips are in.)
- `PUT /api/v1/interview/clip/{persona_id}/{line_id}` (multipart `file`, mp4/webm/mov; optional `caption` field) — upload a clip you rendered yourself (e.g. in the HeyGen studio), no API key needed; replaces that line's clip. `caption` overrides the on-screen text for this clip (its actual spoken wording).
- `PUT /api/v1/interview/clip/{persona_id}/{line_id}/caption` (JSON `{ "caption": "..." }`, blank clears) — set/clear a clip's on-screen caption without re-uploading.
- `DELETE /api/v1/interview/clip/{persona_id}/{line_id}` — remove a clip (reverts to placeholder/TTS).
- `GET /api/v1/interview/avatars/clips` now also returns `rendered`, `uploaded`, and `placeholder_mode`.

### Scope
Frontend sequences the `/script` steps with a clip-or-TTS player and the existing answer flow; hard fallbacks so it runs with placeholders, uploaded clips, HeyGen clips, or nothing. Null-safe; global P0 rules apply.

Acceptance: starting a mock interview with an interviewer plays the common questions one after another (clip or photo+TTS), pausing for the candidate's answer between questions; with placeholder mode on, every question has a playable clip; an uploaded or HeyGen clip replaces the placeholder for that question automatically; a missing or broken clip never stalls the session.

---

## P45 — Fix: dialogs render off-screen / un-interactable on the dashboard (portal modals to body)

**Bug (reproduced live on `/dashboard/interview`):** clicking an interviewer's **Voice** / preview button opens the "Voice — {name}" dialog, but only a dimmed backdrop shows — the dialog panel renders ~800px *below* the viewport and can't be interacted with. This affects **any modal on the dashboard**, not just this one.

**Root cause (confirmed by inspection):** the modal's overlay is `<div class="fixed inset-0 z-50 flex items-center justify-center">`, but it is **rendered inline inside the page tree**, not portaled to `<body>`. An ancestor on these pages has a CSS `transform` (the `animate-fade-in-up` / `animate-pop` entrance wrappers). A `transform` (also `filter`, `backdrop-filter`, `perspective`, `will-change`, `contain`) on an ancestor makes **that element the containing block for `position: fixed` descendants instead of the viewport**. So `fixed inset-0` stretched to the full-height page container (measured 896×1760 at top 231) and `items-center` centered the panel at ~y820 — off-screen — while the backdrop still covered the screen and swallowed clicks. Verified fix: re-parenting the same overlay to `document.body` made it 1024×768 at (0,0) and the panel centered in view.

**The fix — render modals in a portal to `document.body`:**
1. Every modal/dialog/overlay (the Voice/voice-preview dialog, upload-clip dialog, confirm dialogs, the version zoom/preview, any `fixed inset-0` overlay) must be rendered via a React portal to `document.body` (e.g. `ReactDOM.createPortal(<Overlay/>, document.body)`), so no transformed/animated ancestor can trap its `position: fixed`.
2. Do **not** place a `position: fixed` overlay as a descendant of an `animate-fade-in-up`, `animate-pop`, or any element with `transform`/`filter`/`backdrop-filter`/`will-change`/`contain`. If a portal isn't used, the overlay must have **no** transformed/filtered ancestor between it and `<body>`.
3. Standard overlay contract: overlay = `fixed inset-0 z-50 flex items-center justify-center p-4` with a backdrop; panel = `w-full max-w-md max-h-[90vh] overflow-y-auto`; a visible **Close (×)**, close on backdrop-click and on **Esc**; lock body scroll (`overflow:hidden`) while open and restore on close; `role="dialog"` + `aria-modal="true"` + focus trap.
4. Keep the entrance animation on the **panel** (fine), but the fixed **overlay** itself must sit at the portal root, not inside a transformed box.

**Scope:** frontend only; no backend change. Apply to all dashboard dialogs (audit every `fixed inset-0` overlay). Global P0 rules apply.

Acceptance: on `/dashboard/interview`, clicking **Voice**/preview on any interviewer opens a dialog **centered in the viewport**, fully visible and interactive (dropdown, Preview, Save, Upload, Reset, Close) regardless of scroll position; Esc and backdrop-click close it; the page behind doesn't scroll while it's open; and the same holds for every other dashboard modal.

---

## P46 — Blocking bug: can't submit an answer in the mock interview (`/dashboard/interview`)

Re-tested on the **published** site logged in as a real user, after P44/P45 were published. **P45 (dialog) and P44 (video flow) are now confirmed working** — the Voice dialog opens centered, and the session calls `GET /interview/script` + `POST /interview/video` (the greeting correctly falls back to photo+TTS when `/video` returns 501). **One blocking bug remains and stops the whole interview**, so the video question is never reached.

### The bug — submitting an answer errors and never advances
Clicking **Submit answer** shows *"Could not send your answer"* and the interview **stays on the same question**, even though `POST /api/v1/interview/mock/{session_id}/reply` returns **HTTP 200** (verified: request `{"answer":"…","response_seconds":N}` → 200 with a valid `MockInterviewSession`: `status:"active"`, `turns`, `plan`, `asked`, …).

**Root cause:** the questions are displayed from `GET /interview/script` (the fixed 7-step script), but answers are submitted to `POST /mock/{id}/reply` (the separate mock engine). The two aren't reconciled, so after a successful reply the frontend can't figure out the "next question" and throws the error instead of advancing.

### Fix — decouple advancement from the reply
- **`/script` drives the questions and the order; the step index drives advancement.** On **submit**, call `/mock/{id}/reply` only to record the answer and get scoring/coaching (vocabulary, transcript). On a **2xx**, increment to the **next `/script` step** and render it (its `clip_url` as `<video>` or photo+`/tts`, showing `caption`). Do **not** try to parse the "next question" out of the reply response, and do **not** block advancing on TTS/video — advance first, then load media.
- Show *"Could not send your answer"* **only** on an actual network error or a non-2xx from `/reply` — **except** treat **409** as "session already complete," not an error: the mock engine caps its own question count, so once it's reached, later `/reply` calls return 409 while the `/script` still has steps left. On a 409 (or when the script steps are exhausted), finish the interview gracefully. `/script` is the source of truth for the question list; `/mock/reply` is best-effort scoring only.
- Keep the greeting auto-advance (when a step's `expects_answer` is false).

### Verify (with this seeded case)
Start an interview with **Devon Clark** and answer through: greeting → *tell me about yourself* → *what are you looking for* → the question **`behavioral_project`**, which has a real uploaded clip **and** caption. At that step, `/video` returns 200 and the interviewer should play a **talking-head `<video>`** with the caption "What's the most exciting thing you've been working on lately…". Earlier steps have no clip and should show photo + Nova TTS. Submitting any answer must advance with no error.

---

## P47 — Interview: show the clip's caption, not the canonical question text

Verified live: the stitched interview now works (submit advances, and a persona's clip plays as video). One gap remains — when a step has a **custom caption**, the UI still displays the canonical `text`. Example: Devon Clark's `behavioral_project` plays a video whose caption is *"What's the most exciting thing you've been working on lately, and what's the biggest challenge you've faced?"*, but the on-screen question still reads *"Tell me about a challenging project you worked on and how you approached it."*

**Fix:** in the interview session, render each step's **`caption`** from `GET /interview/script` as the on-screen question, not `text`. `caption` already equals `text` when there's no override, so this is safe for every step — just swap the field the question label binds to. (`has_custom_caption` is available if you ever want to style overridden ones differently; not required.)

Acceptance: the question shown on screen matches what the clip actually says — Devon's project step reads "What's the most exciting thing you've been working on lately…" while every non-clip step is unchanged.

---

## P48 — Fix "Sign in with Google" (login succeeds, then bounces to the landing/generic page)

**Bug:** signing in with Google authenticates successfully but the user lands back on the public landing page, not the dashboard — most visible on mobile. **Root cause (verified live):** it's a *server-side* Google OAuth flow. The backend finishes auth and redirects the browser to **`https://hlrtlg.readdy.co/auth/login`** with the session tokens in the URL **fragment**:

```
https://hlrtlg.readdy.co/auth/login#access_token=<JWT>&refresh_token=<JWT>&token_type=bearer
```

(On failure it's `…/auth/login#error=<reason>`.) **The `/auth/login` page never reads this fragment** — tested with a token in the hash: it was left in the URL, nothing was stored, and no redirect happened. So the user ends up unauthenticated and gets bounced to the public site. This is not mobile-specific in the code; it breaks wherever Google sign-in is used (desktop email/password still works, which is why it looks mobile-only).

**Fix — consume the OAuth fragment on return.** On the auth-return page, on first mount (before any "not logged in → redirect" guard runs), parse `window.location.hash`:
- If it contains `access_token`: store the session **exactly as the email-login flow does** — the app reads these localStorage keys:
  - `localStorage.setItem('hw_access', <access_token>)`
  - `localStorage.setItem('hw_refresh', <refresh_token>)`
  then clear the fragment with `history.replaceState(null, '', location.pathname)` and redirect to **`/dashboard`** (or the saved `returnTo` if you keep one).
- If it contains `error`: show that message on the login form (don't redirect to the landing page).
- Run this synchronously on load so it works on the first paint on mobile (no race with an auth guard that would otherwise redirect first).

**Recommended (more robust):** add a dedicated **`/auth/callback`** route whose only job is the parse-store-redirect above (no marketing content, no auth guard). Then the backend redirect target can point there. If you add it, tell me and I'll have the backend `JOBSEARCH_LOGIN_SUCCESS_REDIRECT` set to `https://hlrtlg.readdy.co/auth/callback`. (Until then, handling the fragment on `/auth/login` fixes it with no backend change.)

Acceptance: "Continue with Google" on mobile and desktop lands the user on **`/dashboard`** signed in; the tokens are stored under `hw_access`/`hw_refresh`; the URL fragment is cleared; and an OAuth `#error=…` shows a message on the login page instead of bouncing to the landing page.

---

## P49 — Tailor the interview to a specific role (questions + answers)

The interview now tailors to a **target role**: the questions and the AI suggested answers are grounded in the role's requirements, not just generic. Backend is LIVE and already defaults sensibly — this prompt surfaces and controls it in the UI.

### What the backend now does
- **Suggested answers** (`/interview/suggest-answer`, `/refine-answer`), **prep** (`/interview/prep`), and the **mock interview** (`/interview/mock/start`) all tailor to a target role. Pass `job_posting_id` to target a specific role; omit it and the backend defaults to the user's **strongest target** (best-match job in their pool). Answers emphasize the résumé experience most relevant to the role's requirements (never inventing anything).
- **`GET /interview/script?persona_id=…`** now also accepts **`&job_posting_id=…`** and returns:
  - `tailored_to`: `{ id, title, company }` of the role the interview is tailored to (or `null` when the user has no jobs).
  - extra **role-specific steps** appended after the common questions, each flagged `role_specific: true` (e.g. "This role calls for <requirement>. Tell me about a time you put that to work."). They have no pre-rendered clip, so they play as photo + TTS like any other non-clip step.

### UI
1. **Show what it's tailored to.** On the interview screen, when `script.tailored_to` is set, show a small line such as **"Tailored for {title} at {company}"** near the interviewer. When it's `null`, show nothing special (generic interview).
2. **Let the user choose the role.** Add a lightweight role picker (dropdown of the user's matches/applications) on the start screen. When a role is chosen, pass its id as `job_posting_id` to **`/interview/script`** and **`/interview/mock/start`** (and optionally to `/suggest-answer` / `/refine-answer`) so both questions and answers tailor to that exact role. Default selection = the backend default (just omit the param).
3. **Render role-specific steps** exactly like the others — they already arrive in `script.steps` in order with `role_specific: true`; no special handling needed beyond an optional subtle "role-specific" tag.

### Scope
Frontend selects/passes `job_posting_id` and displays `tailored_to`; everything else is backend. Null-safe (no jobs → generic interview, `tailored_to: null`). Global P0 rules apply.

Acceptance: picking a role (or relying on the default) makes the interview show "Tailored for {role}", appends role-specific questions after the common ones, and the AI suggested answers reference that role's requirements while staying grounded in the résumé.

---

## P50 — Interview controls: make mode/difficulty, transcription, and answer timing clear

Reproduced live on the Devon Clark session. The interview controls work but are hard to find and inconsistent. All frontend; no backend change.

### 1. "Easy" looks like a control but isn't; mode toggles are hidden
The green **"Easy"** pill (difficulty) sits next to real buttons but does nothing when clicked — users tap it expecting to switch mode/difficulty. Meanwhile **Practice mode** / **Hands-free** / **Interviewer voice** live behind an unlabeled **⋮** three-dot icon ("Session options"), which users don't discover — so "switching to practice mode doesn't work" (they never find the toggle). Practice mode actually works and changes the whole panel once toggled.
- **Fix:** surface the session controls as a visible, labeled row/segmented control (e.g. a **"Mode: Interview | Practice"** switch and a clearly-labeled **Options** button), not a bare ⋮. Give the "Easy" chip a clear treatment: either make it a real **Difficulty** selector (relabel to "Difficulty: Easy" and let the user change it — restart/apply as needed), or render it as plainly non-interactive text so it doesn't look tappable.

### 2. Show Practice mode is ON persistently
When Practice mode is on, show an unmistakable persistent indicator near the interviewer (e.g. a **"Practice mode"** badge), not only the changed panel. The current ⋮ menu state (On/Off) is hidden once the menu closes.

### 3. One clear, consistently-named transcription control
Speech-to-text is exposed under three different names depending on mode: **"Record"** (interview mode), **"Start listening"** (practice mode), and **"Hands-free answering" / "Mic auto-start"** (auto). Users can't tell which one transcribes their spoken answer into the box.
- **Fix:** use **one consistent label everywhere** for voice input, e.g. a mic button labeled **"Speak answer"** (and **"Stop"** while active) with an obvious on/listening state, plus a short helper "Your words appear in the box — edit before sending." Keep a single **auto-listen** toggle (the hands-free/mic-auto-start concept) with one name, shown in the same place in both modes.

### 4. Natural pause before the answer starts (not a wait)
After the interviewer finishes the question, the gap before the user can answer / before auto-listen opens the mic feels like a **wait period**. Make it a **natural conversational pause of ~0.6–1s** after the question audio ends, then open the mic (when auto-listen is on) with a clear **"Your turn"** cue. Don't block on anything after the audio ends; if auto-listen is off, enable the answer box immediately when the question finishes.

### 5. Toggling Practice mode restarts the interview from the greeting (confirmed bug)
Reproduced: while on the **intro** question, turning **Practice mode** on sent the interview back to the **greeting** ("Hi, thanks for joining me today…"), which then auto-advanced to intro again. So toggling a session option **discards the current question and any progress** and restarts — which is why switching to Practice mode "doesn't work" for the user (they were mid-question, it jumped back to the start, and looked like nothing applied). The mode toggle itself was also flaky (appeared to revert to Off in one run).
- **Fix:** toggling Practice mode / Hands-free / Interviewer voice must **apply in place**, preserving the current question and the conversation so far — never restart the session or reset to the greeting. The toggle must also persist (stay on until the user turns it off), including across the normal question-to-question advance.
- **Not a bug (verified):** there is **no timer-based auto-advance** — with no input the interview stayed on the same question for 90s+. Questions should continue to advance only on the user's Submit/Done (or the greeting's one-time auto-advance). The earlier "auto-advance" was this reset-to-greeting, not a spontaneous skip.
- **Related caution:** Hands-free's own description is "opens the mic when the question ends **and sends on a pause**" — combined with ambient room noise this can transcribe stray audio and **auto-submit an answer the user didn't give**, skipping a question. Keep auto-listen opt-in (not the default), require a clear end-of-speech, and show what will be sent before sending.

### Scope
Frontend only. Null-safe; global P0 rules apply. Don't remove functionality — relabel/relocate for clarity, fix the timing, and fix the toggle so it never restarts the session.

Acceptance: the mode and difficulty are obvious and labeled (no dead-looking "Easy" pill); Practice mode shows a clear persistent ON indicator and **stays on without restarting the interview**; voice input is one consistently-named control with an obvious listening state that never auto-submits ambient noise; and after a question the answer flow starts on a short natural pause, not a long wait.

---

## P51 — TEMPORARY: a visible "Preview interviewer video" link on the Practice interviews page

The talking-head video is currently hard to find — it only plays on the 4th question for ~5s and only for an interviewer that has a clip. Add a **temporary, clearly visible** way to preview it from the Practice interviews area, so it's easy to see without running a whole interview. Backend is LIVE; frontend-only.

### Where
On each interviewer card in **"Choose your interviewer"** (`/dashboard/interview`), add a visible link/button, e.g. **"▶ Preview video"**, next to **Voice** / **Start interview**. (Optional: also show it in the live session header.) Mark it clearly temporary — e.g. a small dashed **"Preview (temp)"** tag — so it's trivial to remove later.

### Behavior
On click, for that persona `P`:
1. `GET /api/v1/interview/script?persona_id={P}` → find the first step whose `clip_url` is set (`has_clip: true`).
2. Play that `clip_url` in a small inline `<video autoplay playsinline controls>` (with sound) — either inside the card or in a lightweight modal (portal to `document.body`, per P45, so it isn't clipped). Show the step's `caption` under it.
3. If no step has a clip, show **"No video yet for this interviewer."**

The clip is a plain public MP4 — no auth header is needed on the `<video>` tag.

### Note
Right now only **Devon Clark** has a real clip (placeholder mode is off), so only her card will play a preview; the others will say "No video yet." (If placeholder mode is turned on, every interviewer's preview will play the bundled stand-in clip.)

### Scope
Temporary frontend affordance over the live `/script` + `/clip` endpoints. Null-safe; global P0 rules apply. Easy to remove once the in-session video is prominent enough.

Acceptance: from `/dashboard/interview`, clicking **"Preview video"** on Devon Clark plays her talking-head clip (with audio) immediately, without starting a full interview; interviewers without a clip clearly say so.

---

## P52 — Put the interviewer's face/video where the user is actually looking (by the recorder)

The talking-head video is easy to miss because of **layout**, not wiring: the interviewer avatar is a small thumbnail in the **top header**, while the user's attention is on the **answer recorder lower down**. When a clip plays up top, nobody's looking there. Move the interviewer's face/video down next to the question + answer flow so it's front-and-center. Frontend-only.

### What to change
1. **Relocate the interviewer avatar/video into the main question→answer column**, directly above the question text and the recorder/answer input — the spot the user naturally watches while listening and preparing to answer. Remove (or shrink to a tiny label) the avatar in the top header; keep the name / role / difficulty / "Tailored for {role}" as a compact caption under the face.
2. **Make it prominent.** Render the avatar/video as a sizable panel (roughly 220–320px wide, 16:9 or portrait as the clip dictates), not a 150px thumbnail, so when the clip plays the talking head is obvious.
3. **Same element plays photo and video.** When the current step has a `clip_url`, play it there as `<video autoplay playsinline>` (with sound); when it doesn't, show `persona.avatar_url` and speak via TTS — all in the *same* prominent frame. Show a clear **"Speaking…"** state on it.
4. **Don't snap away.** When a clip ends, **hold the last frame** (or return to the photo with a subtle fade) and show a small **"▶ Replay"** control on the frame, so a short clip isn't gone before the user notices it.
5. Keep the recorder/answer controls directly **below** this frame so face → question → answer read top-to-bottom in one focused column.

### Scope
Frontend layout/placement only, over the existing `/script` + `/video` data (each step already carries `clip_url` / `caption`). Null-safe; works with photo+TTS, uploaded clips, placeholder mode, or nothing. Global P0 rules apply.

Acceptance: during an interview the interviewer's face sits right by the answer recorder (one focused column, face → question → answer); when a question has a clip it plays there prominently with sound and a Replay control; the user doesn't have to look to the top of the page to notice the video.

---

## P53 — "Simple" experience: a free, guided, minimal version of the site

A thin, friendly version of the product that is genuinely useful for free and dead-simple for **older / non-technical users** — minimal controls, no complicated setup, big obvious buttons, and step-by-step guides. It still lets people feel the core value (matches, tailored résumé/cover letter, interview practice) and, with an easy guided wizard, connect email and use **limited** auto-apply.

### Delivery
- **Default for free accounts** — free users land in Simple.
- **Simple ⇄ Full toggle for paid users** — paid can switch to Simple too (it doubles as a "simplify the app" mode). Free users stay in Simple; "Full" features show a friendly upgrade prompt.

### Design principles (older / non-technical first)
- **One task per screen**, one clear **primary button**; no dense dashboards, kanban, tabs, or jargon.
- **Big labeled buttons** (text, not icon-only), large fonts, high contrast, generous spacing.
- **Linear guided flows** ("Step 1 of 3", Back / Next / "I'll do this later"), with plain-language reassurance at each step.
- **Plain words**: "Add your résumé" not "Upload document"; no acronyms (ATS, OAuth, etc.) in the UI.
- Never a dead end — every limit leads to a friendly next step or upgrade.

### Simple Home — a few big cards
1. **My Résumé** — create / upload / improve with AI.
2. **Cover Letter** — let AI write/tailor one.
3. **My Matches** — a few jobs picked for you (read-only taste).
4. **Practice Interview** — answer a question, get friendly feedback (choose the interviewer's voice).
5. **Connect & Auto-Apply** — easy guided setup (limited on free).
6. **Upgrade** — what the full version adds.

### Features (each a simple guided flow)
1. **Résumé (create/update)** — "Add your résumé": upload a file **or** build one with a short guided form. One big **"Improve with AI"** button rewrites/strengthens it; simple manual edit; preview; save. Free = **one résumé**. Hide the version marquee / design chooser / structured tools (those are Full).
2. **Cover letter** — one button **"Write my cover letter"**, confirm the role, AI drafts it, simple edit, save. (Allowed on free.)
3. **Matches (read-only)** — a short ranked list (free cap, e.g. **10 / month**) with a plain "why this fits" line. **Apply** opens the auto-apply wizard (limited) — never silently applies.
4. **Practice interview** — one friendly interviewer, one question at a time, speak **or** type, get simple feedback. **Voice change is allowed** (pick the interviewer's voice). Hide personas / difficulty / modes / video setup (Full).
5. **Connect email + limited auto-apply — the key easy wizard.** A step-by-step, plain-language guide to connect **one** email and turn on auto-apply, each step explained with reassurance ("We ask your permission before anything is sent. We never store your password."). The **human-approval gate stays** — nothing goes out without a clear OK. Free limits: **1 email source**, a small monthly cap on jobs gathered ("reaped") and on auto-applies (e.g. **~5 / month**). Everything shows remaining counts in plain words ("3 of 5 auto-applies left this month").
6. **Limits & upgrade** — when a free user hits any cap (matches, auto-applies, email sources, a 2nd résumé, advanced interview), show a friendly **"You've reached your free limit — upgrade to do more"** with a short what-you-get list. Calm, not pushy.

### Hidden on free / Simple (until upgrade, or the Full toggle for paid)
Inbox management, multiple email sources / connectors, dashboards & kanban, bulk/grouped apply, verification deep-dive, résumé version marquee & design system, advanced interview (personas, difficulty, modes, video setup beyond voice).

### Backend note — plan + limits are now LIVE
Read **`GET /api/v1/auth/me/plan`**. It returns:
```json
{ "plan": "free|paid|tester", "unlimited": false, "can_toggle_full": false,
  "simple_default": true,
  "limits": { "resumes": 5, "cover_letters": 5, "matches_per_day": 10,
              "email_sources": 3, "autoapplies_per_day": 5, "autoapplies_per_week": 10,
              "reaped_per_month": 25 },
  "remaining": { "resumes": 5, "cover_letters": 5, "email_sources": 3,
                 "autoapplies_today": 5, "autoapplies_week": 10, "matches_per_day": 10,
                 "reaped_month": 25 } }
```
- `unlimited: true` (paid/tester) → `limits`/`remaining` are `null`; `can_toggle_full: true` (show the Simple⇄Full toggle). Free → `can_toggle_full: false`, locked to Simple.
- Use `remaining` to show "N left" and, when a limit is hit, the friendly upgrade prompt. The backend **also enforces** every cap and returns **HTTP 402** with `{"detail": {"error": "free_limit_reached", "resource": "...", "message": "..."}}` when exceeded — show that message. Matches are capped to 10 (the list simply returns ≤10 on free); reaping/auto-apply are capped server-side.

### Scope & acceptance
Frontend Simple experience (default for free, toggle for paid) over the existing engines; backend adds plan/limits enforcement separately.
Acceptance: a non-technical user, using big obvious controls and step-by-step guides, can add/update a résumé, get AI help, write a cover letter, see a few matches, practice an interview (with voice choice), and be guided to connect **one** email and use **limited** auto-apply — with remaining-count indicators, friendly upgrade prompts at the free caps, the approval gate always intact, and no auto-apply beyond the limit.

---

## P54 — Upgrade screen ("what you get with Full")

The friendly place the free-tier limit prompts lead to: a simple, reassuring page that shows what the free plan includes, what the full version unlocks, and where the user currently stands. Designed for the same older / non-technical audience as P53 — plain words, big buttons, no pressure. Reads the live plan. **Do not mention paid plans, pricing, waitlists, or "coming soon" anywhere** — when the user asks to upgrade, just flash a short message that it's not available yet.

### Where it's reached from
- The **Upgrade** card/button on the Simple home.
- Every **limit-reached** moment: when an action returns **HTTP 402** `{"detail": {"error": "free_limit_reached", "resource": "...", "message": "..."}}`, show the `message` inline (a calm banner, not a blocker) with a **"See what Full unlocks"** button that opens this screen **scrolled to / highlighting the matching `resource` row**.
- Hidden for paid/tester accounts (they're unlimited) — show the **Simple⇄Full toggle** instead.

### Data
Read **`GET /api/v1/auth/me/plan`**. Use `limits` + `remaining` to show "you've used N of M" per row. If `unlimited` is true, don't show this screen (show the toggle).

### Layout (simple + reassuring)
1. **Headline**: "You're on the Free plan" + one plain line: "Free gets you started. Upgrade when you want to do more — your data and your approvals always stay with you."
2. **A single clear comparison** — two columns, **Free** vs **Full**, big readable rows (one line each), with the user's current usage shown on the Free side:

   | | Free (you) | Full |
   |---|---|---|
   | Résumés | up to 5 *(N used)* | Unlimited |
   | Cover letters | up to 5 *(N used)* | Unlimited |
   | Job matches | 10 a day | Unlimited |
   | Connected email/accounts | up to 3 | Unlimited + inbox auto-import |
   | Auto-applies | 5 a day · 10 a week | Unlimited |
   | Jobs gathered for you | 25 a month | Unlimited |
   | Interview practice | Yes (voice included) | Yes + personas, difficulty, video |
   | Dashboard & inbox | Simple view | Full dashboard, kanban & inbox |
   | View | Simple | **Switch between Simple & Full anytime** |

   (Pull the Free numbers from `limits`, not hard-coded, so they track the backend.)
3. **Reassurance strip** (plain, large): "Human approval before anything is sent · We never store your password · Cancel anytime."
4. **Primary button**: **"Unlock Full"** — on click, **flash a short toast: "Full is not available yet — you'll keep everything you've done."** and stay on the page. No waitlist, no email capture, no pricing, no checkout, no "coming soon." A secondary **"Keep using Free"** closes back to where they were.

### Scope
Frontend only, over `GET /auth/me/plan`. Plain language, big controls, never a dead end. **No mention of paid plans / pricing / waitlist / coming-soon** anywhere in the app — the only response to an upgrade attempt is the brief "not available yet" flash. Global P0 rules apply.

Acceptance: hitting any free cap shows a calm inline message and a one-tap path to this screen (highlighting the right row); the screen shows Free (with the user's usage) vs Full in one simple comparison; tapping Unlock Full flashes "not available yet" and nothing else (no pricing/waitlist); paid/tester users never see it (they see the Simple⇄Full toggle instead).

---

## P55 — Simple résumé experience: visual, a document viewer, proper AI editing (never the raw text editor)

The free/Simple résumé screen is currently too plain — a mocked default user, no pictures, no way to actually see the résumé. Make it a warm, visual, AI-first résumé experience. Supersedes P53's résumé bullet for the Simple view. Frontend over existing endpoints + `GET /auth/me/plan`.

### Must
1. **Show the résumé — a real document viewer.** Render the user's résumé as a clean, readable document (the same rendered preview used elsewhere), front and center. Read-only, nicely formatted, with fit-width / zoom / "Read full size". The seeded sample résumé renders here too, so a brand-new account immediately *sees* a résumé, not an empty box.
2. **Never expose the raw text / markdown editor by default.** It must stay hidden in the Simple view — not behind an obvious toggle, just not present. Editing happens through AI (below) and simple guided fields; the power editor is a Full-only tool.
3. **A proper AI experience + résumé editing.** This is the point of the screen:
   - A big, obvious **"Improve with AI"** that rewrites/strengthens the whole résumé (`POST /resumes/{id}/improve-structured`) and shows a clear **before → after** in the viewer with **Keep / Undo**.
   - A simple **"Ask AI to change it"** box for targeted changes (`POST /resumes/{id}/ai-edit`) — apply immediately, Undo = previous version.
   - **Tailor to a role** in one tap (uses the target role; see P49) so the résumé speaks to the job.
   - Add-your-own-wins: a friendly "Tell us what you did" input that folds the user's points in (`POST /resumes/{id}/incorporate`), AI-polished.
   - Every AI change lands in the **viewer** with Keep/Undo — the user never edits raw text.
4. **Make it lively, not dull.** Use the product's illustrations/iconography, the person's name, a friendly avatar/illustration, an **ATS/strength meter** and **match score** as simple visuals, encouraging microcopy, and warm empty/success states. No bare grey boxes.

### Free caps (show, don't surprise)
Read `GET /auth/me/plan`. On free, show remaining in plain words — e.g. **"18 AI edits left today"** (`remaining.ai_edits_today`) near the AI buttons. When an AI action returns **HTTP 402** (`detail.error = "free_limit_reached"`, `resource` = `ai_edits` or `ai_input`), show the friendly `detail.message` inline with a link to the upgrade screen (P54) — never a raw error. For `ai_input` (text too long), nudge: "shorten this or upgrade." Paid/tester: no caps, no counters.

### Scope
Frontend for the Simple view, over existing résumé endpoints (`improve-structured`, `ai-edit`, `incorporate`, tailor) + `/auth/me/plan`. The raw editor stays hidden on Simple. Null-safe; global P0 rules apply.

Acceptance: the Simple résumé screen shows the actual résumé in a clean viewer with visuals (never an empty/dull box and never the raw text editor); the user improves it entirely through obvious AI actions with before→after + Keep/Undo; AI-edit remaining is shown and free caps surface as friendly upgrade prompts, not errors.

---

## P56 — Simple version: mobile-first, one obvious "Switch to Full", real name on sign-in

Three fixes to the Simple experience. Frontend only.

### 1. Mobile-first (no clusters)
The Simple view must be excellent on a phone:
- **Single column**, big readable text, generous spacing, **no horizontal scroll** at 360–400px wide.
- **No clusters of buttons or crowded menus.** One clear **primary action per screen**; group everything else behind a single plain "More" if truly needed. Replace any row of small buttons with a few **big, stacked, tappable cards/buttons** (full-width, ≥48px tall, text labels — not icon-only).
- Primary actions sit where a thumb reaches (lower on the screen); nothing important crammed into tiny top-corner icons.
- The Simple home's few big cards (P53) stack vertically and fill the width on mobile.

### 2. One obvious "Switch to Full" control (fix: easily missed)
For users who can switch (`GET /auth/me/plan` → `can_toggle_full: true`, i.e. paid/tester), the Simple⇄Full toggle is currently too subtle and gets missed. Make it **impossible to miss**:
- A **clearly-labeled button with icon + text** — "**Switch to Full view**" (and "Switch to Simple" when in Full) — in a **consistent, prominent spot** (e.g. the top bar, or a full-width bar under the header on mobile), **high-contrast / accent-colored**, never hidden inside a ⋯ menu.
- Persist the choice per user (localStorage is fine) so it sticks across visits.
- Free users (`can_toggle_full: false`) don't see it at all.

### 3. Greet with the real name (fix: generic greeting on sign-in)
Right after sign-in the greeting shows a generic/placeholder name before the real one loads. Fix:
- Greet using the signed-in user's real name from **`GET /api/v1/users/me`** (`full_name` → first name). Backend returns it correctly (verified), so **never show a generic/mock name**.
- While the name is still loading, show a **nameless** greeting ("Welcome back" / "Good morning") — then fill in the name when it arrives. No flash of a generic or wrong name.
- If `full_name` is genuinely empty, use the email's name part, else just the nameless greeting.

### Scope & acceptance
Frontend over `/auth/me/plan` + `/users/me`. Null-safe; global P0 rules apply.
Acceptance: the Simple view is comfortable one-handed on a phone (single column, big tap targets, no button clusters, no sideways scroll); users who can switch see a prominent, clearly-labeled "Switch to Full view" control they can't miss (hidden for free); and the sign-in greeting always shows the user's real first name (or a nameless greeting while loading / if unknown) — never a generic placeholder.

---

## P57 — Résumé Workspace layout + click-to-edit bubbles (refines P55)

Exact structure and interaction for the résumé screen, top to bottom. Frontend only, over existing endpoints + `GET /auth/me/plan`.

### Vertical order (top → bottom)
1. **Résumé summary — collapsed link at the top.** A one-line **"AI summary ▸"** collapsible, **collapsed by default**, sitting *above* the résumé render. Expanding it reveals the AI overview, with **Read aloud + voice controls** right there (the app's existing TTS play/pause + voice picker, e.g. `/interview/tts` or the read-aloud switch). It does not push the résumé down when collapsed.
2. **Résumé render** — the document viewer (P55), the visual centerpiece.
3. **AI functions & prompts — directly beneath the render.** All AI actions live here, right under the document:
   - **Primary button (the one users can't miss): "Auto-improve my résumé."** One tap runs the AI improvement **and folds in the user's best saved/"reaped" bullets** (their strongest highlights/experience) — `POST /resumes/{id}/improve-structured` plus the user's experience highlights / `incorporate`. Show before→after in the render with **Keep / Undo**. This is the biggest, most obvious control on the screen.
   - Secondary: **Ask AI to change it** (`/ai-edit`), **Tailor to role** (P49). Keep these smaller/below the primary.

### Click-to-edit bubble (direct manipulation)
- **Clicking directly on the résumé** (a bullet, a line, a heading) opens a small **inline editing bubble** anchored to that element: edit the text inline **or** "Rewrite with AI" that one piece (`/ai-edit` with a targeted instruction, or a span rewrite). Apply → the render updates with Keep/Undo.
- **Mobile-friendly:** on phones the bubble is a **bottom sheet** (full-width, big tap targets, easy dismiss), not a tiny floating popover; on desktop it's a compact popover by the clicked element. No crowding.
- **Tier-limited:** each AI rewrite from a bubble counts against the free **AI-edit cap** (`/auth/me/plan` → `remaining.ai_edits_today`); when the cap is hit, the bubble shows the friendly 402 message + the upgrade link (P54). Plain (non-AI) inline text edits aren't capped.

### Switch to Full + "it's free" wording
- **Put the Simple⇄Full toggle on this screen too — easy to identify and access.** Use the prominent "**Switch to Full view**" control from P56 (icon + text, high-contrast, consistent spot in the header — never buried in a menu). Show it to users who can switch (`GET /auth/me/plan` → `can_toggle_full: true`); hide it for free.
- **Remove "Pricing" from the menu / nav entirely — there are no paid tiers to show.** Anywhere a plan or price would appear, the **wording is simply "Free"**: the account/menu shows "**Free plan**" (no "Pricing" item, no "Pro/Premium", no dollar amounts). The only upgrade affordance anywhere is P54's **"Unlock Full"** → the brief "**not available yet**" flash.

### Scope & acceptance
Frontend over résumé endpoints (`improve-structured`, `ai-edit`, `incorporate`, experience/highlights) + `/auth/me/plan`. Raw text editor stays hidden (P55). Null-safe; global P0 rules apply.
Acceptance: the collapsed **AI summary** (with read/voice) sits above the render; the render is the centerpiece; **"Auto-improve my résumé" (with best bullets)** is the clear primary control directly beneath it; tapping any part of the résumé opens a mobile-friendly editing bubble (inline or AI rewrite) with Keep/Undo; AI rewrites respect the free AI-edit cap; a prominent, easy-to-find **Switch to Full** toggle is present for those who can switch; and **no pricing appears anywhere** — the plan simply reads "Free".

---

## P58 — Landing page: remove pricing / "paid plans coming soon" (it's free)

The public marketing page (`/`) still has a **Pricing** section and "Paid plans coming soon — pricing to be announced" copy. Remove all pricing and future-paid-plan language — the product is simply **free** right now. Frontend only; no backend.

### Changes
- **Remove the "PRICING" section heading and any paid-plan framing** ("Paid plans coming soon", "pricing to be announced", "Free forever" tier card as a *pricing* comparison, dollar amounts, "Pro/Premium"). No price tables, no tiers.
- If you keep a short section there, make it a plain **"It's free"** statement — e.g. "Free to use — no card, no catch." — with the existing **Request early access** call to action. No mention of future paid plans.
- **Nav / footer:** remove any **"Pricing"** menu/footer link.
- **FAQ:** the "What does it cost?" answer becomes simply **"It's free to use."** (drop "paid plans coming soon").
- Don't list specific plan caps as marketing numbers here (they'd drift from the app). Keep it to "free."

### Scope & acceptance
Frontend copy/section removal on the landing page only; app behavior unchanged. Global P0 rules apply.
Acceptance: the landing page has **no pricing section, no price amounts, no "paid plans / coming soon" language, and no "Pricing" nav/footer link**; any cost mention simply says it's free; the Request-early-access CTA remains.

---

## P59 — Fixes: Simple toggle target, review-before-send preview, batch approvals, status-email consent

### 1. Fix the Simple⇄Full toggle target (bug)
"**Switch to the Simple version**" currently navigates to **`/extension`** (the public marketing page). It must open the **Simple dashboard at `/simple`**. From Simple, "**Switch to Full view**" goes to **`/dashboard`**. Fix the href/handler on both. (Verified: the Simple experience lives at `/simple`; the toggle just points to the wrong URL.)

### 2. Review-before-send preview of the application
Before an auto-apply is actually submitted (the approval step), show the user a **rendered preview of the exact application** they're approving: the **résumé** (the chosen version, rendered as a document) + the **cover letter** if any + **where it's headed** (company / role / platform). Then **Approve & send** or **Skip**. Nothing is sent until they approve on this preview. Use the existing résumé/cover-letter render endpoints.

### 3. Batch approvals
Prepared applications in the pipeline can be reviewed/approved **in batch**: select several (or "Approve all"), each showing its preview, and send the approved set in one action (`POST /applications/batch` already supports batching; submission still honors the per-application approval gate). Show **per-item results** (sent / needs manual / skipped).

### 4. Emailed status updates — with consent (backend LIVE)
Add a clear **opt-in toggle**: "**Email me when my application status changes**" — in Settings and/or near the pipeline, **off by default (consent required)**.
- Read it from **`GET /api/v1/users/me`** → `notify_status_email`; set it with **`PUT /api/v1/users/me/email-notifications?enabled=true|false`**.
- When on, the backend emails the user on status changes (submitted, interviewing, offered, …). Plain copy: "We'll email you at {email} when a job's status changes. Turn off anytime."

### Scope & acceptance
Frontend over existing endpoints + the new consent endpoint. Null-safe; global P0 rules apply.
Acceptance: the Simple toggle switches between **`/simple`** and the full dashboard (never the extension page); before any auto-apply is sent the user sees a **rendered preview** of the exact résumé/cover letter + destination and must approve; prepared applications can be **approved in batch** with per-item results; and an **off-by-default** "email me on status changes" toggle controls real status emails via the consent endpoint.

---

## P60 — Dark mode in the Simple view + real dashboard activity/meters

### 1. Add the dark/light toggle to the Simple view
The full app has a dark-mode toggle but the **Simple view (`/simple`) doesn't**. Add the same dark/light toggle to the Simple header — a clear, single control (sun/moon with a label is fine for the non-technical audience), applying the app's existing dark theme. Persist the choice (localStorage) and keep it consistent with the Full view's theme. One obvious control; no cluster.

### 2. Dashboard "Recent activity" + meters must be real (backend is real)
The dashboard's **Recent activity was blank** because no activity existed to show — the backend now records in-app notifications on real actions (applications prepared, status changes, submits), so there's data to render. Make sure the dashboard reads it:
- **Recent activity** = `GET /api/v1/dashboard/summary` → `recent_activity[]` (`{type, message, at, read}`), newest first. Render these rows (not a hardcoded/mock list). If truly empty, show a calm empty state ("No activity yet — it'll show up here as you apply and interview.").
- **All meters come from `/dashboard/summary`** and are real: `matches.total` / `matches.strong`, `applications.{total,submitted,interviewing,offered}`, `interviews`, `weekly_goal`, `resumes`, `cover_letters`, `saved_jobs`, `connected_apps`, `unread_notifications`. Do **not** hardcode numbers. "Strong matches" now ranks against the user's latest résumé (so it matches what the Matches page shows).
- Re-fetch `/summary` on load and after actions (applying, status changes) so the numbers and activity stay current.

### Scope & acceptance
Frontend over `/dashboard/summary` + a theme toggle. Null-safe; global P0 rules apply.
Acceptance: the Simple view has a working dark/light toggle that persists; the dashboard's Recent activity shows real recorded events (or a calm empty state) and every meter reflects `/dashboard/summary` — no mock numbers; strong-match count matches the Matches page.

---

## P61 — Auto-apply activity log + Simple/Full feature parity

### 1. "What the AI did" — an easy application activity log (backend LIVE)
Every application has a plain-English log of the steps the AI took to apply and **exactly which résumé/cover letter version it used**. Surface it conveniently.
- **Endpoint:** `GET /api/v1/applications/{id}/activity` →
  ```json
  { "application_id": "...", "status": "...",
    "job": { "title": "...", "company": "...", "url": "..." },
    "resume": { "name": "Williams, Bayete, IT Director.docx", "version": 34 },
    "cover_letter": { "name": "...", "version": 2 }  // or null,
    "steps": [ { "at": "…ISO…", "label": "Prepared your application", "detail": {…} },
               { "at": "…", "label": "Started applying via indeed" },
               { "at": "…", "label": "Submitted via indeed" } ] }
  ```
- **UI:** from each application (in the pipeline, the apply queue, and the Simple "My applications"), a clear **"See what we did"** / activity link opens a simple **timeline** of the `steps` (newest or oldest-first, your call — be consistent), with the **résumé & cover-letter name + version** shown at the top ("Applied with Résumé v34, no cover letter"). Plain language, one tap to open, easy to close. This must be present in **both Simple and Full**.

### 2. Simple and Full must have the same useful features
Simple is a **simpler presentation of the same product — not a reduced one**. Every genuinely useful capability in Full is also reachable in Simple (just with big, obvious, one-task-at-a-time controls and fewer things on screen):
- résumé create/update + AI editing, cover letters, matches, **auto-apply with the approval gate + this activity log**, interview practice (with voice), connect email, status notifications, dark mode.
- The only differences are **presentation** (Simple: guided, uncluttered, mobile-first) and the **free-tier caps** (which apply to the account tier, not the view). Nothing useful is hidden from Simple just because it's Simple; what's hidden is power-user *complexity* (raw editor, dense dashboards, bulk tooling) — and even those have a simple equivalent (e.g. AI editing instead of the raw editor).
- A user switching Simple⇄Full should find the same features, same data, same account — only the layout changes.

### Scope & acceptance
Frontend over `/applications/{id}/activity` + existing endpoints; the activity log is backend-live. Null-safe; global P0 rules apply.
Acceptance: any application shows a one-tap, plain-English activity log listing the AI's steps and the exact résumé/cover-letter version used, in both Simple and Full; and every useful feature available in Full is also available (simply presented) in Simple — Simple differs only in presentation and the account's caps, never by withholding a useful capability.

---

## P62 — Make listening prominent: résumé summary read-aloud + an interview "Listen" mode

Audio is a first-class, mobile-friendly way to use the app — surface it, don't bury it. All backend already exists (`/interview/tts`, `/interview/answer-voice`, `/interview/suggest-answer`, `/interview/script`, the read-aloud voice switch).

### 1. Advertise the résumé summary read-aloud (currently under-featured)
The résumé summary's **Read aloud + voice** (P57) is too hidden. Make it an **obvious, inviting control** — a clear **"▶ Listen to your summary"** button (with the voice picker nearby), prominently placed near the summary, not tucked inside a collapsed link. Play/pause, scrubbing optional, and it reads the AI summary via `/interview/tts` (or the read-aloud switch) in the chosen voice.

### 2. Interview "Listen" mode — hear the questions AND the answers, on mobile, on repeat
Add a prominent **"Listen"** mode to interview prep for hands-free, repeat practice (great on a phone, commuting, etc.):
- For the chosen interviewer, it plays each common question aloud (the persona's clip audio or `/interview/tts`), then reads the **suggested answer** aloud (`/interview/suggest-answer` → `/interview/answer-voice` or `/tts`), then moves to the next — a continuous **Question → Answer** audio walkthrough.
- **Mobile-first, repeatable controls:** big **Play / Pause**, **Previous / Next**, **Replay this one**, and a **Repeat** (loop the current Q&A, or loop the whole set) so a user can listen to the same question/answer over and over. Keep playing with the screen off / app backgrounded where the browser allows (use a persistent audio element; show a simple now-playing line: "Q2 · tell me about yourself").
- Let the user pick the **voice** (reuse the existing per-persona/answer voice picker). Works with the user's own tailored suggested answers (role-aware, per P49) so they're rehearsing *their* answers, not generic ones.
- Honor the free **AI-edit / suggest caps** where suggested answers are generated; cache generated answers so replaying doesn't re-spend.

### Scope & acceptance
Frontend over the existing TTS / answer-voice / suggest-answer / script endpoints; mobile-first; one obvious control, no clusters. Null-safe; global P0 rules apply.
Acceptance: the résumé summary has a prominent "Listen to your summary" control (not buried); interview prep has an obvious **Listen** mode that reads each question and its suggested answer aloud with Play/Pause/Next/Replay and a Repeat/loop, usable one-handed on a phone and comfortable to listen to the same Q&A repeatedly; the user can pick the voice; it uses their role-tailored answers; and it respects the free caps.

---

## P63 — Source logo + direct link on dashboard matches and in auto-apply

Users should always be able to see where a job came from and click straight to it. Two gaps:

### 1. Dashboard top matches: show the source logo + a direct link (backend updated)
The dashboard's "Today's top matches" show neither the **source board logo** nor a **direct link**. The data is now there:
- `GET /api/v1/dashboard/summary` → `matches.top_matches[]` (and `matches.top`) each include: `company_logo`, **`source_logo`**, **`source_display`** ("Indeed"), **`source_url`** (the best link — direct posting, else a board search), and `url`.
- Render each top match with the **source board logo + name** (e.g. a small Indeed/LinkedIn badge) and make the card/"View" open **`source_url`** in a new tab (`rel="noopener"`). Use `company_logo` for the company mark and `source_logo` for the board attribution; fall back to initials/an inbox badge when a logo is empty.
- The Matches page already exposes the same fields (`MatchOut.source_logo/source_url/source_display`) — make the dashboard consistent with it.

### 2. Auto-apply: give the user a link to the provider to check the outcome
After an application is prepared/submitted, the user should be able to **open it on the source site** (Indeed/LinkedIn/…) to check the outcome themselves.
- `GET /api/v1/applications/{id}/activity` → `job.source_url` (+ `source_display`, `source_logo`) is the link. Also available as `job_url` on the application.
- In the apply queue, the pipeline, and the activity timeline (P61), add a clear **"Open on {source_display}"** / **"Check on the site"** link that opens `source_url` in a new tab. Show it in both Simple and Full.

### Scope & acceptance
Frontend over `/dashboard/summary` and `/applications/{id}/activity` (backend fields are live). Null-safe (missing logo → initials/badge; missing link → hide the button). Global P0 rules apply.
Acceptance: each dashboard top match shows the source board logo + name and opens the real posting (or a board search) in a new tab; every application offers a clear "open on the provider" link to check the outcome, in both Simple and Full.

---

## P64 — Fix two gaps: render the source LOGO image + place the status-email consent toggle

Live test found the backend data/endpoints are present but two things aren't shown. Frontend only; no backend change.

### 1. Render the source board **logo as an image** (not just the board name)
On the dashboard top matches (and anywhere a match shows), the board is shown as text ("Via Indeed") but the **source logo image isn't rendered** (0 `<img>` from `source_logo`). Fix:
- Use **`source_logo`** (from `GET /dashboard/summary` → `matches.top` / `matches.top_matches[]`, and `MatchOut.source_logo` on the Matches page) as a small **`<img>` board badge** next to the match. It's a real icon URL (e.g. `https://icons.duckduckgo.com/ip3/indeed.com.ico`).
- Use **`company_logo`** as the company mark (left of the title).
- **Fallbacks:** if `source_logo` is empty or the image 404s (`onerror`), show the **`source_display`** text badge ("Indeed") — or an "inbox" badge for inbox-sourced; if `company_logo` fails, show the company initials. Never a broken-image icon.
- The match/card and its "View" open **`source_url`** in a new tab (`rel="noopener"`) — you already render these links; keep them.

### 2. Place the "Email me when my application status changes" consent toggle
The consent endpoint is live but there's **no toggle in the UI**. Add it:
- **In Settings** (a "Notifications" row) **and** near the **applications/pipeline** (a small "Get status emails" switch).
- **Off by default.** Read the current value from **`GET /api/v1/users/me`** → `notify_status_email`; write with **`PUT /api/v1/users/me/email-notifications?enabled=true|false`**.
- Plain copy: "Email me at {email} when a job's status changes." + "Off anytime." Show the user's email so they know where it goes.

### 3. (Reinforce) "Open on the provider" link on each application
Make sure every application (apply queue, pipeline, and the P61 activity timeline) has a clear **"Open on {source_display}"** link that opens **`GET /applications/{id}/activity` → `job.source_url`** in a new tab, so the user can check the outcome on Indeed/LinkedIn/…. Present in both Simple and Full.

### Scope & acceptance
Frontend over `/dashboard/summary`, `/users/me` (+ the email-notifications PUT), and `/applications/{id}/activity`. Null-safe (logo fails → text/initials; no link → hide). Global P0 rules apply.
Acceptance: dashboard matches show the actual **source board logo image** (with a text-badge/initials fallback) and link to the posting; Settings and the pipeline have an **off-by-default** "email me on status changes" toggle wired to the consent endpoint; and every application has an "open on the provider" link — all in both Simple and Full.

---

## P65 — Loop / repeat for the AI read-aloud (summary + full interview Q&A)

Let users put the audio on repeat for hands-free, on-the-go study (extends P62). Frontend only; uses the existing TTS / answer-voice endpoints.

### A clear "Loop" control on both players
Add an obvious **Loop / Repeat** toggle (a loop icon with an on/off state, plus a short label) to:
1. **The résumé summary read-aloud (P62 "Listen to your summary").** When Loop is on, the summary audio **restarts automatically** when it ends and keeps playing until the user stops it.
2. **The interview "Listen" mode (full Q&A walkthrough).** Provide two loop choices so it's clear:
   - **Repeat all** — when the last question→answer finishes, start again from the first (loop the whole set).
   - **Repeat one** — loop just the current question + its suggested answer over and over (for drilling a single one).
   A simple cycle on the loop button is fine (Off → Repeat all → Repeat one → Off), with the current mode clearly labeled.

### Behavior
- **Keeps going on its own** until the user pauses/stops — including with the screen off / app backgrounded where the browser allows (persistent audio element). Show a now-playing line (e.g. "Looping · Q2 · tell me about yourself").
- **Don't re-spend on replays:** cache generated TTS audio and suggested answers so looping replays the cached audio and never re-calls the AI (respects the free caps).
- Mobile-first: the Loop control is a big, obvious tap target next to Play/Pause; persist the user's loop choice.

### Scope & acceptance
Frontend over the existing TTS / suggest-answer / answer-voice endpoints. Null-safe; global P0 rules apply.
Acceptance: the summary player has a Loop toggle that replays the summary continuously until stopped; the interview Listen mode has a Loop control with Repeat-all and Repeat-one, each clearly labeled; looping plays cached audio (no extra AI spend) and keeps playing hands-free on a phone until the user stops it.

---

## P66 — Carry the P64 fixes into the Simple view (source logo + status-email toggle)

P64 shipped in the **Full** experience but not the **Simple** one. A live test (authenticated) found two gaps in Simple — this closes them. **Frontend only; no backend change.** The same fields and endpoints P64 used are already LIVE; Simple just isn't rendering them. Match the existing Simple look (large tap targets, one accent color, plain copy, mobile-first, dark-mode aware).

### 1. Show the source board on `/simple/matches` (logo image + text fallback)
Today each Simple match card shows only the title, company, a "Worth a look" tag, **Apply**, and a "Read the job" link — the **board isn't surfaced at all** (0 `<img>`, no text badge), even though `source_logo` is a real icon URL. Fix, mirroring P64 #1:
- Render **`source_logo`** (from the Matches payload / `MatchOut.source_logo`, e.g. `https://icons.duckduckgo.com/ip3/indeed.com.ico`) as a small **`<img>` board badge** on each Simple match card.
- **Fallback:** if `source_logo` is empty or the image 404s (`onerror`), show the **`source_display`** text badge ("Indeed" / an "inbox" badge for inbox-sourced). **Never** a broken-image icon, and never *nothing* — the user should always see which board it came from.
- Keep the existing **"Read the job"** link as-is (it already opens `source_url` in a new tab with `rel="noopener"`). Optionally add the company mark (`company_logo`, else initials) to match Full, but the source badge is the required fix.

### 2. Add the "status emails" consent toggle to Simple
The consent toggle exists in Full (Settings + pipeline) but is **absent from every Simple surface** (home, matches, connect). Add one obvious, Simple-styled switch, off by default:
- Best home: the **"Connect email & auto-apply"** area (`/simple/connect`) and/or the Simple home safety row ("Nothing is ever sent without you") — wherever a non-technical user will see it alongside the auto-apply promise.
- **Off by default.** Read from **`GET /api/v1/users/me`** → `notify_status_email`; write with **`PUT /api/v1/users/me/email-notifications?enabled=true|false`** (same endpoint Full uses — already verified wired).
- Plain copy, showing the address: "Email me at {email} when a job's status changes." + "Off anytime." Big tap target; reflect the saved state immediately.

### 3. (Confirm) "Open on the provider" in Simple applications/activity
Wherever Simple lists applications or the auto-apply activity (the P61 timeline in its Simple form), make sure each item has the same clear **"Open on {source_display}"** / "Read the job" link to `job.source_url` (from `GET /applications/{id}/activity`) in a new tab, so a Simple user can still check the outcome on Indeed/LinkedIn/…. If no such list is surfaced in Simple yet, add a minimal read-only one.

### Scope & acceptance
Frontend over the same Matches payload, `/users/me` (+ the email-notifications PUT), and `/applications/{id}/activity` that P64 used. Null-safe (logo fails → text/initials; no link → hide). Global P0 rules apply.
Acceptance: `/simple/matches` cards show the **source board logo image** (with a `source_display` text/inbox fallback, never blank); the Simple view has an **off-by-default "email me on status changes"** toggle wired to the consent endpoint and showing the user's address; and Simple applications/activity each link out to the provider — so P64 now holds in **both** Simple and Full.

---

## P67 — BUG: users can't delete a résumé or cover letter (give every document an easy, obvious Delete)

A tester reported he **can't delete a résumé draft from his list.** The backend is fine — the problem is the UI never exposes a whole-document delete. **Frontend only; the endpoints below are already LIVE.**

**Root cause:** today the only trash control is the **version** trash in the Versions marquee (P42 / P2.1), which deletes *a version within a document* and is **hidden/disabled when only one version remains** (the API 400s otherwise). A fresh **draft** résumé has a single version, so it has **no delete affordance at all** — there is no way to remove the whole document. Deleting a *document* is a different, always-available action from deleting a *version*; this prompt adds it. Don't change or remove the version trash — keep both, and make the difference obvious ("Delete this version" vs "Delete résumé").

### 1. A clear per-document Delete everywhere a document is listed or open
Add an obvious control to **résumés and cover letters** in **all** of these places, in **both Simple and Full**:
- **The Documents library** — on every résumé/cover-letter card, a visible **⋯ (More) menu** (or a direct trash icon) containing **Delete** and **Archive**. Not buried behind hover-only on desktop; on mobile/Simple it's a plainly labeled row in the card's menu with a big tap target.
- **The Workspace** (open document) — in the header's **⋯ More** menu: **"Delete résumé"** / **"Delete cover letter"** (label by type). After a successful delete, **leave the Workspace**: route back to the Documents list and select another document (or show the empty state).
- **The Simple view** — wherever Simple lists the user's résumé(s)/cover letter(s), a clearly labeled **Delete** (and **Archive**) action, same styling language as the rest of Simple.

### 2. Wire it to the live endpoints
- **Delete résumé:** `DELETE /api/v1/resumes/{id}` → **204**.
- **Delete cover letter:** `DELETE /api/v1/cover-letters/{id}` → **204**.
- Works for **drafts and any document regardless of version count** — it's ownership-checked only; **no plan/tier gate** (never hide Delete behind Full/upgrade; every user owns their documents). A **404** means it's already gone — treat as success and just remove the card.
- On 204: optimistically remove the card from the list (and from the versions marquee / any open reference); show a toast **"Deleted '{name}'."** Re-fetch the list (`GET /api/v1/resumes?archived=false` / `…/cover-letters?archived=false`) to stay in sync.

### 3. Confirm, because delete is permanent — and offer Archive as the safe alternative
- **Confirm dialog** before deleting: name the document and state it's permanent — e.g. *"Delete '{name}'? This permanently removes the résumé and all its versions. This can't be undone."* Primary button **Delete** is **red** (destructive); secondary **Cancel**. (Per the P9 color rule, red is reserved for destructive actions — use it here and nowhere benign.)
- In that same dialog, offer **"Archive instead"** — the reversible option (hides it from the main list without losing it):
  - Archive: `PUT /api/v1/resumes/{id}` (or `…/cover-letters/{id}`) with `{ "archived": true }`; Unarchive with `{ "archived": false }`.
  - Surface an **Archived** shelf/filter (list with `?archived=true`) with an **Unarchive** action, so archiving is clearly recoverable. Because document delete has **no server-side undo**, steer hesitant users to Archive rather than offering a fake Undo.
- Dialogs must portal to `body` and be interactable on the dashboard (P45) — don't render the confirm off-screen.

### Scope & acceptance
Frontend over `DELETE /api/v1/resumes/{id}`, `DELETE /api/v1/cover-letters/{id}`, the `PUT …{id} { archived }` toggle, and the `?archived=` list filters — all already LIVE; **no backend change.** Null-safe, keyboard-accessible (`aria-label="Delete {name}"`), 204/404 both clear the card, global P0 rules apply.
Acceptance: from the Documents library, the Workspace, **and** the Simple view, a user can delete **any** résumé or cover letter — **including a brand-new single-version draft** — via an obvious control; a destructive confirm names the document and offers **Archive instead**; deleting removes it from the list and (if open) returns to the library; archiving moves it to a recoverable Archived shelf; and Delete is never hidden behind a tier/upgrade.

---

## P68 — Admin dashboard: engagement, AI cost, and projected revenue (operator-only, in-app)

An **operator analytics dashboard inside Hirewave**, visible **only to designated admins** — never to regular users. The backend is new and token/role-gated; this prompt builds the GUI over it. Match the app's design system (P9 one-accent palette, P60 dark mode). **No résumé/email/job content is ever shown — counts, timestamps, plan, and estimated AI cost/revenue only.**

### 0. Gating — show the dashboard only to admins
- On app load (for an authenticated user), call **`GET /api/v1/admin/me`** → `{ is_admin, email }`. Show the **Admin** nav entry and allow the `/admin` route **only when `is_admin === true`**. For everyone else, hide the nav and hard-redirect away from `/admin` (the data endpoints also return **403**, so never render partial data).
- Admins are set by an operator via the **`JOBSEARCH_ADMIN_EMAILS`** Railway variable (comma-separated). The frontend never hardcodes who is admin — it always asks `/admin/me`.

### 1. Overview (top of `/admin`) — `GET /api/v1/admin/analytics/overview`
Render a row of summary cards from the response:
- **Users** — `totals.users`, with a small per-tier breakdown from `totals.by_tier` (`tester` / `trial` / `free`).
- **Projected revenue (MRR)** — `revenue.monthly_projected` (USD), with a by-tier mini-table from `revenue.by_tier` (`{count, price, subtotal}`). Show `revenue.note` as a caption ("projection from configurable plan prices — the app is free today") so it's never mistaken for billed revenue.
- **AI cost (month-to-date, est.)** — `ai_cost.month_to_date_est`, with `ai_cost.ops` (number of AI calls) and the `ai_cost.rates` as a caption. Show `ai_cost.note` ("estimated — tokens approximated from text length").
- **Margin (est.)** — `margin.monthly_est` (revenue − AI cost). Color neutral; it can be negative (fine — it's a model).
- **Engagement** — `engagement.active_7d` / `active_30d`, `email_connected`, `active_saved_search`, and **`matches_frozen_no_feeder`** (users whose matches can't update because they have neither a connected email nor an active saved search — this directly explains "my matches aren't updating").
- **Feature usage (MTD)** — `engagement.feature_interactions`: total interactions this month per core feature (`resumes`, `cover_letters`, `job_search`, `applications`, `interview`, `highlights`, `integrations`). Render as a small bar/row so it's obvious which features are actually used vs. ignored (an interaction = a state-changing action like an edit, a search, an apply — not a page view).
- **System health** — from `system`: **worker** status (`worker_healthy` → green "Live" / red "Stale", with `worker_last_tick` relative time and `worker_ticks`), `scheduler_enabled` (on/off), `job_source_mode` (`mock` = demo data / `http` = live boards), `gmail_fetch_mode`. Make `worker_healthy === false` or `job_source_mode === "mock"` visually prominent (amber/red) — those are the system-level reasons matches go stale for *everyone*.

### 2. Per-user table — `GET /api/v1/admin/analytics/users?tier=&limit=`
A sortable, searchable table (search by email, filter by `tier`). One row per user from the array; columns:
- **Email**, **Tier** (chip), **Last active** (`last_active`, relative), **Joined** (`created_at`).
- **Engagement:** `engagement.resumes`, `cover_letters`, `applications` (+ `applications_submitted`), `matches_real` of `matches_pool`, `newest_job_age_hours` (e.g. "3h ago" / "—"), **email connected** (✓/✗), **active search** (✓/✗, with `saved_search_last_run` on hover).
- **AI usage (MTD):** `ai.ops` and `ai.est_cost`.
- **Feature usage (MTD):** `features` — a per-feature interaction count (`features.resumes`, `cover_letters`, `job_search`, `applications`, `interview`, `highlights`, `integrations`) plus `features.total`. Show this as a compact sparkline/mini-bar or an expandable cell so you can see, per user, **how much they actually use each core feature** (e.g. heavy résumé editing but zero job searches). Sort/filter by `features.total` to spot power users vs. dormant accounts.
- **Revenue / margin:** `revenue_monthly`, `margin_monthly`.
- **Flags:** render `flags[]` as chips with plain tooltips — `matches_frozen_no_feeder` → "No email or saved search → matches can't update", `no_real_jobs` → "Only sample jobs so far", `no_search_criteria` → "No target roles/categories set". These are the per-user diagnosis for the "matches not updating" complaint.
- Sensible defaults: sort by Last active desc; highlight rows with a `matches_frozen_no_feeder` flag.

### 3. Framing (so the numbers are read correctly)
- Label the revenue and AI-cost sections clearly as **projection / estimate** (use the `note` fields). Optionally show the current assumptions (plan prices, token rates from the responses) in a small "Assumptions" expander, noting they're set via Railway env (`JOBSEARCH_PLAN_PRICES`, `JOBSEARCH_AI_COST_INPUT/OUTPUT_PER_1K`).
- **Privacy note** in the UI: "Counts and plan only — no résumé, email, or message content is shown here, and no account is ever accessed."

### Scope & acceptance
Frontend over `GET /api/v1/admin/me`, `/admin/analytics/overview`, `/admin/analytics/users` (all **new** — deploy the backend first; they're session-gated by `JOBSEARCH_ADMIN_EMAILS`). Null-safe (missing `newest_job_age_hours` → "—"; empty tiers hidden), global P0 rules apply.
Acceptance: an admin (email in `JOBSEARCH_ADMIN_EMAILS`) sees an **Admin** nav entry → a dashboard with overview cards (users by tier, projected MRR, estimated AI cost MTD, margin, engagement, system health) and a searchable per-user table with engagement, AI cost, revenue, and diagnostic flags; a **non-admin never sees the nav** and is blocked from `/admin` (and the API 403s); revenue/AI-cost are clearly labeled projection/estimate; and no user content is ever displayed.

### P68 addendum — real-vs-test split + which email inbox feeds matches (backend LIVE)
Two things were added to the same endpoints; surface them so the numbers are honest and iCloud shows up:
- **Real vs test users.** `overview.totals` now also returns `real_users`, `test_users`, and `by_tier_real`. Seed/load-test accounts (domains like `test.dev`, `example.com`, `*.local` — configurable via `JOBSEARCH_ADMIN_TEST_DOMAINS`) otherwise inflate the count. Make the **Users** card headline the **real** number (e.g. "**4 users** · +86 test") so a pile of seed accounts isn't read as real signups. Each per-user row has **`is_test`** (boolean) — show a small "test" chip and default the table to **hide test accounts**, calling `GET /api/v1/admin/analytics/users?exclude_test=true`, with a toggle to show them.
- **Email provider per user.** Each row's `engagement.email_providers` is a list like `["gmail"]` / `["icloud"]` / `[]`; `overview.engagement.email_providers` is the per-provider count across users (e.g. `{ "gmail": 2, "icloud": 1 }`). Replace the plain "email connected ✓/✗" with **which** inbox feeds matches (Gmail / iCloud chips), and add the provider breakdown to the Engagement card. This is how a connected **iCloud** inbox becomes visible on the dashboard.

Acceptance (addendum): the Users card leads with real users and separates out test accounts; the per-user table hides test-domain accounts by default (toggle to show) and shows each user's connected inbox type(s); a user who connects iCloud appears with an **iCloud** email chip and is **not** flagged `matches_frozen_no_feeder`.

## P69 — Connect iCloud Mail (feed job matches from an iCloud inbox over IMAP)

Let a user connect their **iCloud** mailbox so job alerts, recruiter mail, and application replies feed their matches — the same way connected Gmail does. iCloud doesn't use OAuth: the user supplies their **iCloud email + an app-specific password**, which the backend validates and stores encrypted. **Frontend only; the backend is already LIVE.** Match the app's design system (P9 one accent, P60 dark mode); mobile-first. Bearer auth on every call; apply global P0 rules (token refresh, null-safe, no infinite spinners). Verify on the **published** site, not the Readdy preview.

Why this matters: today most users have **no connected email feeder**, so their matches never refresh from email. iCloud is a one-screen fix for the large iPhone/Mac user base.

### 0. Where it lives
In the existing **Connect email / Connected accounts** area (next to Gmail job alerts). Drive the list from **`GET /api/v1/integrations/connected-apps`** — any row with **`imap_connectable === true`** (iCloud) renders an **app-password connect**, not an OAuth button. Fetch the per-provider help/host from **`GET /api/v1/integrations/imap-providers`** → `[{ provider, label, host, app_password_url, help }]`.

### 1. Not connected → the connect form
- Show a card titled from `label` ("iCloud Mail") with a short line: "Connect your iCloud inbox to pull job emails into your matches."
- A **"Connect iCloud"** button opens a small form with two fields:
  - **iCloud email** (type=email).
  - **App-specific password** (type=password) — with the `help` text shown inline and a link to `app_password_url` (`https://appleid.apple.com/account/manage`, open in a new tab) labeled "Create an app-specific password". Make the distinction explicit: **"Your normal Apple ID password won't work — generate an app-specific password."**
- Submit → **`POST /api/v1/integrations/connect-imap`** with JSON `{ "provider": "icloud", "email": <email>, "app_password": <password> }`.
  - **On 200** (`{ connected, account_email, provider }`): mark connected, show the `account_email`, close the form, and surface a **"Scan now"** affordance (step 3). Clear the password field from memory.
  - **On 400**: show the `detail` message inline under the form (e.g. "could not connect iCloud Mail: the email or app-specific password was not accepted") and keep the form open so they can retry. Do **not** treat 400 as a generic failure — the detail is user-actionable.
- Never store or log the app password client-side; it's write-only to the API.

### 2. Connected state
- When the row shows `authenticated === true` and `method === "imap"`, render it as **Connected** with the `account_label`/`account_email`, a **Disconnect** button, and a **Scan now** button.
- **Disconnect** → **`DELETE /api/v1/integrations/icloud`** (optionally `?account_email=<email>` to remove just one of several). On 204, return the card to the not-connected state.
- A user may connect **more than one** iCloud address — after a successful connect, still offer "Connect another address".

### 3. Scan now (immediate pull; the scheduler also reaps it automatically)
- **"Scan now"** → **`POST /api/v1/inbox/scan?source=icloud`**. Show a brief spinner, then a result toast from the response: `fetched`, `job_found`, `ingested` (e.g. "Scanned 23 emails — found 7 job emails, added 4 matches"). If `ingested > 0`, refresh the matches list.
- On **400 "connect icloud first"**, send them back to the connect form (shouldn't happen from the connected state).
- Explain once that new mail is pulled automatically on a schedule, so "Scan now" is only for an immediate refresh.

### 4. Privacy copy
Add a line matching the app's existing email-privacy framing: **"Only job-related email is read into your matches — everything else is ignored, and your password is stored encrypted and never shown again."**

### Scope & acceptance
Frontend over `GET /api/v1/integrations/imap-providers`, `GET /api/v1/integrations/connected-apps`, `POST /api/v1/integrations/connect-imap`, `DELETE /api/v1/integrations/icloud`, `POST /api/v1/inbox/scan?source=icloud` (all **LIVE** — no backend change). 
Acceptance: an **iCloud Mail** connect card appears beside Gmail; connecting with a valid iCloud email + app-specific password succeeds and shows the connected address; a wrong password shows the server's actionable 400 detail and lets the user retry; **Scan now** reports fetched/found/ingested and refreshes matches; **Disconnect** removes it; the app-specific-password guidance (with the appleid.apple.com link) is clearly distinguished from the Apple ID password; and no password is ever displayed back or stored client-side.

## P70 — BUG: opening a cover letter's full editor crashes ("Cannot access 'Kt' before initialization")

**Frontend only — the backend is fine (the data loads; this is a rendering crash).**

### Reproduce
1. Sign in → **Documents** → open a **cover letter** (e.g. from "Open cover letter" / "Open this version", route `/dashboard/documents/cover-letters/<id>`).
2. The page hits the app's error boundary — **"Something went wrong on this page"** — with details **`ReferenceError: Cannot access 'Kt' before initialization`**. The **résumé** editor at `/dashboard/documents/resumes/<id>` opens fine; only the **cover-letter** editor route throws. Confirmed on the published site 2026-11-04.

### Root cause (what to look for)
This is a JavaScript **temporal dead zone (TDZ)** error: the **cover-letter editor page component** references a value **before it's initialized**. In the shipped bundle the crash is at the very top of that component, where a derived constant is computed from the **document "kind"/type** during render — of the shape:
```js
const label = KIND === 'cover_letter' ? 'A' : 'B';   // KIND here is read before it exists
```
The referenced binding (`KIND` / the document-kind constant / a shared constant or context) has **no local declaration in the component** — it comes from module scope — so it is in the TDZ when the component first renders. That is the fingerprint of **either**:
- a **circular import** between the cover-letter editor module and a shared module (a constants file, a context, a helper, or the résumé editor it was branched from) — the shared module's `const`/`let` export hasn't finished initializing when the cover-letter editor renders; **or**
- a **module-scope `const`/`let` referenced before its declaration line** inside the cover-letter editor file (e.g. a constant or `styled`/config object used above where it's defined).

The résumé editor is structurally identical and works, so the bug is in **what the cover-letter editor imports / the order it declares things**, not in the shared UI.

### Fix
1. In the **cover-letter editor/workspace page component**, find the value it reads near the top (the document-kind constant / shared constant / context used to compute a label, tab set, or template — anything branched on "résumé vs cover letter") and make sure it is **declared or imported before first use**. Move any module-scope `const`/`let` **above** the component (or above its first reference).
2. **Break the import cycle:** move every constant/enum/helper/context that **both** the résumé editor and the cover-letter editor use into its **own leaf module** that imports nothing from either editor, and import it from there in both. Neither editor should import from the other, and neither should import from a barrel/index that re-imports it back.
3. Mirror the **résumé editor's** import structure and declaration order (it initializes the same binding in time). Do **not** paper over it by only wrapping the route in an error boundary — fix the TDZ so the editor actually renders.

### Acceptance
- Opening **any** cover letter to its full editor (`/dashboard/documents/cover-letters/<id>`) renders the editor (preview + side panel) with **no** error boundary and **no** console error (`Cannot access '…' before initialization` gone).
- The résumé editor still opens normally; both document types render from the same shared components.
- Switching between a résumé and a cover letter, and using Full-size/Preview, never throws.

## P71 — Make setup / connection flows easy to find (a Connect hub + contextual entry points)

**Frontend only; all endpoints are LIVE.** Today the setup/connection flows (email — Gmail & iCloud — job-site connections, the browser extension, and the forwarding address) are scattered and hard to find. Give them **one obvious home in the main menu** and small contextual links where users naturally look — without adding clutter or nag banners. Match the design system (P9 one accent, P60 dark mode); mobile-first; Bearer auth; global P0 rules.

### 1. Main menu — a **Connect** entry (canonical home)
Add a **Connect** (a.k.a. "Set up") item in the sidebar's existing **CONNECT** section. It opens a single **Connect hub** page that lists every setup option with a live status chip and a one-click connect/manage action:
- **Email** — Gmail (OAuth) **and iCloud Mail** (app-specific password) **and** the forwarding address. Drive from `GET /api/v1/integrations/connected-apps`, `GET /api/v1/integrations/imap-providers`, `GET /api/v1/inbox/address`. iCloud uses the P69 connect-imap form; Gmail uses OAuth where `oauth_available`.
- **Job sites** — LinkedIn, Indeed, Greenhouse, Workday, etc., from `connected-apps` (OAuth or connected-browser-session method, with `supports_auto_apply`/`ai_access`).
- **Browser extension** — install/update from the **Chrome Web Store** (the same listing "Get the extension" already points to), showing connected/needs-update status from the extension heartbeat, **plus a one-click "Enable in this browser"** (see below).
Each row: name · status (connected / not connected / needs attention) · action. This page is the one place that answers "how do I connect X?".

### 1a. Enable the extension in ONE CLICK — the user never copies a token (required for non-technical users)
The extension needs the user's Project Harbor session to pull jobs and fill forms. **Do NOT ask the user to find, copy, or paste a token** — that's developer-grade and will lose non-technical users. Instead, hand it to the extension automatically from the app:
- The extension content script (on the app's own origin) already announces itself: listen for the `harbor-connect-ready` event / `document.documentElement.dataset.harborConnect` to know it's installed.
- When installed **and** the user is signed in, show a single **"Enable in this browser"** button in the extension row (or auto-run it once). On click, `window.postMessage` to the extension:
  ```js
  window.postMessage({ source: "harbor-app", type: "harbor-session",
    refreshToken: <the user's current refresh token>, apiBase: <API base> }, window.location.origin);
  ```
  The extension stores it locally and replies `{ ok: true, linked: true }`; show "Enabled ✓". That's the entire user action — one click, no token ever shown.
- If the extension is **not** installed, the button becomes "Add to Chrome" → the Web Store listing; after install, auto-run the link.
- Keep the manual paste (popup → Advanced) only as a hidden power-user fallback; never surface it in the normal flow.

### 2. Contextual entry points (small inline links, never banners)
Surface a quiet link to the relevant Connect-hub section from where the need arises:
- **Résumé / cover-letter upload** screen → "Connect email to auto-import job replies" → email section.
- **Matches empty / stale state** (the `matches_frozen_no_feeder` case) → one inline line "Connect email or a job site to keep matches updating" → Connect hub.
- **Inbox** → a link from the existing email area to the full Connect hub.
- **Extension**: the existing "Get the extension" / "Update extension" affordances link to the Chrome Web Store listing **and** to the hub's extension row.

### 3. Onboarding re-runnable
If a first-run onboarding wizard exists, make its "connect your accounts" step reachable **any time** from the Connect hub (re-runnable), not a one-time screen.

### Acceptance
A **Connect** nav item opens a hub showing Email (Gmail + iCloud + forwarding), Job sites, and the Extension with live status and one-click connect; the same flows are reachable via **small contextual links** from résumé/cover-letter upload, the Matches empty state, and Inbox; the extension links to its **Chrome Web Store** listing; and nothing is added as an intrusive banner — the site stays uncluttered.

## P72 — Move the keyboard-shortcut tips out of the page body into a "Tips & Tricks" menu

**Frontend only.** The Documents editor currently shows an inline keyboard-shortcuts **banner** in the main content ("New: drive the editor from the keyboard — `Ctrl+S` save in place, `Shift+Ctrl+S` save as new version, `Ctrl+F` Find & Replace, `Alt+I` jump to Ask AI… every key is also in the Shortcuts panel"). It clutters the workspace. Relocate the tips; keep the workspace clean. Match the design system; mobile-first.

### Do
1. **Remove** the inline keyboard-shortcut banner/tips card from the Documents editor body — and any similar inline shortcut hints that interrupt the main content.
2. Add a **"Tips & Tricks"** menu item (e.g. under **ACCOUNT** or a Help area). It opens one calm page that houses:
   - **Keyboard shortcuts** — the full list currently in the Shortcuts panel (save in place, save as new version, Find & Replace, jump to Ask AI, zoom, undo/redo, etc.), grouped by area.
   - Room for a few other short usage tips (how versions work, Ask AI, connecting email) — concise cards, not a wall of text.
3. Keep a **minimal** in-editor affordance: a small **"?" / Shortcuts** icon (or the existing Shortcuts panel toggle) that opens the shortcuts on demand — but **no** large banner in the body. Any first-time hint is a single dismissible one-line tooltip, not a persistent card.
4. Preserve the site's uncluttered feel: one menu entry, consistent with P9/P60, works on mobile.

### Acceptance
The keyboard-shortcut banner no longer appears in the Documents editor body; a **Tips & Tricks** menu item opens a page with the full keyboard-shortcut list (and space for tips); an unobtrusive in-editor shortcuts affordance remains; and the workspace looks cleaner with no loss of the shortcut information.

## P73 (patch) — Cover letters must render as a real preview ("Couldn't load this version's design")

**Frontend-only patch; the backend is fine** — the cover-letter content endpoints return **200** (`POST /api/v1/cover-letters/{id}/review`, the version content). On the Documents page a cover letter's preview card shows **"Couldn't load this version's design"** and plain text only — it does **not** render as a styled document preview the way a résumé does, so **adding a cover letter never produces a proper second preview**.

### Reproduce
1. Documents → **Cover letters**: the current cover letter's preview card reads "Couldn't load this version's design" (text only, no rendered document).
2. **Upload** or **Generate** a cover letter → it does not render as its own styled preview the way a résumé upload does.
3. (Related: opening a cover letter to the full editor still crashes — see **P70**. Fix both so the cover-letter preview works in the Documents list **and** the editor.)

### Root cause
The preview runs cover letters through the **résumé design/template render path**, but a cover letter has no template/design associated, so the render throws and the UI falls back to the "Couldn't load this version's design" **error card** instead of just rendering the document.

### Patch
1. Render the cover letter from its **content/version** using the **same shared document-preview component** résumés use (fit-width / zoom / Full-size / version marquee), pointed at the cover-letter text (already available from the 200 `review` / version content) — **not** a résumé-only design pipeline.
2. When a cover letter has **no template/design set**, fall back to a **clean default document render** (a plainly styled letter). Never show "Couldn't load this version's design" for a missing template — only surface a design error if an explicitly chosen template genuinely fails.
3. **Adding a cover letter** (Upload or Generate) must immediately show it as its **own rendered preview** — a second preview, same renderer as a résumé — not a text-only card.
4. Leave résumé previews unchanged.

### Acceptance
A cover letter renders as a full styled document preview with the same behavior as a résumé (zoom / fit / Full-size / version marquee); the "Couldn't load this version's design" card is gone (default render when no template is set); uploading or generating a cover letter immediately produces its own rendered preview; and résumé previews still work.

## P74 (patch) — Remove the always-on "Update extension" button from the top bar (and fix its source)

**Frontend only.** The top bar shows an **"Update extension"** pill that is **always active and always says an update is available** — it never reflects reality. Remove it from the top bar, and fix/relocate the underlying signal so a *genuine* update prompt only appears when there actually is one.

### Do
1. **Remove** the persistent **"Update extension" / "Upgrade extension"** button from the global top bar. The top bar should not carry a standing extension-update nag.
2. **Audit its info source.** Find what currently drives the "update available" state and why it's always true. Likely culprits: a hardcoded/true flag, a stale `localStorage` marker (e.g. `hirewave_extension_update_notified` / `hirewave_extension_last_seen`), or a version check that compares wrong/missing values so it always reports "newer available." Make the state come from a **real version comparison** — the installed extension's reported version vs. the latest Chrome Web Store version the app knows — and default to **no update** when the version can't be determined (fail closed, not "update available").
3. **Relocate** any genuine "update available" indicator into the **Connect hub → Browser extension row** (P71): show "Update available" there, linking to the Chrome Web Store listing, only when the real check says so. No top-bar pill.
4. Leave the normal "Get the extension" install affordance intact (for users who don't have it yet) — this patch is about the false *update* nag, not install.

### Acceptance
The top bar no longer shows an "Update extension" button; an update prompt appears only when a real version check confirms a newer extension exists (and never by default); any legitimate update notice lives in the Connect hub's extension row with a Chrome Web Store link; installing the extension when absent still works.

## P75 (patch) — Uploaded/generated documents must never auto-become "current" (the user chooses)

> **⚠ Superseded for the upload/generate case by [P86].** The user reversed this: an **explicit upload or generate IS an explicit choice**, so the new document **should** become current and show in the marquee immediately (P86). P75 still governs the cases it was really meant for — **login, migration, device switch, page load** must never auto-switch "current" to the newest-by-date. Keep P75 for those; follow P86 for a deliberate upload/generate.

**Frontend only.** Today, uploading or generating a résumé/cover letter **auto-switches the "current" document** to the new one (the marquee flips to "your latest résumé" and shows the upload). The current document should be whatever the user **explicitly chose**, never "the newest by date." (Backend has no "current document" concept — "current" is purely a client selection the app persists via `PUT /api/v1/view-state/resumes` · `/cover-letters`.)

### Do
1. **Treat "current" as an explicit, persisted selection**, not "the latest." The marquee/editor shows the document whose id the user selected (stored in `view-state`), and the header reads "versions of your **current** résumé/cover letter" for that selection.
2. **On upload or generate:** add the new document to the library, confirm with a small toast ("Résumé added — open it to make it current"), and **do not change the current selection**. The previously-current document stays current and keeps showing in the marquee.
3. **Switching is always deliberate:** give every document in the library an explicit **Open** / **Make current** action. Only that action (or clicking the document) changes the current selection and persists it to `view-state`. Never auto-select the newest.
4. **First-ever document** (empty library, no current selection yet) may become current automatically — there's nothing to displace. Never auto-replace an existing explicit selection.
5. Apply identically to résumés **and** cover letters.

### Also (same upload path): fix the stale count badge
After an upload, the **"Résumés" / "Cover letters" tab count badge** doesn't refresh (e.g. shows `1` when there are now `2`). Re-read the list (`GET /api/v1/resumes` · `/cover-letters`) on upload success so the count and the library list update immediately.

### Acceptance
Uploading or generating a résumé or cover letter never changes which document is shown as current; the new item appears in the library with an explicit **Open / Make current** control; the current document changes **only** when the user picks it (persisted in `view-state`); the first document on an empty library may become current; and the tab count badge updates immediately after an upload.

## P76 — Real-time AI-activity bubbles + authorization checkpoints (security & control)

A live, glanceable stream of **what the app's automation/AI is doing on the user's behalf** when it has access to their connected email and authenticated job sites — shown as small **bubbles/toasts** — plus **approval checkpoints** for sensitive actions. **The point is to reassure the user about their security and control:** they always see what's happening, and nothing sensitive happens without their explicit OK. **Backend is LIVE** (`GET /api/v1/activity`); this builds the UI. Design system (P9 one accent, P60 dark mode); mobile-first; Bearer auth; global P0 rules.

### 1. Feed source (one endpoint)
Poll **`GET /api/v1/activity?since=<last generated_at>&limit=50`** on a cadence (~8–12s while the tab is **visible**; pause when hidden via the Page Visibility API; back off when idle). Response:
`{ items[], pending_action_count, unread_count, mode{automation_live, submit_live, email_scan_live, sourcing_live, worker_active}, generated_at }`.
Each item: `{ id, kind: "notification"|"checkpoint", type, category: matches|application|document|security|system, message, at, read, requires_action, action? }`. **Dedupe by `id`.**

### 2. Passive update bubbles (`requires_action: false`)
As new items arrive, show a small **toast/bubble** in a fixed corner — 1–2 lines, a category icon/colour, **auto-dismiss ~6s**, stack a few max, with "View all" to open the panel. These never block and never need a click. E.g. "Scanned your inbox — added 3 matches", "Prepared a tailored draft for *Staff Engineer @ Globex*".

### 3. Checkpoint bubbles (`requires_action: true` / `kind: "checkpoint"`)
These need a decision and **must not auto-dismiss**. Show a persistent card with the message + **Approve** / **Reject**:
- Approve → `POST action.approve` (`/api/v1/auto-apply/approvals/{id}/approve`); Reject → `POST action.reject`. Bulk: `POST /api/v1/auto-apply/approvals/approve-all`.
- If **`action.will_submit_for_real === false`**, badge it: *"Test mode — the form is filled and held; nothing is sent."* When true: *"On approve, this application is sent."*
- A **reauth** checkpoint (category `security`) → "Reconnect your Gmail/iCloud" linking to the Connect hub (P71).
- Keep a **pending-actions tray/badge** = `pending_action_count`; it persists until each is resolved.

### 4. The activity overview panel
A **bell/pulse icon** in the top bar with two badges (`unread_count`, `pending_action_count`) opens a compact panel: recent `items` newest-first (**the quick overview**), **checkpoints pinned at top**, grouped by category. Mark read via `PUT /api/v1/notifications/{id}/read` and `/read-all`. `mode.worker_active` drives a subtle "AI is working" pulse.

### 5. Security & control (the whole point)
At the top of the panel, a short **assurance line + live/simulated status** from `mode`:
- `submit_live === false` → "Automation is in **simulated** mode — nothing is actually sent." `=== true` → "**Live** — applications are sent **only after you approve each one**."
- Always state the guarantee: **"Nothing is sent to an employer or on your behalf without your explicit approval."**
- Give one-tap **Pause / Stop automation** controls (reuse auto-apply grants: `GET /api/v1/auto-apply/grants` + its pause/revoke endpoints) so the user can halt everything instantly.
- **Badge every simulated action** so the feed never overstates what happened.

### 6. Reasonable, not excessive
Passive actions (scanning, sourcing, drafting, matching) **just bubble and fade** — no prompts. Only **sensitive/irreversible** actions (submitting to an employer, sending on the user's behalf, reconnecting access) create a checkpoint that asks. Never prompt for routine reads.

### Acceptance
Real-time bubbles appear for AI actions as the feed reports them, and passive ones auto-dismiss; a prepared application shows a **persistent checkpoint** bubble with Approve/Reject wired to the approvals endpoints and **never sends without approval**; simulated actions are clearly badged; a top-bar activity panel gives a quick overview with unread + pending counts, a live/simulated status, and a Pause/Stop control; and no passive action ever interrupts the user. Verify on the published site.

## P77 — Mobile that works without the extension (email-fed matches + tap-to-copy Apply helper + desktop handoff)

**Frontend only; all endpoints are LIVE.** Browser extensions do **not** run on mobile Chrome/Safari, so the extension's Fill/pull/connect features are desktop-only. On a phone the web app must still deliver real value **without the extension**, and never dangle a feature the user can't use. Platform-detect (user agent + no-extension); mobile-first; design system (P9/P60); global P0 rules.

### 1. Email-fed matches as the mobile default
On mobile, lead the Connect hub (P71) and the Matches empty state with **"Connect your email to keep matches coming"** — Gmail (OAuth) and iCloud (P69 app-password), which need **no extension** and feed matches on mobile exactly like desktop. This is the primary mobile growth loop; make it the first thing a phone user sees.

### 2. Apply helper — tap-to-copy (uses `POST /api/v1/apply/field-map`)
Mobile can't auto-fill a job form, but it can make manual applying fast. On a match's "Apply" action, open an **Apply helper** sheet:
- Call `POST /api/v1/apply/field-map` with the common application fields (name, email, current title/company, etc.) for the selected résumé/job. 
- Render each returned `mappings` item as a **tap-to-copy chip** ("Email → you@example.com · Copy"), grouped; show `needs_user` items as "you answer these" and omit `skipped_sensitive`.
- Also offer **Copy résumé text** / **Copy cover letter** and an **Open job ↗** button (opens the posting in the mobile browser) so the user pastes each field as they go.
- Clear, honest framing: "We prepared your answers — tap to copy into the application." No claim of auto-fill.

### 3. Desktop handoff (honest, not a nag)
Where the desktop extension would auto-fill, show a single quiet line: **"On a computer, the Project Harbor extension fills this for you in one click."** Link to the Connect hub's extension row. One line, dismissible, never a blocking modal.

### Mobile hygiene
- **Hide** every extension-only affordance on mobile (install/enable extension, "Fill with Harbor", pull-from-tab) — don't show a button that can't work. Surface them only on desktop.
- Keep everything else (matches, résumé/cover-letter editing, AI, activity bubbles, approvals) fully usable on a phone.

### Acceptance
On a phone, the app leads with email-connect for matches (no extension prompts), an **Apply helper** turns a match into tap-to-copy field values from `/apply/field-map` plus copy-résumé/cover-letter and open-job, and a single quiet "fills in one click on a computer" line points to desktop — while all non-extension features work normally; no extension-only button is shown on mobile. On desktop the extension flow (P71/P76) is unchanged.

## P78 (patch) — Profile menu / account section must show the REAL signed-in user (no mock name)

**Frontend only.** The profile menu in the user's **Account** section shows a **hard-coded mock name** (e.g. "Jordan") instead of the signed-in user's real name. The backend has the real identity (confirmed: the account's `full_name` is the user's actual name) — the UI just isn't using it.

### Do
1. Source the profile menu's **name, email, and avatar initials from the real session user** — the same identity the dashboard greeting already uses ("Good evening, <name>"). Never a hard-coded demo name.
2. Apply this everywhere a name/avatar renders: the **account/profile menu**, the account-settings header, the avatar initials, and any "signed in as" line.
3. **Remove any hard-coded placeholder identity** ("Jordan", "Alex Sample", etc.) from the UI. Fallback order when a name is missing: `full_name` → email local-part → "You" — **never** a mock person.

### Acceptance
The profile menu and account section show the **signed-in user's real name and email**; no mock/placeholder name appears for any account (verify on the migrated Gmail account — it should read the real name, not "Jordan").

## P79 (patch) — Make the résumé styling/design control easy to find (top of the résumé render)

**Frontend only.** The résumé **styling / design** function (template + design + section styles — P2.4) is not easily accessible; users can't find it. Surface it **at the top of the résumé render**, in the preview toolbar.

### Do
1. Put a clearly-labeled **Style / Design** control in the **résumé preview toolbar at the top** (alongside fit/zoom/full-size/download) — not buried in a tab or menu.
2. It opens the existing design/template chooser: `GET /api/v1/resume-templates` (+ `/categories`), `POST /resume-templates/generate`, `PUT /api/v1/resumes/{id} { template_id }`, and the section-style controls. Applying a style **re-renders the preview immediately** (new version via the normal save path).
3. Keep it available in both normal and full-size preview.

### Acceptance
A **Style / Design** control is visible at the top of the résumé render and opens the design/template chooser; choosing a template or style re-renders the preview right away; it's reachable without hunting through tabs.

## P80 (patch) — Every screen must recognize the user's existing résumé (don't depend on empty client state)

**Frontend only; the backend already has the résumé.** A résumé that uploaded and **renders in Documents** isn't recognized by other screens (tailor, Matches, interview prep, auto-apply) — because those read a **client-side "selected/current résumé"** that's empty on a fresh session (e.g. after an account migration or first login on a new device). Every backend feature already finds the résumé by the user's id (`GET /api/v1/resumes`); the UI just isn't fetching/selecting it.

### Do
1. Any screen that needs "the user's résumé" must **fetch `GET /api/v1/resumes`** and, when nothing is explicitly selected in `view-state`, **default to the user's current/most-recent real résumé** (skip `is_sample`), then persist that selection (`PUT /api/v1/view-state/resumes`).
2. After **login or migration** with ≥1 real résumé, **auto-select it as current** so Documents, Tailor, Matches, Interview prep, and Auto-apply all see it immediately — no re-upload, no manual pick.
3. **Never show "no résumé — upload one"** (or an empty résumé picker) when the user actually has a résumé in Documents. If the picker is empty, re-fetch the list before showing the empty state.

### Acceptance
With a résumé present in Documents, **every résumé-dependent screen recognizes and uses it** without re-uploading or manually selecting; a freshly migrated or first-login account with one real résumé has it active across Tailor, Matches, Interview prep, and Auto-apply; the "no résumé" empty state never shows when one exists.

## P81 (patch) — Robust extension detection + "refresh to activate" after install

**Frontend only.** "Get the extension" shows an **install** prompt even for users who've installed it, because (a) the app checks for the extension at a single moment and can miss the content script's slightly-later announcement, and (b) a freshly-installed extension's content script **doesn't inject into already-open tabs** until the page is refreshed.

**How the extension signals presence:** its content script, on the app origin, sets `document.documentElement.dataset.harborConnect = <version>` and dispatches a `harbor-connect-ready` CustomEvent (`detail.version`).

### Do
1. **Detect on load AND via event AND by brief polling:** read `document.documentElement.dataset.harborConnect`; also `window.addEventListener("harbor-connect-ready", …)`; also poll the dataset for ~3s after load (the content script runs at `document_idle`). When any fires, mark the extension **Installed** (show version) and record last-seen.
2. **After the user clicks "Add to Chrome"**, show a clear step: **"Installed? Refresh this page to activate the extension"** — content scripts don't load into already-open tabs; a refresh flips the state to Installed ✓.
3. When the marker is present, the row shows **Installed ✓ (version)** with a Manage link, **not** an install button.
4. "Needs update" shows **only** when the installed version is genuinely older than the store's latest (ties to P74) — never by default.

### Acceptance
A user with the extension installed sees "Installed ✓" (after a refresh if they just installed it), not an install prompt; detection works whether the content script announces before or after the app's check; the install flow tells the user to refresh to activate.

## P82 — Résumé Design/Styles must be an OBVIOUS feature (top of the render AND a standalone menu item)

**Frontend only.** Earlier attempts (P79) still left Design hidden — users can't find how to change how their résumé looks. Make it **impossible to miss** by giving it **two** entry points. (Do not bury it inside a secondary tab.)

### Do
1. **A prominent button at the TOP of the résumé render.** In the preview header/toolbar — alongside fit/zoom/full-size/download — place a clearly-labeled **"Design"** (or **"Styles"**) button with an icon, in the **accent/primary color** so it stands out. Visible in both normal and full-size preview, always.
2. **A standalone "Design" (or "Styles & Templates") menu item** in the résumé/document navigation (or a clearly visible control in the editor header), so a user thinking "I want to restyle my résumé" finds it **directly**, without opening the editor's tabs.
3. Both open the **template/design chooser**: `GET /api/v1/resume-templates` (+ `/categories`), `POST /api/v1/resume-templates/generate`, `PUT /api/v1/resumes/{id} { template_id }`, and the section-style controls. **Live preview** — applying a template/style re-renders immediately (new version via the normal save path).

### Acceptance
A first-time user can change their résumé's look in **≤2 clicks** from the résumé view: a labeled **Design/Styles** button sits at the **top of the render** AND a **standalone Design entry** exists in the nav/header; neither is hidden in a secondary tab; choosing a template re-renders right away.

## P83 — Auto-setup wizard: one guided, step-by-step flow for non-technical users (progress bar + in-context permissions)

**Frontend only; all endpoints are LIVE.** Connecting email and getting the extension is still too hard for non-technical users. Replace the scattered steps with **one simple setup wizard** — a step-by-step **dialog** with an **overall progress bar**, one clear action per step, plain language, and permission requested **only at the moment it's needed**. It auto-runs on first login, is **skippable + resumable** (persist progress in `view-state`), **re-runnable** from the Connect hub, and **platform-aware** (hide desktop-only steps on mobile — P77). Match the design system (P9 one accent, P60 dark mode); mobile-first; Bearer auth; global P0.

### The flow (each step: a title, a one-line "why", ONE primary action, the progress bar, Back / Skip)
1. **Welcome** — "Let's set up Hirewave — about a minute." Show the step list, progress 0%.
2. **Your résumé** — if none, upload (drag-drop / file: .pdf/.docx/.txt → `POST /api/v1/resumes/upload`). If present, confirm "We'll tailor this one." Advance on success.
3. **Cover letter** *(optional)* — "Add a cover letter so we can tailor it per job." **Upload** one (`POST /api/v1/cover-letters/upload`) or **Generate** a starter (`POST /api/v1/cover-letters/generate`), or **Skip for now**. ✓ when present.
4. **Pick a look** *(optional — Design)* — "Choose a style for your résumé." Show the template/design chooser (same as P82): `GET /api/v1/resume-templates` (+ `/categories`), `PUT /api/v1/resumes/{id} { template_id }`; **live preview**, apply re-renders immediately. **Skip for now** keeps the default. ✓ when a style is chosen.
5. **Connect your email** (the key step) — plain: "Connect your email so job replies and alerts flow into your matches." Offer **Gmail** (if `connected-apps` says `oauth_available` → OAuth consent) or **iCloud** (the P69 app-specific-password form, with the appleid.apple.com link + help text). Request that permission **inline**; on success show ✓ and advance. "Skip for now" allowed. Drive from `GET /integrations/connected-apps`, `GET /integrations/imap-providers`, `POST /integrations/connect-imap`.
6. **(Desktop only) Get the browser extension** — detect via P81 (`dataset.harborConnect` / `harbor-connect-ready`). If missing: **"Add to Chrome"** → the Web Store listing → **"Installed? Refresh to activate"** → auto-detect. If present → ✓. On mobile, **skip** this step and show the P77 mobile apply path instead.
7. **(Desktop only) Enable in this browser** — **one click** posts the session to the extension (`harbor-session`, P71 §1a) — **no token copy-paste**. Show ✓.
8. **(Desktop only) Connect your job sites** — "Connect the job boards you already use so Project Harbor can pull your matches and apply for you." List the supported sites from `GET /api/v1/integrations/connected-apps` with each one's status. For each not-connected site, a simple **two-part** instruction: **(a)** "Log in to this site in your browser" (link opens it in a new tab), **(b)** **Connect** → the browser extension captures that site's existing session and posts it (the Connect-hub connect action / `harbor-connect` message → `POST /api/v1/auto-apply/sessions`). Show ✓ per site; let the user connect **several** or **Skip for now**. Requires the extension — if steps 6–7 weren't done, route back to them first. Note inline that **LinkedIn stays assisted** (you click Apply; nothing is auto-submitted there), per its terms. On **mobile**, skip this step (no extension) — note sites can be connected later on a computer.
9. **Join the community** *(optional)* — "Connect with other job seekers and discover shared résumé templates." One tap to **join the Project Harbor community** (the community / boards section — e.g. join the default board / enable the community feed). **Skip for now** allowed. Works on mobile too (no extension needed).
10. **Done** — "You're all set!" Summary of what's set up (résumé ✓ · cover letter ✓ · style ✓ · email ✓ · extension ✓ · job sites ✓ · community ✓), progress 100%, primary CTA → **View your matches**.

### Rules (what makes it "easy")
- **One thing per step**, in plain words; never dump all options at once.
- **Ask for each permission in-context**, with a short reason, at the step that needs it (OAuth consent / app-password / Chrome install) — not up front.
- **Overall progress bar** reflects completed/total steps and advances as each succeeds.
- **Never blocks the app**: the wizard is dismissible; the user can close it and finish later from the Connect hub, with progress remembered.
- **Platform-aware**: on mobile, show résumé, cover letter, Design, email, and community (+ the mobile apply path); **hide** the extension and job-site steps (desktop-only). Optional steps (cover letter, Design, community) are clearly skippable.

### Acceptance
On first login a non-technical user sees a guided wizard with a **progress bar**; each step asks for **one** thing in plain language and requests the needed permission **in-context** (OAuth / app-password / Chrome install / job-site login); completing it sets up **résumé, cover letter, résumé style (Design), email, job sites, and community** (+ the **extension** on desktop, enabled in one click with no token paste) with clear ✓s; cover letter, Design, and community are optional/skippable; the job-sites step walks the user through logging in and connecting each board (LinkedIn noted as assisted); it is **skippable, resumable, and re-runnable** from the Connect hub, and **hides desktop-only steps (extension + job sites) on mobile** while keeping the document and community steps.

## P84 (patch) — Obvious Delete for a whole résumé / cover letter (trash on the marquee + the document card)

**Frontend only; the backend delete is LIVE.** Users still can't find how to **delete an entire résumé or cover letter** — there's no visible trash control. (Deleting a *version* is different from deleting the whole document; make both obvious.) Backend endpoints already exist:
- Whole document: `DELETE /api/v1/resumes/{id}` · `DELETE /api/v1/cover-letters/{id}` → 204.
- One version: `DELETE /api/v1/resumes/{id}/versions/{version}` · `DELETE /api/v1/cover-letters/{id}/versions/{version}`.

### Do
1. **Delete the whole document — two visible places:**
   - A **trash / Delete control in the Document-versions marquee header** (next to "Open résumé/cover letter"), labeled so it's clear it removes the **entire** current document, not just a version.
   - A **trash icon on each document card** in the Résumés / Cover letters library list.
2. **Confirm before deleting** — a small dialog: "Delete this résumé/cover letter and all its versions? This can't be undone." Confirm → call the whole-document `DELETE`; on 204 remove it from the list, clear it as current if it was selected (fall back to another doc or the empty state), and refresh the count badge.
3. **Per-version trash stays** on each version card (delete just that version via the version `DELETE`), visually distinct from the whole-document delete so users don't confuse the two. Never allow deleting the last remaining version — delete the whole document instead.
4. Works for **both** résumés and cover letters, identically.

### Acceptance
From the Documents view a user can **delete an entire résumé or cover letter in ≤2 clicks** — a clearly-labeled trash/Delete sits in the marquee header AND on each document card, with a confirm; deleting removes it from the list and updates the current selection + count; per-version delete remains available and visually separate; the last version can't be deleted (delete the document instead).

## P85 (patch) — Uploading a cover letter must render + bump the count immediately (parity with résumés)

**Frontend only; the backend is fine.** `POST /api/v1/cover-letters/upload` returns **201** with the full cover letter (`content` extracted, an **Original** version seeded, `file_url`) — exactly like `POST /api/v1/resumes/upload`. For **résumés** this was already fixed: on a successful upload the new document renders at once and the tab count updates. **Cover letters still don't** — after uploading one, nothing renders as its own preview and the "Cover letters" count badge stays stale until a manual refresh. Bring the cover-letter upload path to **full parity with the résumé upload path**.

### Repro
1. Documents → **Cover letters** → **Upload** a `.pdf`/`.docx`/`.txt` cover letter. The call returns 201.
2. **Bug:** the new letter does not immediately appear as a rendered preview, and the **"Cover letters" tab count** doesn't visibly update until a reload. The identical résumé flow works.

### Backend truth (verified in-process, 2026-11-06 — do NOT try to "fix" this in the UI)
A fresh account ships **one seeded _sample_ cover letter** (`is_sample: true`). On the **first real upload** the backend **clears that sample and replaces it**, so the list count correctly stays **1** (sample → real), not `1 → 2`. The count only increments from the **second** real upload onward (`1 → 2`). Verified sequence: seeded `[sample]` → 1st upload `[real]` (count **1**) → 2nd upload `[real, real]` (count **2**). Each upload's **201 response already carries `content` + `versions:[{version:1,label:"Original"}]` + `active_version:1`**, and `GET …/{id}/preview.html` renders **200**. Consequences for the UI:
- **Don't gate "did it work?" on the count changing** — on the first upload it legitimately stays 1, so the UI must treat the **201 response** (not a count delta) as success.
- The most likely real symptom: the UI **never re-fetches the list**, so after the swap it keeps showing the **old sample** and the user thinks nothing was added/rendered. Re-fetching fixes both the preview and the badge.

### Do (mirror whatever the résumé upload success handler already does)
1. **On 201, use the returned object directly** — the response **is** the created cover letter with its content + `versions[0]` ("Original"). Add it to the in-memory cover-letters list and **render it immediately** through the **same shared document-preview component** résumés use (per P73 — never the résumé-only design pipeline; default clean letter render when no template). Do not wait for a separate fetch to draw the first preview.
2. **Always re-fetch the list** right after success — `GET /api/v1/cover-letters?archived=false` — and **replace the cached list with the response** (don't merge). This is what makes the swapped-out sample disappear and the real letter + badge show correctly (same as P75's résumé count fix). If the fetch lags, the optimistic insert from step 1 still shows the letter.
3. **Do not auto-switch "current"** (keep P75): adding a cover letter doesn't change the current selection; show the small "Cover letter added — open it to make it current" toast, with an **Open / Make current** control. (If the library was empty, the first one may become current.)
4. Make sure the upload success handler is **wired for cover letters at all** — the likely root cause is that only the résumé branch calls the "insert + render + re-fetch list" routine, and the cover-letter branch just closes the dialog. Use **one shared post-upload routine** parameterized by document kind so the two paths can't drift again.
5. Null-safe + global P0 rules (token refresh, render on 200, never a stuck spinner — if the first render is slow show a skeleton, not a dead spinner).

### Acceptance
Uploading a cover letter makes it **appear as its own rendered preview immediately** (same renderer/behavior as a résumé) **and** bumps the "Cover letters" count badge right away with no manual refresh; and the résumé upload flow still behaves exactly as before. *(Per [P86], the uploaded document now also becomes **current** and shows in the big Document-versions marquee — not only in the Quick preview.)*

## P86 (patch) — Uploading/generating a document must SHOW it: make it current in the marquee + never fail silently

**Frontend only; backend fully verified working (2026-11-06).** Live reproduction on the published site proved the data layer is correct: a real **Upload file** click fired `POST /api/v1/cover-letters/upload` → **201**, the list **re-fetched** (`GET …?archived=false` 200), and the uploaded doc's **preview.html + preview.png rendered** (200) in the **Quick preview** pane, with the count going up. **The problem the user sees:** the uploaded document does **not** appear in the dominant **"Document versions" marquee** — that marquee only follows the letter marked **Current**, and P75 kept "current" from changing on upload — so the most-looked-at area shows no change and it reads as *"uploading a document does not show."* The user has decided an **explicit upload/generate is an explicit choice** and should become current. Also, transient backend **`503`s** (Railway restarts) were observed, and a failed upload currently shows **nothing** — a swallowed error that also looks like "it didn't work."

### Do — Part A: the uploaded/generated doc becomes current and shows in the marquee
> **Proven hook (verified live 2026-11-06):** the **"Make current"** button already live-updates the marquee with **no page reload** — clicking it fires `PUT /api/v1/view-state/cover-letters` then re-fetches the doc + `preview.html`/`preview.png` and the marquee switches instantly. The marquee *is* reactive to the current selection. **So do NOT invent a new refresh mechanism — on upload success, call the exact same "Make current" handler** the button uses, passing the newly-uploaded document's id. That is the whole fix for "the marquee doesn't reload."
>
> **THE EXPLICIT RENDER COMMAND (this is the line that "renders the preview in the marquee"):** there is **no separate "render into marquee" call** — the marquee is **data-bound to the current selection id**, so *setting the current id IS the render command.* In the upload success handler do exactly:
> ```js
> const doc = await res.json();                 // 201 body == the new document (has content + versions[0])
> setCurrentCoverLetterId(doc.id);              // ← renders it in the marquee (marquee is keyed on this id)
> await fetch('/api/v1/view-state/cover-letters', {
>   method: 'PUT',
>   headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
>   body: JSON.stringify({ selectedId: doc.id }),   // persist so it survives reloads
> });
> ```
> The marquee component **must be keyed/eff:** `key={currentId}` or `useEffect(..., [currentId])` that re-fetches `GET /api/v1/cover-letters/{currentId}` (+ `/versions`, `/preview.png|html`) and renders. **If the marquee does not change when `currentId` changes, it is not bound to the selection — bind it.** (Résumés identical with `setCurrentResumeId` + `/view-state/resumes`.)
1. On a **successful** upload (`POST …/resumes/upload` · `…/cover-letters/upload`) **or** generate (`…/cover-letters/generate`, `…/resumes` generate), **invoke the existing "Make current" action on the new document's id** — i.e. set it as the current selection and **persist it** via `PUT /api/v1/view-state/resumes` · `/cover-letters` `{ selectedId: <new id> }`, then let the marquee/editor re-render from that selection exactly as the button already does. The big **Document-versions marquee** must then switch to and render the **just-added document** (its `versions[0]` "Original"), not the previously-current one. **Root cause to avoid:** the upload handler currently updates the list/preview but **never changes the current selection**, so the selection-driven marquee has no reason to re-render — reusing the Make-current path fixes that.
2. Keep everything P85 already does (insert into list, re-fetch the list, bump the count, render in the preview). Now the **marquee** reflects it too, because current = the new doc.
3. **This is the ONE carve-out from P75.** Everywhere else P75 still holds: **login, migration, device switch, plain page load, or a background list refresh must NOT auto-switch** current to the newest-by-date. Only a **deliberate upload/generate in this session** moves current. (If you want a safety valve, briefly surface an **Undo / "keep my previous current"** on the success toast — optional.)
4. Apply identically to **résumés and cover letters** (one shared post-upload routine, per P85).
5. **Make the two-step upload obvious:** after a file is selected, the **"Upload file"** confirm button must be visually prominent (primary styling, clearly the next action) so users don't leave a file merely *staged*. (Selecting a file alone must never be mistaken for a completed upload.)

### Do — Part B: never fail silently (visible error + Retry)
6. Wrap the whole upload flow (the `POST`, the list re-fetch, and the `view-state` PUT). If **any** step fails — **503**, network error, timeout, or a 401 that refresh can't fix — show a clear, non-dismissable-until-acknowledged **error toast**: *"Upload didn't go through (server was busy). Try again."* with a **Retry** button that re-runs the same upload. **Never** leave the user with no feedback.
7. A **503 / timeout is transient** — Retry should just repeat the request (optionally auto-retry once after ~1.5s before showing the error). Distinguish it from a **4xx** (bad file/too large → show the real reason, don't auto-retry). Follow global **P0** (token refresh on 401, render on 200, never a dead spinner).
8. Show an explicit **in-progress** state on the confirm button ("Uploading…") so the user knows it's working, and clear it on success or error.

### Acceptance
Uploading **or** generating a résumé/cover letter immediately makes that document **the current one shown in the big Document-versions marquee** (and the preview + count), via a persisted `view-state` selection — the user no longer has to hunt for it. P75 still prevents any auto-switch on **login/migration/page-load/background refresh**. The **"Upload file"** confirm is unmistakably the next step. And if the upload (or its follow-up refresh) **fails for any reason**, the user sees a clear **error + Retry**, never silence — a transient `503` no longer looks like "nothing happened." Works identically for résumés and cover letters.

## P87 (BUG) — Deleting a document strands "current" → "no versions" + can't upload a new version (404)

**Frontend only; backend verified correct 2026-11-06.** Reproduced live: after a document is **deleted** (the whole-document P84 Delete), the app's persisted **current selection (`view-state.selectedId`) still points at the now-deleted id**. The marquee then shows **"No saved versions of this cover letter yet,"** and any attempt to **add/upload a new version** hits `POST /api/v1/cover-letters/{deletedId}/versions` → **404 "cover letter not found"** — so the user is stuck and "could not upload a new version." (Backend is fine: `GET /cover-letters/{missing}` returns 404, and `DELETE …/versions/{version}` already returns **400 "can't delete the only version"**, so the *last* version can't be removed that way — the document was removed by the whole-document Delete, and the UI just never moved the selection off it.)

### Do
1. **Heal a dangling current selection.** Whenever the current document's fetch returns **404** (on page load, after a delete, or after a background refresh), treat the stored `selectedId` as invalid: **pick another existing document** (e.g. most-recently-updated) as current and **persist it** (`PUT /api/v1/view-state/{resumes|cover-letters}`), or show the **empty state** if the library is now empty. Never leave the UI pinned to a missing id.
2. **On deleting the current document** (P84 whole-document Delete), immediately **move current to another document** (or empty state) and persist — do this as part of the delete success handler, not lazily.
3. **Never POST a version to a missing/empty current.** The "add a new version" / "upload a new version" action must target a **valid** current document. If there is no valid current doc, route the user to **upload/create a new document** (which becomes current per P86) instead of firing a version POST that 404s. If a version POST ever returns 404, surface a clear message ("That document was removed — upload a new one") and drop into the new-document flow, never a silent failure (P0/P86 error rule).
4. **Keep P84's last-version guard in the UI:** the per-version trash must be **hidden/disabled on the only remaining version** (the backend returns 400 for it) — to remove a one-version document the user uses the **whole-document Delete**, which must warn it removes the **entire document and all versions**.
5. Applies identically to résumés and cover letters.

### Acceptance
Deleting a document never leaves the app stuck: current moves to another existing document (or a clean empty state) and persists; the "No saved versions" dead-end and the `404` on adding a version are gone; adding/uploading a version always targets a valid document (or starts a new one); the last remaining version can't be deleted from the per-version trash (use whole-document Delete, which warns); works for résumés and cover letters.

## P88 — Cover-letter versions must display HORIZONTALLY like the résumé versions (not blank/stacked)

**Frontend/layout only; all data already loads. The RÉSUMÉ versions display is the reference — make cover letters match it exactly.** Verified live 2026-11-06: the **résumé** "Document versions" strip works well — each version is a **large, fully-rendered card laid out horizontally, side by side** (the CURRENT card centred, the next clearly to its right, "‹ ›" to browse). The **cover-letter** versions strip is the same component but **broken**: its cards render **blank/empty** and appear **stacked/overlapping** on top of one another instead of sitting side by side. The user wants the cover-letter versions to **look and behave exactly like the résumé versions** — horizontal, distinct, fully-rendered cards.

### Do
1. **Use the exact same versions display for cover letters as for résumés** — same component, same **horizontal** side-by-side card layout, same spacing/sizing, same browse controls ("‹ ›", "N of M", Find a version, Hide identical). Do **not** invent a different layout for cover letters; the only differences should be the data source (`/cover-letters/...`) and labels ("cover letter" vs "résumé").
2. **Fix the blank render.** Each cover-letter version card must render **that version's own content** through the **same shared document renderer** the résumé cards use (per P73 — never the résumé-only design pipeline; default clean letter render when no template). Pull the content from the version (`GET /api/v1/cover-letters/{id}/versions/{version}` → `content`, or `.../versions/{version}/preview.png|preview.html`), exactly as the résumé cards do. No empty white cards.
3. **Fix the stacking/overlap.** Cards must sit **side by side in a horizontal row** (the résumé layout), each fully visible — **no `position:absolute` pile-up, no z-index stacking, no cards hidden behind the current one**. If the résumé strip uses a horizontal scroller/track, the cover-letter strip must use the identical one.
4. The **active/current** version card is highlighted with the **CURRENT** badge and centred/scrolled into view, same as résumés; per-card actions (activate / rename / per-version trash with the P84/P87 guards) behave identically.
5. This is specifically about bringing the **cover-letter** versions strip up to parity with the résumé one — the résumé strip already looks right; don't change it beyond sharing the component.

### Acceptance
The cover-letter Document-versions strip is **visually and behaviourally identical to the résumé one**: version cards are **fully rendered** (no blank cards) and laid out **horizontally, side by side with no overlap/stacking**, browsable with the same controls, the CURRENT card highlighted and centred; the résumé strip is unchanged; both use the same shared component.

## P89 (BUG, root cause) — Upload "goes silent": the staged-file confirm + status render ~1200px OFF-SCREEN

**Frontend only; the upload handler works — the confirmation UI is just placed far below the fold.** Measured live 2026-11-06 (viewport 629px tall): when a user picks a cover-letter file, the file **stages correctly**, but the **staged-file panel renders at y≈1577px and its "Upload cover letter" confirm button at y≈1797px — ~1168px *below* the bottom of the screen**. The marquee (y≈256, in view) only **flickers** as state updates, then nothing visible happens. The user never sees a confirm button, a progress bar, or any status, so the upload is **never submitted** → "opens the file browser, I choose a file, the marquee slightly vibrates, then it goes silent with no indicators and the preview never shows." Clicking that off-screen confirm **does** work (upload → 201 → marquee updates per P86); the only defect is **placement + lack of in-view status.** This blocks the user from even testing Design/styling.

### Do
1. **Preferred — auto-submit on selection (best for non-technical users).** When a file is chosen from the picker, **start the upload immediately** — no separate, hunt-for-it confirm step. Show an inline **"Uploading `<filename>`…"** indicator **right at the Upload control** (top of the Cover letters / Résumés section, in view), then on success the doc becomes current and renders in the marquee (P86).
2. **If a confirm step is kept, it must be IN VIEW.** Render the staged-file panel (filename, **Upload** / **Choose a different file** / **Cancel**) **inline, immediately adjacent to the "Upload cover letter" button at the top of the section** — never 1000px down the page. On stage, **scroll it into view and move focus to the Upload button**. A modal/inline card anchored to the upload control is ideal.
3. **Always show status — never silent.** Visible states at the upload control: **selected → uploading (spinner/progress) → success** ("Added — now your current cover letter") **or error + Retry** (P86 Part B). The user must always see what's happening without scrolling.
4. On success, keep P86: the new doc becomes **current** and renders in the marquee; bump the count.
5. Apply identically to **résumé** and **cover-letter** uploads (same shared upload component — the résumé upload likely has the same off-screen-confirm issue).

### Acceptance
Picking a file to upload (résumé or cover letter) triggers the upload **without hunting for an off-screen button** — either it auto-submits, or the confirm panel appears **in view right at the upload control** with focus moved to it. The user always sees **progress and a success/error result** in view (never a silent flicker), and on success the document becomes current and renders in the marquee. No part of the upload flow renders below the fold.

## P90 — Basic formatting toolbar in the full document editor (inline) + font family/size in Design (document-level)

**Frontend only; saves through the existing version path.** Documents are stored as **Markdown** and rendered through a chosen **template/design**, and the renderer already honors Markdown **plus inline `<u>…</u>`**. Give the full editor a small, non-intimidating formatting toolbar (NOT a Word clone). Split: **inline character/paragraph formatting lives in the editor toolbar**; **font family + base size live in Design** (template-level), because per-character font/size doesn't fit a Markdown+template model and reads poorly on a résumé/cover letter.

### Do — editor toolbar (inline, acts on the current selection; all map to what the renderer supports)
1. **Bold** → wrap selection in `**…**`. **Italic** → `*…*`. **Underline** → `<u>…</u>`. Toggle on/off if already applied; buttons show an **active state** when the caret is inside that formatting.
2. **Text style / "size"** = a small dropdown mapping to headings (this is how size works in a doc model, not point sizes): **Title** (`# `), **Section heading** (`## `), **Subheading** (`### `), **Normal** (no prefix). Applies to the current line/block.
3. **Bulleted list** (`- `) and **Numbered list** (`1. `) toggles on the selected lines.
4. **Link** → wrap selection as `[text](url)` with a tiny URL prompt.
5. Optional (only if trivial): **Strikethrough** (`~~…~~`), **block quote** (`> `), **horizontal rule** (`---`).
6. **Keyboard shortcuts:** Ctrl/Cmd+B, +I, +U. **Mobile:** the toolbar is a horizontally-scrollable row of big tap targets (plain-language tooltips: "Bold", "Bigger (heading)", "Bullets").
7. **Save through the existing path** — edits produce updated Markdown saved via `POST /api/v1/{resumes|cover-letters}/{id}/versions { content }` (new version), and the preview/marquee re-renders from the response (P2.1/P86). No new endpoint.
8. The editor's output stays **valid Markdown (+ `<u>`)** so the renderer, ATS text, and templates keep working — do **not** emit arbitrary HTML/CSS, font tags, colors, or inline styles.

### Do — Design panel (document-level, NOT per-character)
9. In **Design**, expose **Font family** as a small **curated set** (e.g. 4–5: a clean serif, a clean sans, one "modern", one "classic") applied to the whole document via the template (`PUT /api/v1/{resumes|cover-letters}/{id} { template_id }` / the template chooser's existing render params). Live preview per choice (P2.4).
10. Expose **base size / density** as a simple scale — **Normal / Large** (or Compact / Comfortable) — template-level, not a point picker. (Only if the template system supports it; otherwise omit and keep font family + template.)
11. Keep Design **prominent near the document render** (per the earlier Design-prominence work) so users find font/size there.

### Explicitly do NOT add (keeps it clean, avoids the Word trap)
Arbitrary point sizes; per-selection text/highlight colors; multiple fonts within a paragraph; tables-as-layout; multi-column. These don't fit the Markdown+template model and make documents look amateur.

### Acceptance
The full editor shows a small toolbar — **Bold, Italic, Underline, a Title/Heading/Normal style dropdown, bulleted & numbered lists, and Link** (plus optional strikethrough/quote) — that formats the current selection, shows active state, supports Ctrl/Cmd+B/I/U, works on mobile, and **saves as valid Markdown (+`<u>`) through the existing `/versions` path** with the preview re-rendering. **Font family** and a simple **base size** live in **Design** at the document level with live preview. No arbitrary point sizes, colors, or font-mixing; the renderer/ATS/templates keep working.

## P91 — "Open in / Edit elsewhere": export to Word, Google Docs, PDF, or copy text (convenient, everywhere)

**Frontend only; export endpoints already LIVE and verified 2026-11-06.** Let users take a résumé/cover letter into their own editor. The backend already renders the **current active version** as a formatted file — no backend work for Part A:
- `GET /api/v1/resumes/{id}/export.docx` → **200**, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (real Word .docx)
- `GET /api/v1/resumes/{id}/export.pdf` → **200**, `application/pdf`
- `GET /api/v1/cover-letters/{id}/export.docx` · `…/export.pdf` → same
- `GET /api/v1/{resumes|cover-letters}/{id}/file` → the **original uploaded** bytes (keep as "Download original")

A **Word .docx is the universal exchange format** — it opens in **Microsoft Word, Apple Pages, LibreOffice, AND Google Docs** (Drive import). So one good export covers "my app of choice."

### Do — Part A (frontend, ship now)
1. **Add an "Open in… / Edit elsewhere ▾" control** in **convenient, obvious places**, for both résumés and cover letters:
   - the **document preview / versions-marquee header** (next to Open / Download / Design),
   - the **full editor header**,
   - each **document card's ⋯ menu** in the library.
2. **Menu items:**
   - **Download as Word (.docx)** — labeled "opens in Word, Pages, or Google Docs." Fetch `…/export.docx` with the auth header, get the blob, and save via an `<a download="<Name> — <Role>.docx">` (the endpoint doesn't set a filename, so the client names it). Never a raw link that 401s.
   - **Open in Google Docs** — since there's no Drive integration yet, do the pragmatic flow: trigger the **.docx download**, then open **`https://docs.google.com/document/u/0/`** (or `https://drive.google.com/drive/my-drive`) in a new tab with a one-line hint toast: *"Your Word file downloaded — in Google Docs choose File ▸ Open ▸ Upload to finish."* (When Part B ships, replace this with the one-click path.)
   - **Download as PDF** — `…/export.pdf` (for viewing/printing/sharing; note PDF is not easily editable).
   - **Copy text** — copy the current Markdown/plain text to the clipboard for pasting into any editor/email.
   - **Download original** — `…/{id}/file` (the exact file the user uploaded), clearly distinguished from the formatted export.
3. **Auth + null-safe:** all fetches send the Bearer token (P0), show a brief "Preparing…" state, and surface an **error + Retry** on failure (never silent). Disable items when there's no content yet.
4. **Plain language, mobile-friendly:** big tap targets, tooltips ("Edit in Word", "Edit in Google Docs", "Save as PDF"). No acronyms.

### Do — Part B (OPTIONAL, later; needs backend — do NOT block Part A on it)
True one-click **"Open in Google Docs"** requires a **Google Drive OAuth integration**: with the user's Drive permission, upload the exported `.docx` to their Drive, convert to a Google Doc, and redirect to the new doc's URL. This is a separate backend feature (Drive API + OAuth scope) — note it as a future enhancement; Part A's download-and-import flow works today without it.

### Acceptance
From the preview/marquee header, the editor, and each document card, a user can **Open in / Edit elsewhere** and get: **Download as Word (.docx)** (opens in Word/Pages/Google Docs) with a sensible filename, **Open in Google Docs** (downloads .docx + opens Google Docs with a how-to hint), **Download as PDF**, **Copy text**, and **Download original** — all authenticated, with progress and error/Retry, never a silent or 401'd link; works for résumés and cover letters on desktop and mobile. (One-click Drive upload is noted as an optional backend follow-up.)

## P92 — Wire "Open in Google Docs" one-click (Drive) + keep the download/import fallback

**Frontend only; backend LIVE.** The backend now has `POST /api/v1/resumes/{id}/open-in-google-docs` and `POST /api/v1/cover-letters/{id}/open-in-google-docs` — they upload the **current version** to the user's Google Drive as a **native, editable Google Doc** and return `{ web_view_link, file_id, name }`. Wire the P91 "Open in Google Docs" item to it.

### Do
1. **On click** → `POST …/{id}/open-in-google-docs` (Bearer auth). Show "Opening in Google Docs…".
   - **200** → `window.open(res.web_view_link, "_blank")` and a toast "Opened in Google Docs."
   - **409** with body `detail.error === "drive_not_connected"` → the user hasn't linked Drive yet: start the one-time OAuth using `detail.connect_path` (`POST /api/v1/integrations/connect/google_drive` → open the returned `authorization_url` in a popup/new tab). When the connect flow returns (watch for the window to close / a `?connected=google_drive`), **automatically retry** the open-in-google-docs call once, then open the Doc.
   - **502 / network** → error toast + **Retry** (never silent).
2. **Keep the fallback (P91):** always keep **Download as Word (.docx)** in the menu for Word/Pages and as the no-Drive path; if the user declines/cancels the Drive OAuth, fall back to the download + "File ▸ Open ▸ Upload" hint.
3. **Connect hub:** add **Connect / Disconnect Google Drive** next to Gmail & iCloud. Connection status comes from `GET /api/v1/integrations` (a `google_drive` entry = connected); disconnect = `DELETE /api/v1/integrations/google_drive`. Show the one-click item as primary when Drive is connected; otherwise show it but let the 409 path drive the connect.
4. Plain language ("Edit in Google Docs"), big tap targets, works on mobile. No document content is ever sent anywhere except the user's own Drive via this call.

### Acceptance
Clicking **Open in Google Docs** with Drive connected opens the résumé/cover letter as an editable Google Doc in a new tab; when not connected it runs the one-time Drive consent (`drive.file`) and then opens the Doc automatically; failures show Retry; **Download as Word** still works as the universal fallback; Drive shows in the Connect hub with connect/disconnect.

## P93 (AUDIT fixes) — Cover-letter page: marquee icon toolbar, count clarity, collapsible history, add-not-replace

**Frontend only. Audited live 2026-11-06.** Concrete problems found on the cover-letter Documents page and the fixes:

### A. Modern icon toolbar IN the marquee header (upload + download not reachable there today)
Today the marquee header only has "Open cover letter" / "Read". Add a compact **icon button row in the Document-versions marquee header** (and the résumé one), with tooltips:
- **Upload** (upload/tray icon) — opens the file picker and **auto-submits on selection** (per P89: in-view progress "Uploading…", no off-screen confirm), then the new doc becomes current (P86).
- **Download / Export** (download icon) — a small menu: Word (.docx), PDF, Google Docs (P91/P92), Copy text, Download original (`…/{id}/file`).
- **Open** (open-in icon), **Delete** (trash, P84/P87 guards).
Use clean, consistent line icons; keep labels as tooltips/aria-labels for accessibility and mobile.

### B. Disambiguate the two counts (the "14 vs 1 version" confusion)
The badge **"Cover letter 14"** is the number of **cover-letter documents** in the library; the marquee **"1 version"** is the number of **saved versions of the current letter** — two different things shown next to each other. Fix the labels so they're unmistakable:
- Library/tab badge → **"14 cover letters"** (documents).
- Marquee subheading → **"1 saved version of this cover letter"** (not a bare "version" next to "14").
Never render a bare count adjacent to "version(s)" that could be read as a version count.

### C. Collapsible history (the page is ~7,000px tall; a long list is dumped at the bottom)
The full list of cover letters / versions currently fills the bottom of the page (starts ~5,500px down; total page ~7,000px). Make it a **collapsible section, collapsed by default**: a header like **"All cover letters (14) ▾"** that expands on click; same for a long per-letter version history ("Version history (N) ▾"). Default view shows the current letter + marquee; everything else is one tap away, so the page isn't a 7,000px scroll.

### D. "Upload replaces instead of adds" — make ADD explicit, and offer version-append
**⚠ The two-way choice below is SUPERSEDED by P96 §C:** upload now **always adds a new document** (no replace / append-version prompt). Keep only the ADD-is-explicit perception fixes (the toast + visible library update); ignore the "upload as a new version of this letter" option.
Uploading a file **adds a new cover letter to the library** (the count goes up) and makes it current (P86) — it does **not** delete the previous one, but because the marquee view switches, it *feels* like a replace. Fix the perception:
- After an upload, show a toast **"Added your cover letter — you now have N"** and make the **library list** (collapsible, section C) visibly update so the user sees the new item alongside the old ones.
- ~~Offer a distinct choice when a current letter exists: "Upload as a new letter" vs "Upload as a new version of this letter".~~ **(Dropped — see P96 §C: always add a new document.)**

### Acceptance
The marquee header has a clean **icon toolbar** (upload, download/export, open, delete) that works from the marquee view; counts are labelled so **"14 cover letters"** (library) and **"1 saved version"** (current letter) can't be confused; the long cover-letter / version list is a **collapsed-by-default** section the page no longer scrolls through; and uploading clearly **adds** a document (toast + visible library update) with an explicit option to instead **append a version** to the current letter. Applies to résumés too where it fits.

## P94 — Keep the ORIGINAL document's formatting (faithful "Original" view, not only the normalized text)

**Mostly frontend. Audited live 2026-11-06:** an uploaded `.docx` cover letter renders as **plain paragraphs** — the app extracts the text and re-renders it through its own template, so the original's visual formatting (letterhead, fonts, spacing, contact block, bold/headings) is lost. The extracted/normalized text is needed for AI tailoring + ATS, but the user also wants to **see and keep their original formatting**. Give them both.

### Do
1. **Add a faithful "Original" preview** of the uploaded file, distinct from the editable/tailored view:
   - **.docx** → convert the original bytes to HTML **client-side with a docx to HTML renderer (e.g. `mammoth.js`)** fetched from the `…/{id}/file` endpoint — this preserves bold, headings, lists, tables and paragraph structure far better than the current text extraction. Render that HTML in the preview.
   - **.pdf** → render the original PDF faithfully (embed / `pdf.js`) from `…/{id}/file`.
   - **.txt/.md** → render as-is.
2. **A clear toggle** on the preview: **"Original"** (faithful, read-only, the uploaded file) vs **"Working copy"** (the editable, AI-tailorable, template-rendered text). Default to **Original** right after upload so the user immediately sees their formatting; switch to Working copy when they edit/tailor.
3. **Exports already preserve the file:** keep P91's **Download original** (the exact uploaded bytes) so the user can always retrieve the pristine file.
4. Make clear in the UI (one line) that tailoring/AI edits operate on the Working copy (normalized text) — the Original stays untouched and downloadable.
5. (Optional backend follow-up, note only: a server-side `.docx -> PDF/HTML` faithful render — e.g. LibreOffice headless — if client-side conversion proves insufficient for complex files.)

### Acceptance
Right after uploading a `.docx`/`.pdf` cover letter or résumé, the preview shows the **original formatting faithfully** (docx via client-side docx-to-HTML, pdf rendered as-is), with a clear **Original / Working copy** toggle; the pristine original is always downloadable (P91); AI tailoring continues to work on the normalized Working copy without altering the Original.

## P95 — Stop serving a stale build: no-cache index.html + "new version — reload" banner

**Hosting/config + a small frontend bit. Root cause verified live 2026-11-06:** fixes get published but users keep running the **old build** because the entry **`index.html` is served from cache** (no service worker is involved — confirmed). Since the JS/CSS bundles are content-hashed (e.g. `index-C-iiyAqE.js`), only `index.html` must never be cached; once it's revalidated, the new hashed bundles load automatically. This has made several shipped fixes (P86/P88/P89) look "still broken" until a manual hard-refresh.

### Do
1. **Serve `index.html` as non-cacheable.** Configure the hosting/export so the HTML entry document returns:
   - `Cache-Control: no-cache, no-store, must-revalidate` (and no long `max-age`).
   Keep the **hashed static assets** (`/assets/index-*.js`, `*.css`, images) on long cache (`immutable`, 1 year) — they're safe because their names change per build. Only the entry HTML changes to no-cache.
2. **Do NOT introduce a service worker** that caches the app shell (that would re-create the exact stale-build problem). If one exists, ensure it uses network-first for navigation/HTML and self-updates.
3. **"New version available" reload banner (belt-and-suspenders).** In the app, periodically (e.g. every few minutes and on window refocus) fetch the current `index.html` (or a tiny `/version.json` emitted at build time with the build hash) with `cache: "no-store"`; if the build hash differs from the one the running app booted with, show a small, non-intrusive banner: **"A new version is available — Reload."** Clicking it does `location.reload()`. Never force-reload mid-edit; just offer it.
4. Keep it uncluttered — one slim banner, dismissible, reappears on the next detected change.

### Acceptance
After a deploy, a returning user on a normal reload (no hard-refresh) gets the **latest build** because `index.html` is served `no-cache` while hashed assets stay cached; no service worker pins an old shell; and if a user has an old tab open when a new build ships, a subtle **"New version — Reload"** banner appears and reloads into the new build on click. Shipped fixes take effect for users without anyone clearing cache.

## P96 — Document preview: resizable pane controls, an engaging toolbar, and upload-always-adds

**Frontend only. Follows P94 (original formatting now preserved).** Audited live 2026-11-06. Four fixes to the cover-letter / résumé Documents workspace:

### A. Add resizable / zoom controls to the document preview pane
The preview now renders the original formatting (P94) but has **no way to resize or zoom** it — the pane is a fixed box. Add the standard document-viewer chrome to the preview header (same component for résumés and cover letters, Original and Working-copy views):
- **Zoom out / Zoom in** (− / + with the current % shown), **Fit width**, and **Reset (100%)**.
- **Expand / Read full size** — open the document in a large modal/overlay at a comfortable reading size, with the same zoom controls, and Esc/✕ to close.
- A **draggable splitter** between the preview pane and the right-side panel so the user can widen the preview (remember the last width per session). On mobile this collapses to a full-width preview with the zoom controls still present.
Controls apply to `.docx` (mammoth HTML), `.pdf` (pdf.js), and text alike — they scale the rendered preview, they do not alter the stored document.

### B. Make the Design / feature menu line engaging (it's too bland today)
The toolbar line that holds **Design** and the other feature controls is flat and grey — it doesn't stand out or invite interaction. Restyle it with the Harbor/Hirewave brand treatment:
- Give the bar presence: brand accent color, a subtle gradient or tinted surface, clear iconography with labels, and hover/active states that respond.
- Make **Design** read as the primary, inviting action (accent fill or a distinct pill), with the secondary actions (Upload, Download/Export, Open, Versions) as clean icon+label buttons that light up on hover.
- Keep it a single tidy row, accessible (aria-labels, focus rings, good contrast in light and dark), and responsive — it should feel like a polished app toolbar, not a plain link line.

### C. Upload ALWAYS adds a new document — drop the "replace / append a version" choice
This **reverses P93 §D's two-way prompt.** Replacing an existing document on upload is unnecessary and confusing. From now on:
- **Uploading a file always creates a NEW document** in the library (the document count goes up). There is **no** "upload as a new version of this letter" / replace path, and no prompt asking which — upload just adds.
- The freshly uploaded document becomes **current** and is **visibly highlighted** in the library list and marquee (e.g. an accent border / "New" or "Current" badge) so the user sees exactly what was added.
- Keep P86/P89 behavior: auto-submit on selection, in-view "Uploading…" progress, then the new doc is selected/rendered.

### D. Versioning stays per-document and is managed by the user, not by upload
Each document still carries its own versions (the seeded "Original" is v1; AI edits / manual saves add v2, v3…). The newly uploaded document shows its **correct version number** (Original / v1). Version management is a deliberate, user-driven action — never a side effect of uploading:
- In the Versions list (P93 collapsible history), the user can **preview** any earlier version and **delete** old versions they don't want (last-version-protected per the backend 400 guard — deleting the only version is blocked; deleting the whole document is a separate explicit action).
- "Current" / highlighted = the user's selected document+version; switching selection updates the preview (P86 render-on-select).

### Acceptance
The document preview has working **zoom / fit-width / reset / expand-to-full-size** controls and a **draggable splitter** (preview resizes; stored doc unchanged); the **Design/feature toolbar** is visibly branded and engaging (Design reads as the primary action, hover/active states, accessible, responsive); **every upload adds a new document** (no replace/append-version prompt), the new document is **highlighted and marked current with its correct version number**; and the user can **preview or delete earlier versions** from the collapsible Versions list without upload ever touching existing documents. Applies to résumés and cover letters.

## P97 — Correct cover-letter FORMAT (salutation, header-vs-signature) + stand-out primary buttons

**Frontend. Follows P94/P96.** Audited live 2026-11-06 against standard cover-letter format. Two parts:

### Part 1 — Cover-letter structure must match a proper business letter
A cover letter has a fixed, expected skeleton; the current render breaks it. The structured backend model already exists (`CoverLetterData`: `name, contact[], date, company, role, salutation, paragraphs[], closing, signature`) and the backend now **flags a missing opening salutation** in the review (new `"Add an opening salutation"` suggestion from `GET/POST .../review`). Surface and respect that structure:

1. **Opening salutation is REQUIRED and must render.** Every cover letter opens with a salutation on its own line — **"Dear Hiring Manager,"** (or "Dear <name>," when known). If the current letter has none (a free-text AI edit can drop it), show the review's **"Add an opening salutation"** suggestion prominently with a one-click **"Insert 'Dear Hiring Manager,'"** fix that writes it as the first line above the body. Never render a letter that jumps straight into a paragraph.
2. **The name appears twice ON PURPOSE — style the two differently, don't duplicate a banner.** Standard format puts the sender's **name + contact** in a *header block* at the **top**, and the sender's **typed name** in the *signature* at the **bottom** under the close. Today both render as the same bold "title header," which reads as a duplicated header. Fix:
   - **Top:** a contact header — name (prominent) + contact line (email · phone · location) + date. Not a résumé-style name banner.
   - **Bottom:** the closing block — **"Sincerely,"** on its own line, then the typed name as a **signature** (a light script/italic style is fine to evoke a signature; see 3).
   - They are visually distinct; the bottom is clearly a sign-off, not a repeated title.
3. **Typed signature is correct — keep it, and make it optional to upload a real one.** Turning a handwritten signature into the typed name is **standard and expected** for a digital/emailed letter (ATS and PDFs handle text, not ink) — this is not a bug. Render the typed name in the signature slot (optionally an italic/script face). *Optional nicety:* let the user attach a signature image that renders above the typed name; default stays the typed name.
4. Apply this skeleton in both the **Working-copy** preview and on **export** (.docx/PDF/Google Docs): header → date → (company / Re: role) → **salutation** → body paragraphs → close → signature. The faithful **Original** view (P94) is unchanged — it shows the uploaded file as-is.

**Recommended skeleton (reference):** Contact header · Date · (Recipient/Company) · **Salutation ("Dear …,")** · Opening paragraph (hook, names role + company) · 1–2 body paragraphs (one concrete, quantified result) · Closing paragraph (call to action) · **Sign-off ("Sincerely,") + typed name.**

### Part 2 — Primary / next-step buttons must stand out (not blend into the color scheme)
Right now **Save** and other next-step CTAs share the same color as ordinary buttons and disappear to the eye. Establish a clear visual hierarchy:
- **Primary actions** (Save, Save version, Apply, Continue / next-step CTAs) get the brand **accent fill** with strong contrast, larger weight, and an optional **subtle pulse/glow** when they're the expected next action (e.g. after an unsaved edit the **Save** button gently pulses; it stops once saved). Use a tasteful animation (soft box-shadow pulse or scale), respect `prefers-reduced-motion`.
- **Secondary actions** (Cancel, Open, Download, switch views) are quieter — outline/ghost style — so they clearly recede behind the primary action.
- Exactly **one** primary action is emphasized per context; never pulse two things at once. Disabled Save isn't pulsing. Keep it accessible (contrast, focus ring, aria) in light and dark.

### Acceptance
A rendered/exported cover letter always has an **opening salutation** (with a one-click insert when missing, driven by the review suggestion), a **top contact header** and a **distinct bottom signature** (typed name, not a duplicated banner); the signature-as-typed-name is treated as correct with an optional image upload. Across the editor, the **Save and next-step buttons are visibly the primary action** (accent fill, optional pulse when action is pending, reduced-motion respected) while secondary buttons recede — a user can instantly tell what to click next.

## P98 — Make the MAIN features obvious: "Auto Improve" as the hero action, site-wide visual hierarchy

**Frontend, site-wide. Generalizes P97 Part 2 to the whole app.** Audited live 2026-11-06: the headline features — above all **Auto Improve** (the one-click "make my résumé better" that unsophisticated users want most) — are rendered in the same flat, low-contrast style as every secondary control, so they're effectively hidden. Users can't find the thing the product is *for*. Fix the hierarchy everywhere, not just in the document editor.

### The problem
- **Auto Improve** (résumé one-click improve; the equivalent cover-letter improve) looks like a plain link/button among many. It should be the single most obvious action on the résumé/document screen.
- Other primary features (Tailor to a job, Generate cover letter, Analyze/Review, Apply, Save) are equally buried. Everything is one grey tone — nothing signals "start here."

### Do
1. **Define ONE primary-action style and use it consistently (reuse P97 Part 2's system):** brand **accent fill**, strong contrast, larger weight/size, clear icon + verb label, lively hover/active states. Secondary actions are outline/ghost and visibly recede. This is a shared button component, not per-screen styling.
2. **Auto Improve is the hero.** On the résumé / document workspace make **Auto Improve** the prominent primary CTA — big, accent-filled, with a short benefit label (e.g. **"✨ Auto-Improve my résumé"** / "One-click improve"). Give it a brief **pulse/shimmer when the user has a résumé loaded but hasn't improved it yet** (the expected next step), stopping once used; respect `prefers-reduced-motion`. Keep the advanced/manual tools present but secondary, so power users still have them without the beginner path being hidden.
3. **One clear primary per screen.** Each main screen surfaces its headline action as THE primary button (résumé → Auto Improve; a job → Tailor / Generate cover letter; a draft → Save; a finished doc → Download/Open). Exactly one emphasized primary per context; never two competing heroes.
4. **Discoverability cues for beginners:** a short one-line helper under the hero ("New here? Start with Auto-Improve — we'll do the work."), and make feature cards/tiles on the dashboard use the same accent treatment for their main CTA so the path through the product is visually obvious.
5. Accessible and responsive: contrast AA in light and dark, focus rings, aria-labels, large tap targets on mobile, motion-reduced fallback (no pulse → a static accent + subtle ring).

### Acceptance
On first look at the résumé/document screen, **Auto Improve is unmistakably the main action** (accent-filled hero, benefit label, gentle pulse when improvement is the pending next step), while manual/advanced tools are clearly secondary; every main screen has exactly one visually dominant primary CTA using a single shared accent style; a first-time user can tell what to click without hunting. Motion respects `prefers-reduced-motion`; contrast/focus/labels pass in light and dark.

## P99 — Fix what shipped: hero-button hierarchy, surface Design, click-to-expand, de-clutter, feature the new functions in Tips

**Frontend. Live audit of the published build 2026-11-07 (signed in).** P96–P98 were only *partially* applied — zoom/fit/Reset/Expand, the Original↔Working-copy toggle, the collapsible "All cover letters (15)", a draggable gutter, and an accent on *some* buttons all shipped. The remaining problems are **inverted hierarchy, buried features, and clutter.** Fix each precisely:

### 1. The hero button is INVERTED — fix it (highest priority)
Measured live on the cover-letter page: **"Improve whole cover letter"** renders with a near-**white** background (`oklch(0.985 …)`, dark-green text) — a ghost/secondary style — while *lesser* actions **Upload / Generate / Apply change** get the green **accent fill** (`oklch(0.56 0.14 158)`). The most important action recedes; minor ones dominate.
- Make **Improve whole cover letter** (and the résumé **Auto-Improve**) the **single accent-filled hero**: solid brand accent, white text, largest weight/size on the screen, with the **pulse-when-pending** from P98 (pulses when a document is loaded but not yet improved; stops after use; `prefers-reduced-motion` → static accent + ring).
- Demote Upload/Generate to a **still-visible but secondary** tier (accent *outline* or a lighter fill), so exactly ONE hero dominates. Never render the primary improve action as a white ghost button again.

### 2. Surface the Design chooser — it exists but is hidden behind Alt+D
The Design chooser is built (keyboard shortcut **Alt+D**, "Open the Design chooser") but has **no visible button** anywhere on the documents page — that's why "the design function isn't present or featured."
- Add a **visible, labelled "Design" button** (template/theme/font) to the document toolbar (P96 §B styling — branded, not grey), next to Upload/Download/Open. It opens the same chooser Alt+D opens.
- For cover letters, expose at least the document-level **font family / size / spacing** controls (P90) even if full résumé templates don't apply — the user must *see* a Design option where they're working.

### 3. Click the document to open a fuller view
Today only a small **Expand** button / "⤢ to read full size" opens the larger view; clicking the preview itself does nothing, so users don't discover it.
- Make the **preview pane/card itself clickable to expand** (cursor-zoom affordance + a visible "Expand ⤢" affordance on hover), opening the same full-size reader. Keep Esc/✕ to close.

### 4. Raise contrast — the palette is washed out
The screen is pale sage/grey on white; headings and the version-bar action icons (upload/download/improve/trash) are faint and low-contrast.
- Strengthen text, heading, border and icon contrast to **WCAG AA**; give the version-bar action icons real weight/color so they read as buttons. Keep it clean, but it must not look disabled/empty.

### 5. Cut clutter (simplicity)
Concrete redundancies/power-user noise found on Dashboard + Documents:
- **Two stacked version surfaces** — a top "Document versions" marquee AND "Your current … · versions" below it (on both Dashboard and Documents). **Merge into one.**
- The marquee helper line "*Newest to oldest · centred on the current version · hover an edge to glide · ← → to browse · ⇤ ⇥ to jump · click for actions*" is too much — reduce to a short hint; put the rest behind "?".
- Move debug/power controls — **"Reset this page," "Reset duplicate check," "Blocked as a duplicate when it shouldn't be?"** — into an **Advanced/overflow (⋯)** menu, not inline for everyone.
- The **"Jump back in" recent list is full of throwaway test files** (P89RECHECK…, P86CHECK…, VERIFY-P85…, test_resume.txt, duplicate CL (1)s). Let the user clear/hide items, and don't resurface obvious junk. *(Separately: the user should delete these test docs from the library.)*

### 6. Feature the NEW functions in Tips & onboarding (not just shortcuts)
The Tips & tricks page is a 30-item **keyboard-shortcut cheat sheet**; it never explains the headline features in plain language, and there's no first-run tour (`wizardKeys` empty).
- Add a short **"What's new / featured" section** (plain language, no shortcut required) covering: **Auto-Improve / Improve whole document**, **Original vs Working copy** (keep your formatting), **Open in Google Docs** (one-click edit in Docs), the **cover-letter format** (salutation + proper signature), and the **Design chooser**. One line + where to click for each.
- Add a lightweight **first-run callout / checklist** (or extend Simple view's intro) that *names* these featured functions so a new user discovers them — dismissible, shown once.

### Acceptance
The **Improve/Auto-Improve** action is the single accent-filled hero (pulses when pending); Upload/Generate are clearly secondary. A **visible Design button** sits in the document toolbar (opens the Alt+D chooser; cover letters at least get font controls). **Clicking the preview** opens the full-size reader. Text/icons meet **AA contrast**. The duplicate version marquees are merged, verbose helper text is trimmed, and debug controls live under an Advanced menu. **Tips & tricks** has a plain-language "featured functions" section and a one-time first-run callout naming the new capabilities.

## P100 — Guided tours: opt-in coach-mark bubbles that walk the user through a task

**Frontend. New capability.** Add an **optional, task-oriented guided tour**: anchored bubble/popup messages ("coach marks") that spotlight the real on-screen element for each step and walk the user through the features that accomplish a task. It is **always the user's choice** — never auto-forced, always skippable and replayable.

### Entry points (opt-in — the user chooses)
- A persistent **"Show me how" / "Take a tour"** control (a small help/`?` button in the header, and an item in **Tips & tricks** and **Settings → Help**).
- On a user's **first visit to a screen**, a single, dismissible invite — **"Want a quick walkthrough? Yes / No thanks"** — shown once per screen. "No thanks" never asks again for that screen; tours stay available from the help button.
- Each **featured function** (P99 §6) has a "Show me" link that launches the matching tour.

### Tour behavior (the bubbles)
- Each step is a **bubble anchored to the real element** it describes, with a **spotlight/dimmed backdrop** that highlights just that element, a short **title + one or two plain-language sentences**, and controls: **Back · Next · Skip tour**, plus a **progress indicator** ("Step 2 of 5").
- Bubbles **auto-position** (above/below/beside) to stay on-screen; the highlighted element **scrolls into view**; clicking the element or **Next** advances. **Esc** or **Skip** ends the tour; **✕** closes.
- If a step's target isn't present yet (e.g. no document loaded), the step either **guides the prerequisite** ("Upload or pick a cover letter first") or is **skipped gracefully** — a tour never points at a missing element or gets stuck.
- Finishing or skipping a tour is **remembered** (persisted per tour id) so it isn't shown again unprompted; the user can **replay any tour** anytime from the help menu.

### The task-based tours (ship at least these, each a short sequence)
Build a small, declarative tour definition (id, title, ordered steps = {anchor/selector, title, body, optional action}) so tours are easy to add. Ship:
1. **Improve my résumé/cover letter** → pick/upload a doc → **Auto-Improve / Improve whole document** (the hero) → review the change → **Save as a version**.
2. **Keep my original formatting** → the **Original ↔ Working copy** toggle → what each is for → **Download original**.
3. **Edit elsewhere** → **Open in Google Docs** (one-click) / **Download as Word** → (connect Drive if prompted).
4. **Change the look** → the **Design** button (templates / font / size).
5. **Apply to a job** → Matches → Tailor → review → **approve the apply** (human-approval step).
Keep each tour to ~3–6 steps; lead with the benefit, not the mechanics.

### Craft & accessibility
- Plain, friendly language; one idea per bubble; no jargon. Reuse the brand accent and the P97/P98 button system so bubbles feel native.
- **Keyboard accessible** (Tab/Enter/Esc), focus is trapped in the active bubble and restored on exit, ARIA roles/labels on the bubble and spotlight, and the highlighted element is announced.
- **Respect `prefers-reduced-motion`** (no large animated movement — just show/anchor). Works at mobile width (bubbles reflow, backdrop still highlights the target). Never block the UI permanently — the user can always Skip/Esc.

### Acceptance
A user can **opt into** a guided tour from a visible help control, from Tips & tricks, and from a once-per-screen invite (declining never nags again). Running a tour shows **anchored bubbles with a spotlight** over the real elements, Back/Next/Skip and a step counter, auto-positioning and scroll-into-view, graceful handling when a target is absent, and completion is remembered with replay available. At least the five task tours above work end-to-end, each short and benefit-led, fully keyboard-accessible, reduced-motion-safe, and usable on mobile.

## P101 — The Harbor Assistant: a page- and context-aware guide as a translucent light overlay

**Frontend. Expands P100.** Grow the guided-tour system into a persistent, **context-aware assistant** — a light, translucent overlay companion that knows what screen you're on and what state you're in, suggests the next best action using the app's real tools, can run any P100 tour, and offers a full **"Grand Tour."** Opt-in and unobtrusive throughout.

### Look & feel — a translucent light overlay (not a solid panel)
- Render the assistant as a **frosted-glass, light, translucent surface**: low-opacity white/tinted background with **backdrop blur**, a soft border and shadow, so the app subtly shows through. Light and airy — a gentle presence, not a heavy modal.
- Default state is a **small floating launcher** (a friendly ✨/assistant pill or bubble, bottom corner). Clicking it expands a **translucent card** with suggestions and actions; collapsing returns to the pill. It can be **moved/dismissed**, never blocks the UI, and stays out of the way of the primary content.
- Reuse the brand accent and the P97/P98 button system for actions inside it. Dark-mode variant uses a translucent dark glass. Respect `prefers-reduced-motion` (fade/anchor, no large motion).

### Page- & context-awareness (the core upgrade)
The assistant reads the **current route + visible state** and tailors its guidance. It maps the situation to **concrete next actions that use the app's own tools**, each a one-click launch or a "Show me how" P100 tour. Examples (data-driven, not hardcoded copy):
- **Documents, a doc loaded but not improved** → "Make this stronger in one pass → **Auto-Improve**" (launches it / tours it).
- **Just uploaded a .docx** → "Keep your original formatting — here's **Original vs Working copy**."
- **Drive not connected / wants to edit elsewhere** → "**Open in Google Docs** for deeper edits" (offers connect).
- **Résumé with a low/absent ATS or no job targeted** → "**Tailor** this to a specific job to raise your match."
- **Cover letter missing a salutation (from the review)** → "Add a proper opening — **insert 'Dear Hiring Manager,'**."
- **Matches with items awaiting approval** → "You have N applies ready to **review & approve**."
- **No résumé yet** → "Start here: upload or generate a résumé."
Keep suggestions **few and ranked** (1–3 at a time), benefit-led, and dismissible; never nag. Each suggestion links to the exact control or runs the relevant P100 tour.

### Guidance on tasks & features (help, in context)
- A small **"What can I do here?"** list for the current page — the relevant tools/features with one-line descriptions and a "Show me" that launches the matching tour or focuses the control.
- Lightweight **search/ask** box: the user types what they want to do ("write a cover letter", "change the font", "apply to a job") and the assistant points them to the feature/tour that does it. (Deterministic mapping over the feature catalog is fine — no backend AI call required for v1.)

### The Grand Tour
- A prominent **"Take the Grand Tour"** option in the assistant (and in Tips & tricks): a guided, cross-page walkthrough that **chains the P100 task tours** in a sensible order (set up → résumé → cover letter → tailor → apply → interview prep), moving the user between screens, with **Back/Next/Skip** and overall progress ("Part 3 of 6"). Pausable and resumable; completion remembered.

### Opt-in, memory, accessibility
- Entirely **optional**: the launcher can be collapsed or hidden from Settings; a first-run invite ("Meet your assistant — want help getting started?") appears once and never nags after "No thanks." Everything is replayable from the launcher and Tips.
- Persist per-user: which suggestions/tours were seen or dismissed, Grand-Tour progress, and the launcher's position/hidden state.
- **Accessible**: keyboard reachable, focus management, ARIA live region for suggestions, AA contrast *despite the translucency* (ensure text over the frosted surface stays readable — add a subtle scrim behind text if needed). Works at mobile width (launcher + sheet), reduced-motion-safe.

### Acceptance
A **translucent, frosted light overlay** assistant is present as a small, movable launcher that expands into a glassy card. It is **context-aware** — on each screen it surfaces 1–3 ranked, benefit-led next actions tied to the app's real tools and the user's current state, each launching the control or a P100 tour. It offers a **"What can I do here?"** list and a simple ask/search that maps intent to features, and a **"Take the Grand Tour"** that chains the task tours across pages with progress and resume. It is fully opt-in (hideable, never nags after decline), remembers state per user, keeps text readable over the translucency at AA contrast, and is keyboard-accessible, reduced-motion-safe, and usable on mobile.

## P102 — Upload stays on the Documents screen and focuses the marquee (no jump to a separate page)

**Frontend. Fixes a navigation regression.** When the user uploads a document **from the Documents screen marquee**, the app currently **navigates away to a standalone document page** (e.g. `/dashboard/documents/cover-letters/{id}`). That extra step is unnecessary and jarring — the upload was invoked on the Documents screen, so the result should appear **right there, in the marquee**, with no page change.

### Do
1. **Stay in place.** An upload invoked from the Documents screen **does not navigate** to a separate document page. The user remains on the Documents screen; the marquee updates in place.
2. **Focus the marquee on the new document.** After the upload, the new document becomes **current** and is **selected/highlighted/centred in the versions marquee** where the upload was invoked (per P86/P96: highlighted, "Current" badge, correct version number), and the preview re-renders to it — all on the same screen. Scroll/focus the marquee so the user's eye lands where they acted.
3. **Edit from the same marquee with the same functions as the résumé.** The Documents screen keeps the **marquee formatting and the same in-place edit functions** it already uses for résumés (the distinctions between résumé and cover letter were already defined in the earlier prompts — honor those, don't re-diverge). A user uploading a cover letter gets the same stay-on-page, edit-in-the-marquee behavior a résumé upload gets.
4. **Opening is still a deliberate action.** Navigating into a fuller/standalone document view should happen only when the user explicitly chooses it (Open / Expand / click-to-expand per P99 §3) — never as an automatic side effect of uploading.

### Acceptance
Uploading a document from the Documents screen marquee **keeps the user on the Documents screen** with **no navigation to a separate page**; the newly uploaded document is immediately **current, highlighted, and focused in the marquee** with its correct version number and a re-rendered preview, and it can be edited in place using the same marquee functions as a résumé. A standalone/fuller view opens only when the user explicitly asks for it. Behavior is consistent for résumés and cover letters, preserving the already-defined distinctions between them.

## P103 — Smart decision overlays: contextual Save/Cancel (and other commits) instead of fixed buttons

**Frontend.** Decision controls that only matter **after an action** — **Save / Cancel**, Accept / Undo, Keep / Discard — should appear as **contextual overlays that surface exactly when a decision is pending**, anchored near the change, and **disappear once resolved** — not sit as permanent fixed buttons taking up space and competing for attention. The app already has the right model in the **Rephrase toolbar** (appears on text selection); generalize it.

### The pattern — a "decision overlay"
- **Appears only when there's a pending decision** (an unsaved edit, an AI change to accept, a destructive action to confirm). When nothing is pending, it's **not on screen**.
- **Anchored to the thing being decided** (the edited line, the changed preview, the version card), floating just above/beside it; auto-positions to stay in view; reuse the P101 **translucent light** treatment and the P97/P98 button hierarchy (primary = the commit, e.g. Save; secondary = Cancel/Undo).
- **Clear keyboard + click paths:** **Enter = commit, Esc = cancel**, and the overlay never traps focus or blocks the rest of the page. **Only one** decision overlay is active at a time.
- **Non-destructive by default; confirm the destructive ones in place.** Irreversible actions (delete a document/version) still require explicit confirm — but as a **small inline confirm popover on the item** ("Delete this version? Delete / Cancel"), not a static button or a full modal.
- After commit, show a brief, **transient confirmation** (a toast / "Saved ✓" that fades) rather than leaving a persistent control behind.

### Move these decisions from static controls → smart overlays
Audited live on Documents:
1. **Edit → Save / Cancel.** After an inline or manual edit, show a floating **Save · Save as new version · Cancel** overlay anchored to the edited content (Enter saves, Esc cancels), instead of a fixed button row. Pulse Save while the edit is unsaved (P98), clear it on save.
2. **Ask AI → Apply / after-apply Accept · Undo.** When an AI change lands, surface an **Accept · Undo** overlay on the changed region (currently a static "Apply change"/review area). 
3. **Improve whole document → Keep · Discard (review).** The one-pass improve review becomes a decision overlay over the preview: **Keep changes (Save version) · Discard**, not a fixed bar.
4. **Version card actions.** The "Click for actions" on a version card opens a **contextual popover** — Make current · Rename · Delete (inline confirm) · Read full size — instead of always-visible controls.
5. **Insert-salutation / review fixes (P97).** A review suggestion like "Add an opening salutation" offers an **inline overlay** with **Insert 'Dear Hiring Manager,' · Dismiss** anchored at the insertion point.
6. **Upload-as-new / duplicate prompts.** Any remaining upload confirmations resolve as a brief inline overlay/toast (per P86/P102 uploads just add), never a persistent control.
7. **Find & replace** stays a floating bar (already overlay-like) — keep it consistent with this pattern.

Leave genuinely **persistent primary actions** (the Auto-Improve/Improve hero, Upload, Generate, Design) as visible buttons — those are entry points, not post-action decisions. Only the **decision/commit** controls move to overlays.

### Acceptance
Save/Cancel and other post-action commits (Accept/Undo, Keep/Discard, delete-confirm) appear as **contextual overlays anchored to the change, only while a decision is pending**, styled as translucent light surfaces with the primary/secondary hierarchy, driven by **Enter=commit / Esc=cancel**, never trapping focus, one at a time, with a transient "Saved ✓" on commit and inline confirm popovers for destructive actions. The static Save/Cancel button rows are removed from the editor and version UI; persistent entry-point actions (Improve hero, Upload, Generate, Design) remain as buttons. Accessible and reduced-motion-safe.

## P104 — Fix marquee↔preview sync + real click-to-expand, enforce cover-letter rules, add proactive AI recommendations

**Frontend. Correctness-first — these are bugs, verify on the published build.** Several avoidable issues on the Documents screen. Fix the bugs (1–2) first, then enforce the rules (3) and add the proactive AI layer (4), using overlays throughout.

### 1. The marquee selection and the preview below it must ALWAYS be in sync (bug)
Right now the **current/selected version shown in the marquee is not the one rendered in the preview below** — they diverge. There must be **one single source of truth**: a `selectedVersion` (the current/selected version in the marquee) that **drives the preview directly**, rendering from **that version's own content** (not a lagging `rendered_text` or a cached render).
- Selecting/centring a version in the marquee **immediately re-renders the preview to that exact version**. Changing the current version, uploading (P102), switching documents — the preview follows, every time, with no mismatch.
- The marquee's "Current"/highlighted card and the preview header must name the **same version number**. If they ever disagree, that's the bug — reconcile to the single `selectedVersion`.

### 2. Clicking the preview must open a REAL full-size reader — and clean up (bug)
Clicking the marquee preview does **not** open a fuller human-readable view — it stays a large thumbnail, and a **stale/orphaned enlarged thumbnail survives on its own after the page scrolls or focus changes**. Fix both:
- Clicking the preview opens a **true full-size, human-readable reader overlay** (modal/lightbox) of the **current selection** — actual readable document size with the P96 zoom/fit controls, Esc/✕ to close — not an inflated thumbnail.
- The expanded view is a **single managed overlay** bound to the current selection; it **does not leave an orphaned enlarged instance** behind when the user scrolls, navigates, or changes focus. Opening is idempotent (no duplicates); closing fully tears it down.

### 3. Enforce the cover-letter edit rule set (already defined — don't let it drift)
Make sure the previously defined cover-letter behavior is actually in place: **required opening salutation + one-click insert** (P97, backed by the new review check), **top contact header vs. distinct bottom signature** (P97), **Original ↔ Working copy** faithful formatting (P94), **horizontal version display matching résumés** (P88), **upload always adds + becomes current** (P96/P102), and the **same marquee edit functions as résumés** with the already-defined résumé/cover-letter distinctions honored. Audit the cover-letter path against these and close any gaps.

### 4. Proactive AI: the app analyzes the document and offers recommended changes (feature)
Don't make the user think of what to ask. The AI should **analyze the current document on its own** and **proactively offer remedies** — format and wording — with a clear option to apply them:
- On open / after upload, run the existing analysis (cover letters: `review_cover_letter` → score, ratings, suggestions incl. the new salutation check; résumés: the review/`suggest-edits` path) and surface a short, ranked list of **recommended changes** ("Tighten this cliché," "Add a measurable result," "Insert an opening salutation," "Fix this wording").
- Present each as an **actionable recommendation in an overlay** with **Apply · Apply all · Dismiss** (apply writes the change and saves/queues a version via the existing apply/versions endpoints; each apply is undoable per P103). The user is always **offered** the change — nothing is applied without their click.
- Tie into the one-pass **Improve whole document** as the "fix everything recommended" option. Keep it benefit-led and non-nagging (collapsible, remembered when dismissed).

### 5. Overlays throughout for an engaging, interactive feel
Use the P101 translucent-light + P103 decision-overlay language for: the **full-size reader** (2), the **AI recommendations** and their Apply/Dismiss (4), the **insert-salutation** fix (3/P97), and version-card actions. Anchored, dismissible, one primary action each, keyboard-accessible, reduced-motion-safe.

### Acceptance
The marquee's current/selected version and the preview below it are **always the same version** (single `selectedVersion` source of truth; preview re-renders on every selection/upload/switch, version numbers match). **Clicking the preview opens a true full-size readable reader overlay** of the current selection with zoom controls and clean teardown — **no orphaned enlarged thumbnail** survives scroll/navigation/focus change. The **cover-letter rule set** (salutation+insert, header/signature, Original/Working copy, horizontal versions, upload-adds-and-currents, résumé-equivalent editing) is verified in place. The app **proactively surfaces ranked AI recommendations** (format + wording) in overlays with **Apply / Apply all / Dismiss**, each undoable, nothing applied without the user's choice. All of the above uses the translucent overlay language and is accessible and reduced-motion-safe.

## P105 — Speaking assistant: give the Harbor Assistant a voice, central to the UX

**Frontend. Expands P100/P101; builds on the existing narration system** (the app already has narration settings — `hw_narration_enabled`, `hw_narration_voice`, `hw_narration_rate`, `hw_narration_auto_read`). Make the assistant a **speaking guide** that verbally walks users through tasks, highlights the section it's talking about, reads things in plain language, reads summaries, and warmly promotes relevant features. Use the browser **Web Speech API (`speechSynthesis`)** — no backend TTS needed for v1.

### Central, but consent-first (browsers block autoplay audio anyway)
- The speaking assistant is a **prominent, first-class part of the UX** — a clear **"🔊 Guide me / Listen"** control on the P101 assistant and on tours/summaries — but it **only speaks after the user starts it** (a click), per browser autoplay rules and good taste. Respect the existing `hw_narration_enabled` / `auto_read` prefs; never surprise-talk.
- Always-available **transport controls**: Play/Pause, **Stop**, skip step, **voice picker** (from `speechSynthesis.getVoices()`), **rate/pitch**, and **mute**. Persist choices via the existing `hw_narration_*` keys.

### Speak + highlight together (the core)
- When guiding, the assistant **speaks each step in simple language while spotlighting the exact section/element** it's describing (reuse the P100 coach-mark spotlight + P101 translucent overlay). Speech and highlight advance **in sync**; finishing a sentence/step moves the highlight; Pause stops both.
- **Word/section cues:** use `speechSynthesis` `onboundary`/`onend` events to keep the highlight and (optional) progress in step with the narration.

### What it reads
1. **Step read-throughs** — narrate P100 task tours and the P101 Grand Tour: "Here's how to improve your résumé. First, pick a document…" in short, plain sentences.
2. **Summaries** — read the document **AI summary**, the **review** result ("Your cover letter scores 82. It's missing an opening salutation — want me to add it?"), and the **"what changed"** after an Improve pass.
3. **Recommendations (P104 §4)** — read each proactive recommendation aloud and offer to apply it ("I'd tighten this cliché — shall I apply it?"), wired to the same Apply/Dismiss overlay.
4. **Feature promotion** — short, benefit-led spoken nudges about relevant capabilities in context ("You can open this in Google Docs to edit in Docs — want me to show you?"), drawn from the P101 context map. Promotional, not pushy: 1 at a time, dismissible, never repeats after "No thanks."

### Accessibility (critical for a voice feature)
- **Never audio-only:** everything spoken is **also shown as text/captions** in the assistant overlay (live caption of the current sentence), so it works muted and for deaf/hard-of-hearing users.
- **Don't fight screen readers:** keep the visual focus/`aria-live` behavior correct; the spoken guide is an *addition* the user opts into, and should not double-announce for assistive tech — offer it, default off when the user already relies on a screen reader, and make it easy to turn off.
- Keyboard controls for all transport; `prefers-reduced-motion` still applies to the highlight; stop speaking immediately on navigation/stop; handle voices-not-loaded and unsupported browsers gracefully (fall back to captions/text only).

### Acceptance
The assistant can **speak**, started by the user, with Play/Pause/Stop, voice and rate controls persisted to the existing narration settings. While guiding, it **narrates each step in plain language and highlights the matching section in sync**. It can **read document summaries, review results, "what changed," and proactive recommendations**, offering to apply changes via the P104 overlays, and delivers **brief, benefit-led spoken feature promotions** in context (one at a time, non-repeating after decline). Every spoken line is **also shown as captions/text**; it never autoplays, respects reduced-motion and screen-reader users, is fully keyboard-controllable, and degrades gracefully where speech synthesis is unavailable.

## P106 — Assistant must use the SERVER neural voices (the interview voices), not browser TTS

**Frontend wiring fix. Backend already done — verified live 2026-11-07.** The assistant currently speaks with the browser's robotic `speechSynthesis` and never calls the server TTS, even though the **same neural voices the Practice-Interview section uses are already available to it.** Confirmed on prod: `GET /api/v1/narration/voices` returns **`server_tts: true`, provider `openai`, 11 voices** (alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse; default **nova**), and `POST /api/v1/narration/speak` returns **200 audio/mpeg**. The backend note confirms narration *"reuses the same neural-voice source (`state.speech`) as the mock interview."* Nothing to build server-side or configure — just call it.

### Do
1. **Populate the voice picker from the server.** On opening the assistant/voice settings, call **`GET /api/v1/narration/voices`** and list the returned **server voices** (id + display name + gender) — all 11 — with the server `default_voice` ("nova") preselected. Drop the placeholder/mislabeled list ("Alloy · serverEcho…"). Persist the choice via `PUT /api/v1/narration/prefs` (and the existing `hw_narration_voice`).
2. **Speak through the server, not the browser.** When the assistant speaks (Listen to recommendations, Guide me, read a summary, Grand Tour narration), call **`POST /api/v1/narration/speak`** `{ text, voice }`, take the returned **audio/mpeg**, and play it via an `<audio>` element (track it so Pause/Stop/skip control it, and so it can be torn down cleanly — no orphaned audio).
3. **Browser voice is the FALLBACK only.** Use `speechSynthesis` **only** when `voices.server_tts === false` or `/speak` returns **501** (no provider). It must never be the default when server voices are available — which, on prod, they are.
4. **Keep the rest of P105** (speak+highlight sync, captions/text of every line, transport controls, consent-first, accessibility). Sync the highlight to audio via the `<audio>` element's `timeupdate`/`ended` events instead of `speechSynthesis` boundaries when using server audio.
5. Respect the request cap (the endpoint limits ~8000 chars) — chunk long reads per step/sentence.

### Acceptance
The assistant's voice picker lists the **11 server neural voices** from `GET /api/v1/narration/voices` (default nova), and speaking routes through **`POST /api/v1/narration/speak`** with the returned audio played via a managed `<audio>` element (verifiable: an `audio/mpeg` request fires and an `<audio>` plays — not `speechSynthesis`). The browser voice is used **only** as the documented fallback when `server_tts` is false / `/speak` 501s. Voice choice persists via narration prefs; Pause/Stop/skip control the audio with clean teardown; highlight stays in sync via audio events; captions and accessibility from P105 remain.

## P107 — Full word-processor editing of the Working copy (rich text, per-word formatting)

**Frontend. Pairs with the backend task in `docs/RICH_TEXT_EDITING.md` (Option B) — requires `content_html` support on the versions/export endpoints.** Make the **Working copy** fully editable like a word processor: type anywhere and apply **per-word** formatting, saved as a version. The faithful **Original** view (P94) stays read-only.

### Do
1. **Rich-text (WYSIWYG) editor on the Working copy.** Use a proven editor — **TipTap (ProseMirror)** recommended (React-friendly, outputs clean HTML). Render the document body as an editable surface where the user clicks and types directly, like Word/Docs. Not a raw-markdown box.
2. **Formatting toolbar** (sticky, branded per P97/P98): **bold, italic, underline, strikethrough**; **font family** and **font size**; **text color** and **highlight**; **headings** (Title / H1 / H2 / body); **alignment** (left/center/right/justify); **line spacing**; **bulleted & numbered lists**; **links**; **undo/redo**; **clear formatting**. Keyboard shortcuts (Ctrl/Cmd+B/I/U, etc.). Reuse the existing rephrase/selection pattern for a floating mini-toolbar on text selection. Colours round-trip end-to-end (backend allows them and renders them on export); the colour picker emits `#hex`/`rgb()` values.
3. **Save as a version.** The editor emits HTML; save via `POST /api/v1/{resumes|cover-letters}/{id}/versions { content_html }`. The backend sanitizes it and derives the plain-text `content` for AI/ATS — the client does **not** send a second text body. Use the **P103 decision overlay** for Save / Save as new version / Cancel (Ctrl+S saves; pulse Save while dirty). Autosave-to-draft locally is fine; a committed version is explicit.
4. **Keep colours or standardize for ATS (imported coloured docs).** When a document is imported **with colour** (detect it in the loaded `content_html` — any `color:`/`background-color:`), offer a clear one-time choice in a P103-style overlay: **"Keep colours"** vs **"Standardize for ATS"** (strip colour, keep all other formatting). Keep = save normally; Standardize = save with `{ "content_html": …, "standardize": true }` (the backend strips every colour and keeps the rest). Make the ATS rationale plain ("some applicant-tracking systems read coloured text poorly"). The choice is the user's; never auto-strip. A user can also re-standardize later from the toolbar/menu.
5. **Original vs Working copy stays clear (P94).** **Original** = faithful, read-only, exactly as uploaded. **Working copy** = this editable rich document. A `.docx` upload opens the Working copy **already formatted and coloured** (backend seeds `content_html`, colour included); `.pdf`/`.txt` open as editable text. One line reminds the user that AI tailoring operates on the Working copy.
6. **Load `content_html`** from `GET /…/{id}` (or the version render) into the editor; fall back to rendering `content` (Markdown) for legacy versions with no `content_html`.
7. **Escape hatch for full fidelity.** Keep **Open in Google Docs / Download as Word** (P91/P92) for anything beyond the in-app editor — now round-tripping the formatted document.
8. Accessible (keyboard-operable toolbar, ARIA, focus ring, AA contrast), responsive (toolbar wraps/collapses to an overflow on mobile), `prefers-reduced-motion` safe.

### Acceptance
The Working copy is a **true WYSIWYG editor**: the user types anywhere and applies **per-word** bold/italic/underline, font family/size, **colour/highlight**, alignment, spacing, lists, headings and links, with a branded toolbar and shortcuts. Saving writes `content_html` to a new version via the versions endpoint (backend derives the text projection; AI/ATS unaffected), committed through the P103 save overlay. An imported **coloured** document offers **Keep colours vs Standardize for ATS** (the latter saves with `standardize: true`); nothing is auto-stripped. A `.docx` upload opens already formatted and coloured; Original stays read-only; legacy Markdown versions still load. Exports/Google-Docs reflect the formatting (colours included). Keyboard-accessible, responsive, reduced-motion-safe.

## P108 — BUG: the cover letter reverts on republish + the section is too busy (show one large editable render)

**Frontend. Correctness-first bug fix + a decluttering pass — verify on the published build.** Two problems on the cover-letter (Documents) screen: (1) the user's saved version **reverts whenever a new Readdy build is published**, and (2) the section is **too busy** and never simply shows a **large, editable render** of the letter. The backend is **not** the cause and needs no change — a committed version is already durable on the server (`POST /cover-letters/{id}/versions` saves it and sets `active_version`; `GET /cover-letters/{id}` returns `active_version`, the `versions[]`, and each version's `content`/`content_html`). The bug is that the UI is trusting client-side state that a republish wipes.

### 1. Make the current version survive a republish (the bug)
The server is the **single source of truth** for which version is current. On load the screen must **read it back**, and nothing a new Readdy build ships may override it.
- **On mount, always fetch the document** (`GET /api/v1/cover-letters/{id}`) and render **`active_version`** — load **that version's `content_html`** into the P107 editor (fall back to its `content` for legacy versions). Never seed the editor from a Readdy-bundled default, a hard-coded sample, or stale build assets.
- **A committed edit must persist server-side, not just in view-state.** Saving/applying/activating goes through the existing endpoints (`POST /cover-letters/{id}/versions`, `.../versions/{v}/activate`) — which already set `active_version` — so the current version is reconstructed from the server after any reload or republish. If "current" is only React/`useState` or a build-scoped cache, that's the bug.
- **Do not key persistence to the build.** Any client cache (localStorage/sessionStorage/IndexedDB) is a **convenience mirror only**; on load, the **server's `active_version` wins** and overwrites the cache. Do not namespace saved state by a Readdy build hash/origin, and do not treat a new bundle as a reason to re-seed. Clearing the cache must change nothing the server already holds.
- **Acceptance check for this bug:** edit a cover letter and save → publish a new Readdy build → reopen the letter → it shows the **edited version**, not the old/original. (Reconciles with the P104 §1 single-`selectedVersion` rule and the P3a "preview mirrors the server version" rule.)

### 2. Lead with ONE large, editable render — declutter everything else
The cover-letter view should open to a **large, readable, editable rendering of the letter itself** (the P107 Working copy), front and centre — not a crowded grid of panels, zones, rails and cards competing for attention.
- **The document is the hero.** A single large editing surface takes the main column at a comfortable reading/writing width (document-sized, generous line length, real type). The P107 WYSIWYG toolbar sits with it (sticky). This is the first and main thing the user sees and interacts with.
- **Demote the rest to secondary, on-demand surfaces.** Versions marquee, Original/Working-copy toggle, AI recommendations (P104 §4), Design, voice/assistant, and other tools move **out of the always-on layout** into a compact side panel / tabs / overflow menu, or the P101/P103 overlays — summoned when wanted, collapsed by default. Keep **one** clearly-primary **Save** (P97/P98 prominence, P103 overlay to commit); don't scatter duplicate commit buttons.
- **Remove redundancy.** Collapse duplicated previews/thumbnails into the single large render (no separate small thumbnail *and* big view fighting — see P104 §2). Drop decorative panels and copy that don't help write or save the letter. One AI-recommendations entry point, not several.
- **Keep it simple on small screens.** The large render stays the focus; secondary tools collapse to an overflow. Accessible (keyboard, ARIA, AA contrast), `prefers-reduced-motion` safe.

### Acceptance
Reopening a cover letter after **a new Readdy build is published** shows the user's **saved/current version** (server `active_version` with its `content_html`), never a reverted or bundled-default copy; the current version is reconstructed from the server and no build-scoped client cache can override it. The screen **opens to one large, editable rendering** of the letter (the P107 Working copy with its toolbar) as the clear focus, with versions, Original toggle, AI recommendations, Design and assistant **demoted to secondary/on-demand** surfaces and a single prominent Save. No duplicate previews or commit buttons; responsive, accessible, reduced-motion-safe.

## P109 — Build the Unified Workspace (current): one large editable render + a demoted tabbed panel, for résumés AND cover letters

**Frontend / IA. This is the build order for the single Workspace — it supersedes the *layout* of P7 and folds in everything shipped since (P94, P96–P108). No backend, no new endpoints; every endpoint is already LIVE.** P7 defined the Workspace IA and the per-tab endpoint map; this prompt is what to actually build now, reconciled with the rich editor, the one-large-render focus, the persistence fix, the overlays, and the assistant. Where this prompt and P7 differ (the editing surface, the focus, persistence), **this prompt wins**; for each tab's detailed behavior, follow P7 and the prompt it cites. Verify on the **published** build (`hlrtlg.readdy.co`), Bearer auth, the global P0 rules apply.

### A. Information architecture (from P7 — keep)
- **Documents = the library.** Pick / upload / archive / flag / delete résumés **and** cover letters; opening any document goes into the **Workspace**. There is **no** separate "My Work Highlights" nav entry and **no** separate "Documents editor" page — exactly **one** place to edit a document.
- **One Workspace shell for both types**, driven by the **P29/P33 Résumé ⇄ Cover letter toggle**: the toggle switches the shell, the preview, **and** the versions marquee together. Résumé = full tabs; cover letter = reduced tabs (§D).

### B. The hero: ONE large, editable render (P108 §2 + P107 + P94)
This is the change from P7's "static preview + hidden markdown editor." The main column **is** the editable document.
- **The editing surface is the hero.** The main column is the **P107 WYSIWYG Working copy** — a large, document-width, click-and-type rich editor (per-word bold/italic/underline, font family/size, **colour/highlight**, headings, alignment, spacing, lists, links; sticky branded toolbar; `#hex`/`rgb()` colours that round-trip). Not a hidden/opt-in markdown box. One comfortable reading/writing width, real type, generous line length.
- **Original ↔ Working copy (P94).** A clear toggle on the hero: **Original** = faithful, read-only, exactly as uploaded; **Working copy** = this editable render. A `.docx` upload opens the Working copy **already formatted and coloured** (backend seeds `content_html`); `.pdf`/`.txt` open as editable text. Imported-with-colour → the P107 **Keep colours vs Standardize-for-ATS** overlay.
- **Real full-size reader (P104 §2).** Expanding opens a **true full-size reader overlay** of the current selection (P96 zoom/fit, Esc/✕), as a single managed overlay — **no orphaned enlarged thumbnail**, no duplicate previews.

### C. Persistence: the current version survives a republish (P108 §1 — applies to BOTH types)
- **On mount, always fetch the document** (`GET /api/v1/{resumes|cover-letters}/{id}`) and load **`active_version`** (its `content_html`, falling back to `content` for legacy versions). **Never** seed the editor from a Readdy-bundled default, sample, or stale build asset.
- **One `selectedVersion` is the single source of truth** (P104 §1): it drives the hero render and matches the marquee's "Current" card and the header version number — always. Saving/applying/activating persists server-side via `POST /{…}/{id}/versions` and `.../versions/{v}/activate` (both already set `active_version`), so the current version is reconstructed from the server after any reload or **republish**.
- **Client cache is a mirror only** — never keyed to the build hash/origin; on load the server's `active_version` wins. Clearing it changes nothing the server holds.

### D. The rest is DEMOTED to a compact side panel / tabs / overlays (P108 §2, folding P7's tabs)
Everything that isn't the document moves out of the always-on layout into a slim side panel (tabs, one visible at a time), an overflow menu, or the P101/P103 overlays — collapsed by default, summoned when wanted. Nothing from P7 is lost; it's just no longer competing with the document. For a **résumé** the panel holds P7's tabs; for a **cover letter**, the reduced set.

- **Ask AI + proactive recommendations** — instruction-driven edit (`/ai-edit`, `/improve-structured`), **defaulting to the last generated bullets + prompt** (P6: `/highlights/latest`, `/highlights/runs`, `.../runs/{run_id}/state`, `DELETE /highlights`). This tab is also where the **P104 §4 proactive AI recommendations** live: on open/after upload, run the review (cover letters: `review_cover_letter` incl. the salutation check; résumés: `/suggest-edits`) and surface a short ranked list with **Apply · Apply all · Dismiss** in a **P103 overlay**, each undoable. Tie "fix everything" to the one-pass Improve.
- **My Work Highlights** *(résumé only)* — the paste-driven, accept-before-save pipeline (P2.3 zones A–D): `/evidence-prompts` → `/evidence/extract` → `/evidence/synthesize` → `/highlights/suggest` with smart Add/Replace (`/match-bullets`, P2a), scrollable accept/reject + Undo (P2d), complement/avoid dedup (P2c) → `/apply-edits` → `/versions`. Persistent experience library (`/api/v1/experience*`) → `/incorporate`.
- **Bullets** *(résumé only)* — the interactive bullet board (P4): reorder, edit, remove, substitute, drag right→left to replace, undo/redo. `/match-bullets`, `/versions`.
- **Manual edit** — the raw-text/markdown fallback + Find & replace (P1b/P1c/P1.1, `/replace`) for anyone who wants it; secondary to the P107 WYSIWYG hero, not the primary editor.
- **Design** — template/design chooser with live preview (P2.4): `/resume-templates` (+ `/categories`), `/resume-templates/generate`, `PUT /{id} { template_id }`. Make it discoverable (P79/P82) but out of the hero.
- **Versions** — the marquee (P2.1): list, rename, activate, delete. `GET /{id}` (`versions[]`, `active_version`), `.../versions/{v}/render`, `PATCH`/`activate`/`DELETE`. Switches with the P33 toggle.
- **Assistant (P101/P105/P106)** — the translucent Harbor Assistant is available from the Workspace (Guide me / Listen), speaking through the **server neural voices** (`/narration/speak`), able to narrate steps, read the review/summary, and read + offer to apply the §D recommendations via the same overlays. On-demand, consent-first, captioned.

### E. Commits, Save, and shared rules
- **One prominent Save** (P97/P98 prominence), committed through the **P103 decision overlay** (Save / Save as new version / Cancel; Ctrl+S; pulse while dirty). **No scattered duplicate commit buttons.**
- Single save path (`/versions`); **Undo = switch to the previous version**; the **"Updated — N change(s)"** cue (P4b) after any save; global P0 (token refresh, null-safe render on 200, error+Retry not infinite spinners). Switching tabs never loses the hero render, `selectedVersion`, or an in-progress review.
- Enforce the **cover-letter rule set** (P97/P104 §3): required opening salutation + one-click insert, top contact header vs. distinct bottom signature, Original/Working-copy fidelity, horizontal versions (P88), upload-adds-and-currents (P96/P102/P75).

### F. Cover letters = the same shell, reduced tabs (P7 §C + P97)
Opening a cover letter opens the **same Workspace** with the **same large P107 editable hero** and Original/Working-copy toggle, pointed at the letter, with a **reduced panel**: **Ask AI + recommendations**, **Manual edit**, **Design** (if templates apply), **Versions**. Hide the résumé-only tabs (My Work Highlights pipeline, Bullets board). Same persistence (§C), same Save/overlay model, cover-letter rules enforced.

### G. Scope
IA + layout + focus only; reuse every existing control's behavior from the cited prompts. The only AI is the AI those tabs already call. **No new backend, no new endpoints.** Nothing in `src/` changes.

### Acceptance
There is **one** place to edit a document, for both résumés and cover letters, reached by opening from the Documents library and switched by the **Résumé ⇄ Cover letter toggle** (which moves the preview **and** the versions marquee). The Workspace **opens to one large, editable rendering** — the P107 WYSIWYG Working copy with its toolbar and the P94 Original/Working-copy toggle — as the clear focus; versions, My Work Highlights, Bullets, Manual edit, Design, AI recommendations and the assistant are **demoted** to a compact side panel / overflow / overlays, collapsed by default, with **one** prominent Save (P103 overlay) and no duplicate previews or commit buttons. The current version is loaded from the server's `active_version` and **survives a Readdy republish** (reconstructed from the server; no build-scoped cache overrides it); one `selectedVersion` drives the hero and matches the marquee. Each panel item works against its live endpoint; saving anywhere creates a new version and the hero updates immediately with the "what changed" cue. A cover letter opens the same shell with the reduced tab set and the cover-letter rules enforced. No separate "My Work Highlights" nav entry; identical from every entry point; responsive, accessible, reduced-motion-safe.

## P110 — BLOCKER: the document is a PDF in an iframe, so it can't be edited — build the editable surface from the text the backend already has

**Frontend. This is the real reason P107/P108/P109 "don't work": the WYSIWYG editor was never actually built — the app still renders the document as a flattened PDF and clicking it only zooms. Fix the surface itself. No backend change.** Verified live on the published build 2026-11-08 by inspecting the DOM and the API:

> **Evidence (do not hand-wave past this):**
> - The "document preview" is an **`<iframe>` whose `src` is a `blob:` URL of `content-type: application/pdf`** (magic bytes `%PDF-1.6`). A PDF is a flattened image of text — **it has no editable text nodes and no DOM to place a caret in.** That is why "clicking the file" can never start editing.
> - There are **zero `contenteditable` elements anywhere on the page** — no editor was mounted.
> - The click that "snaps it to a smaller view" is the wrapper `div.group.relative…` (it has an `onclick` and `cursor:pointer`) — a **zoom/fit toggle**, not an edit action.
> - Across all 16 cover letters, **`content_html` is empty on every one** (including a `.docx` upload that should have seeded it), **but the plain-text `content` is present on almost all** (≈1,100–1,800 chars on generated letters). So the editable text already exists — the app just renders the PDF instead of using it.

### 1. The editing surface must be HTML in the page DOM — NEVER a PDF/iframe
Stop using the rendered **PDF** (the `build_pdf`/`file_url` blob in an `<iframe>`) as the thing the user edits. The Working copy must be **real HTML elements in the page** (`<h1>/<h2>/<p>/<ul>…`), styled to look like the document, so the browser can put a caret in them.
- **Source the HTML, with a fallback that works TODAY:** mount **`content_html`** if it's non-empty; **otherwise build editable HTML from the existing `content`** text (render its markdown-ish headings/bullets/bold into `<h*>/<p>/<ul>/<strong>` blocks). Do **not** depend on `content_html` being populated — on live data it is empty everywhere, so a `content`-only path must render a full editable document right now.
- The **PDF/`file_url` iframe is only for the read-only _Original_ view** (P94) and for Expand / print / export. It is never the editable surface.

### 2. Make the content editable IN PLACE, inside the existing frames
Exactly what the user asked: *"even if it uses the existing paragraph and header frames, all content within can be manually edited."*
- Render the document's blocks and make them **editable in place** — `contentEditable` on the rendered body (or TipTap/ProseMirror bound to that same HTML). **Clicking any paragraph or heading places a caret there and the user types** to change the text within that frame. Headings stay headings, paragraphs stay paragraphs; the text inside each is freely editable. Selection shows the P107 formatting toolbar.
- This is the hero surface from P108/P109 — large, document-width, real type.

### 3. Remove the click-to-zoom from the editing surface (the "snaps to smaller view" bug)
The wrapper `div.group.relative…` `onclick` that shrinks/zooms the view **must not intercept clicks on the editable document**. On the Working copy, a plain click = **place caret**, nothing else.
- Move zoom / fit-width / Expand to **explicit buttons** (P96), not a click anywhere on the page. The full-size reader/zoom stays available for the **Original** (the PDF) via those buttons — but clicking the editable Working copy never resizes it.

### 4. Save the edits (already supported)
On save, serialize the editable HTML and `POST /api/v1/{resumes|cover-letters}/{id}/versions { content_html }` (the backend sanitizes it and derives the plain-text `content` for AI/ATS). Commit via the P103 overlay. This also **fills the empty `content_html`** going forward, so reopened/edited docs get richer round-trips.

### 5. Data gaps to close (so editing isn't empty)
- A `.docx` upload must actually **seed `content_html`** (the backend supports it); verify the deployed build runs it — the live `.docx` has empty `content_html`.
- A few PDF uploads extracted almost no text (`content` of ~50 chars — scanned/flattened PDFs). For those, the Working copy will be near-empty; show a clear "we couldn't read text from this PDF — paste or type your letter here" editable state rather than a blank PDF the user can't touch. The Original PDF still shows read-only.

### Acceptance
Opening a document shows an **editable HTML rendering in the page DOM**, not a PDF in an iframe. **Clicking any paragraph or heading places a caret and the user can type and change the text in place**, within the existing heading/paragraph frames; a plain click **never** resizes or "snaps" the view (zoom/Expand are explicit buttons, and apply to the read-only Original). The surface renders from `content_html` when present and **otherwise from the existing `content` text** (so it works on today's data where `content_html` is empty). Editing then saving writes `content_html` via the versions endpoint (text derived server-side). The **Original** view still shows the faithful uploaded PDF, read-only. A `.docx` upload seeds `content_html`; a text-less scanned PDF yields an editable "type your letter here" surface, not an un-editable blank. Verified by: a `contenteditable` (or editor) node exists in the DOM, the document is **not** inside a `application/pdf` iframe on the edit surface, and typing changes the on-screen text.

## P111 — Assistant speaks by DEFAULT (one-time consent) + a sleek on/off + mic muted by default with real privacy controls

**Frontend. Updates the posture of P105/P106:** instead of "default off, click to speak every time," the assistant **speaks by default once the user has given a one-time consent**, captured in the setup wizard (P83) or on the assistant's first run. Voice output and voice input (mic) are **separate** permissions; the mic is **off/muted by default and between interactions**. Keep everything P106 established (server neural voices via `POST /api/v1/narration/speak`, captions, transport controls). No backend change — reuse the narration prefs (`hw_narration_enabled`, `hw_narration_voice`, `hw_narration_rate`, `hw_narration_auto_read`, `PUT /api/v1/narration/prefs`) and add the local flags below.

### 1. One-time consent, then speak by default
- **Ask once, clearly.** In the **P83 setup wizard** (a short "Meet your guide — want it to talk you through things?" step) **or** on the **assistant's first run**, show a friendly consent card: **"Turn on the talking guide"** — *"Your assistant can walk you through tasks out loud with a natural voice. You can turn this off anytime."* Buttons: **Yes, talk to me** (primary) / **No, stay silent**. The **Yes click doubles as the browser audio-unlock gesture** (required for autoplay) — speak a one-line confirmation right then so the user hears it working.
- **After consent, voice output is ON by default** (`hw_narration_enabled = true`, `hw_narration_auto_read = true`, plus a `hw_voice_consent = "granted"` flag so we never re-prompt). The assistant then narrates steps, summaries, review results and recommendations **without a per-time click** — within the normal autoplay rules (speak in response to the user's navigation/actions, which carry a gesture; if a context ever lacks one, fall back to a single "🔊 tap to hear" chip, never a dead-silent failure).
- **If the user picks "No,"** set consent to `declined`, voice stays off, and only the sleek toggle (below) is shown — never nag again.
- **Screen-reader exception (keep from P105):** if the user relies on a screen reader / has a reduced-motion+AT profile, **default voice OFF** even post-consent and let them opt in — don't double-speak over their AT.

### 2. A sleek, always-visible on/off for speech
- A **minimal speaker toggle** on the assistant chrome — a single **🔊 / 🔇** control (clear label/tooltip, ~1 tap) that mutes/unmutes the voice instantly and **persists** (`hw_narration_enabled` / a `hw_voice_muted` flag). No digging through Settings to silence it.
- Muting **stops any in-flight audio immediately** (tear down the `<audio>` element — no orphaned playback) and shows the muted state; unmuting resumes future narration. Keep the fuller transport (Play/Pause/Stop/skip, voice picker, rate) from P105/P106 behind the assistant's menu.

### 3. Microphone: requested, but MUTED by default and between interactions (privacy-critical)
Voice **input** (talking to the assistant) is a **separate opt-in** from voice output, with strict defaults:
- **Separate permission ask.** Request the mic only when the user first chooses to use voice input (or as a clearly-separate, skippable step in the wizard) — **not bundled** into the speak-consent. Copy: *"Let the assistant listen only while you hold the mic button. It stays muted the rest of the time."*
- **Muted by default and between interactions.** The assistant **never holds an open mic.** It listens **only** during an explicit **press-and-hold / tap-to-talk** interaction, and the instant that ends it **stops the media tracks** (`stream.getTracks().forEach(t => t.stop())`) — not merely paused/`enabled=false`. Between interactions the mic is fully released, and the browser's in-use indicator is off.
- **Visible state.** A clear mic indicator: **muted (default)** vs **listening (only while held)**. Listening shows an obvious active cue; releasing returns to muted.
- **No recording, no storage.** Audio is transcribed transiently for that one interaction and **never stored, uploaded as audio, or logged**; nothing persists. If transcription uses a service, say so in the privacy note; otherwise use the browser `SpeechRecognition` locally.
- Voice input is **fully optional** — the assistant is completely usable with the mic permission denied/never granted (type to it instead).

### 4. Sensible privacy controls (one small panel)
A compact **"Voice & privacy"** panel on the assistant (and mirrored in Settings):
- **Talking guide (voice output):** On/Off — reflects/sets `hw_narration_enabled`.
- **Let the assistant listen (mic):** Off by default; "Only while I hold the mic button" (no always-on option). Revoke here (stop tracks + forget the grant).
- **Voice** picker + **rate** (from P106 server voices).
- A plain-language line: *"Your mic is off unless you're holding the button. We don't record or store your audio."* Link to revoke/relearn.
- Everything is **reversible** and **remembered** via narration prefs + the local flags; revoking mic access takes effect immediately.

### 5. Keep all of P105/P106
Server neural voices (not browser TTS) via `/narration/speak` played through a managed `<audio>`; **every spoken line is also shown as captions/text**; speak+highlight stays in sync (audio `timeupdate`/`ended`); Pause/Stop/skip; graceful fallback to captions-only where speech is unavailable; `prefers-reduced-motion` respected.

### Acceptance
After a **one-time consent** (in the P83 wizard or the assistant's first run), the assistant **speaks by default** — narrating steps, summaries, review results and recommendations without a per-time click — using the server neural voice, with captions always shown. A **sleek 🔊/🔇 toggle** on the assistant mutes/unmutes instantly (stopping in-flight audio) and persists; declining consent leaves it silent with no re-nagging; screen-reader users default to silent. The **microphone is a separate opt-in, muted by default and between interactions** — it listens **only** during an explicit press/tap-to-talk and **stops the media tracks** the moment that ends (browser mic indicator goes off), never records or stores audio, and the assistant works fully with the mic denied. A **"Voice & privacy" panel** exposes voice-output on/off, mic off/"only while held," voice/rate, revoke, and a plain no-recording statement — all reversible and remembered. Verified by: the mic's live-use indicator is off except while the talk button is held, and no audio stream/track stays active between interactions.

## P112 — Assistant console: draggable + speed slider + readable captions on the translucent overlay + remember the speak choice

**Frontend. Polish on the live assistant (P101/P105/P106/P111). No backend change** — reuse narration prefs (`hw_narration_enabled`, `hw_narration_voice`, `hw_narration_rate`, `hw_voice_consent`, `PUT /api/v1/narration/prefs`) and hydrate them on load (P22). Four refinements.

### 1. Grabbable, movable console
- The assistant console (the P101 translucent panel) is **draggable** — a clear grab handle / its header bar (`cursor: grab` → `grabbing`), drag to reposition anywhere on screen. Pointer-based (mouse + touch).
- **Stay on-screen:** clamp to the viewport so it can't be dragged off or cover nothing-but-edge; re-clamp on window resize. Don't let it block the whole document — it floats above, movable out of the way.
- **Remember its position** across reloads/sessions (`hw_assistant_pos` in localStorage); restore on load, falling back to a sensible default (e.g., bottom-right) if off-screen or unset. A small "reset position" affordance in its menu.
- **Accessible:** movable by keyboard when the handle is focused (arrow keys nudge), ARIA on the dialog, focus not trapped, `prefers-reduced-motion` (no slide animation, just place it).

### 2. Speaker speed slider (visible, not buried)
- A **labeled rate slider** right on the console (near the 🔊/🔇 toggle) — **Slower ↔ Faster**, range ~**0.5×–2.0×**, step 0.1, showing the current value (e.g., "1.0×").
- **Applies live:** changing it adjusts the **currently playing** narration and all future speech immediately — for server audio set `audio.playbackRate`; for the browser-TTS fallback set `utterance.rate`.
- **Persists** to `hw_narration_rate` and syncs via `PUT /narration/prefs`; restored on load.

### 3. Readable captions on the translucent overlay
Keep the translucent/glass look (P101), but the **words must be clearly legible** on top of it — the current captions are hard to read.
- Put the caption text on a **subtle solid scrim** inside the translucent panel (a darker/lighter readable band behind just the text, or a frosted `backdrop-filter` layer) so it never sits directly on busy page content.
- **Larger, higher-contrast type:** comfortable caption size (≥16–18px), good weight, **AA contrast guaranteed** against the scrim in **both light and dark** themes; a soft text-shadow/outline as a fallback where blur isn't supported. Sensible max line-length and line-height; the current spoken sentence is emphasized.
- The panel chrome stays translucent and light; **only the readability of the words is increased** — don't make the whole panel opaque.

### 4. Remember the decision to let the assistant speak (across engagements)
The speak choice must **survive reloads and the next visit** — don't re-ask or reset to off.
- On load, **hydrate** the voice state from the **server narration prefs** (P22) and localStorage: `hw_voice_consent` (granted/declined — never re-prompt once set), `hw_narration_enabled`/`hw_voice_muted` (the on/off), `hw_narration_voice`, `hw_narration_rate`, and the window position. Apply them before the assistant first speaks.
- **Write-through on every change:** toggling 🔊/🔇, moving the rate slider, or granting/declining consent updates both localStorage **and** `PUT /narration/prefs`, so the choice is remembered on this device and the next (cross-device per P22).
- Net effect: a returning user who turned the voice on (or off) finds it **the same way next time**, at their chosen speed and voice, with the console where they left it — no fresh consent prompt.

### Acceptance
The assistant console can be **dragged by its handle/header to any on-screen position** (mouse/touch + keyboard), stays clamped on-screen, and **remembers its position** next time. A visible **speed slider (0.5×–2.0×)** changes the narration rate **live** (current + future speech) and persists. **Captions are clearly readable** — larger, high-contrast text on a subtle scrim within the still-translucent panel, AA-compliant in light and dark. The **decision to let the assistant speak is remembered across reloads and future visits** (consent, on/off, voice, rate, and position hydrated from narration prefs + localStorage, written through on change) — a returning user is never re-prompted and finds their settings intact. Reduced-motion and keyboard accessibility preserved throughout.

## P113 — One AI surface: fold the typed AI-prompt into the Assistant, and remove the now-redundant manual-edit buttons

**Frontend. Builds on the live editable editor (P110) and the Assistant (P101/P105/P106/P111/P112). No backend change** — reuse the same AI endpoints the prompt box already calls. Two cleanups the user asked for, verified against the live cover-letter editor 2026-11-08.

### 1. Remove the redundant manual-edit buttons (the document is directly editable now)
Now that the Working copy is a real `contenteditable` surface with a formatting toolbar (P110 — confirmed live: one `contenteditable` body, no PDF iframe), the separate "open a manual editor" controls are dead weight. The editor currently shows **four** overlapping ones — **"Edit manually," "Edit the full text," "Edit text,"** and **"Prefer to tweak it yourself? Advanced tools."**
- **Remove them from the editor chrome.** Direct in-place editing **is** the manual editing — clicking the letter and typing, with the toolbar. There's no second "manual" mode to switch into.
- If a raw-text / plain-markdown fallback is still wanted for edge cases (e.g. a scanned PDF with no structure), keep **exactly one** entry, tucked inside an **overflow / "Advanced"** menu — never as prominent chrome, and not duplicated. Everything else goes.

### 2. Fold the typed AI-prompt into the Assistant (one place to ask the AI)
Today there are two "AI" surfaces: a standalone **AI-prompt textarea** (placeholder *"e.g. make my summary punchier, or use present tense for my current role."*) **and** the **Assistant**. Collapse them so the **Assistant is the single AI surface** — you **type or talk** to it, and it both **guides you** and **makes the requested edits**.
- **Remove the standalone AI-prompt textarea** from the editor chrome. Its job moves into the Assistant.
- **The Assistant gets a text input** (always available, alongside the P111 mic). The user asks it anything in plain language — an **edit request** ("make my summary punchier," "use present tense for my current role") **or** a **help request** ("how do I add a job?"). Typing always works even if the mic is denied.
- **It routes intent to the same endpoints the prompt box used:** an edit request → `POST /api/v1/cover-letters/{id}/ai-edit` (or `/improve-structured`, `/suggest-edits` → `/apply-edits` → `/versions`) **against the currently open document**; a help/navigation request → the P101 guidance. One AI brain, context-aware of the open document (P101).
- **Edits apply with Undo** (the current model: apply immediately, **Undo = version switch**, P1.1/P0b), the preview updates, and the change is saved as a version. For bigger rewrites, offer **Apply / Apply all / Dismiss** via the P103 overlay (as P104 §4 already does). Nothing destructive without the user seeing it.
- **Keep the proactive layer (P104 §4 / P105):** the Assistant still surfaces and reads ranked recommendations and can apply them — now the same surface you can also type a freeform instruction into.

### 3. Keep the hero "Auto-improve" button (don't fold that away)
The one-click **"Auto-improve my cover letter" / "Improve whole cover letter"** hero action (P98) **stays a visible primary button** for non-technical users — only the *freeform typed prompt* folds into the Assistant. The Assistant may **also** trigger auto-improve ("want me to improve the whole thing?"), but the standalone hero button remains.

### Acceptance
The cover-letter (and résumé) editor has **no standalone "Edit manually" / "Edit the full text" / "Edit text"** buttons — direct in-place editing is the only manual editing, with at most **one** raw-text fallback hidden under an Advanced/overflow menu. There is **no standalone AI-prompt textarea**; the **Assistant is the single AI surface** — the user **types or speaks** a request to it, and it **guides** (help/navigation) **or edits the open document** (routing to `ai-edit`/`improve`/`suggest`→`apply`→`versions`), with apply + Undo and the P103 overlay for larger changes, preview updating on save. The **hero "Auto-improve" button stays visible** (P98). Typing to the Assistant works with the mic denied; the Assistant stays context-aware of the open document; accessibility and the P112 console behavior are preserved.

## P114 — The Assistant completes tasks: conversational step-by-step walkthroughs, confirm-before-acting (click OR voice), relevant suggestions

**Frontend orchestration over existing endpoints. Elevates the Assistant (P101/P104/P105/P113) from a setup guide into a task-completion agent. No new backend** — it drives the flows the app already has (connect sources, auto-apply, tailoring, interview) and obeys the P76 authorization-checkpoint model and the global "explicit consent before any side-effectful action" rule.

### A. From guide to agent: drive a desired OUTCOME to done
The Assistant doesn't just point at buttons — it **walks the user through a goal to completion**, in conversation. The user states an outcome ("help me set up auto-apply," "get my résumé ready for this job," "connect my email") and the Assistant **takes them through every step and action**, doing what it can and directing what only the user can, checking each step is done before moving on, until the outcome is achieved. It is multi-step and conversational, not a one-shot answer.

### B. Task playbooks (each = ordered steps + the real action + a completion check)
Ship a set of **outcome playbooks**, each decomposed into concrete steps with the exact control/endpoint and a "done?" check. At minimum:
- **Connect a job source** — walk through connecting email/boards (P13/P14/P71 Connect hub, `/api/v1/integrations/*`): explain, open the right connect flow, confirm it connected (poll status), offer "pull now."
- **Set up auto-apply** — the P15/P23/P24 flow: pre-fill a sensible rule, explain each field, **create/enable it on confirm** (`/api/v1/auto-apply*` rules), then show it running.
- **Tailor my résumé / cover letter to a job** — pick the job (Matches, P31 pulls the JD), open the doc in the Workspace (P109), run the tailoring/recommendations (P104 §4), apply on confirm, save a version.
- **Practice an interview** — set role/mode (P49/P50), start a session.
- (Extensible: Upload/organize documents, review matches, etc.) Each playbook declares its steps so the Assistant can narrate progress ("Step 2 of 4") and resume if interrupted.

### C. Do-or-direct each step
For every step the Assistant either:
- **Does it** (offer first, §D) — e.g. create the auto-apply rule, apply a résumé edit, trigger "pull now" — via the same endpoint the UI uses; then shows the result and an **Undo** where possible; **or**
- **Directs the user** (spotlight + plain instruction, P100/P105) for anything only they can/should do — **OAuth consent, entering credentials, choosing a file, picking a job** — and waits, detecting completion before advancing. The Assistant **never performs the sensitive step itself** (it never types a password or completes a provider's consent screen).

### D. Confirm before acting — clearly, by click OR voice; check the mic first
Before **any** action that changes something (connect an account, enable auto-apply, apply an edit, send, delete, save), the Assistant **asks in plain language and waits for an explicit yes**:
- **Ask clearly:** *"Want me to create an auto-apply rule for Software Engineer roles in Columbia, SC? I won't send anything until you say go."* Show the specifics of what it will do.
- **Accept the answer by click OR voice.** On-screen **Yes / No** (primary/secondary) **and**, when voice input is available, a spoken **"yes / do it / go"** or **"no / stop"** confirms. 
- **Check mic status before offering voice confirmation.** Query the permission/mute state (`navigator.permissions.query({name:'microphone'})` + the P111 mic flag). If the mic is **granted and the user chooses to talk**, accept the spoken yes/no (listening only during that confirm, then tracks stopped — P111). If the mic is **muted/denied/unavailable**, don't wait on voice — present the **Yes/No buttons** and optionally offer "tap the mic to answer by voice." Never block on a mic that isn't on.
- **No action without an explicit yes.** Silence, ambiguity, or "not sure" = do nothing and keep guiding. Every action it takes is logged to the **P76 AI-activity / approvals** surface, is reversible where the platform allows, and the Assistant **reports what it did** afterward ("Done — your rule is on. Undo?").

### E. Relevant, in-context suggestions
As it works, the Assistant **offers the next sensible step or feature** where it makes sense — *"Your résumé's tailored. Want to set up auto-apply so it goes out automatically?"* / *"You've connected Gmail — want me to pull your latest matches?"* One at a time, benefit-led, dismissible, never nagging (don't repeat after "no thanks"). Suggestions are grounded in the user's actual state (connected sources, existing rules, current document), not generic.

### F. Keep the guardrails
Consent-first and **mic muted by default / between interactions** (P111); sensitive data (credentials, OAuth, payment) always done by the user, never the Assistant; spoken lines also shown as **captions/text** (P105); the P112 console (draggable, speed slider, readable captions, remembered state) and all accessibility/reduced-motion rules preserved; typing to the Assistant fully works with the mic off.

### Acceptance
The Assistant **walks a user through a complete outcome** (e.g. connect a source, set up auto-apply, tailor a document, start an interview) **step by step in conversation**, doing what it can via the live endpoints and directing what only the user can (OAuth/credentials/file/job choice), checking each step before advancing, and announcing progress. Before **every** side-effectful action it **asks clearly what it's about to do and waits for an explicit yes**, accepting **either an on-screen Yes/No or a spoken yes/no** — and it **checks mic status first**, falling back to buttons when the mic is muted/denied and never blocking on voice. Nothing changes without confirmation; actions are logged to the P76 approvals surface, reversible where possible, and reported back with Undo. The Assistant **proactively suggests relevant next features/actions** grounded in the user's state, one at a time and dismissible. All P111/P112 privacy, console, caption and accessibility behavior is preserved.

## P115 — Assistant playbooks (exact step scripts): Connect a source · Auto-apply · Walk the matches · Upload/Download · Design

**Frontend. The concrete scripts P114 executes. No new backend — every endpoint below is LIVE** (verified against the routers 2026-11-08). Each playbook is ordered steps; each step says **Do** (Assistant calls the endpoint, after the P114 confirm) or **Direct** (only the user can — Assistant spotlights + waits), the **endpoint**, whether it **needs confirm**, and the **done-check**. The P114 rules hold throughout: confirm before any side-effectful call (click **or** spoken yes/no after a **mic-status check**); never enter credentials/OAuth; log to P76 approvals; report + Undo.

### Playbook 1 — Connect a job source
*Triggers: "connect my email/Gmail/iCloud," "add a job source," "where do my matches come from."*
1. **Pick the source.** Ask which: Gmail (OAuth) or iCloud/other mail (app password), or a board. **Direct** (user picks). No confirm.
2. **Start the connection.**
   - **Gmail / OAuth providers:** **Do** → `POST /api/v1/integrations/connect/gmail` → returns `{ authorization_url }`. **Confirm** ("Open Google's sign-in to connect Gmail?"), then open `authorization_url` in a new tab. **The user completes Google's consent themselves** (Direct) — the Assistant never types the password.
   - **iCloud / IMAP:** **Do** → `GET /api/v1/integrations/imap-providers` to render the form (label + where to get an app-specific password). **Direct:** the user enters their **email + app-specific password** (never their Apple ID password; Assistant never fills these). Then **Do** → `POST /api/v1/integrations/connect-imap { provider, email, app_password }`. **Confirm** before the POST.
3. **Verify it connected.** **Do** → `GET /api/v1/integrations` (OAuth) or the `?connected=` redirect / `connect-imap` 200 shows `account_email`. Done-check: the provider appears connected. If error, explain and retry step 2.
4. **Offer "pull now."** Suggest fetching matches from the new source. **Confirm**, then **Do** the ingest/refresh the Matches page uses. 
5. **Suggest next:** "Want to review your matches?" → Playbook 3.

### Playbook 2 — Set up auto-apply (safety-first: nothing sends without approval)
*Triggers: "set up auto-apply," "apply for me," "automate applications."*
> **Say this up front and mean it:** an auto-apply rule **never submits a real application on its own** — runs only **prepare** applications that **wait in your approvals**, and assisted/LinkedIn jobs are **queued for your manual Apply click**. The user approves each. Keep `require_verified: true`.
1. **Pre-fill smart defaults.** **Do** → `GET /api/v1/auto-apply/suggested-criteria` → `{ criteria:{ title_keywords, locations, remote, sources, min_fit_score }, suggested:{ max_submits, daily_cap, mode:"assisted", require_verified:true } }`. No confirm (read-only). Present the pre-filled rule in plain language.
2. **Explain each field + let the user edit.** title_keywords, locations, remote, sources, min_fit_score (fit threshold), max_submits, daily_cap, mode (**assisted** = queued for your click; **auto** = prepared then waits in approvals), interval_minutes (**0 = only when you run it**; >0 = cadence). **Direct** (user tweaks). Default to **mode: assisted, interval_minutes: 0, require_verified: true** unless the user explicitly chooses more.
3. **Create the rule — confirm clearly.** **Confirm** ("Create this rule? It won't send anything — matches will wait for your OK."). **Do** → `POST /api/v1/auto-apply/grants { name, scope:"criteria", criteria:{…}, require_verified:true, max_submits, daily_cap, mode, interval_minutes, expires_at? }`. Done-check: a grant id returns; show it as **active**.
4. **Preview before any real run.** **Do** → `POST /api/v1/auto-apply/grants/{id}/run { dry_run: true }` → show the jobs it *would* prepare. No submissions. 
5. **Run for real (optional) — confirm.** Only if the user asks. **Confirm**, **Do** → `POST /api/v1/auto-apply/grants/{id}/run { dry_run: false, limit? }`. Prepared apps land in approvals.
6. **Review approvals.** **Do** → `GET /api/v1/auto-apply/approvals`; the user **approves each** (`POST /approvals/{application_id}/approve`) or rejects (`.../reject`), or `POST /approvals/approve-all` **only on explicit confirm**. Pause/resume anytime: `PATCH /grants/{id} { status:"paused"|"active" }`.
7. **Suggest next:** "Want me to tailor your résumé so these applications are stronger?" → Playbook 5 / the tailoring flow.

### Playbook 3 — Walk through the matches
*Triggers: "show me my matches," "which jobs fit," "help me go through these."*
1. **Load matches.** **Do** → `GET /api/v1/jobs/matches?limit=10` (optionally `&resume_id=` if the user has several résumés, `&min_score=`, `&categories=`). No confirm. Each item has `score`, `reasons[]`, `breakdown{ semantic, skills, location, salary, seniority, recency }`, `matching_skills`, `gap_skills`, `authenticity_score`, `source_display`, `salary_display`, `url`.
2. **Walk them one at a time, top-ranked first.** For each: say the title/company, the **fit score and why** (read 1–2 `reasons` + the strongest `breakdown` factors), the **matching skills**, the **gaps** ("they want X, which isn't on your résumé"), and flag **low `authenticity_score`** as "verify before applying." Plain language, one job at a time (read-only; no confirm).
3. **Offer actions per job** (each needs **confirm**):
   - **Save it** → `POST /api/v1/jobs/saved { job_id }`.
   - **Tailor my résumé/cover letter to it** → hand to the tailoring flow (open the doc in the Workspace, pull this job's description, run recommendations P104 §4). 
   - **Open the real posting** → open `url`/`source_url` (Direct).
   - **Add to auto-apply** → Playbook 2 seeded with this role's keywords.
4. **Narrate progress** ("Job 3 of 10") and let the user say "next," "skip," "save this," "tailor for this." 
5. **Suggest next:** after the walk, "Want to export these, or set up auto-apply for the ones like these?" (`GET /api/v1/jobs/matches/export`).

### Playbook 4 — Upload & download documents
*Triggers: "upload my résumé/cover letter," "download this," "get a Word/PDF copy," "open in Google Docs."*
- **Upload (Direct the file pick; Assistant never invents a file):**
  1. Ask résumé or cover letter. **Direct** → user chooses the file (`.pdf`, `.docx`, `.txt`).
  2. **Do** → `POST /api/v1/resumes/upload` **or** `POST /api/v1/cover-letters/upload` (multipart). **Confirm** before upload. Done-check: the new document returns.
  3. Explain: it's **added as a new document** and you **choose whether it becomes current** (P75) — a `.docx` opens already formatted and editable (P110/P107); a scanned PDF may have little text (offer to type it in).
  4. **Suggest next:** "Want me to review it / tailor it to a job?"
- **Download / export (confirm — it's a file action):**
  1. Ask the format and explain the trade-offs: **PDF** = send/print/ATS-safe, fixed layout (`GET /api/v1/{resumes|cover-letters}/{id}/export.pdf`); **Word (.docx)** = edit in Word/elsewhere (`…/export.docx`); **Google Docs** = edit online (`POST /…/{id}/open-in-google-docs`, needs Drive connected — route to Playbook 1 if not).
  2. **Confirm**, then **Do** the export; hand the user the file / opened doc. Done-check: file downloaded or Docs opened.

### Playbook 5 — Design your document (advise per style + best practices)
*Triggers: "change the design/style," "make it look better," "which template," "is this ATS-friendly."*
1. **Load the styles.** **Do** → `GET /api/v1/resume-templates` (+ `GET /resume-templates/categories` → `modern, classic, minimal, executive, creative, technical, academic, elegant`). No confirm. **Advise per the styles the endpoint actually returns** — don't assume names. The 8 built-ins and who each suits:
   - **Modern** — single column, blue accent, uppercase ruled headers. *Safe, ATS-friendly default for most roles.*
   - **Classic** — serif, centered header, clean rules. *Traditional/corporate, legal, finance.*
   - **Minimal** — lots of whitespace, sans, no dividers. *Senior/clean; great when content is strong and short.*
   - **Executive** — two-column, navy, bold bar headers. *Senior/leadership; two-column can trip some ATS — see best practices.*
   - **Creative** — two-column, purple, bold. *Design/marketing; avoid for conservative industries.*
   - **Technical** — compact two-column, teal, monospace caps. *Engineering/IT; fits dense skills.*
   - **Academic** — serif, single column, generous spacing. *CVs, research, publications.*
   - **Elegant** — refined serif. *Polished, understated; client-facing roles.*
2. **Recommend for the user's situation.** Use their role/seniority (from the résumé/matches) to suggest 1–2 styles and say **why**, in plain language.
3. **Share best practices (and check the doc against them):**
   - **ATS-safe first:** a **single-column** layout reads most reliably in applicant-tracking systems; if the user wants a two-column style (Executive/Creative/Technical), note they should keep a plain-text/PDF copy for ATS and test it.
   - **One accent color**, used sparingly; high contrast; avoid light-gray body text.
   - **Length:** ~1 page early-career, up to 2 for senior; CV (Academic) can be longer.
   - **Consistent headings**, standard section names (Experience, Skills, Education) so parsers find them.
   - **No photo / graphics-as-text** for US applications; don't put key info in headers/footers (some parsers drop them).
   - **Readable font** (the style's sans/serif/mono) at ~10–11pt body; don't over-compress (density) to force one page.
4. **Preview before applying.** **Do** → `GET /api/v1/resumes/{id}/render?template_id={id}` to show the look. No confirm (preview).
5. **Apply the style — confirm.** **Confirm** ("Apply the Modern style to this résumé? You can switch back anytime."). **Do** → `PUT /api/v1/resumes/{id} { template_id }`. Reversible (switch templates / prior version). Done-check: the preview updates to the new style.
6. **Suggest next:** "Want to download a PDF to send?" → Playbook 4.

### Acceptance
The Assistant can run each of the five playbooks end-to-end against the live endpoints named above, following the P114 model: **Connect** (Gmail OAuth via `connect/{provider}` with the user completing consent; iCloud via `imap-providers`→`connect-imap` with the user entering the app password; verify via `GET /integrations`; offer pull-now), **Auto-apply** (`suggested-criteria`→explain→confirm→`POST /grants`→`run{dry_run:true}` preview→approvals, stating clearly that nothing submits without approval and keeping `require_verified:true`), **Matches** (`GET /jobs/matches`, walked one at a time with score/reasons/gaps/authenticity and per-job Save/Tailor/Open/Add-to-auto-apply, each confirmed), **Upload/Download** (user picks the file → `resumes|cover-letters/upload`; export via `export.pdf`/`export.docx`/`open-in-google-docs` with the format trade-offs explained, each download confirmed), and **Design** (`GET /resume-templates`, per-style advice + best-practices keyed to the live categories, `render?template_id=` preview, `PUT /resumes/{id}{template_id}` on confirm). No credentials/OAuth are ever entered by the Assistant; every side-effectful call is confirmed by click or spoken yes/no after a mic-status check; actions are logged, reversible where possible, and reported with Undo.

## P116 — Route the Assistant through the permissioned automation backend (`/api/v1/assistant`): consent scopes, audit log, autofill/submit guardrails

**Frontend wiring. There is already a purpose-built, audited automation engine — use it as the authorization spine for P114/P115 instead of ad-hoc confirms. No backend change** (verified in `routers/assistant.py` + `engines/assistant/*` 2026-11-08). The P114 per-action confirm still happens; it now sits **on top of** durable, server-enforced consent scopes and a real audit log.

### 1. Consent scopes are the durable authorization layer (all OFF by default)
Surface and use the scope model in an **Assistant permissions** panel (near the P111 Voice & privacy panel):
- **Read** `GET /api/v1/assistant/consent` → `{ granted:[…], available:{ scope: description } }`. The three scopes:
  - **`form_autofill`** — "Auto-fill application forms with my profile (I review before it submits)."
  - **`draft_prep`** — "Auto-prepare application drafts (résumé + cover letter) for strong matches."
  - **`submit_after_review`** — "Submit applications once I've reviewed and approved them."
- **Grant/revoke** with `PUT /api/v1/assistant/consent { scopes:[…] }`. All default **off**; each is a clear toggle with its plain-language description. Revocable anytime.
- **How this relates to P114's confirms:** granting a scope is the **standing permission**; the P114 per-action "want me to do X?" is the **moment-of-action confirm**. An automation call that lacks its scope returns **403** ("grant the '…' permission in Assistant settings first") — when that happens, the Assistant explains and offers to open the permissions toggle, it never tries to route around it.

### 2. The audit log is the P76 activity surface (server-side, real)
- **Read** `GET /api/v1/assistant/actions` → `[{ id, kind:"autofill"|"prepare"|"submit", job_id, status:"proposed"|"completed"|"blocked"|"skipped", detail, created_at }]`. Show this as the Assistant's **activity/approvals history** (P76) — every action it did or proposed, including what it **refused** (blocked). The Assistant references it ("here's what I've done") and never claims an action the log doesn't show.

### 3. New Playbook 6 — Apply to a specific job (per-job autofill, guardrailed)
*Triggers: "apply to this one," "fill out this application," "help me apply."* From a job in Matches (Playbook 3):
1. **Check/obtain the scope.** Needs `form_autofill`. If not granted, explain and **Direct** the user to grant it (§1). 
2. **Preview the fill plan (nothing submits).** **Do** → `POST /api/v1/assistant/autofill/{job_id}` → `FillPlanOut { entries:[{ field, label, value, source, status:"filled"|"blocked"|"needs_input", reason }], filled, blocked, needs_input }`. Walk the user through it: what it will **fill**, what it **needs from them** (`needs_input`), and what it **refused** (`blocked` = credentials/sensitive — explain these are never auto-filled). Read-only; no submit.
3. **Collect the `needs_input` answers.** **Direct** (user types any missing non-credential answers; recurring ones are learned via the screener).
4. **Fill (and optionally submit) — confirm + scope-gated.** **Confirm** clearly. **Do** → `POST /api/v1/assistant/autofill/{job_id}/execute { submit }`:
   - `submit:false` → fills only. 
   - `submit:true` → **also needs the `submit_after_review` scope** *and* an explicit yes. 
   - Result `LiveFillResultOut { status, filled[], unknown_required[], confirmation, detail, live }`. **`live:false` means it was simulated** (no real browser session configured) — **say so honestly**: "I prepared this; to actually submit on the site you'll need to connect a browser session, or do the final submit yourself." A `status` of **`needs_login`/`captcha`** = **escalate to the user** (they sign in / solve it themselves — the Assistant never does). `unknown_required` fields → hand back to the user.
5. **Report + log.** Summarize from the result and point to `GET /assistant/actions`. 

### 4. Fold the bulk flow (Playbook 2) into the same engine
Auto-apply **grants** (`/api/v1/auto-apply/*`, P115 Playbook 2) are the **bulk orchestration**; the `/assistant` endpoints are the **per-job primitives** the grant engine composes. Keep Playbook 2 as the setup/approvals flow, and add:
- **Auto-prepare drafts for strong matches** — needs `draft_prep`. **Confirm**, **Do** → `POST /api/v1/assistant/prepare-drafts { min_fit:70, limit:5 }` → `{ prepared, application_ids }`. Drafts **wait for approval** (P115 Playbook 2 step 6 approvals) — nothing submits.
- Everywhere "submit" could happen, the **double gate** holds: `submit_after_review` scope **+** per-action confirm **+** (for real submission) the user's connected browser session; otherwise it prepares/simulates and routes to approvals.

### 5. Hard guardrails (server-enforced — reflect them, don't fight them)
- **Credentials never touched.** `blocked` (password/SSN/credential) fields are structurally excluded from the plan and never reach the browser. The Assistant presents these as "you'll enter this yourself."
- **CAPTCHA / login walls are escalated, never solved** (matches the global rule). On `captcha`/`needs_login`, the Assistant stops and asks the user to handle that step.
- **Submission is opt-in twice** (scope + confirm) and needs a real connected session to be live; default prod is **simulated** — never imply an application was really sent when `live:false`.
- Scopes are **off by default and revocable**; every action is **audited**; the P114 voice/mic-status confirm model and P111/P112 privacy all still apply.

### Acceptance
The Assistant's automation is built on `/api/v1/assistant`: a **permissions panel** reads/writes consent scopes (`form_autofill`, `draft_prep`, `submit_after_review`) via `GET/PUT /assistant/consent`, all off by default and revocable, and a 403 from any automation call routes the user to grant the scope rather than being worked around. The Assistant shows its **audit log** from `GET /assistant/actions` and never claims an unlogged action. **Per-job apply** previews via `POST /assistant/autofill/{job_id}` (showing filled/needs_input/**blocked-credentials**) and executes via `…/execute { submit }` — submit gated by the `submit_after_review` scope **and** a confirm, with **`live:false` reported honestly as simulated**, and `captcha`/`needs_login` **escalated to the user**. **Bulk** draft prep uses `POST /assistant/prepare-drafts` (needs `draft_prep`) feeding the auto-apply approvals queue; nothing submits without the double gate. Credentials never reach the browser, CAPTCHAs are never solved, and all P114/P111/P112 behavior is preserved.

## P117 — ONE canonical Auto-apply experience (don't build two): rules + per-job autofill, one permissions panel, one approvals/activity view

**Frontend / IA. The two backends (`/api/v1/auto-apply/*` grants and `/api/v1/assistant/*` scopes+autofill) are ONE feature to the user — present them as a single experience, not parallel screens. No backend change.** This resolves the overlap P116 §4 flagged: the grant engine already composes the assistant engine server-side; the UI must mirror that single system.

### The one mental model
There is **one feature: "Auto-apply."** It works at **two scales**, both producing the **same result — prepared applications that wait for your approval**, never auto-sent:
- **A rule (bulk)** = an auto-apply **grant** (`/api/v1/auto-apply/grants/*`, P115 Playbook 2): criteria, caps, optional cadence; a run **prepares** matching applications.
- **One job (per-job)** = **autofill** (`/api/v1/assistant/autofill/{job_id}` → `…/execute`, P116 Playbook 6): fill/prepare a single application from Matches.

The **Assistant (P114) is the conversational driver** of this one feature — it can set up a rule *or* apply to one job. It is **not** a second auto-apply feature. The existing **Auto-apply page is the one visual home**; keep it, drive it from the Assistant, and **do not create a second auto-apply screen or nav entry.**

### One permissions panel (not two)
- The **`/assistant/consent` scopes** (`form_autofill`, `draft_prep`, `submit_after_review`, P116 §1) are the **single place** that governs what Auto-apply may do — for **both** the rule flow and the per-job flow. Show them **once**, in the Assistant/Auto-apply permissions panel.
- A grant's own `require_verified`, `mode`, caps and cadence are **rule settings**, not a second permission system — present them as "how this rule behaves," clearly distinct from the standing scopes. Don't surface two competing "permissions" UIs.

### One approvals + activity view (merge the two sources)
Combine into a **single "Activity & approvals"** surface (the P76 home):
- **Pending approvals** (top): `GET /api/v1/auto-apply/approvals` — applications prepared but not sent, each with **Approve** (`POST /auto-apply/approvals/{application_id}/approve`) / **Reject** (`…/reject`) / **Approve all** (explicit confirm only). Everything a rule-run *or* a per-job prepare created lands here.
- **History** (below): `GET /api/v1/assistant/actions` — the audit log of what the assistant did/proposed/blocked (autofill · prepare · submit). 
- One list, one place the user checks "what's waiting / what happened" — regardless of whether it came from a bulk rule or a single-job apply.

### One submit gate everywhere
Whether bulk or per-job, submission requires the **same triple gate** (P116 §5): the **`submit_after_review`** scope **+** a per-action confirm (click or voice) **+** a real connected browser session for a *live* submit; otherwise it **prepares/simulates** and routes to approvals. Never imply an application was really sent when the result is simulated (`live:false`). Credentials are never entered; CAPTCHA/login walls escalate to the user.

### Entry points (map to the one system — no duplicates)
- **"Set up auto-apply"** → the rule/grant wizard (Playbook 2).
- **"Apply to this job"** (from a match) → per-job autofill (Playbook 6).
- **"What's waiting for me?"** → the one Activity & approvals view.
- All three are the same Auto-apply feature, the same scopes, the same approvals queue.

### Acceptance
The app presents **one** Auto-apply feature with **one** visual home and **no** duplicate auto-apply screen/nav entry. Setting up a **rule** (grant) and applying to a **single job** (autofill) both funnel prepared applications into **one shared Activity & approvals view** that merges `/auto-apply/approvals` (pending, with approve/reject/approve-all) and `/assistant/actions` (history). **One permissions panel** exposes the `/assistant/consent` scopes governing both flows, with a grant's own caps/mode/verified shown separately as rule settings — not a second permissions UI. The **submit gate is identical** everywhere (scope + confirm + connected session, else simulated/prepared), credentials are never entered, and CAPTCHAs/login walls escalate to the user. The Assistant drives this one feature conversationally and is never presented as a separate auto-apply system.

## P118 — BUG: the "insert salutation" warning shows even when a salutation is already present

**Frontend. A false positive — fix the trigger. No backend change** (the backend is already correct — verified live 2026-11-08). The editor keeps showing the **"Insert 'Dear Hiring Manager,'"** recommendation (with "Not now" / "Dismiss this suggestion") on cover letters that **already open with a salutation**.

> **Evidence (live):** for a cover letter whose text is `# Bayete Williams` / `Senior Level IT Leadership Position` / **`Dear Hiring Manager and team`** / …, `POST /api/v1/cover-letters/{id}/review` returns **`strengths: ["…","Opens with a proper salutation."]`** and suggestions **`["Add a concrete result"]`** — **no salutation suggestion**. The backend's multiline check (`^\s*(?:dear|to whom…|hello|hi|greetings)`) correctly finds the salutation even though it's on the **third** line (after the name/title header). So the warning is coming from the **frontend**, not the review.

### The bug
The salutation prompt is being shown **unconditionally** (or from a naive client-side check — most likely testing only the **first line/block**, which here is the name header `# Bayete Williams`, so it wrongly concludes "no greeting"). It is **not** gated on the real review result.

### Fix
1. **Drive the salutation prompt from the backend review only.** Show "Insert a salutation" **iff** `POST /api/v1/cover-letters/{id}/review` returns a suggestion whose title is **"Add an opening salutation"** (category `structure`). If the review doesn't include it — as for any letter that already has a greeting — **don't show the prompt.** Remove any client-side salutation heuristic (don't test `content.startsWith("Dear")` or only the first line; the salutation legitimately sits below a name/title header).
2. **Re-evaluate after edits.** Re-run (or re-read) the review after an edit, an AI change, an insert, or a version switch, so the prompt **clears as soon as a salutation exists** and doesn't persist stale. The same rule applies to the other review-driven recommendations (P104 §4): they reflect the current review, not a one-time or hardcoded list.
3. **Respect dismissal** (unchanged): if the user dismisses it, keep it dismissed for that document/version.

### Acceptance
A cover letter that already opens with a salutation (even when a name/title header precedes it) shows **no** "insert salutation" prompt and instead reflects the review's **"Opens with a proper salutation"** strength. The prompt appears **only** when `POST /cover-letters/{id}/review` actually returns the "Add an opening salutation" suggestion, and it **clears immediately** once a salutation is added (review re-evaluated after edits/version changes). No client-side salutation heuristic remains; dismissal still sticks.

## P119 — Assistant voice: one speaker at a time (no overlapping audio) + a warmer, friendlier voice and tone

**Frontend. Two fixes to the live assistant voice (P105/P106/P111/P112). No backend change** — the neural voices already exist. Right now **multiple voices talk over each other**, and the voice sounds **too serious/robotic**.

### 1. One voice at a time — a single speech channel (bug)
Audio is overlapping because more than one utterance plays at once (e.g. a narration line, an auto-read, and a recommendation all fire; or the browser-TTS fallback plays **at the same time** as the server audio). Gate it to exactly one.
- **A single narration controller owns the only active audio.** Route **every** spoken line through one manager that holds **one** `<audio>` element (server TTS) or **one** `speechSynthesis` utterance. Before starting any new speech, it **stops/cancels the current one** (`audio.pause(); audio.src=''` and/or `speechSynthesis.cancel()`) — barge-in, newest wins — so two lines never overlap.
- **Never run server audio and browser TTS together.** Use the P106 server voice **or** the fallback, never both. If server audio is playing, `speechSynthesis` must be silent, and vice-versa.
- **Queue, don't stack.** If several lines are meant to be read in sequence (e.g. a multi-step walkthrough), play them **one after another** via the controller's `ended` event — a short ordered queue, not concurrent playback. New higher-priority speech (a direct answer, a confirm prompt) **clears the queue** and speaks immediately.
- **Stop on the right events:** navigation, Stop/mute (P111/P112), starting a new request, or closing the assistant all **immediately** stop the current audio and clear the queue — no orphaned playback (ties to the P112 teardown rule).

### 2. Warmer, friendlier voice + tone
- **Pick a warmer default voice.** From `GET /api/v1/narration/voices` choose a **warm, friendly** voice as the new default instead of the current neutral one — e.g. **`coral`** (warm, upbeat) or **`shimmer`** (bright, friendly); audition and set whichever reads warmest. Keep the full picker (P106) so the user can change it; just change the **default** and persist it via narration prefs.
- **Soften the delivery.** A slightly **slower, natural rate** (the P112 slider default around ~0.95–1.0×) reads warmer than a fast clip. If the voice supports a style/tone hint, use a friendly/conversational one.
- **Warm up the words (this matters as much as the voice).** Rewrite the assistant's spoken copy to sound like a friendly helper, not a manual: contractions, encouragement, plain language, a little personality — e.g. *"Nice — your résumé's looking sharp. Want me to tailor it to this job?"* instead of *"Resume processing complete. Proceed to tailoring?"* Keep it concise and never saccharine; warmth, not filler. Captions show the same friendly text (P105).

### Acceptance
Only **one** assistant voice is ever audible at a time — every line routes through a single controller that stops/cancels the current audio before the next, server audio and browser TTS never play together, and sequential lines play as an ordered queue that newer high-priority speech preempts; navigation/Stop/mute/new-request stop audio immediately with no overlap or orphaned playback. The **default voice is a warmer, friendlier one** (e.g. coral/shimmer) at a natural rate, the spoken (and captioned) copy is **conversational and encouraging** rather than formal/robotic, and the user can still pick any voice. All P111/P112 privacy, console and accessibility behavior is preserved.

## P120 — Assistant console: a minimize state (keep the speaking bar, hide the list) + make dragging actually work

**Frontend. Fixes the live assistant console (`hw-glass` / `hw-console-handle` / `hw-console-body`). No backend change.** Two problems, confirmed live 2026-11-08: the assistant is **one monolithic panel** — the task **list** (playbooks, suggestions, ask, tour, panels) and the **speaking** controls are fused, and the only control is **"Hide assistant,"** which closes everything; there's **no way to minimize the list while keeping the speaking dialog open**. And although a grab handle exists (`hw-console-handle`, `cursor: grab`) the panel **won't actually drag**, and it can start **low on the screen**.

### 1. Split into a full view and a minimized "speaking bar" (keep speech open)
Give the console **three states**, not two:
- **Full** — today's panel: handle + the whole list (Guide me, "Get something done" playbooks, Suggested next, Ask, Grand Tour, Voice & privacy, Permissions & activity).
- **Minimized** — collapses the **list** down to a **compact speaking bar**: the drag handle + **live captions** + transport (**Play/Pause/Stop**, **🔊/🔇 mute**, the P112 **speed slider**) + the **press-and-hold mic** + an **Expand** button. The big list is hidden; **speech keeps playing** and captions keep updating. 
- **Closed** — "Hide assistant" fully dismisses and stops speech.
- **Add a distinct Minimize control** (e.g. a "–" / collapse button on the handle, next to Hide) separate from **Hide assistant**. **Minimizing the list must not stop the voice** — the speaking bar persists and audio continues. Expand restores the full list in place. Remember the last state (full/minimized) per P112.

### 2. Make the console actually draggable (it isn't) + sane start position
The handle is styled (`cursor: grab`) but nothing moves. Wire the drag for real:
- **Pointer + touch drag on `hw-console-handle`:** `pointerdown` on the handle → track `pointermove` → update the panel's `left/top` (it's already `position: fixed` with inline `left/top`) → `pointerup` ends; use Pointer Events (or mouse **and** touch) so it works on a touchscreen too, and `setPointerCapture` so a fast drag doesn't drop. `cursor: grabbing` while dragging. The **minimized speaking bar is draggable the same way** via its handle.
- **Clamp on-screen** every drag and on resize (never off the top/edges or below the fold).
- **Sane default + fix "starts low":** open at a **fully-visible** default (e.g. upper-right, a small margin from the top — not low on the screen). If a **remembered position** (P112) is off-screen or in the bottom region, **clamp it back into view** on load instead of restoring it low. "Reset position" returns to that sane default.
- **Keyboard move** (arrow-nudge when the handle is focused) and reduced-motion still apply (P112).

### Acceptance
The assistant has a **Minimize** control distinct from **Hide**: minimizing **collapses the task list to a compact speaking bar** (captions + Play/Pause/Stop + mute + speed + mic + Expand) while **speech keeps playing**, and Expand restores the full list; Hide closes everything and stops speech. The console (full **and** minimized) can be **dragged by its handle with mouse and touch**, stays clamped on-screen, **opens fully visible and never low/off-screen** (remembered positions are clamped into view; Reset returns to a sane default), and is keyboard-movable. All P111/P112/P119 voice, privacy and accessibility behavior is preserved.

## P121 — Make the assistant conversational: greet → offer → listen → act, a real turn-taking loop driven by voice or dialog commands

**Frontend. Ties P114 (task agent) + P115 (playbooks) + P119 (one voice) + P120 (console) into an actual conversation. No backend change** — uses the existing narration, action endpoints, and mic. Today the assistant shows a menu; it should **talk with the user**.

### 1. Open with a greeting and an offer
When the assistant opens (and the user has turned voice on per P111), it **greets warmly and asks how it can help** — e.g. *"Hi, I'm your Harbor Assistant. What would you like to get done today? I can walk you through anything — or I can read you the options."* Then it **waits** (it does not auto-dump the whole menu). Captions show the same text; if voice is off, it's shown, not spoken.

### 2. Offer the options by group, pausing for a response (don't monologue)
If the user says *"what can I do / read my options,"* the assistant reads the groups **one at a time and waits after each**, newest-preempts-current per P119:
- **"Get something done"** — the P115 playbooks (Connect a source, Set up auto-apply, Walk the matches, Apply to a job, Upload/Download, Design, Tailor, Practice).
- **"Suggested next"** — the ranked recommendations for this user.
- **"Ask for something"** — free-form ("write a cover letter," "change the font").
- **"Take the Grand Tour."**
It reads a group, then **pauses: "Want any of those, or shall I go on?"** — it never reads the entire list in one breath. The user can jump in at any point ("that one," "auto-apply," "next group," "skip to asking").

### 3. Listen for commands — verbal AND dialog, same vocabulary
Every turn ends by **waiting for the user**, who can **speak** (when the mic is on — P114 mic-status check) **or click** an on-screen control that mirrors the same choice. Interpret a consistent command set:
- **Flow:** stop / pause · continue / resume / go on · **next** · **back** · **repeat** · skip · "never mind."
- **Choose:** by name or number ("the second one," "auto-apply," "yes," "no").
- **Navigate:** **"go to [Matches / Documents / Auto-apply / Design / Interview]"** — the assistant navigates there (P115) and **keeps the conversation going** in that section.
- **Task controls:** **apply / do it / confirm** · **cancel** · **undo** — mapped to the P114 confirm + P116 actions (nothing side-effectful without an explicit yes; mic-status-checked).
Anything speakable is also a visible button (P114); captions reflect every spoken line.

### 4. Barge-in + turn-taking
- **Barge-in:** a command (stop / next / a new request) **immediately cancels the current speech** (the P119 single-voice controller) and acts — the user never has to wait out a sentence.
- **One turn at a time:** speak → **await the user** → interpret → act (or navigate) → confirm the result → offer the next step. The assistant **always hands the turn back**; it doesn't march ahead on its own, and it doesn't talk over itself (P119).
- **Graceful fallbacks:** if it doesn't understand, it says so briefly and re-offers ("Sorry — did you mean *auto-apply* or *apply to one job*?"), showing the options as buttons. If the mic is off/denied, it asks the user to type or tap instead — never blocks on voice.

### 5. Interactive navigation carries the task
When the user picks a playbook or says "go to [section]," the assistant **takes them there and runs the steps conversationally** (P115/P116): narrate the step, do-or-direct it, **ask for the go-ahead**, wait, then continue — so navigation and the task are one flowing dialog, resumable if interrupted.

### Acceptance
Opening the assistant **greets the user and asks how it can help, then waits** (no menu dump). On request it **reads the action groups one at a time, pausing for a response** after each. The user drives it by **voice or by clicking** the mirrored controls, using a consistent command set — **stop / continue / next / back / repeat / choose / go to [section] / apply / cancel / undo** — and a command **barges in**, cancelling current speech (P119) and acting. Every turn **ends by waiting for the user**; the assistant confirms before any action (P114), navigates to sections and keeps the task going there (P115/P116), re-offers clearly when it misunderstands, and falls back to type/tap when the mic is off. All P111/P112/P119/P120 voice, console, privacy and accessibility behavior is preserved.

## P122 — Assistant: interview-style voice menu, a guided bullet workshop (dual-pane + "use that one"), and NLU intents

**Frontend, plus one new backend endpoint (spec in `docs/ASSISTANT_INTENT.md`).** Extends the conversational assistant (P121) with a familiar voice picker, a hands-on bullet-building walkthrough, and natural-language commands.

### 1. Give the assistant the interview's voice menu
The assistant must expose the **same voice-selection menu the Practice-Interview section uses** (P35/P36/P37 — the labeled neural voices), so the user changes the assistant's voice the familiar way:
- Reuse the interview's voice picker (named voices, audition/preview) inside the assistant's **Voice & privacy** panel, reachable in **one tap** from the console. These are the same server voices (`GET /api/v1/narration/voices`, P106).
- Changing it **applies live** to the assistant's speech and **persists** via narration prefs (`PUT /narration/prefs`, P112). The conversational command "switch to the warm voice / use Coral" also changes it (via the `change_voice` intent, §4).

### 2. A guided "bullet workshop" over the user's data dump
The assistant walks the user through turning a raw paste into résumé bullets (the My Work Highlights pipeline, P2.3/P4/P115), **narrating where the processing is** at each async step:
- **Collect:** invite the user to paste a data dump (notes, a job history, a brag doc) or upload it. 
- **Process + summarize state:** run and narrate each stage — extract → `POST /resumes/{id}/evidence/extract` (`data_points[]`): *"I read your paste and pulled 12 points."* → synthesize → `POST /resumes/{id}/evidence/synthesize` (`groups[] {theme, summary, points}`): *"I grouped them into 3 themes — leadership, cost savings, scale."* → suggest → `POST /resumes/{id}/highlights/suggest` or `/suggest-edits` (`suggestions[] {action:"add"|"reword", before, after, rationale}`): *"Here are 5 suggested bullets."* Keep a running, plain-language summary of **where it is and where it's going**, so the user always knows the state.
- Persist/resume via the highlights runs (`/highlights/latest`, `/highlights/runs`), per P6.

### 3. Dual-pane workshop with window controls
Lay the workshop out as a **two-pane split** with window controls:
- **Bubbles pane** — the candidate bullets as **frameless bubbles** (P8): each suggestion a draggable bubble (`after` text + its `rationale`).
- **Résumé render pane** — the live document (the P110 editable render / preview) where bullets land.
- **Window controls** per the P120 language: focus/expand/collapse/swap and resize each pane, and a one-pane fallback on small screens. Dragging a bubble onto the render pane adds/replaces a bullet (P4/P8).

### 4. Suggest, read, and "use that one"
The assistant actively helps choose bullets, by voice or click:
- **Suggest which to use:** call `POST /resumes/{id}/match-bullets` (`matches[] {candidate, recommend:"add"|"replace", best_score, replace?, alternatives[]}`) and recommend — *"I'd use this one; it replaces a weaker line about the same thing."* Order by `best_score`; explain add vs replace.
- **Read them aloud:** read the bubbles one at a time (P119 single voice), **highlighting the current bubble** as it reads.
- **"Use" / "use that one":** on the spoken command (resolved by the `use_bullet` intent against the **currently read/highlighted** bubble — §4 context) **or** a click, apply that bullet — add, or replace its `recommend.replace` target — via `POST /resumes/{id}/apply-edits` → preview → `POST /resumes/{id}/versions`, with the **P114 confirm** and **Undo = version switch**. "Next / skip / discard" move through them.

### 5. Highlight either pane while guiding
The assistant can **spotlight the bubbles pane or the résumé render pane** (the P100/P105 translucent spotlight) as it talks — *"these are your candidate bullets"* (highlight bubbles) → *"here's where this one lands"* (highlight the render pane) — synced to the narration.

### 6. Natural-language commands via the intent endpoint
Wire the P121 command understanding to **`POST /api/v1/assistant/interpret`** (spec: `docs/ASSISTANT_INTENT.md`): send the transcript + light context (`page`, `resume_id`, `focused_index`, the on-screen `options`), get back `{ intent, slots, confidence, needs_disambiguation }`, and map it to the existing guarded actions. It covers flow (stop/continue/next/back/repeat), choose/`use_bullet`, `navigate`, `start_playbook`, `change_voice`/`set_rate`, and free-form `ask`. **Interpretation only — the frontend still runs the confirmed, guarded action** (P114/P116). Fall back to the local matcher + mirrored buttons if the endpoint is unavailable (P121 §4).

### Acceptance
The assistant's **Voice & privacy** panel offers the **interview-style named voice menu**, one tap away, changing the assistant voice live and persistently (and by the "switch voice" command). A **bullet workshop** walks a pasted data dump through extract → synthesize → suggest, with the assistant **narrating the processing state** throughout, laid out as a **dual-pane (bubbles + résumé render) with window controls**. The assistant **suggests** which bullets to use (from `match-bullets`), **reads them aloud one at a time while highlighting the current bubble**, and on **"use / use that one"** (voice via `use_bullet` or click) **applies** that bullet (add/replace → `apply-edits` → `versions`) with confirm + Undo. It can **spotlight the bubbles pane or the render pane** in sync with speech. Natural-language commands route through **`POST /assistant/interpret`** (per `docs/ASSISTANT_INTENT.md`) and map to the existing guarded actions, with a local fallback. All P111/P112/P119/P120/P121 behavior is preserved.

## P123 — BUG: the microphone has no visible status/permission indicator and fails silently

**Frontend. No backend change.** Verified live 2026-11-08: the mic permission is `denied` yet **nothing in the UI shows it** — there's only a bare `ri-mic-line` icon with no label and no state, no "listening/muted/blocked/enable" cue, and voice input simply doesn't hear with no explanation. Fix the mic so its state is always visible and a denied/blocked permission is surfaced, not swallowed. (The APIs are all present — `getUserMedia`, `SpeechRecognition`, a device, secure context — so the only blocker is permission + missing UI.)

### 1. An always-visible mic status indicator
Put a clear mic control/indicator on the assistant (full console **and** the P120 speaking bar) whose appearance + label reflect the **live** state:
- **Not yet enabled** (permission `prompt`, voice input never turned on) → a mic button labelled **"Tap to enable voice input"**. 
- **Granted + idle/muted (default, P111)** → **"Mic off — hold to talk"**, mic-muted icon; this is the resting state between interactions.
- **Listening** (only while held) → an obvious **active** state: filled/pulsing mic, "Listening…", and (nice-to-have) a live input-level meter so the user sees it's hearing them. 
- **Denied / blocked** → a distinct **blocked** state: **"Microphone blocked — turn it on in your browser's site settings,"** with a short "How?" link. Never show a ready-looking mic when permission is denied.
- **Unavailable** (no device / `getUserMedia`/`SpeechRecognition` unsupported) → **"Voice input isn't available here — type instead,"** and hide the hold-to-talk affordance.
Label it for screen readers (`aria-label` reflecting the state) and announce changes via `aria-live`.

### 2. Make press-and-hold actually request + use the mic, and handle denial
- On the **first** hold-to-talk, call `navigator.mediaDevices.getUserMedia({audio:true})` to **prompt for permission** (this is the only way to ask), then start `SpeechRecognition` while held; on release, **stop the recognizer and stop the tracks** (`stream.getTracks().forEach(t=>t.stop())`, P111 — muted between interactions).
- If `getUserMedia` rejects (**`NotAllowedError`/denied**), switch the indicator to the **blocked** state (§1) and tell the user in-dialog how to re-enable — **don't fail silently**. If it rejects with `NotFoundError` → the **unavailable** state.
- **React to live permission changes:** `navigator.permissions.query({name:'microphone'})` then `permissionStatus.onchange` → update the indicator immediately when the user grants or revokes in browser settings (no reload needed).

### 3. Honest confirms + never block on a dead mic
- The P114 "confirm by voice" path must **check this state first**: only offer spoken yes/no when the mic is **granted and ready**; when it's muted/blocked/unavailable, present the **Yes/No buttons** and say "mic's off — tap the mic to talk, or use the buttons." The assistant never silently waits on a mic that can't hear.
- Typing to the assistant always works regardless of mic state (P113/P121).

### Acceptance
The assistant shows an **always-visible mic indicator** whose label/appearance match the live state — **not-enabled / off-hold-to-talk / listening / blocked / unavailable** — with ARIA. Press-and-hold **requests permission on first use**, listens only while held, and **stops the tracks on release**; a **denied permission shows the "blocked — enable in site settings" state with guidance** instead of failing silently; the indicator **updates on live permission changes**. Voice-confirm is only offered when the mic is ready (else buttons), and the assistant never blocks on an unavailable mic. All P111/P114 privacy (muted by default, no recording) is preserved.

## P124 — Proactively detect the mic permission and tell the user exactly what to do

**Frontend. Extends P123. No backend change.** P123 shows mic state when the user tries; this makes the assistant **detect the browser permission up front and tell the user if action is needed**, with specific steps — so they're never left guessing why it can't hear.

### 1. Detect the permission state proactively (not only on hold-to-talk)
- When the assistant opens (and whenever voice is relevant), **query the permission immediately** — `navigator.permissions.query({ name: "microphone" })` — and reflect `granted` / `denied` / `prompt` in the indicator (P123) **before** the user tries to talk. Also detect **no device** (`enumerateDevices` → no `audioinput`) and **unsupported** (`getUserMedia` / `SpeechRecognition` missing).
- Subscribe to `permissionStatus.onchange` so the state (and the message below) updates **live** when the user allows/blocks it in the browser — no reload.
- Where `permissions.query` isn't supported (older Safari), fall back to inferring from the last `getUserMedia` result and treat unknown as `prompt`.

### 2. Tell the user if action is needed — with the specific action
When the mic **isn't ready and voice would be used**, show a clear, calm **"action needed"** message (not a dead icon), matched to the state:
- **`prompt` (never asked):** *"To talk to me, tap the mic and choose **Allow** when your browser asks."* (The tap triggers the P123 `getUserMedia` prompt.)
- **`denied` / blocked:** *"Your microphone is blocked for this site. To turn it on: click the **padlock / site-info icon** in the address bar → **Site settings** → set **Microphone** to **Allow**, then reload."* Tailor the wording to the detected browser (Chrome/Edge: padlock → Site settings; Safari: **Safari → Settings for This Website → Microphone → Allow**, or the address-bar mic icon; Firefox: padlock → clear the blocked permission). Include a short **"How?"** expander with these steps and a **"Re-check"** button.
- **No device:** *"I don't see a microphone connected. Plug one in, then tap Re-check."*
- **Unsupported browser:** *"This browser can't do voice input — you can type to me instead."*
- **`granted`:** no message — just the ready "hold to talk" state (P123); never nag.

### 3. Re-check and confirm it's resolved
- A **"Re-check"** action re-queries the permission and updates the state immediately; on `onchange → granted`, the action-needed message clears itself and the indicator flips to ready, optionally confirming *"Mic's on — hold to talk."*
- **Detect the browser** (from the user agent) only to tailor the instructions; keep a generic fallback ("open your browser's site settings and allow the microphone") when unsure.
- Keep it **non-nagging**: show the action-needed prompt when the user turns on voice or tries to talk, and when the state is blocked — not repeatedly, and never when granted. Typing always works regardless (P113/P121).

### Acceptance
On opening the assistant, the mic permission is **detected up front** (`granted`/`denied`/`prompt`/no-device/unsupported) and reflected in the indicator, updating **live** on permission change. When action is needed, the assistant shows a **specific, browser-tailored message telling the user what to do** — allow-when-prompted for `prompt`, the exact site-settings steps for `denied`/blocked, connect-a-mic for no device, type-instead for unsupported — with a **Re-check** that clears the message once resolved. It never nags when `granted`, never blocks (buttons/typing remain), and preserves all P111/P114/P123 privacy and behavior.

## P125 — A convenient push-to-talk button: hold to speak, release to run — with spoken confirmation + follow-up

**Frontend. No backend change** — uses the live intent endpoint (`POST /api/v1/assistant/interpret`), the P119 single voice, and the P123/P124 mic states. Give the user one obvious button to **talk to the AI**: press and hold to speak, release and it runs the command and talks back.

### 1. The button
- A **prominent, convenient push-to-talk button** — a clear mic button on the assistant (full console **and** the P120 speaking bar), big tap target, obvious label ("**Hold to talk**"). It is the primary way to speak to the assistant.
- **Press-and-hold = listen:** on `pointerdown`/hold, start the mic (`getUserMedia` on first use → prompt per P123/P124) and `SpeechRecognition`, and show the **Listening** state (pulsing mic + live caption of the words as they're recognized). 
- **Release = stop:** on `pointerup`/leave/blur, **stop recognition and stop the tracks** (muted between interactions, P111). Also support **keyboard**: hold **Space** (or Enter) while the button is focused = hold-to-talk, with the same down/up semantics; `aria-pressed`/`aria-live` for screen readers.
- If the mic is `prompt`/`denied`/no-device/unsupported, the button reflects it (P123) and shows the P124 action-needed guidance instead of silently doing nothing.

### 2. Release → process automatically
On release, take the final transcript and **process it without another tap**:
- Call **`POST /api/v1/assistant/interpret`** with the transcript + context (`page`, `resume_id`/`cover_letter_id`, `focused_index`, on-screen `options`) → `{ intent, slots, confidence, needs_disambiguation }`.
- **Map the intent to the action** (P121/P122): navigation, playbook step, choose/`use_bullet`, voice/rate, read/suggest, or free-form `ask`. 
- If nothing was heard / empty transcript → say *"I didn't catch that — hold the mic and try again,"* no error.

### 3. Spoken confirmation + follow-up (the "talk back")
After processing, the assistant **speaks a confirmation and a follow-up** (one voice, P119; captions always, P105):
- **Restate what it understood + what it's doing:** *"Okay — taking you to your matches."* / *"Adding 'Cut cloud spend 30%' to your résumé."*
- **Safe actions** (navigate, read, suggest, choose) → do them and confirm, then **follow up** with the next step: *"Here are your top matches — want me to walk through them?"*
- **Side-effectful actions** (apply, connect, enable auto-apply, submit, delete) → the spoken line **is the P114 confirm**: state specifics and **ask for the go-ahead** — *"I'll create an auto-apply rule for Software Engineer roles — say 'go' or tap Yes. I won't send anything."* — and **wait** (accept spoken yes/no, mic re-checked per P114, or the buttons). Nothing side-effectful runs on the voice command alone.
- **Low confidence / `needs_disambiguation`** → ask to clarify and show the options as buttons: *"Did you mean auto-apply, or apply to one job?"*
- Barge-in holds: pressing the button again cancels current speech (P119) and starts a new turn.

### Acceptance
There is a **prominent push-to-talk button**: **press-and-hold starts the mic and shows Listening** (with live caption), **release stops listening and stops the tracks**, and the spoken command is **processed automatically** via `POST /assistant/interpret` → the mapped action. The assistant then **speaks a confirmation of what it heard and is doing, plus a follow-up**, with captions; **safe actions run and confirm**, **side-effectful ones speak the P114 ask and wait for an explicit yes** (voice or button), empty/low-confidence input is handled gracefully, and mic-blocked/unavailable states show the P123/P124 guidance. Keyboard hold-to-talk and ARIA included; one voice at a time (P119); muted between interactions (P111).

## P126 — Push-to-talk on the Documents screen (and everywhere) + resume-where-you-left-off and a spoken status briefing

**Frontend. No backend change** — orchestrates existing endpoints (`/dashboard/summary`, `/activity`, `/jobs/matches`, the highlights/auto-apply state, `/view-state`), the P125 push-to-talk, and the P119 voice.

### 1. Push-to-talk on Documents + a persistent global button
- Put the **P125 push-to-talk button on the main Documents screen** so the user can talk to the assistant right there — not only inside the console.
- Better: make it a **persistent, global affordance** (a small always-present mic on the assistant launcher/app chrome) so hold-to-talk works from **any** screen. Same behavior as P125 (hold = listen, release = run → `POST /assistant/interpret` → act → spoken confirmation + follow-up), same P123/P124 mic-state handling. It targets the current page's context (`page`, current `resume_id`/`cover_letter_id`, on-screen `options`).

### 2. Greet with continuity — offer to resume or brief the user
On open/login (per the P121 greeting, non-nagging), the assistant **recognizes where things stand** and offers, e.g.: *"Welcome back. Would you like a **full status report**, to hear **what's changed since last time**, or to **pick up where you left off**?"* — spoken + captioned + as buttons. It waits (P121).

### 3. Resume where the last session left off
Detect an **in-progress task** from persisted state and offer to continue it, reporting **readiness**:
- A bullet workshop in progress → `GET /resumes/{id}/highlights/latest` / `/highlights/runs` ("you had 5 suggested bullets — want to finish choosing?").
- An auto-apply rule prepared/awaiting approval → `GET /auto-apply/approvals` / `GET /auto-apply/grants` ("your rule is ready to create" / "3 applications are waiting for your OK").
- A document mid-edit → the current `selectedVersion` / last `recently-viewed` (`GET /api/v1/recently-viewed`) ("you were editing your cover letter — reopen it?").
- State **readiness** plainly: what's done, what's the next action, and the one click/word to continue. Resume on confirm (P114).

### 4. "Would you like a full status report?"
On request, call **`GET /api/v1/dashboard/summary`** and **speak a brief report** (P119, captioned): strong-match count + the top match, applications by status, **pending approvals/actions**, connected sources, this-week progress (apps/interviews), and how many documents. Keep it short; offer to drill into any part ("want to hear the top matches?").

### 5. "What's changed since last login?"
- Keep a **last-seen timestamp** (persist via `PUT /api/v1/view-state/{view}` for cross-device, mirrored in localStorage). On request, call **`GET /api/v1/activity?since=<lastSeen>`** and summarize the **new** items — new matches, applications now awaiting approval (`requires_action`), new document versions, reconnect prompts — briefly, flagging anything that **needs action**. Then advance the last-seen marker.
- If nothing changed, say so warmly ("nothing new since last time").

### 6. Analyze & refresh matches — highlight the best, briefly
On request (or as a suggested follow-up): optionally **refresh** matches (the Matches "pull now"/ingest the page uses), then `GET /api/v1/jobs/matches?limit=5` and **read the top few briefly with one reason each** — *"Top fit: Senior IT Lead at Acme, 92% — strong on leadership and cloud, close on location."* (from `score` + the strongest `reasons`/`breakdown`). Then offer to **walk them** (P115 Playbook 3), tailor, save, or apply — each confirmed (P114). Keep it brief: headline + why, not a monologue.

### Acceptance
The **push-to-talk button is on the Documents screen** and available as a **persistent global** control from any screen, behaving exactly like P125 against the current page's context. On open, the assistant offers **"full status report / what's changed since last time / resume where you left off."** It can **resume an in-progress task** (bullet workshop, pending auto-apply approvals, a document mid-edit) and **state readiness + the next step**; speak a **brief status report** from `/dashboard/summary`; summarize **what changed since last login** from `/activity?since=<lastSeen>` (persisting the marker, flagging items needing action); and **refresh + analyze matches, naming the best few and why, briefly**, then offer to act — all spoken (one voice, P119), captioned, mirrored as buttons, and confirmed before any side-effect (P114).

## P127 — Live audio indicator: show the mic is actually HEARING you (input-level visualizer)

**Frontend. No backend change.** Hold-to-talk works (P125), but there's no sign the mic is live. Add a **real-time audio visualizer driven by the actual mic signal** — not a timer-based pulse — so the user can see it's hearing them while they speak.

### Do
1. **Drive it from the real input signal.** Reuse the `getUserMedia` stream P125 already opens; feed it to the **Web Audio API**: `const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream); const analyser = ctx.createAnalyser();` `src.connect(analyser)`. On each animation frame read the level (RMS / peak from `getByteTimeDomainData` or `getByteFrequencyData`) and map it to the visualizer. The visual **must move with the user's voice volume** — quiet when silent, bigger/brighter when they speak — so it genuinely reflects audio being heard.
2. **Make it obvious during Listening.** Show it on/around the mic button and in the P120 speaking bar while holding: e.g. **animated rings/halo that scale with level**, a **bar/VU meter**, or a lightweight **waveform**. Pair it with the "Listening…" label and the live caption (P123) so there's both a visual level and the recognized words.
3. **Flag a silent mic.** If the level stays ~0 for a second or two while Listening (muted hardware, wrong input device), hint it: *"I'm not picking up any sound — check your microphone or input device."* (distinct from the P123/P124 permission states — this is "granted but hearing nothing").
4. **Clean teardown.** On release/stop, stop the RAF loop, disconnect the analyser, and `close()` the AudioContext along with stopping the tracks (P111/P125) — no lingering audio graph, no orphaned context.
5. **Accessible + reduced-motion.** The meter is decorative (captions are the real feedback): under `prefers-reduced-motion`, show a **non-animated** level (a few discrete bars or a "Hearing you ✓" state) instead of continuous motion; keep an `aria-live` "Listening" announcement, not a per-frame one.

### Acceptance
While holding to talk, a **live visualizer reacts to the user's actual voice level** (moves when they speak, settles when silent), shown with the Listening state and caption, confirming the mic is hearing audio. A **granted-but-silent** mic is flagged after a moment ("not picking up any sound — check your mic"), distinct from the permission messages. On release the audio graph is torn down cleanly (RAF stopped, AudioContext closed, tracks stopped). Reduced-motion users get a non-animated level indicator; ARIA is preserved. No change to P125 hold-to-talk behavior or P111 privacy.

## P128 — BUG: hold-to-talk never engages the mic (no permission prompt, no meter, no capture) — wire it to getUserMedia on press

**Frontend. No backend change.** Verified live 2026-11-08: the bundle **contains** `getUserMedia`, `createMediaStreamSource`, `createAnalyser`, `SpeechRecognition` — so the code exists — but pressing hold-to-talk **never prompts for mic permission, shows no level meter, and captures nothing**, so the assistant can't hear (e.g. "analyze my matches" is never received). The intent endpoint is fine — `POST /assistant/interpret` correctly maps "analyze my matches" → `start_playbook/walk_matches` — so the failure is **upstream at mic capture**. Make the button actually engage the microphone on press.

### 1. Press MUST call `getUserMedia` directly (this is what prompts + feeds the meter)
- On `pointerdown`/hold of the push-to-talk button, **immediately call `navigator.mediaDevices.getUserMedia({ audio: true })`** — this is the only thing that triggers the browser's permission prompt and yields the MediaStream the P127 meter needs. **Do not gate it** behind a separate "enable voice input" toggle or any prior step; the press itself requests the mic. (If it's currently started only via `SpeechRecognition`, that's the bug — add the explicit `getUserMedia` call.)
- When the promise resolves, **mount the P127 analyser/meter off that exact stream** and show **Listening** — so the user sees it's live. Start `SpeechRecognition` in parallel for the transcript.
- On release, stop recognition, stop the meter, and **stop the stream tracks** (P111/P125/P127 teardown).

### 2. Surface every failure — never silent
- `getUserMedia` rejects **`NotAllowedError`/denied** → the P123/P124 blocked state + site-settings steps. 
- **`NotFoundError`** (no device) → "no microphone found."
- **Permission `prompt` never resolves / user dismisses** → return to idle with "tap and hold, then choose Allow."
- **`SpeechRecognition` missing** (e.g. **Firefox**, which has no `webkitSpeechRecognition`) → still run the `getUserMedia` meter so the user sees the mic is connected, but clearly say **"voice commands need Chrome, Edge, or Safari — or type your request here,"** and keep the text input working. Never leave the user pressing a button that does nothing with no explanation.

### 3. Put the push-to-talk where the user is (P126 §1 gap)
Confirmed live: there is **no** push-to-talk/mic control on the **Documents** screen. Add the P125 push-to-talk button to the Documents screen and as the **persistent global** control, each wired to the §1 `getUserMedia` path (not a decorative mic icon).

### 4. Prove it end-to-end
Holding the button and saying "analyze my matches" should: prompt for the mic on first use → show the live meter reacting to the voice (P127) → capture the transcript → `POST /assistant/interpret` → `walk_matches` → the assistant refreshes/analyzes matches and speaks the brief result (P126 §6). Every stage visible; nothing silent.

### Acceptance
Pressing and holding the push-to-talk button **calls `getUserMedia` on the press** (prompting permission on first use), **mounts the live level meter from that stream** (P127), and **captures speech** via `SpeechRecognition` where supported; the Documents screen (and a global control) have a working push-to-talk, not a dead mic icon. Denied/no-device/unsupported-browser cases each show a **specific message** (never silent), with typing always available. End-to-end, holding and saying "analyze my matches" reaches `/assistant/interpret` and runs the matches analysis. All P111/P123/P124/P125/P127 behavior is preserved.

## P129 — Assistant playbook: guided tailoring of a résumé AND cover letter to a specific job, explaining its reasoning on request

**Frontend. No backend change** — expands the P115 "Tailor" playbook into a full step-by-step walkthrough over existing endpoints, with the assistant explaining *why* when asked and asking permission at each actionable step (P114). Drivable by voice (P125/P128) or click.

*Triggers: "tailor my résumé/cover letter to this job," "aim my application at this role," "make my documents fit this job."*

### Steps
1. **Pick the target job.** From Matches (or a saved job) — the assistant needs a `job_posting_id`. If the user is on a match, use it; otherwise help them choose (P115 Playbook 3). If the job's full description isn't loaded, offer to **pull it** (P31) — **confirm** first.
2. **Pick what to tailor.** Résumé, cover letter, or both. Open them in the Workspace (P109/P110).
3. **Analyze the fit (read-only) and show the reasoning.**
   - **Cover letter:** `POST /api/v1/cover-letters/{id}/tailor { job_posting_id }` → `{ fit_score, addressed[], missing_points[], qualifications, summary, tailoring[] }`. The assistant says the **fit score**, what the letter **already addresses**, what's **missing**, and the concrete **tailoring** changes.
   - **Résumé:** `POST /api/v1/resumes/{id}/suggest-edits { context: <job description>, job_posting_id }` → `suggestions[] { action, section, before, after, rationale }`. Also use the match **`gap_skills` / `reasons` / `breakdown`** (`GET /jobs/matches`) for the "why it fits / where it's short."
4. **Walk the suggestions one at a time** (P119 one voice, captioned): for each, say what it changes and — briefly — **why** (its `rationale`, the requirement it addresses, or the gap it fills). "Next / skip / use that one" move through them (P122/P128).
5. **Explain reasoning on demand.** When the user asks **"why?"** / "why that change?" / "why does this fit?" / "why is it missing?", give the **specific reasoning**, not a generic answer: tie it to the job's `requirements`/`missing_points`, the résumé `gap_skills`, the fit_score, or the suggestion's `rationale`. Keep it brief unless they ask for more. (Intent: the P122 `ask`/`suggest_bullets` path; the assistant has the analysis in context.)
6. **Apply with permission.** Nothing changes without the user's go-ahead (P114):
   - Résumé: apply chosen edits → `POST /resumes/{id}/apply-edits` → preview → `POST /resumes/{id}/versions` (Undo = version switch).
   - Cover letter: `POST /cover-letters/{id}/revise { job_posting_id, … }` (or apply the tailoring) → `POST /cover-letters/{id}/versions`. Enforce the P97 cover-letter rules.
   - Confirm each apply (or "apply all") via the P103 overlay / spoken yes; report what changed.
7. **Do both, then offer next.** Tailor the résumé and the cover letter for the same job, then suggest: **download/send** (Playbook 4), or **apply to this job** (Playbook 6 / auto-apply, P116 scopes) — each with its own permission.

### Permissions where needed
Tailoring analysis is read-only. The assistant asks consent for the **actionable** steps: pulling the job description (P31), applying an edit / saving a version (P114), and — only if the user continues into applying — the automation scopes (P116). It never saves or sends without an explicit yes.

### Acceptance
The assistant **walks the user through tailoring a résumé and a cover letter to a chosen job**, step by step: it loads the job, analyzes fit via `cover-letters/{id}/tailor` and `resumes/{id}/suggest-edits` (read-only), and presents the **fit score, addressed vs missing points, gap skills, and concrete suggestions**. It walks the suggestions one at a time and, **when asked "why," explains the specific reasoning** (requirement addressed / gap filled / rationale / fit score) — briefly. It **applies chosen changes only on confirmation** (résumé `apply-edits`→`versions`; cover letter `revise`→`versions`, P97 rules), tailors **both** documents, and offers download or apply next. All actionable steps ask permission (P114/P116); spoken (one voice, P119), captioned, and voice- or click-driven.

## P130 — Mic connectivity troubleshooting guide + wire the audited intents (check_mic, status, what's-new, resume)

**Frontend. Backend intents already shipped** — `POST /api/v1/assistant/interpret` now returns `check_mic`, `status_report`, `whats_new`, `resume_task` (plus the existing set). This builds the **hardware-connectivity guide** (core to a voice app) and routes the audited intents. See `docs/ASSISTANT_CAPABILITIES.md` for the full map.

### 1. A specific "is my microphone connected?" troubleshooting guide (`check_mic`)
When the user says *"check if my microphone is connected," "is my mic working," "test my microphone," "you can't hear me," "troubleshoot my mic," "check my audio"* (intent `check_mic`) — or taps a **"Test microphone"** item in the assistant's Voice & privacy panel — run a short, plain-language **diagnostic** and report each step:
1. **Browser support:** `getUserMedia` + `SpeechRecognition` present? If not (e.g. voice commands need Chrome/Edge/Safari) → say so; the meter still works where `getUserMedia` exists.
2. **Permission state:** `navigator.permissions.query({name:'microphone'})` → **granted / prompt / denied**. If `denied` → the P124 "blocked — enable in site settings" steps for the user's browser. If `prompt` → "I'll ask for mic access — choose Allow."
3. **Device present:** `enumerateDevices()` → is there an `audioinput`? If none → "no microphone detected — plug one in / check your system settings," and offer **Re-check**.
4. **Live capture test:** request `getUserMedia({audio:true})` and run the **P127 level meter for ~3 seconds**: *"Say something…"* — if the level moves → **"Your mic is connected and I can hear you ✓."** If the level stays flat → "I got mic access but hear no sound — check it's not muted / the right input device is selected (system sound settings)."
5. **Result + next step:** summarize pass/fail per step with the specific fix, a **Re-check** button, and — on success — *"You're set — hold the mic and talk to me."* Tear down the stream after (P111/P127).
Speak it (one voice, P119) **and** show it as a checklist with ✓/✗ and the fix per item; keep it brief.

### 2. Route the audited intents to their real actions
- **`status_report`** → speak the brief status from `GET /dashboard/summary` (P126 §4) — don't just navigate to the dashboard.
- **`whats_new`** → summarize `GET /activity?since=<lastSeen>` and advance the marker (P126 §5).
- **`resume_task`** → resume the in-progress task and state readiness (P126 §3).
- **`check_mic`** → §1 above.

### 3. Close the navigation gap
`/interpret` already returns the correct `navigate` section (e.g. "take me to my résumé" → `navigate/documents`). Ensure the frontend **actually routes every `navigate` intent** to its screen (documents/matches/auto_apply/design/interview/inbox/connect/community/dashboard). If a spoken nav "did nothing," it was mic-capture (P128) or unrouted navigation — fix both: route all `navigate` intents, and confirm capture via §1.

### 4. The guide is reachable without voice too
Because a user with a broken mic can't speak, the mic troubleshooting guide (§1) is **also a button** — "Test microphone" in Voice & privacy and in the P124 action-needed message — so it's usable precisely when voice isn't.

### Acceptance
Saying (or tapping) "check my microphone / is my mic working / test my microphone" runs a **step-by-step connectivity guide** — browser support, permission state, device presence, and a **live capture test using the P127 meter** — reporting pass/fail with the specific fix per step and a Re-check, spoken and shown, and reachable as a **button** when the mic is unusable. The assistant routes **`status_report`→/dashboard/summary**, **`whats_new`→/activity**, **`resume_task`→resume**, and **every `navigate` intent to its screen** (so "take me to my résumé" opens Documents). All P114/P119/P123/P124/P127/P128 behavior is preserved.

## P131 — Full hardware check: walk through connecting AND testing the microphone and the speakers

**Frontend. Backend intents already shipped** — `/assistant/interpret` now returns **`check_audio`** (full both-devices check) alongside **`check_mic`** (mic only). This builds a complete **audio hardware check** — a voice app needs **output (speakers)** working, not just input. Extends the P130 mic guide. Reachable by voice *and* as a **"Hardware check"** button in the assistant's Voice & privacy panel (so it works when audio is broken).

### Entry points
- Voice/intent: `check_audio` ("check my audio / speakers / sound", "hardware check", "I can't hear you", "no sound") → **full check (speakers + mic)**; `check_mic` ("is my mic working", "you can't hear me") → **mic section** (still offer the speaker test). 
- Button: **"Hardware check"** / "Test microphone & speakers".

### A. Speakers / output test (do this first — the user needs to hear the guide)
Walk it step by step, reporting each result:
1. **Output device + volume:** note that sound plays through the browser/system; remind the user the **tab isn't muted**, system volume is up, and the right **output device** is selected. (The web can't read system volume, so guide, don't assert.)
2. **Play a test sound:** play a short, pleasant **test tone** (WebAudio oscillator) or a spoken line — *"If you can hear this, your speakers are working. Did you hear it?"* — with **Yes / No** (and voice yes/no).
3. **If "No":** step-by-step fixes — unmute the tab (speaker icon on the tab), raise system/app volume, switch output device (headphones vs speakers), check Bluetooth is connected, then **Replay**. Keep going until Yes or the user stops.
4. **If "Yes":** ✓ "Speakers are working." Move to the mic.

### B. Microphone / input test (P130)
1. **Browser support** (`getUserMedia`/`SpeechRecognition`). 2. **Permission** (`permissions.query` → granted/prompt/denied; denied → P124 site-settings steps). 3. **Device present** (`enumerateDevices` audioinput). 4. **Live capture test:** `getUserMedia({audio:true})` + the **P127 meter** for ~3s — *"Say something"* — level moves → ✓ "I can hear you"; flat → "mic muted / wrong input — check system sound settings." 5. Tear down the stream (P111/P127).

### C. Result + what to do
Show a compact **checklist** (Speakers ✓/✗, Microphone ✓/✗) with the specific fix beside any ✗ and a **Re-check** per item and overall. On all-clear: *"You're all set — hold the mic and talk to me."* Narrate it (one voice, P119) **and** show it; keep each step short.

### D. Always usable when audio is broken
Everything is **visible text + buttons**, not audio-only — a user with dead speakers reads the guide; a user with a dead mic taps instead of speaking. The guide never depends on the very thing it's testing.

### Acceptance
"Check my audio / hardware check / test my speakers" (or the button) runs a **full hardware check**: a **speakers/output test** (play a test tone/voice → "did you hear it?" → targeted fixes + replay) **then** the **microphone test** (support → permission → device → live meter capture), each reported ✓/✗ with the specific fix and a Re-check. "You can't hear me" runs the mic section; "I can't hear you / no sound" runs the speaker section. The whole guide is **readable and button-driven** (works with broken audio), spoken where possible (P119), and ties into P123/P124/P127/P128. 

> Note: the web can't read or change **system** volume/mute or force an output device — the speaker guide **instructs** the user through those OS-level steps and verifies by playback ("did you hear it?"), which is the correct and only reliable check.

## P132 — Mic layout (green→red metered button + text input under it) and a hardware checklist that covers BROWSER *and* OS blocks (fix "still can't get mic audio")

**Frontend. No backend change** (intents live). Diagnosed live 2026-11-08: the app **does** call `getUserMedia` (the browser shows a mic request), the page is **not** iframed, and there's **no blocking `Permissions-Policy`** — `micAllowedHere` is **true**. So "the AI cannot get mic audio" is a **permission BLOCK**, not missing code: on **Edge/Windows** the usual culprits are the site permission set to **Block** *or* the **Windows microphone privacy** setting blocking Edge — both throw a silent `NotAllowedError` with no prompt. Fix the layout and make the hardware checklist actually resolve these.

### 1. Button + input layout
- **Put the text input directly UNDER the hold-to-talk button** — "Type to the assistant…" sits immediately below the mic button, same width, always available (works when the mic doesn't).
- **Green → red state:** the hold-to-talk button is **green when idle** ("Hold to talk"), and turns **red while engaged** (held/listening). 
- **Superimpose the P127 meter on the button:** render the live audio-level visualizer **on the button itself** (rings/fill/bars over the red button) so the level pulses *in* the button while held — one clear control that shows idle/active/hearing.

### 2. "Check my hardware" must kick off the checklist
Both the **voice** command ("check my hardware", "test my mic and speakers" → `check_audio`; "is my mic working" → `check_mic`) **and** a visible **"Check my hardware"** button launch the P131 checklist. Wire the button — don't leave it inert.

### 3. The checklist must cover BROWSER *and* OS blocks (this is the actual fix)
When capture fails (`NotAllowedError`) or the user runs the check, walk **both** layers, because JS can't tell which one is blocking:
- **Browser site permission (controls WEBSITES):** the tab isn't muted; this **site's** mic permission is Allow. **Edge:** click the **padlock / "View site information"** in the address bar → **Permissions for this site** → set **Microphone = Allow**, then reload. The full per-**site** list (and the Block list) lives at **`edge://settings/content/microphone`** — make sure "Ask before accessing" is on and **remove this site from the Block list** if it's there. (Chrome: `chrome://settings/content/microphone`; Safari: Settings for This Website.)
- **Operating system (controls APPS, not sites — the layer people miss):**
  - **Windows:** **Settings → Privacy & security → Microphone** → turn on **Microphone access**, **Let apps access your microphone**, and **Let desktop apps access your microphone** / ensure **Microsoft Edge** is allowed. Note Windows lists **desktop apps** (Edge as a whole), **not** individual websites — the website list is the browser one above. A Windows OS block throws the same `NotAllowedError` even when the site is "allowed."
  - **macOS:** **System Settings → Privacy & Security → Microphone** → enable your browser.
- **Explain the two layers** so the user doesn't hunt in the wrong place: *Windows controls whether the browser app can use the mic; the browser controls which websites can. Both must allow it.*

## P133 — Make the mic diagnostic REAL, measured, and adaptive (stop false "it's working"; advance progressively)

**Frontend. No backend change.** User feedback: the mic troubleshooting is **repetitive, non-adaptive, and the app reports "working fine" when it isn't**. Rebuild it as a **measured, branching diagnostic** that proves each stage with real values and advances based on results — not a static list. (A standalone reference implementation exists — mirror its logic.)

### 1. MEASURE, don't assume — kill the false positive
The app must **never report the mic as working unless it has measured real audio frames.** Run an `AnalyserNode` on the actual `getUserMedia` stream and read the **peak level over ~4 seconds** while prompting "speak now." Verdicts:
- **Permission granted + peak ≥ ~3%** → ✓ truly working.
- **Permission granted + peak ≈ 0** → ✗ **"granted but silent"** (the common hidden case): the stream opened but no sound arrives → wrong/muted input device or hardware mute. **This must NOT read as success.**
- Inspect the track too: `track.muted` (OS/other app muted it) and `track.readyState`; report these specifically.

### 2. Branch on the actual error — distinct fixes, no repetition
Catch `getUserMedia` rejections and give a **different, specific** resolution for each (don't loop the same generic steps):
- **`NotAllowedError`** → blocked: browser site-permission (padlock / `edge://settings/content/microphone`, remove from Block) **and** OS (Windows Privacy / macOS) — the P132 two-layer steps.
- **`NotReadableError`** → **mic is busy / driver**: another app (Teams/Zoom/Discord/Camera) holds it exclusively, or a driver glitch → close those apps, unplug-replug, restart the browser. *(This is a frequent "it's all allowed but still nothing" cause and was missing.)*
- **`NotFoundError`** → no device; **`OverconstrainedError`** → bad device id; **`SecurityError`** → insecure context.

### 3. Device picker — find a mic that actually works
List all audio inputs (`enumerateDevices`) and let the user **select each and re-test with a live meter** (`getUserMedia({audio:{deviceId:{exact:id}}})`). This resolves "permission is fine but the default input is the wrong/silent device" — which no amount of permission-toggling fixes. On a working one: "set this as your default input in your OS sound settings."

### 4. Adaptive, progressive flow (not a checklist on repeat)
Run as **ordered stages that stop at the first failure and show only the relevant fix**, then a **Re-check** that re-runs from that stage — so the user advances (support → permission → device present → capture → **measured level** → device switch), never re-reading passed steps. Each stage shows its **real value** (permission state, device label, track.muted, measured peak %), not a generic "checking…".

### 5. Honest final verdict
State plainly which layer is at fault and the one next action: *"Permission and hardware are fine and I can hear you — if the app still fails, the app isn't reading this stream"* vs *"The browser has the mic but it's silent — switch input device"* vs *"Blocked — allow it here: …"*. Keep the text input working throughout.

### Acceptance
The mic check **measures real audio** (AnalyserNode peak over ~4s) and **never reports success without detected sound**; "granted but silent" is surfaced as a distinct failure with the device-switch fix. Errors branch to **specific** resolutions (`NotAllowedError`/`NotReadableError`/`NotFoundError`/… each different, including the "mic busy/another app" case). A **device picker re-tests each input with a live meter**. The flow is **progressive** — stops at the first failing stage, shows its real measured value and only its fix, with a Re-check — not a repeating generic list. All P119/P123/P124/P127/P128/P131/P132 behavior is preserved.

## P134 — BUG: the browser gives the app a working mic but the app doesn't use it (proven) — fix capture + transcription

**Frontend. No backend change needed for the capture fix.** **Proven on the live site 2026-11-08:** running `navigator.mediaDevices.getUserMedia({audio:true})` in the console on `hlrtlg.readdy.co` returns a **live, unmuted** track ("Realtek Microphone Array") measuring **59.4% peak audio** over 4s. So permission, device and hardware are all fine on the app's own origin — **the app is handed a working stream and fails to capture/transcribe from it**, while falsely showing "working." Fix the app's capture path.

### 1. Actually USE the getUserMedia stream (drive the meter from it)
On hold-to-talk, call `getUserMedia({audio:true})` and **attach an `AnalyserNode` to the returned stream** to drive the P127 meter. This WILL move (the same call measures 59% in the console). **If the in-app meter doesn't move but the console test does, the app isn't attaching the stream it received** — bind the analyser to the actual `stream` from `getUserMedia`, not a placeholder. Keep the stream referenced so it isn't garbage-collected/stopped immediately.

### 2. Wire SpeechRecognition correctly, with full event + error handling
For the transcript, create `new (window.SpeechRecognition||window.webkitSpeechRecognition)()` and handle **all** events — the likely silent-failure point:
- `recognition.lang='en-US'`, `interimResults=true`; `onstart`, `onresult` (read `results[last][0].transcript`), `onerror`, `onend`.
- **Handle `onerror` visibly** — `not-allowed`, `no-speech`, `aborted`, and especially **`network`** (Edge/Chrome speech is a cloud service and can fail). Don't swallow it: show "I couldn't catch that (speech service error) — try again or type." 
- Start it on press, stop on release, and **use the final transcript** → `POST /assistant/interpret`. Don't assume success with no `onresult`.

### 3. If SpeechRecognition is unreliable, fall back — never dead-end
If recognition errors (e.g. `network`) or yields nothing while the **meter shows real audio**, fall back gracefully: retry once, then tell the user to type (the text input is right there, P132). Optionally record the `getUserMedia` stream with `MediaRecorder` for a future server-STT path — but at minimum, **a captured-but-not-transcribed turn must say so**, not silently "work."

### 4. Stop the false "it's working"
Gate every success signal on **evidence**: show "Listening" only when the meter has real level; show "got it" only on an actual `onresult` transcript (or recorded audio). If `getUserMedia` resolved but no transcript and no level, say what happened. Never report ready/working without measured audio or a transcript (ties to P133).

### 5. Verify after build (same proof)
In the running app, holding the button must: move the meter (real level), produce a transcript (or a clear error), and reach `/assistant/interpret`. Confirm by: the in-app meter moves exactly as the console `getUserMedia`+AnalyserNode test does (it measured 59%).

### Acceptance
Holding the mic in the app **drives the meter from the real `getUserMedia` stream** (moves on speech, as proven in console), **captures a transcript via SpeechRecognition with full `onerror`/`onend` handling**, and sends it to `/assistant/interpret`; a recognition **`network`/other error is surfaced** (retry or type), never silently treated as success. No success state is shown without measured audio or a transcript. The app no longer "thinks it's working" when it captured nothing. All P127/P128/P132/P133 behavior is preserved.

## P135 — Proactive remediation: the assistant proposes the exact fix, summarizes, invokes bullet-making, and is ready to apply on the user's behalf

**Frontend. No backend change** — ties the review, the exact-wording suggestions, the bullet workshop, and one-click apply into one action-ready flow over existing endpoints. The assistant shouldn't just *find* problems — it should **propose the concrete fix, summarize, recommend the next step, and be ready to make the change** on the user's say-so.

*Triggers: opening a document / after upload / "review my document" / "what should I fix / improve."*

### 1. Find → propose the ACTUAL change (wording, not just the problem)
Run the review and the edit suggestions together:
- `POST /api/v1/{resumes|cover-letters}/{id}/review` → score, strengths, issues (title/detail/severity).
- `POST /api/v1/resumes/{id}/suggest-edits { context, job_posting_id? }` → `suggestions[] { action, before, after, rationale }` — the **exact wording change** (before → after). Cover letters: `POST /cover-letters/{id}/tailor`/`review` for the concrete tailoring edits.
For each issue, the assistant presents the **proposed rewrite** ("change *'responsible for sales'* → *'grew regional sales 24% in 12 months'*") with the one-line **why**, not merely "add a metric."

### 2. Summarize briefly (spoken + shown)
Lead with a short, ranked **summary**: *"Your résumé scores 78. I'd make 3 changes: add a measurable result to your lead bullet, tighten a cliché in your summary, and align your title to the job. Want me to make them?"* (P119 one voice, captioned). Keep it to the few that matter.

### 3. Ready to apply — on the user's behalf, one click/word
Every proposed change is **staged and ready to execute**, nothing applied without the go-ahead (P114):
- Per item: **Apply · Apply all · Dismiss** (P103 overlay / spoken "apply" / "apply all" / "skip"). 
- **Apply** writes the change via `POST /resumes/{id}/apply-edits` → preview → `POST /resumes/{id}/versions` (cover letters: `/revise`→`/versions`; or `/ai-edit`), **Undo = version switch**. 
- **"Fix it all for me"** maps to applying all recommended (or the one-pass `POST /resumes/{id}/improve-structured`). The assistant reports what it changed.
- The assistant is **ready and offers to do it** ("I can make all three now — just say go"), but waits for the explicit yes.

### 4. Invoke the bullet-making process for the next steps
Where the fix is "add evidence / a stronger achievement" (a gap, not a reword), **proactively launch the P122 bullet workshop** with a recommendation, carrying the gap as context: *"Your leadership experience is thin for this role — let's turn your recent work into 2 strong bullets. Paste a few notes and I'll draft them."* → `/evidence/extract` → `/synthesize` → `/highlights/suggest` → `/match-bullets`, then read/suggest/"use that one" (P122) → `/apply-edits` → `/versions`. Recommend the **next step** explicitly after any pass ("tailored ✓ — want to download, or set up auto-apply?").

### 5. Keep it benefit-led and safe
Proactive but not pushy: one summary, collapsible, remembered when dismissed (P104). Nothing changes without confirm (P114); everything undoable; spoken lines also captioned; works by voice or click; the review re-runs after edits so recommendations stay current (P118).

### Acceptance
On analyzing a document the assistant **summarizes the issues and, for each, proposes the exact wording change** (before → after with a one-line why, from `suggest-edits`/`review`/`tailor`) — not just the problem. Each proposed change is **staged and ready to apply on the user's behalf** via Apply / Apply all (→ `apply-edits`/`revise`/`improve-structured` → `versions`, undoable), executed only on an explicit yes (P114). Where a gap needs new evidence, it **invokes the bullet-making workshop** (P122) with the gap as context and **recommends the next step**. Benefit-led, non-nagging, re-evaluated after edits, spoken+captioned, voice- or click-driven. All P104/P114/P118/P119/P122/P129 behavior is preserved.

## P136 — A genuinely friendly assistant voice: warm preset + natural rate + a conversational script rewrite

**Frontend. No backend change** — refines the voice (P119) with a warmer default and, more importantly, **rewrites the assistant's wording** so it *sounds* friendly, not formal. Three levers; the wording matters most.

### 1. Warm default voice + natural pace
- Default the assistant to the **warmest server neural voice** — audition **`coral`** (warm, upbeat) and **`shimmer`** (bright, friendly) from `GET /api/v1/narration/voices` and set the friendlier one as the default (keep the full picker, P112/P122). 
- **Rate ~0.95×** (P112 slider default) — a hair slower than 1.0 reads as warm and unhurried, not clipped.

### 2. Rewrite the assistant's lines to a friendly, conversational voice (the real change)
Apply a **"voice & tone"** style to ALL assistant copy (spoken and the matching captions): **contractions, first person, short sentences, warmth, light encouragement, plainlanguage** — like a helpful friend, never a manual or a robot. Be concise; warmth, not filler; never saccharine. Concrete rewrites of the recurring lines:

| Where | Before (formal) | After (friendly) |
|---|---|---|
| Greeting | "What would you like to get done today?" | "Hey — good to see you. What are we working on?" |
| Offer options | "Would you like a status report, to hear what's changed, or to resume?" | "Want a quick catch-up on what's new, or should we pick up where you left off?" |
| Before an action | "Do you want me to create an auto-apply rule?" | "Happy to set that up for you — want me to go ahead? I won't send anything without your okay." |
| Recommendation | "Suggestion: add a measurable result." | "One quick win — let's add a real number here so it pops. Want me to?" |
| Applying | "Change applied. Version saved." | "Done! Saved that as a new version — easy to undo if you change your mind." |
| Error / miss | "I did not understand that." | "Hmm, I didn't quite catch that — mind trying again, or type it to me?" |
| Mic blocked | "Microphone blocked." | "Looks like your mic's switched off for this site — let's get it turned on, it's quick." |
| Finishing | "Task complete." | "Nice — that's sorted. Want to tackle the cover letter next?" |

Keep required specifics (what an action will do, the confirm) — just say them warmly. Captions show the same friendly text (P105).

### 3. Small spoken warmth cues
Natural connectors ("Okay—", "Alright,", "Got it,", "Let's—"), the user's first name occasionally when known, and brief acknowledgements ("good question," "nice work") — sparingly, so it stays genuine, not cloying. No baby-talk, no exclamation overload (one is plenty).

### Acceptance
The assistant defaults to a **warm neural voice** at a **natural ~0.95× rate**, and its **spoken + captioned wording is conversational and warm** across greeting, options, confirmations, recommendations, applying, errors, mic guidance and closings (per the rewrite table) — contractions, first person, short friendly sentences, light encouragement — while still stating what each action does and keeping the P114 confirm. Users can still pick any voice/rate. No change to behavior, confirms, or privacy (P111/P112/P119 preserved).

## P137 — Assistant advice from the document AND a data dump; feature "My Work Highlights" as fully supported

**Frontend. No backend change** — all sources are live (confirmed 2026-11-09). Make explicit that the assistant advises from the résumé/cover letter **and** anything the user dumps, and promote **My Work Highlights** to a first-class, listed feature.

### 1. Advice grounded in three live sources
When asked "what should I improve / review this / help me," the assistant pulls real advice from:
- **The résumé** — `POST /resumes/{id}/review` (score, strengths, issues) + `POST /resumes/{id}/suggest-edits` (exact **before→after** rewrites + rationale).
- **The cover letter** — `POST /cover-letters/{id}/review` + `POST /cover-letters/{id}/tailor` (fit, addressed vs missing, concrete changes).
- **The user's dumped info** — paste notes / a brag doc / raw work → `POST /resumes/{id}/evidence/extract { text }` (clean data points) → `POST /resumes/{id}/evidence/synthesize { text }` (themed concepts) → suggest bullets. *(Verified: a dump produced points like "Reduced Sev1 incidents from ~12/month to 3" and themes like "Incident Reduction & Reliability.")*
It presents concrete advice (the exact change, the reason), not generic tips, and offers to apply it (P135).

### 2. My Work Highlights = a fully-supported, listed feature
- **Surface it as a first-class feature**, not a buried tab: add it to wherever the app lists what it does (the onboarding "things this app does" callout, the features list, the assistant's "what can I do" options). 
- The assistant **invokes it by name**: "my work highlights / turn this into bullets / build bullets from my notes" → the workshop (P122). It invites the dump, narrates extract→synthesize→suggest, recommends bullets with reasoning, and applies chosen ones (`/apply-edits`→`/versions`) with confirm + Undo.
- Make its value one line: *"Paste your notes or accomplishments and I'll turn them into strong, tailored résumé bullets."*

### Acceptance
Asked for advice, the assistant gives **specific, grounded** recommendations from the **résumé** (`review`/`suggest-edits`), the **cover letter** (`review`/`tailor`), **and** a **user's pasted data dump** (`evidence/extract`→`synthesize`→bullets), each with the concrete change + reason and an offer to apply (P135). **My Work Highlights is presented as a fully-supported feature** in the app's feature list and the assistant's capabilities, invoked by its name/phrases, running the full dump→points→themes→bullets workshop. No backend change; all P122/P135 behavior preserved.
- **Device:** a mic is connected/selected (`enumerateDevices`), not muted in hardware, correct input device.
- After each fix, a **Re-check** re-runs `getUserMedia` + the P127 meter; on success → ✓ "I can hear you now."

### 4. Never fail silently on a block
On `NotAllowedError` / `NotFoundError`, **automatically surface this checklist** (not just a dead red button): "I couldn't get the microphone — let's fix it," then §3. Keep the **text input** fully working throughout so the user is never stuck.

### Acceptance
The **text input sits directly under** the hold-to-talk button; the button is **green when idle and red while engaged**, with the **P127 level meter superimposed on it** reacting to the voice. **"Check my hardware"** (button or voice) **launches the checklist**, which walks **both browser site-permission and OS microphone-privacy** steps (Edge + Windows called out explicitly, Chrome/macOS too) plus device selection, with a **Re-check** that confirms capture via the meter. A capture failure (`NotAllowedError`) **auto-opens the checklist** instead of failing silently, and typing always works. All P119/P123/P124/P127/P128/P131 behavior is preserved.

## P138 — A Stop button on the mic, and fix typed commands routing to the Grand Tour

**Frontend. No backend change** — the intent endpoint is correct (verified: "refresh my matches" → `start_playbook/walk_matches` at 0.85). Two fixes.

### 1. Add a Stop button to the mic / assistant
Hold-to-talk releases on pointer-up, but the user needs an explicit **Stop** to end things manually.
- Put a clear **Stop** control on the mic / speaking bar (P120), visible whenever the assistant is **listening or speaking**. One tap:
  - **Stops listening immediately** — stop `SpeechRecognition` and **stop the media tracks** (`stream.getTracks().forEach(t=>t.stop())`, P111), tear down the P127 meter.
  - **Stops any narration** — halt the current `<audio>` / `speechSynthesis` via the P119 single-voice controller (barge-in), clear the queue.
  - **Cancels in-flight processing** — abort a pending `/assistant/interpret` or action so nothing fires after Stop.
- It works for both hold-to-talk and any tap-to-talk, and as a general "stop talking / stop listening" at any time. Keyboard: **Esc** also stops. Accessible label + `aria`.

### 2. BUG: typed commands must route through the intent endpoint — never default to the Grand Tour
Typing *"refresh my matches"* into the command box **started a Grand Tour**. The endpoint returns the right intent (`start_playbook/walk_matches`), so the **frontend is mis-routing** — either not calling `/assistant/interpret` for typed input, or falling back to the Grand Tour when it doesn't recognize the result.
- **Route typed input exactly like voice (P125/P128):** `POST /api/v1/assistant/interpret` with the text + context → dispatch on the returned `intent`/`slots`. "refresh my matches" → `walk_matches` → **refresh and analyze matches** (P126 §6), **not** a tour.
- **Map every intent to its action** (navigate, start_playbook, use_bullet, status_report, whats_new, check_mic/check_audio, change_voice, ask, …) — the same dispatch table the voice path uses. Don't keyword-match locally in a way that lands on "tour."
- **The Grand Tour launches ONLY on an explicit tour request** (e.g. "take the grand tour", "give me the tour"). It must **never** be the fallback for an unrecognized or low-confidence command.
- **Unknown / low-confidence (`ask` with no clear action, or `needs_disambiguation`)** → the assistant **asks for clarification or shows the options as buttons** ("Did you mean refresh your matches, or something else?") — it never silently launches a 5-minute tour the user didn't ask for.
- Confirm before side-effectful actions as usual (P114); a refresh/analyze of matches is safe to just do.

### 3. The assistant shows its OWN speaking waveform + live captions (works even when muted)
Separate from the P127 **input** meter (the mic listening), the assistant needs an **output** visual so the user always knows **the AI is speaking** and can **read along in real time** — critical when audio is muted or the user simply can't hear.
- **A speaking waveform for the AI's voice.** Whenever the assistant speaks, show an **animated audio wave / bars** representing its *output* (visually distinct from the mic meter). When real audio is playing — even with the **system** muted — drive it from the actual output via Web Audio: `createMediaElementSource(audioEl) → AnalyserNode` (or `speechSynthesis` boundaries for the fallback), so the wave moves with the real speech.
- **Live, moving captions.** Reveal/▸highlight the caption **word-by-word (or phrase-by-phrase) in sync with the speech** — use the `<audio>` `timeupdate` (and server word timings if available) or `speechSynthesis` `onboundary`. The current word is emphasized so the eye follows the voice.
- **Muted-safe (the key case).** If the user has turned the assistant's audio **off (app mute, P112 🔇)** so no audio plays, the assistant must **still show it's speaking**: animate the output wave and **reveal the captions on a natural reading cadence** (paced by text length) so a muted user sees the "speaking" state and **reads the words in real time** — speech is never silently invisible. A small **🔇 "muted — reading mode"** hint explains why there's no sound.
- **Still fully interactive while speaking.** The buttons/options, the **Stop** control (§1), and the text input stay live during speech, so the user can read, stop, or respond at any moment (barge-in per P119).
- Accessible: the moving caption is real text (screen-reader friendly, `aria-live` on sentence changes, not per-word), the wave is decorative, and `prefers-reduced-motion` shows a calm static/stepped indicator instead of continuous motion.

### Acceptance
The mic/assistant has a visible **Stop** control (and Esc) that **immediately stops listening (tracks stopped, meter down) and stops any speech** (P119), cancelling in-flight processing. **Typed commands route through `/assistant/interpret`** and dispatch to the correct action — *"refresh my matches"* refreshes/analyzes matches (never the Grand Tour) — the **Grand Tour fires only on an explicit tour request**, and an unrecognized command **asks for clarification** instead of defaulting to a tour. While speaking, the assistant shows **its own output waveform** (distinct from the mic meter) and **captions that move word-by-word in sync** with the speech; when audio is **muted**, it **still animates the wave and reveals the captions at a reading pace** so the user knows it's speaking and reads along, with controls/Stop/typing interactive throughout. Reduced-motion and screen-reader safe. All P111/P119/P125/P126/P127/P128 behavior preserved.

## P139 — Simplify the résumé bullet system: direct in-place editing + one-click Apply (retire drag-and-drop), keep the pipeline intact

**Frontend. No backend change — the bullet engine is verified sound** (2026-11-09): `suggest-edits` returns before→after suggestions; `match-bullets` correctly classifies each candidate as **add** or **replace** with the exact target line + alternatives; `apply-edits`→`versions` applies with Undo. Keep all of that. What changes is the **UX**: now that the document is **directly editable** (P110), the drag-and-drop "bullet bubble board" (P4/P8) is over-complex and fragile — replace it with direct editing + a simple Apply list.

### 1. Manual bullet editing = edit the bullet in the document (P110)
To change a bullet's wording, the user **clicks into it in the editable document and types** — the P110 WYSIWYG surface. No dragging, no separate "bullet board," no bubble-onto-preview gesture for plain edits. Add/remove a bullet with the normal list controls in the editor (Enter for a new bullet, the list toolbar). **Reorder** with simple **Move up / Move down** controls (and optional drag *within the list only* if it's reliable) — not drag-from-a-separate-pane.

### 2. AI suggestions = a simple, one-click Apply list (not drag-to-replace)
Present `match-bullets` / `suggest-edits` results as a **plain list of suggestion cards**, each showing: the **new bullet**, its one-line **why** (`rationale`), and — for a `replace` — the **line it would replace** (the `replace.text`, with its alternatives available behind a "replace a different line" picker). Per card:
- **Apply** → writes it **directly into the editable document** via `POST /resumes/{id}/apply-edits` (a `replace` swaps the matched `before` line; an `add` inserts into the right section) → preview → `POST /resumes/{id}/versions`. **Undo = version switch.**
- **Apply all** · **Dismiss**. That's it — **no dragging a bubble onto the preview**. One click applies to the document the user can already see and edit.
- For an `add` with `recommend:"add"` and no target line, insert at the top of the relevant section (or where the user's caret is); for `replace`, swap the specific line.

### 3. Retire the drag-and-drop bubble board (keep only what helps)
- **Remove** the frameless draggable bullet bubbles and the drag-right→left-to-replace interaction (P8/P4) — superseded by direct editing (§1) + one-click Apply (§2). 
- If any drag remains, it's **only reorder within the document's own bullet list**, and must be reliable (no orphaned/ghost bubbles, no stuck drag state). If it can't be made clean, drop it in favor of Move up/down.

### 4. Integrity rules (don't regress the engine)
- Apply maps to the **correct line/section** (use the `match-bullets` `replace` target for replaces; never blind-insert duplicates). After apply, the bullet appears **once**, in place, and a version is saved.
- No **orphaned** suggestion cards after apply/dismiss; the list reflects the current document (re-fetch suggestions after edits).
- The **My Work Highlights workshop** (P122: dump → extract → synthesize → suggest) still feeds this same Apply list — the dual-pane/bubbles there also collapse to: suggestions on one side, the **editable document** on the other, Apply writing into it.
- Everything undoable (versions); confirm per P114 only where a bulk apply is large.

### Acceptance
Editing a bullet is **direct**: click it in the document and type (P110); add/remove/reorder via the editor's own list controls (Move up/down), **no separate drag-and-drop bubble board**. AI bullet suggestions appear as a **simple list** (new text + why + the line it replaces) with **Apply / Apply all / Dismiss** that write into the editable document via `apply-edits`→`versions` (Undo = version switch) — **one click, no dragging onto a preview**. The suggestion→match→apply engine is unchanged and correct (adds vs replaces land on the right line/section, once, with a saved version); no orphaned cards or stuck drag state. The My Work Highlights workshop feeds the same Apply list. All P110/P114/P122/P135 behavior preserved.

## P140 — Wire the INPUT mic exactly like the (working) OUTPUT wave: live-mic meter + capture

**Frontend. No backend change** (there is **no server transcription endpoint** — the browser's `SpeechRecognition` is the transcriber). The assistant's **output** speaking-wave now works (P138 §3) — which **proves the app's Web Audio visualization works**. The **input** side still doesn't: no live-mic indicator, and the mic stream never reaches recognition. Build the input exactly like the output, from the mic.

### The core instruction
The output wave is built as: `createMediaElementSource(ttsAudioEl) → AnalyserNode → draw bars each frame`. **Do the identical thing for the mic**, just with a different source node:
```
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });   // proven to work on this origin (console captured 59% peak)
const ctx = new AudioContext();
const src = ctx.createMediaStreamSource(stream);        // ← the only difference vs the output wave
const analyser = ctx.createAnalyser(); src.connect(analyser);
// same draw loop as the output wave, reading analyser.getByteTimeDomainData(...)
```
If you can draw the output wave, you can draw this — it's the same visualizer with the mic as the source.

### 1. The live-mic indicator (the missing piece)
- On press/hold-to-talk, call `getUserMedia({audio:true})`, mount the **input meter** off that stream (the code above), and show a clear **Listening** state — a mic wave/level **visually distinct** from the output speaking-wave (e.g. different color/side), so the user can see the mic is live and hearing them.
- Keep the stream referenced for the whole listening session; on release/Stop, stop recognition and **stop the tracks** (P111), tear down the meter.
- Reflect permission state (P123/P124): granted→listening, denied→the blocked guidance, no-device→message.

### 2. Capture the speech (and surface failures — no silent dead-ends)
- Start `SpeechRecognition` on the same gesture; handle `onresult` (use the transcript → `POST /assistant/interpret`, P128/P138), `onstart`, `onend`, and especially **`onerror`**.
- Because there is **no server STT fallback**, if recognition errors (`network`, `no-speech`) or returns nothing **while the input meter shows real audio**, say so clearly: *"I can see the mic working but couldn't turn it into text — try again, or type it."* Never show nothing. The meter proves the mic is live even when recognition fails.

### 3. Don't conflate the two waves
The **input** meter (mic, "listening") and the **output** wave (TTS, "speaking", P138 §3) are separate components with separate sources; both can exist, but only one is active at a time (don't let the output wave stand in for the mic indicator).

### Acceptance
Holding the mic shows a **live input meter that moves with the user's voice** — built from `getUserMedia → createMediaStreamSource → AnalyserNode`, the same visualizer as the working output wave — giving the previously-missing live-mic indicator. The captured transcript reaches `/assistant/interpret`; a recognition failure **while the meter shows audio** is surfaced with a clear message (try again / type), never silent, since there is no server transcription. Tracks stop on release/Stop (P111); input and output waves are visually distinct. All P119/P123/P124/P127/P128/P138 behavior preserved.

## P141 — Declutter Documents: collapse the onboarding cards, make options/recommendations on-demand, and let the assistant present versions, usage & job-fit

**Frontend. No backend change** — all endpoints are live. The Documents page is cluttered again (the "New here — Start with these" cards, always-on recommendations, a static Job selector). Move this to **on-demand, assistant-driven** surfaces; show things when asked, not constantly.

### 1. Collapse the "New here — Start with these" cards
- The onboarding "Six things this app does" / "Start with these" card wall **clutters the page**. **Collapse it** into a single small entry — a "**New here? Start here**" **menu / overflow** (or a one-line dismissible banner) — not a row of big cards. It stays dismissible and remembered (once), as before.
- The **assistant can list these on demand** ("what can I do here?" → it reads the same starter options, P121). The page doesn't need to show them permanently.

### 2. Lists of options → an on-demand overlay (larger surface)
When the user wants a list of options (starter actions, document actions, recommendations, versions), present it as a **summoned overlay with a larger surface** (P101/P103 language) — roomy, readable — where the user can **pick manually OR tell the assistant to choose** ("you decide" / "pick the best one"). It's **opened on request**, not always on the page, and closes cleanly.

### 3. Recommendations are on-demand, not always-on
- Stop **constantly showing** the résumé/cover-letter recommendations. Replace the always-on recommendation card with a **"Review & suggestions"** trigger (button + voice "what should I fix?") that opens the ranked recommendations (P104/P135) in the overlay when asked. 
- Nothing changes about the recommendations themselves (review → exact before→after → Apply); they're just **revealed on request**, keeping the page calm.

### 4. The assistant presents versions, last-updated, and what they were used for
The assistant can, on request ("show my versions", "what have I sent this to"), list a document's versions using **`GET /api/v1/{resumes|cover-letters}/{id}/version-usage`** (`VersionUsageOut`): each **version + label**, **when it was last updated** (`created_at`), its **source** (original / revision / **tailored** / reuse), the **job it was tailored for** (`tailored_for` {title, company}), and **every job it was applied to**. It reads this briefly ("Version 4, updated Nov 8, tailored for Acme — Senior IT Lead, applied to 2 jobs") and can open/activate a chosen version (`…/versions/{v}/activate`). Present it in the §2 overlay for manual picking too.

### 5. Re-evaluate the static "Job selector"; the assistant does job-fit on demand
- A **static Job selector** on the Documents page earns its place only if it's doing real work; if it's just a dropdown that duplicates what the assistant can do, **demote or remove it**.
- Instead, the assistant **recommends job fit on request**: using **`GET /api/v1/jobs/matches`** (per-job fit score + reasons + `gap_skills`) it says **which jobs this résumé is already strong for** (high scores) and **which should be tailored and how** (the gaps, via `/resumes/{id}/suggest-edits` / `/cover-letters/{id}/tailor`), offering to do the tailoring (P129). Only surfaced when the user asks for "more information or actions."

### Acceptance
The Documents page is **decluttered**: the "Start with these" cards are **collapsed into a menu/overflow** (assistant lists them on demand), and the résumé recommendations are **behind an on-demand "Review & suggestions" trigger**, not always shown. Lists of options open as a **larger on-demand overlay** where the user picks manually or tells the assistant to choose. The assistant **presents versions with last-updated + what each was used for** (via `version-usage`: source, tailored-for, applied-to jobs) and can activate one. The **static Job selector is removed or demoted**; the assistant instead **recommends which jobs the résumé fits and which to tailor (and how)** on request, from `/jobs/matches` gaps, offering to tailor (P129). No always-on clutter; everything reachable on demand by click or voice. All P101/P103/P104/P121/P129/P135 behavior preserved.

<!-- P142 intentionally skipped (Readdy flagged a version-number collision) — next prompt is P143. -->

## P143 — Universal voice input: record audio and transcribe server-side (works on any browser, incl. Firefox/mobile)

**Frontend. Backend endpoint is LIVE** — `POST /api/v1/narration/transcribe` (spec: `docs/TRANSCRIBE_ENDPOINT.md`). This makes voice input **device/OS/browser-agnostic** by decoupling capture from transcription: record with the universal `MediaRecorder` and transcribe on the server, instead of relying on the browser's `SpeechRecognition` (which Firefox lacks and mobile mishandles).

### Do
1. **Record with MediaRecorder (universal).** On hold-to-talk, besides the P140 live meter (`getUserMedia → AnalyserNode`), start a `MediaRecorder(stream)` on the **same stream**; collect `dataavailable` chunks into a Blob (`audio/webm` where supported, else the browser's default).
2. **On release, transcribe server-side.** `POST /api/v1/narration/transcribe` as **multipart** with the Blob as `file` (optional `language`). On **200** → use the returned `text` → `POST /assistant/interpret` (exactly the same path as a typed command, P128/P138). Show the text as the caption.
3. **Graceful capability ladder:**
   - If `/transcribe` returns **501** (no server STT) → fall back to the browser `SpeechRecognition` where available; if that's missing too (Firefox) → *"voice typing isn't available here — type instead,"* with the text box right there (P128).
   - Prefer the **server transcription** when available (more reliable + works everywhere); keep browser `SpeechRecognition` only as the offline fallback.
4. **Keep everything else:** the live input meter (P140), the Stop button (P138 §1), green→red button, muted-safe output wave + captions (P138 §3), confirm-before-acting (P114). Audio is sent once and not stored (server contract); stop tracks on release (P111).
5. **No UI difference to the user** — hold, speak, release, it acts. Whether the words came from the server or the browser recognizer is invisible; only the reliability changes.

### Acceptance
Holding the mic records audio via `MediaRecorder` on the same `getUserMedia` stream that drives the live meter; on release the Blob is POSTed to **`/api/v1/narration/transcribe`**, and the returned `text` is dispatched through `/assistant/interpret` like any command. When server STT is unavailable (501), it falls back to browser `SpeechRecognition`, and when that's also absent it cleanly tells the user to type — so **voice input works on every browser that can record audio** (Chrome, Edge, Safari, Firefox, mobile), with typing as the universal floor. Meter, Stop, output wave/captions and confirms all preserved (P111/P114/P127/P138/P140).

## P144 — BUG: cover-letter renderer shows the original uploaded PDF, not the current version

**Frontend. No backend change** — the server is correct (verified live 2026-11-09). For a cover letter **uploaded as a PDF**, the marquee shows the current version (e.g. **v4**), but the **renderer displays the original uploaded PDF** (the `file_url`) instead of the current version's edited content. Marquee and renderer must match (P104 §1).

> **Evidence:** `cl_4f22bcb6219…` has `active_version: 4`, and `doc.content` is the **edited** text ("# Bayete Williams… Position…"); its `active` version (v4) matches. But it also has `file_url` + `content_type: application/pdf` (the original upload, whose text is "I am interested in securing…"). The renderer is showing that **original PDF**, not v4.

### Fix
1. **Render the CURRENT version's content, not the uploaded file.** The main preview renders from the **active/selected version** (`content_html` if present, else `content`) — the exact version the marquee shows as "current." It must **never** default to the original `file_url`/PDF just because the document was uploaded as a PDF. When current = v4, the renderer shows **v4's content**.
2. **The uploaded PDF is the "Original" view only (P94).** `file_url` / the original PDF is shown **only** when the user explicitly switches to **Original** (the faithful, read-only view). The default/"Working copy" preview is the current version's content (P110). Switching Original ↔ Working copy is the only thing that swaps to the PDF.
3. **Keep marquee ↔ renderer in lockstep (P104 §1 / P108).** One `selectedVersion` (the marquee's current, driven by the server `active_version`) feeds the renderer every time — selecting a version, saving, switching documents, reloading. If the marquee says v4, the renderer shows v4; they can never disagree.
4. **Applies to résumés too** (same rule), but the live bug is cover letters uploaded as PDF — fix there first and verify.

### Acceptance
Opening a cover letter (including one **uploaded as a PDF**) renders the **current version's content** (matching the marquee's "current" — e.g. v4's edited text), **not** the original uploaded PDF. The original PDF appears **only** under the explicit **Original** view (P94); the default preview is the current/Working-copy content (P110). Marquee current and the renderer always show the **same version** (P104 §1); selecting another version re-renders to it. Résumés follow the same rule. No backend change.

## P145 — Remove the redundant standalone "upload (optional)" section below the versions marquee

**Frontend only. No backend change.** On **Documents** (`/dashboard/documents`), well below the **Document versions** marquee there is a separate, bulky upload block — on screen it reads **"Link to a job or résumé (optional)"**, then **"PDF, DOCX, Markdown or plain text · Pick a file and your cover letter uploads right away — no second step,"** then an **"Upload cover letter"** dropzone/button (and the équivalent résumé one). It duplicates what the **marquee already does** — uploading a new document and downloading an existing one are handled in the marquee's own controls — so this standalone section is pure clutter.

### Change
1. **Delete the standalone below-marquee upload card** for both cover letters and résumés: the **"Upload cover letter" / "Upload résumé"** dropzones, their helper copy ("PDF, DOCX… no second step"), and the **"Link to a job or résumé (optional)"** field that rode along with them. Remove the whole block, not just the heading.
2. **Upload + download stay in the marquee — the single home for both.** The marquee's own entry point still **adds a new document** (upload a PDF/DOCX/Markdown/plain-text file) and each version's **⋯ actions** still **download** (Original and Working copy). Nothing is lost; there is just one place to do it now. If that upload/download affordance isn't already on the marquee, add it there as part of this change.
3. **Keep generation reachable, compactly.** "Generate a cover letter tailored to a job" is a distinct capability (not upload/download) — do **not** delete it; if it lived inside the removed card, keep it as a single compact **"Generate cover letter"** action near the library, without the heavy upload chrome.
4. **No orphans.** Remove now-unused file-input elements, drag-and-drop handlers, and the optional job/résumé link state tied only to the deleted card. Don't leave a dangling label, divider, or empty container where it was.

### Acceptance
On Documents there is **no separate upload section below the marquee**. Uploading a brand-new résumé or cover letter, and downloading an existing document (Original + Working copy), are both done **from the marquee** and work end-to-end. Generating a tailored cover letter is still available as a compact action. The page is visibly shorter/less cluttered, with no empty gap, leftover heading, or dead dropzone where the removed section was. No backend change.

## P146 — Proactive matches follow-up: the assistant summarizes and offers the next step, it never just lands silently

**Backend ready — a new grounded endpoint ships for this (see below).** Today, when the assistant navigates to **Matches** it drops the user on the page and goes quiet. It must instead **immediately brief and offer to act**, out loud with the moving caption + output wave so a muted user can read it (P138), taking turns and confirming before it does anything (P114/P121).

### Behavior — right after landing on Matches
1. **Auto-summarize (no extra tap).** From `GET /api/v1/jobs/matches` (the page already loads it): say **how many matches** there are, **how many are new since the last run**, **how many are favored/saved**, and the **top few by score** (title · company · score). "New since last run" = diff the current match `job_id`s against the set last seen, persisted in `localStorage` (`hw_last_matches_seen` → {ids, ts}); update it after briefing. Favored = `GET /api/v1/jobs/saved`. Example: *"You've got 45 matches — 6 new since last time, 3 you've saved. Your strongest right now is Staff Frontend Engineer at Vercel at 91."*
2. **Then ask what they want to do** (turn-taking): tailor to one, apply to one, or look closer. Don't auto-run anything — confirm first (P114).
3. **For a specific job, give a real fit brief.** Call **`GET /api/v1/jobs/{job_id}/fit-brief`** (NEW) and speak it: the **verdict + score**, **why it is / isn't a good fit** (`why_fits`, `gaps`), **what to tailor** (`what_to_tailor`), and **which résumé + cover-letter set to use** (`recommended_resume`, `recommended_cover_letter`; if there are multiple, name the options and why the top one wins). Everything in the brief is computed from the real match scoring and the user's own documents — speak it as given, don't invent.
4. **Always offer to perform or walk the next step.** Use the brief's `next_steps[]` (each is a real action): **tailor** the recommended résumé (`POST /resumes/{id}/tailor`) or cover letter (`POST /cover-letters/{id}/tailor`), **apply** (start the Auto-apply / apply walkthrough), or **save** (`POST /jobs/saved`). Offer to either do it (on confirm) or walk them through it.
5. **Friendly + muted-safe.** Warm language, no harsh words (the backend already softens the narrative); wave + real-time caption always on so the words are readable with sound off.
6. **Generalize past matches.** After navigating to **any** section, give a one-line orient + the single most relevant offer (e.g. Documents → "Your résumé's at 50/100 — want me to run Auto-improve?"). Matches is just the richest case.

### Backend (already implemented — no work for you)
- **`GET /api/v1/jobs/{job_id}/fit-brief`** → `{ score, verdict, summary, narrative, why_fits[], gaps[], what_to_tailor[], recommended_resume{id,title,score}, recommended_cover_letter{id,title}, resume_options[], cover_letter_options[], next_steps[{action,label,resume_id?,cover_letter_id?}] }`. `action` ∈ `tailor_resume | tailor_cover_letter | apply | save`. 404 if the job isn't the user's.
- Existing: `GET /api/v1/jobs/matches`, `GET /api/v1/jobs/saved`, `POST /resumes/{id}/tailor`, `POST /cover-letters/{id}/tailor`.

### Acceptance
Arriving at Matches (by voice, by typed command, or by nav), the assistant **speaks a summary within a moment** — count, new-since-last-run, saved, and the top matches — with the caption moving and the wave showing even when muted, then **asks what to do next**. Picking a job produces a spoken **fit brief** (why it fits, what to tailor, which résumé + cover-letter set to use) drawn from `/fit-brief`, and the assistant **offers to tailor / apply / save** and will do it on confirmation or walk the user through it. It never lands on Matches and says nothing. The same orient-and-offer pattern fires after navigating to other sections.

## P147 — Voice capture must get the WHOLE sentence (stop cutting off mid-sentence)

**Frontend. Backend already enabled.** The live-mic wave now shows (good), but transcription **truncated** — "bring me to my matches" came through as only "bring me to," forcing the user to type the rest. Root cause: the capture finalizes on the first short pause (browser `SpeechRecognition` interim/`onend`) instead of on the whole utterance.

### Fix — capture the full press, transcribe server-side (P143)
1. **Primary path: record → server transcribe.** While the mic button is held (or between start and the explicit **Stop**, per P138), record the **entire** utterance with `getUserMedia` + `MediaRecorder`, collecting all chunks. On release, POST the **complete** blob to **`POST /api/v1/narration/transcribe`** (now enabled server-side) and route the returned text to `POST /api/v1/assistant/interpret`. One clip in, one full transcript out — no mid-sentence cutoff.
2. **Fallback path (`SpeechRecognition`, where no server STT): don't finalize on the first pause.** Set `continuous = true` and `interimResults = true`, **concatenate** segments, and only submit when the user releases / presses Stop, or after a **longer** end-of-speech silence (~1.2 s) — never on the first inter-word gap. Keep the latest interim visible so the user sees it building.
3. **Visible states:** live mic meter while capturing → "Transcribing…" on release → text appears, then interpret. The Stop button (P138) ends capture and transcribes what was said so far.
4. **Never lose words.** If the transcript is partial or empty, drop the captured text into the input so the user can **append by typing** (what they had to do) without re-recording.

### Acceptance
Holding the mic and saying a full sentence ("bring me to my matches") transcribes the **whole** sentence and routes it — no truncation at a mid-sentence pause. The live meter shows during capture, "Transcribing…" on release, and Stop ends and transcribes the captured audio. Partial results are recoverable by typing, never silently dropped.

## P148 — The assistant suggests wording it can understand (and recovers a miss with "did you mean…")

**Backend ready — a new endpoint ships for this.** The user shouldn't have to guess how to phrase things. The assistant should **teach the exact wording it understands**, and when it mishears, **offer the closest phrasing it can act on** instead of a dead end. Every suggestion is verified against the same NLU the assistant uses, so a suggested command is a promise it will work.

### Behavior
1. **Offer screen-aware example commands.** On each screen, call **`GET /api/v1/assistant/suggestions?section=<screen>&job_id=<focused job, if any>`** → `{ suggestions: [{ text, intent, slots }] }`. Show a few as tappable chips / "Try saying…" hints near the mic and the command box (e.g. on Matches: *"Refresh my matches", "Which jobs fit?", "Apply to this job"*; on Documents: *"Tailor my résumé", "Make bullets from my work", "Change the design"*). **Tapping a chip runs it exactly** (send its `text` through the normal interpret → action path), so chips double as buttons and as phrasing lessons.
2. **Recover a miss with real wording.** `POST /api/v1/assistant/interpret` now returns a **`suggestions: [{text,intent,slots}]`** array whenever it couldn't pin a command (intent `unknown`/`ask`). When that happens, the assistant says it didn't quite catch that and offers those as **"Did you mean…"** options (spoken + on-screen), each tappable to run. Never answer a miss with only "I didn't understand."
3. **Keep it honest.** Only ever suggest what comes back from these endpoints — never invent a command. If `suggestions` is empty, fall back to "What can I do?" (which lists options).
4. **Quiet when understood.** When interpret returns a confident command, `suggestions` is empty — don't show "did you mean" noise; just do the thing (after the P114 confirm for actions).
5. **Voice + muted-safe (P138).** Speak the offer and show the chips with the moving caption, so a muted user can read and tap them.

### Backend (already implemented — no work for you)
- **`GET /api/v1/assistant/suggestions`** (query: `section`, `job_id`, `limit`) → `SuggestionsOut { suggestions: [{text,intent,slots}] }`, screen-specific first then global. Every item is verified to parse.
- **`POST /api/v1/assistant/interpret`** now also returns `suggestions: [{text,intent,slots}]` — populated only on a miss (unknown/ask).
- New understood command **`save`** ("save this one for later", "bookmark it") → map to `POST /api/v1/jobs/saved` for the focused job.

### Acceptance
Each screen shows a few **"Try saying…"** commands pulled from `/assistant/suggestions`, and **tapping one runs it**. When the assistant doesn't understand an utterance, it offers **"Did you mean…"** options from the interpret response's `suggestions`, each of which **actually works** when chosen — no dead ends. Confident commands show no suggestion noise. Suggestions are only ever real, parseable wording (never invented), and everything is spoken with a readable caption for muted users.

## P149 — BUG: the Matches brief (P146) never fires on a page refresh, and is wrongly gated by auto-read

**Frontend only. Backend is live and verified.** P146 shipped but the assistant **stays silent and doesn't walk the user through Matches**. Two causes to fix:

1. **The brief only runs when the *assistant* navigated — not on a plain page load / refresh / deep link.** The user refreshed `/dashboard/matches` directly, the view mounted fresh, and nothing triggered the briefing. (Confirmed live: `hw_last_matches_seen` was never written, so the brief had not run even once.)
2. **It's gated behind the document "read aloud" toggle (`hw_narration_auto_read`), which is off.** That toggle is for reading document summaries on demand — it must **not** suppress the assistant's own proactive walk-through. (Confirmed live: `hw_narration_enabled="1"` but `hw_narration_auto_read="0"`.)

### Fix
1. **Fire the brief on Matches *entry, however reached*** — assistant-driven nav, a typed/spoken command, a direct URL, or a **manual refresh / cold load**. Run it in the Matches view's mount/`useEffect`, not only inside the assistant's navigate handler. Guard it so it runs **once per visit** (a ref / the `hw_last_matches_seen` check), not on every re-render, and re-fires on a genuine re-entry.
2. **Decouple it from `hw_narration_auto_read`.** The proactive walk-through is the assistant's behavior, not document read-aloud. Gate **audio** only on *speak enabled* (`hw_narration_enabled`) and not-muted; **never** on `auto_read`. The **visible** walk-through must **always** render regardless of any audio setting.
3. **Always show it, even silent (P138).** On entry, **surface the assistant** (if the console is collapsed/minimized, pop it open or show a compact brief banner) and render the summary **on screen** — count, new-since-last-run, saved, top matches — with the **moving caption + output wave**. If speak is enabled and unmuted it also speaks; if muted or speech is unavailable it still **visibly walks the user through** and never just sits silent. "Silent" is acceptable; "nothing happens" is the bug.
4. **Then offer the next step** (P146 §2–4): ask what to do, and show the tappable next-step chips (tailor / apply / save / look closer) from the fit brief. Wire these to `GET /api/v1/jobs/{job_id}/fit-brief` as before.
5. **Give a manual re-trigger.** A small **"Brief me" / replay** control (and the spoken command *"walk me through my matches"*, which the NLU already understands) re-runs the walk-through on demand, in case the user missed it or has audio off.
6. **Same pattern on other screens** (P146 §6): entry — by any route including refresh — triggers the one-line orient + top offer, on screen and (if enabled) spoken.

### Acceptance
**Refreshing `/dashboard/matches` (not just navigating to it) makes the assistant walk the user through the screen**: the assistant surfaces, shows the count / new / saved / top-matches summary with a moving caption and wave, and offers the next step — **even with `hw_narration_auto_read` off** (it speaks too when `hw_narration_enabled` is on and unmuted). It is never silent-and-blank on arrival. A "Brief me" control and *"walk me through my matches"* re-run it. `hw_last_matches_seen` is written after the first brief. No backend change.

## P150 — Make the assistant part of the setup wizard: a new-user greeting (product overview + why it helps) that turns the voice on and offers the Grand Tour

**Frontend only. All endpoints are LIVE; no backend change.** Two linked problems:

1. **The assistant still isn't talking by default on Matches** (and everywhere). Root cause: P111 only lets the assistant *speak* once a **one-time voice consent** is granted, and that **"Yes" click is also the browser's required audio-unlock gesture**. If a user never passed that step, `hw_voice_consent` is unset, narration stays off, and a cold page load / refresh **cannot autoplay** TTS even after P149 fires the visible walk. So the walk-through shows but **says nothing**.
2. **There's no real introduction.** New users land with no idea what Project Harbor is, what it does, or that there's a talking guide at all.

Fix both by making the **assistant its own first-class step in the P83 setup wizard**, opening with a **greeting** that overviews the product and **turns the voice on with the same click**, then offering the **Grand Tour**.

### 1. Add an "assistant / talking guide" step to the P83 wizard — make it step 2 (right after Welcome)
A dedicated wizard step, shown to every new user, before the résumé/email steps:
- **Greeting + product overview (spoken-capable, but readable first).** A warm card from the assistant: who it is and, in **3–4 plain lines**, **what Project Harbor does and why it's useful** — e.g. *"I'm your Harbor guide. Project Harbor finds jobs that match you, tailors your résumé and cover letter to each one, and can even help you apply — I'll walk you through all of it. Want me to talk you through things out loud?"* Keep it concrete and benefit-led (matches → tailor → apply), not a feature dump; one short line each for **Matches**, **Tailoring**, **Apply help**, **Your guide (me)**.
- **The consent control IS the audio unlock (critical).** Primary button **"Yes, talk me through it"** / secondary **"No, stay silent"**. The **Yes click must, in the same user gesture**: (a) set `hw_voice_consent="granted"`, `hw_narration_enabled=true` (persist via `PUT /api/v1/narration/prefs`), (b) **unlock browser audio** — play a priming `POST /api/v1/narration/speak` line **synchronously in that click handler** (or resume the shared `AudioContext`), and (c) **speak a one-line confirmation right then** (*"Great — you'll hear me as we go."*) so the user hears it working. Set a session flag `hw_audio_unlocked="1"` once this succeeds. This is what makes the voice actually play on Matches afterward.
- **"No, stay silent"** → `hw_voice_consent="declined"`, voice off, never nag again; the visible walk-throughs (P149) still work silently, and the sleek 🔊 toggle (P111 §2) can turn it on later (that click re-runs the unlock).
- **Mic is a separate, skippable sub-step** (keep P111 §3 verbatim): offer "Let me listen while you hold the mic button" as its own opt-in; muted by default; fully skippable; denying it never blocks anything.
- **Screen-reader users:** default voice **off** even on consent (P105/P111), offer opt-in.
- This step is **skippable and resumable** like the rest of P83, and the whole assistant setup is **re-runnable** from the assistant's "Voice & privacy" panel and the Connect hub.

### 2. After the wizard (or on first dashboard load for an existing user who never consented): greet and offer the Grand Tour
- Once setup is done — or when a returning user who has **never** seen the intro lands on the dashboard (`hw_intro_seen` not set) — the assistant **greets by name if known**, gives the **same one-paragraph overview**, and **offers the Grand Tour**: *"Want the 60-second tour, or should I take you to your matches?"* Buttons/chips: **Take the tour** · **Go to my matches** · **I'll explore** (all tappable **and** speakable).
- **Take the tour** runs the existing **Grand Tour playbook** (P100 coach-marks / P115 "Walk the matches" family / P121 turn-taking): a short guided pass over Matches → Documents → Apply, each stop a one-line "what this is / what you can do here" with the caption + wave, confirm-before-moving, and an always-available **Skip tour**. Don't rebuild the tour — **invoke the existing playbook**.
- Set `hw_intro_seen="1"` after it's shown (greet once, not every load); a **"Show me around"** control + the spoken command *"give me the tour"* (NLU already understands the tour/playbook intents) re-run it on demand.
- If voice consent was granted, **all of this is spoken** (audio is already unlocked from step 1); if declined/skipped, it's the same flow **on screen, silently**.

### 3. Result: talking by default on Matches
Because consent + **audio unlock** now happen inside the wizard's first gesture and persist (`hw_voice_consent`, `hw_audio_unlocked`), when the user later reaches **Matches** — by nav **or cold refresh** — the P149 brief both **shows and speaks** by default. Belt-and-suspenders for a brand-new browser session where autoplay re-locks: on the **first user gesture of any session** (any click/keypress), silently re-prime the audio (resume `AudioContext` / fire a 0-length speak) so the next proactive narration plays; until then, keep P149's visible walk so it's **never silent-and-blank**. Never show a dead mic/▶ with no speech when consent is granted.

### Endpoints (all LIVE — no backend work)
- `PUT /api/v1/narration/prefs`, `POST /api/v1/narration/speak` (consent, unlock, speaking) — P106/P111.
- Wizard host + progress/resume = P83; greeting/turn-taking = P121; Grand Tour = P100 / P115 / P121 playbooks; proactive Matches brief = P146/P149 (`GET /api/v1/jobs/matches`, `GET /api/v1/jobs/{job_id}/fit-brief`).
- Local flags: `hw_voice_consent`, `hw_audio_unlocked`, `hw_intro_seen` (+ existing `hw_narration_enabled`, `hw_voice_muted`).

### Acceptance
A new user's setup wizard includes an **assistant step as step 2** that **greets them, overviews what Project Harbor does and why it helps**, and offers **"Yes, talk me through it."** Clicking Yes **turns the voice on and unlocks audio in that one gesture** — the user **hears a confirmation immediately** — and from then on the assistant **speaks by default**, including the **Matches brief on a plain refresh** (P149 now both shows **and** speaks). After setup (or on a never-introduced user's first dashboard load) the assistant **greets and offers the Grand Tour**, which runs the **existing** tour playbook (not a rebuild) and can be re-run via "Show me around" / *"give me the tour."* Declining leaves it silent with no nag, the visible walk-throughs still work, and the 🔊 toggle can enable voice later. The intro shows **once** (`hw_intro_seen`). No backend change.

## P151 — BUG: the quick-action buttons do nothing — wire every chip to execute immediately (no second permission), and declutter the busy assistant

**Frontend. Backend ready (one new understood command shipped — see below).** The assistant's **quick-action buttons / chips don't work**: pressing **"Refresh my matches"** or **"Rate my matches"** does **nothing**. Two bugs, then a declutter.

### 1. Chips must actually run their command (the main bug)
- Each quick-action chip must **send its command text through the normal pipeline** — `POST /api/v1/assistant/interpret` → the matching action handler — **on click**, exactly as if the user had typed/spoken it (P148 §1 promised this; it isn't wired). Right now the chips are decorative. Wire the **onClick** of every chip to the same `runCommand(text)` the typed command box uses. A chip that does nothing on tap is the bug.
- **"Refresh my matches"** → `interpret` returns `navigate {section:"matches", refresh:true}` → go to Matches and reload them. **"Rate my matches"** → now returns `start_playbook {playbook:"walk_matches"}` → run the read-only scored brief (count + top matches by score + why they fit, reusing P146/P149). Both must visibly do their thing.

### 2. Read-only actions execute automatically — NO secondary permission
- The P114 "confirm before acting" gate is **only** for side-effectful / outbound actions (apply, submit an application, send, auto-apply a job, save/bookmark that writes). **Read-only and navigation commands run immediately with no confirm dialog**: `navigate`, `refresh`, `start_playbook` for the read-only briefs (`walk_matches`), `status_report`, `whats_new`, `read_options`, `check_mic`, `check_audio`, `change_voice`, `set_rate`, and the Matches/fit briefs. Pressing "Refresh my matches" or "Rate my matches" must **just happen** — no "are you sure?", no extra tap.
- Keep the confirm **only** where something leaves the app or changes external state (apply/submit/send). Everything informational is instant.
- Give **instant feedback** on tap: the chip shows a brief active/spinner state and the assistant says/【caption】what it's doing ("Refreshing your matches…", "Scoring your matches…") so it never feels dead.

### 3. Only ever show chips that are real, and keep them honest
- Populate the quick actions **from `GET /api/v1/assistant/suggestions?section=<screen>&job_id=<id>`** — every item there is verified to parse and act (P148 §3). **Don't hand-author chips** that aren't backed by a real command (that's how "Rate my matches" became a dead button — it wasn't an understood command; it now is, and is returned by `/suggestions` on Matches). If a label isn't in the suggestions response, don't render it.

### 4. Declutter — the assistant page is very busy
Reduce it to a calm, focused surface:
- **One primary input row**: the mic button + the command box, with **3–5** quick-action chips (the top screen-relevant ones from `/suggestions`), and a **"More…"** that reveals the rest on demand. Don't show every chip at once.
- **Collapse secondary panels by default** (voice/rate controls, "Voice & privacy", the transport/skip controls, the console list): tuck them behind the console's **menu / a single ⚙ or "Options"** (keep P112's minimize). The default view is: greeting/caption + wave, the input row, a few chips.
- **One caption area, one wave** — no duplicated status text. **One speaker at a time** (P119) and one visible "what I'm doing now" line.
- Respect P141's principle (on-demand, not wall-of-options) and the design system (P9 one accent, P60 dark mode). Nothing is removed — it's **progressive disclosure**, so power controls are one tap away but not crowding the default screen.

### Backend (already implemented — no work for you)
- New understood command: **"rate / score / rank / grade my matches (or jobs)"** → `start_playbook {playbook:"walk_matches"}` (the read-only scored brief). It's returned as a **"Rate my matches"** chip from `GET /api/v1/assistant/suggestions?section=matches`. "rate" **without a number** is not read as a voice-speed change.
- Everything else is existing: `POST /api/v1/assistant/interpret`, `GET /api/v1/assistant/suggestions`, `GET /api/v1/jobs/matches`, `GET /api/v1/jobs/{job_id}/fit-brief`.

### Acceptance
Pressing **any** quick-action chip **runs that command immediately**: "Refresh my matches" reloads Matches, "Rate my matches" runs the scored brief — **with no secondary confirmation** and visible feedback. Read-only/navigation commands never show a confirm dialog; only outbound actions (apply/submit/send) still confirm (P114). Chips are sourced from `/assistant/suggestions`, so every one is a command that actually works (no dead labels). The assistant surface is **decluttered**: one input row + a few chips + "More…", with voice/privacy/transport controls collapsed behind a menu, one caption and one wave. No invented/non-functional controls remain.

## P152 — Roll the résumé critique into the assistant's offerings: concrete, choosable edits the user can apply with one tap

**Backend ready — a new "critique mode" ships for this (no paste needed).** Today the assistant can *review* a résumé (a prose critique) but doesn't turn that into **things the user can act on**. It should present the critique as **specific, choosable edit suggestions** — a reworded line, an inserted metric, the target company name folded in for tailoring — each with **Apply**, so the user picks the ones they want and the résumé updates.

### Where this shows up
- On **Documents / the résumé Workspace**: an **"Assistant suggestions"** offering — the assistant says (and prints) *"I spotted a few ways to strengthen this résumé — want to see them?"* and lists the edits.
- On **Matches → a focused job** (tailoring): the same offering, **tailored to that job** — *"Here's how I'd tailor your résumé to [Job] at [Company]."* This is part of the P146/P149 fit-brief follow-up ("what to tailor" → now actual edits).

### Get the suggestions (critique mode — no paste)
- Call **`POST /api/v1/resumes/{resume_id}/suggest-edits`** with **`{ "context": "", "job_posting_id": "<focused job, if any>" }`**. An **empty `context`** triggers critique mode: the backend reviews the résumé itself (and tailors to the job when `job_posting_id` is given) and returns apply-able edits. (Non-empty `context` is still the old paste-mode.)
- Response: **`SuggestEditsResponse { suggestions: [{ action, section, before, after, rationale }] }`** — `action` ∈ `add | remove | reword`; `before` = the exact existing line (empty for add); `after` = the new text; `rationale` = which critique point it fixes.
- **Honesty is built in:** the backend never fabricates a number — when a line should be quantified but the résumé has none, `after` contains a **bracketed placeholder** (e.g. `[add %]`, `[# of people]`) for the user to fill. Render placeholders as an editable field, not as final text. For tailoring it inserts the **real** target company name / job keywords the résumé supports — never invented experience.

### Present them as choosable offerings
1. **Each suggestion is a card** (spoken + printed, P138): a short label ("Reword your summary", "Add a metric to the billing bullet", "Name the target company"), the **before → after** diff, and the one-line rationale. The assistant can **read them aloud**, but the list is always **printed so the user can choose** (don't force voice).
2. **One-tap apply, per item or batched.** Each card has **Apply** (and Dismiss). Applying sends the chosen subset to **`POST /api/v1/resumes/{resume_id}/apply-edits { suggestions: [...] }`** → a new version; the shared preview updates immediately (P4b "Updated — N change(s)"). **Apply all** applies the lot. Undo = version switch.
3. **Edit before applying.** Because some `after` values carry placeholders, let the user tweak the text inline before Apply (send the edited `after`).
4. **It's an offer, not an auto-run.** Generating/showing the suggestions is read-only (no confirm). **Applying** changes the document — that's the one step the user explicitly taps (per item or Apply-all); don't auto-apply.
5. **Reuse, don't rebuild.** This is the same suggestion/accept surface as My Work Highlights / the Bullets review (P2.3/P4) — fold these critique suggestions into that same accept-before-save list rather than inventing a new one.

### Endpoints (all LIVE)
- `POST /api/v1/resumes/{id}/suggest-edits` — **empty `context` = critique mode** (new), optional `job_posting_id` to tailor; returns `{action,before,after,rationale}[]`.
- `POST /api/v1/resumes/{id}/apply-edits` — apply the chosen subset → new version.
- Context for the offer: `GET /api/v1/jobs/{job_id}/fit-brief` (the spoken "why/what to tailor") and `GET /api/v1/resumes/{id}/review` (the score/grade) remain available.

### Acceptance
On Documents (and on a focused job for tailoring), the assistant **offers concrete, choosable edits** drawn from its own critique — reworded lines, added metrics (as fillable placeholders, never fabricated), and the target company folded in — each **printed** with a before→after and rationale, **readable aloud**, and **Apply**-able per item or all at once via `/apply-edits`, updating the preview immediately. Generating the list asks no permission; only **Apply** changes the document. Suggestions come from `suggest-edits` critique mode (empty `context`), so they're grounded in the résumé (and job), never invented.

## P153 — Per-page greeting that ASKS (don't monologue), the voice meter lives in the assistant overlay, and the assistant knows the app and navigates it fast

**Frontend. All endpoints LIVE; no backend change.** Three connected fixes to how the assistant shows up on every screen. This **refines P146/P149**: the assistant must still never be dead-silent, but it should **greet and ask**, not auto-read a long summary at the user.

### 1. Greet per page — "Hello, you're on [Section]. What would you like to do here?"
- On entering **any** section, the assistant gives a short **greeting that names the section**: *"Hello — you're on your **Dashboard**. What would you like me to help with here?"* / *"Hi — this is **Matches**. Want me to rate them, refresh, or tailor to one?"* Map the route to a friendly section name (Dashboard, Matches, Documents, Auto-apply, Design, Interview, Inbox, Connect, Community).
- **Greet once per session, and again only after a long pause.** Say the full "Hello" greeting on the **first** page of the session (or right after the P150 intro) and after the user has been **idle a while** (≳20–30 min) or returns from away; on ordinary navigation between pages **within** an active session, use a **brief orient** ("You're on Documents — want your suggestions?") not the full hello. Persist last-greeted time in `localStorage` (`hw_last_greet_ts`) and the current session id.
- **Ask — don't monologue.** Do **not** auto-read the full summary/brief on arrival. **Greet → name the section → ask what they want**, and **show the choosable suggestions** (the P151 chips + P152 offering) **printed** so the user can pick. Speak the greeting + the offer (if voice is on), but read the full summary **only when the user asks** ("Rate my matches", "Brief me") or if they've explicitly opted into auto-brief. ("New since last run" counts etc. become an *offer* — "Want the rundown?" — not an unprompted monologue.)
- **Read the suggestions, especially when printed.** When suggestions/offerings are on screen, the assistant's spoken line should point at them ("I've got three suggestions here — tap one or say the number"), so voice and the printed choices match (P138 muted-safe).

### 2. The voice meter/wave lives IN the assistant overlay (make the source obvious)
- The **output wave** (and the **mic input meter**) must render **inside the assistant console/overlay**, anchored to it — not floating detached elsewhere on the page. The user should always see **where the speaking is coming from** and how to control it.
- Co-locate the controls with the meter: the 🔊/🔇 mute, Stop, and the caption all sit in the same overlay as the wave, so "that voice" has one obvious home with one-tap control (ties P111 §2 / P112 / P120). When the assistant speaks, the wave animates **in the overlay**; the overlay is the single source of voice + the place to stop/mute it.
- Keep it decluttered (P151 §4): the meter + caption + a few chips are the default; deeper controls stay behind the overlay's menu.

### 3. The assistant knows the app and navigates it fast
- The assistant understands the **core sections and what each is for**, and can **navigate instantly** on request via the existing NLU (`POST /api/v1/assistant/interpret` → `navigate {section}`; sections already recognized: matches, documents, auto_apply, design, interview, inbox, connect, community, dashboard). "Take me to my matches", "open documents", "go to auto-apply" must jump straight there (read-only, no confirm — P151 §2).
- On **"what can I do here?"** / **"what is this page?"**, the assistant gives a **one-line description of the current section and its core offering** plus the top 2–3 actions (from `GET /api/v1/assistant/suggestions?section=<screen>`), so it can orient a user anywhere in the app.
- Navigation during a conversation is **fluid**: the user can say "actually, take me to Design" mid-flow and the assistant goes, keeping the greeting rules above (brief orient on arrival, not a fresh full hello).

### Endpoints (all LIVE — no backend change)
- `POST /api/v1/assistant/interpret` (navigate + commands), `GET /api/v1/assistant/suggestions?section=&job_id=` (per-page offerings), `GET /api/v1/jobs/matches`, `GET /api/v1/jobs/{job_id}/fit-brief`, `POST /api/v1/narration/speak`.
- Local flags: `hw_last_greet_ts`, session id (+ existing narration prefs).

### Acceptance
Entering a section, the assistant **greets and names it** ("Hello — you're on Dashboard. What would you like to do?") and **asks**, showing the printed, choosable suggestions rather than **monologuing the summary** — the full brief is read **only on request**. The full "Hello" fires **once per session and after a long idle**; plain in-session navigation gives a **brief orient**, not a repeat hello. The **voice wave and mic meter render inside the assistant overlay**, co-located with mute/stop/caption, so the speech source and its controls are obvious. The assistant **navigates the app instantly** by voice/typed command (no confirm), and can describe **any page's purpose and top actions** on request. Never dead-silent on arrival, never an unprompted monologue.

## P154 — BUG: a SECOND AI narrator (the embedded Documents "AI summary" reader) is auto-talking and silencing the assistant — fold all AI narration into the assistant

**Frontend only. No backend change.** There are **two** AI voices in the app and they're fighting:
1. the **assistant overlay** (the one we've been building — P105/P106/P111/P119/P146–P153), and
2. an **embedded "AI summary" reader on the Documents page** (from P57/P58 — the "AI summary ▸" / "▶ Listen to your summary" control) that plays its **own** TTS on its **own** audio, **auto-reading** the résumé summary on load.

The embedded reader runs independently of the assistant's single narration controller, so it **auto-monologues the summary while the overlay stays silent** — and because it grabs the audio channel first (consuming the one-time autoplay-unlock gesture and/or holding the active `<audio>`/`speechSynthesis`), the assistant's own greeting never gets to speak. **Result the user sees:** the page reads its summary at them, and the assistant never names the page, greets, or offers. Everything AI must follow the assistant's lead.

### Fix — one narrator, the assistant owns it
1. **Make the assistant's narration manager the ONLY thing that produces audio (enforce P119 app-wide).** Exactly one audio owner: one `<audio>` (server neural voice via `POST /api/v1/narration/speak`, P106) **or** one `speechSynthesis` fallback. **No other component may call** `/narration/speak`, `/interview/tts` (outside the Practice-Interview feature itself), or `window.speechSynthesis`, or own its own `<audio>`. Audit the Documents page (and anywhere a summary/review is read) and remove every independent speak call.
2. **Retire the embedded reader's auto-play.** The Documents "AI summary" (P57/P58) must **not** auto-read on load and must **not** have its own play/pause/voice controls. Keep the **content**: show the AI summary **printed** (collapsible, as today) — just don't let it speak on its own.
3. **Route "read this" through the assistant.** Any "Listen"/"Read aloud" affordance on a summary, review, or document hands its **text to the assistant's narration queue** (the assistant speaks it, in the overlay, with the wave in the overlay — P153 §2), rather than playing its own audio. So all spoken output comes from, and is controlled at, the one overlay.
4. **The summary obeys the assistant's turn-taking (P153).** On Documents the assistant **greets, names the page, and asks** — it does **not** auto-read the summary. The summary is available on demand ("want me to read your summary?" / a Listen control that routes to the assistant), never an unprompted monologue, and never a second voice.
5. **Kill the double autoplay-unlock.** Only the assistant's consent/unlock gesture (P150) arms audio; the embedded reader must not try to play audio (it would either steal the unlock or be blocked and leave the UI thinking it "spoke"). After this, the **first** voice the user hears on Documents is the **assistant greeting**, not a summary read-out.
6. **One set of controls, one wave.** Remove the embedded reader's separate transport/voice UI; mute/stop/voice/rate live only on the assistant overlay (P151 §4 declutter, P153 §2). There is one caption and one wave, in the overlay.

### How to find it (diagnostic)
On the Documents page, look for a component that, on mount or via `hw_narration_auto_read`, calls `POST /api/v1/interview/tts` (or `/narration/speak`) or `window.speechSynthesis.speak(...)` for the résumé **summary/review** text and plays it through its **own** `<audio>`/utterance. That is the second narrator. Replace its playback with "hand the text to the assistant manager"; delete its auto-read trigger and its separate controls.

### Acceptance
On Documents, **nothing auto-reads the summary** and there is **no second voice**. The **assistant overlay is the only narrator** — it greets, **names the page**, and offers (P153), and it is the first (and only) thing that speaks; the embedded AI summary is **printed** and, if the user asks, is spoken **by the assistant** (in the overlay, wave in the overlay), not by a separate player. No component besides the assistant's single manager calls `/narration/speak`, `/interview/tts`, `speechSynthesis`, or owns an `<audio>`. The previously-seen behavior (page silently reading the summary while the overlay stays quiet) is gone. No backend change.

## P155 — Assistant overlay: more translucent, larger, and resizable from every edge/corner (user-controlled, readable)

**Frontend only. No backend change.** The assistant is close to right, but the overlay is **too small and too opaque** to comfortably read its content (suggestions, before→after edits, captions). Give the user control over its size and make it a proper translucent panel.

### 1. Translucency
- Make the overlay a **translucent glass panel**, not a solid card: a semi-transparent background (around **80–88% opacity**, i.e. `rgba(...,0.84)`) with a **backdrop blur** (`backdrop-filter: blur(14px)` + a subtle 1px hairline border and soft shadow) so the app shows through faintly but the text stays crisp. Works in **both light and dark** (P60): light → translucent white; dark → translucent near-black. **Readability first:** keep text at full contrast/opacity even though the panel is see-through (don't fade the content with the background).
- One **opacity** affordance is fine (a slider in the overlay's ⚙ menu, persisted), but the default must already be comfortably translucent.

### 2. Larger by default + resizable from EVERY edge and corner
- **Bigger default size** so a few suggestions and the caption are readable without scrolling — e.g. default width ~**380–460px** and a taller body, capped to the viewport with internal scroll.
- **Resizable from all eight handles** — the four **edges** (N/E/S/W) and the four **corners** (NE/NW/SE/SW) — so the user can widen, heighten, or grow it diagonally by dragging any border. Implement real drag handles (don't rely on the single-corner CSS `resize`, which only does SE). Show a resize cursor on hover over each edge/corner; a comfortable **min size** (so it can't collapse) and a **max = viewport** with margin.
- **Draggable to reposition** (keep P112/P120), and **remember** the chosen size + position + opacity across sessions (`localStorage`: `hw_assist_w`, `hw_assist_h`, `hw_assist_x`, `hw_assist_y`, `hw_assist_opacity`). A small **reset-to-default** in the ⚙ menu.
- Keep the **minimize** state (P120) — collapses to the speaking bar — and the **declutter** (P151 §4): even at the larger size, the default view is caption + wave + input row + a few chips, with deeper controls behind the menu.

### 3. Readability
- Comfortable type size and line-height for the captions and suggestion cards; the moving caption (P138) and the before→after diffs (P152) must be easy to read at the new size. The **wave + mic meter stay anchored in the overlay** (P153 §2).
- On small/phone widths, the panel goes to a near-full-width sheet with the same translucency (don't let it overflow the viewport).

### Acceptance
The assistant overlay is a **translucent, blurred glass panel** (readable text over a see-through background) in light and dark, **larger by default**, and **resizable by dragging any edge or corner** (all 8 handles), draggable to reposition, with size/position/opacity **remembered** and a reset. It never collapses below a usable min or overflows the viewport, keeps the minimize + declutter behavior, and the wave/mic meter remain in the overlay.

## P156 — Voice input: release-to-run (no manual Run), instant mic, and "go to my cover letter" opens the cover letter and says so

**Backend fixes already shipped (server transcription + the cover-letter/résumé distinction).** Three voice problems the user hit, now fixed end-to-end:

### Context — what the backend just fixed (no work for you)
- **Server transcription was failing on every call** and silently falling back to the browser's truncating `SpeechRecognition`. Root cause: the client sent `language: "en-US"` but Whisper requires ISO-639-1 (`"en"`) and 400'd it. **`POST /api/v1/narration/transcribe` now normalizes the language server-side**, so the MediaRecorder→server path returns the **whole** sentence reliably. Keep sending the clip; you can also just send `language: "en"` (or omit it).
- **Navigation now distinguishes documents.** `POST /api/v1/assistant/interpret` on "go to my cover letter" returns `{"intent":"navigate","slots":{"section":"documents","doc":"cover_letter"}}` (and `doc:"resume"` for the résumé). Use `slots.doc`.

### Frontend fixes
1. **Release = run (stop waiting for a manual "Run").** When the user **lets go of the push-to-talk** (or hits Stop), the captured command must **execute automatically** — transcribe → `interpret` → act — exactly as if typed (P151 §2: read-only/nav commands run with no confirm). Today the transcript is dropped into an "I heard this — fix before it runs" box that waits for a manual **Run** click; that's the bug. **Auto-submit on release.** Keep an editable confirm box **only** as an *optional* correction affordance (and only surface it if transcription is low-confidence/empty), never as a required step for a clean transcript.
2. **Mic must engage instantly (kill the init lag).** Pressing the mic takes too long to start, so the first word is lost. **Pre-warm** the mic: acquire the `getUserMedia` stream **once** (on the first voice use / when the assistant opens) and **keep it**, then start/stop a `MediaRecorder` on the held stream per press — so a press starts capturing in <100ms. Respect privacy (P111 §3): the stream is held only while the assistant is active; release it when the assistant closes or after idle, and the mic indicator reflects actual listening. Show the live meter immediately on press.
3. **Honor the document target + announce it.** On `navigate {section:"documents", doc:"cover_letter"}`, open **Documents and select the cover letter** (not whatever doc was showing); for `doc:"resume"`, select the résumé. Then the assistant **confirms what it did with brief, useful meta** — e.g. *"Here's your cover letter — 'Williams, Bayete', last updated 3 days ago, v4."* (title, last-updated, active version; for a résumé you can add its score). Spoken (if voice on) + printed (P138). Generalize: whenever a nav command targets a specific item, land on it and say what it is in one short line.

### Acceptance
Holding the mic and saying "go to my cover letter" **transcribes the whole sentence** (server path, no truncation), and on **release it runs automatically** — the app switches to Documents, **opens the cover letter** (not the résumé), and the assistant says a brief line naming it with useful meta (last updated / version). The mic **starts capturing instantly** on press (pre-warmed stream), with the live meter showing immediately. No manual "Run" is needed for a clean transcript; the editable box appears only to fix a bad/empty capture.

## P157 — Assistant window: make resizing EASY and obvious, and give the audio visuals their own dedicated feature

**Frontend only. No backend change.** Sharpens P155. The glass translucency landed (good), but two things still aren't right on the live overlay: it is **not easily resizable** (`resize: none`, only a couple of handles), and the **audio wave/meter isn't a real, placed feature**. Fix both so the user can comfortably size the window to work with the assistant's sections, and so the voice visualization reads as its own element.

### 1. Easy, obvious resizing (the important one)
The user must be able to resize the window **effortlessly** — to read suggestions, before→after diffs, and sections without fighting a tiny handle.
- **Drag from any edge or corner, with generous hit zones.** All four edges and four corners resize; make the grab areas **large** (edges ≈ 10–12px deep, corners ≈ 18–20px) so they're easy to catch, each showing the correct resize cursor on hover (`ns-/ew-/nwse-/nesw-resize`). Don't rely on the single-corner CSS `resize`.
- **A visible, discoverable grip.** Show an obvious **resize grip** in the bottom-right corner (the diagonal-lines affordance) and a subtle highlight on edges when hovered, so users can SEE the window is resizable without hunting.
- **One-tap sizing too (not only drag).** Add a header control group: an **expand / maximize ⤢ toggle** (grow to a large comfortable size ↔ restore) and optional **S · M · L** size presets. Many users won't drag-resize — give them a one-click way to make it bigger.
- **Comfortable defaults + limits.** Widen the default a bit (reading before→after diffs at 382px is cramped — aim ~**420–460px**), enforce a usable **min** (so it never collapses) and **max = viewport** with a margin, and **reflow content with internal scroll** as it resizes (no clipping, no layout jank).
- **Works on touch** (drag handles + the preset/expand buttons respond to touch), and the chosen **size + position persist** (`hw_assist_w/h/x/y`) with a **reset** in the ⚙ menu. Keep drag-to-move (P112/P120) and minimize.

### 2. The audio visuals are their own feature — placed well
Right now the wave/meter isn't a standing element. Give the voice visualization a **dedicated, deliberately-designed zone** in the overlay (ties P153 §2):
- **A distinct "Voice" strip/section** — its own clearly separated area (e.g. a slim panel directly under the header, or a fixed footer bar), visually set apart (subtle inset/background), that is **always present** so the user always knows where the voice lives and how to control it.
- **It houses, together:** the **output wave** (animates while the assistant speaks, driven by the real audio via Web Audio analyser — P138), the **mic input meter** (animates while listening, visually distinct from the output wave), the **speaking caption** line, and the **mute 🔊/🔇 + Stop** controls — grouped as one coherent "voice" feature, not scattered.
- **Idle state:** when nothing is speaking/listening, show a calm idle baseline (a flat/low shimmer) so the zone still reads as the voice feature and stays discoverable — never an empty gap.
- **Clear source-of-sound:** because this zone lives in the overlay and animates with the real output, the user can always see the speech is coming from the assistant and reach the controls in one place.
- **Resizes gracefully:** the Voice zone stays legible and proportioned as the window is resized; the wave scales to the available width.

### Acceptance
The assistant window is **easy to resize** — grab any edge/corner via a generous hit zone (correct cursors), a visible bottom-right grip signals it, and a header **expand/maximize toggle (+ S/M/L presets)** resizes it in one tap; default is a comfortably readable width, with a sane min, viewport max, reflowing content, persisted size/position, and a reset. The **audio visuals are a dedicated, well-placed "Voice" zone** — output wave + mic meter + caption + mute/stop grouped in their own always-present section that animates with the real audio, shows a calm idle state, makes the speech source obvious, and scales with the window. Translucency/drag/minimize from P155 are preserved.

## P158 — Assistant overlay: scrollable body + a control bar that NEVER disappears, speed/pause always reachable, and narration that checks in

**Frontend only. No backend change.** Follow-up to P155–P157. Resizing now works, but it broke the layout: when the window is made smaller the **content can't be scrolled**, and the **audio wave + push-to-talk (hold-mic) button get clipped off the bottom and vanish**. Essential controls must never disappear when the window is resized. Also: make the speaker easier to control and have it pause and check in instead of monologuing.

### 1. Split the overlay into a fixed frame + a scrollable middle (fixes the clipping)
Lay the overlay out as **three bands** so sizing never hides the controls:
- **Header (pinned top):** title + ⚙ menu + expand/preset + minimize/close (P157).
- **Scrollable body (flex, the only part that scrolls):** suggestions, captions, before→after edits, tabs/sections. Give it `flex: 1 1 auto; min-height: 0; overflow-y: auto;` so it **always scrolls** when content exceeds the available height — at **every** window size, including the smallest. (The missing `min-height:0` is almost certainly why it won't scroll today.) Keep a thin scrollbar; never let content get cut off with no way to reach it.
- **Voice/control bar (pinned bottom, the P157 "Voice" zone — `flex-shrink:0`, never scrolls away):** this bar is **always visible regardless of window size** and holds the always-on controls below.

### 2. These controls must ALWAYS be visible and reachable (never clipped by resize)
Dock all of these in the pinned bottom bar so shrinking the window can never remove them:
- **The output audio wave + mic input meter** (P153/P157) — the user lost sight of the wave; it lives here permanently.
- **The push-to-talk / hold-mic button** — it disappeared on resize; it must be in the pinned bar, always tappable.
- **A Pause/Resume speaker control** — always present (see §3).
- **The speaker speed slider** must be **always accessible** — if the bar is too narrow to show the full slider inline, keep a one-tap **speed control** in the bar (e.g. a `1.0×` chip that opens the slider in a popover, and/or −/+ steppers), so speed is reachable at any window size. Never bury speed behind a menu the user has to hunt for.
- Mute 🔊/🔇 + Stop stay here too.
If the bar gets narrow, let these controls **wrap or collapse into compact icon/chip forms** — but they stay **on screen**; they are never scrolled away or clipped.

### 3. Easy pause + "want me to continue?" check-ins (stop the monologue)
- **A prominent, always-visible Pause/Resume control** for the speaker (in the pinned bar and respond to a spoken "pause"/"stop"/"continue" — P121/P131 barge-in). One tap pauses speech immediately; tap again (or say "continue") resumes.
- **Pause more often and ask.** Chunk narration into **short segments** (e.g. per suggestion, per sentence-group, or ~every 8–12s of speech) and, after each segment of any longer read, **pause and ask**: *"Want me to keep going?"* — spoken (if voice on) **and** shown as a small inline **Continue / Stop** prompt (P138 caption area). Don't read a long list or summary straight through; offer the next chunk. This is the user-pacing rule from P153 (ask, don't monologue) applied to ongoing speech, not just the greeting.
- Default to **short** by design: after the greeting and a couple of printed suggestions, stop and wait for the user rather than continuing automatically.

### Acceptance
At **any** window size (including the smallest), the overlay body **scrolls** to reach all content, and the **wave, hold-mic button, Pause/Resume, speed control, and mute/stop are always visible in a pinned bottom bar** — resizing never clips or hides them. The **speed slider/stepper is reachable at every size**, and the speaker can be **paused and resumed** by button or voice. Longer narration is **chunked**: the assistant pauses after each segment and **asks "want me to continue?"** (spoken + a Continue/Stop prompt) instead of reading straight through. Translucency/resize/drag/minimize from P155–P157 are preserved.

## P159 — Make the assistant's suggestions PROMINENT: show them as draggable bubbles you can drop onto the résumé

**Frontend only. No backend change.** The suggestions the assistant produces (P152 critique→apply-able edits, P6 highlights, bullet recommendations) are **getting lost in a wall of text** — the user can't find them. Surface them as **distinct, well-advertised suggestion bubbles**, and let the user **drag a bubble onto the résumé** to apply it — *in addition to* editing the rendered document directly.

### 1. Suggestions are their own prominent surface — not buried in prose
- Render each suggestion as a **discrete card/bubble**, visually set apart from the assistant's chat text (its own panel/section with a clear label like **"Suggestions"** / **"Suggested edits"**), so they're immediately findable. Never inline them inside a paragraph of narration.
- **Advertise them:** a count + heading ("3 suggested edits"), and when new ones arrive, a brief highlight/badge so the user notices. If voice is on, the assistant points to them ("I've put 3 suggestions below — drag one onto your résumé, or tap Apply") per the ask-don't-monologue rule (P153/P158) — it does **not** read them all straight through.
- Each bubble shows, compactly: the **action** (Add / Replace / Reword / Insert metric / Tailor), a short **before→after** or the new line, and the **rationale** in one line (P152). Keep them scannable — the detail expands on tap, it isn't all shown at once.

### 2. Bubble format the AI produces (reuse, don't reinvent)
- Use the **existing suggestion-bubble styling** the app already uses for AI output so these read as first-class AI suggestions (consistent shape, color, affordances). Group by target section when helpful (Summary / Experience / Skills).
- Each bubble has **explicit buttons too** — **Apply** (and **Replace which line?** / **Undo**) — so drag is never the *only* way to act (accessibility + non-drag users). Drag is an enhancement, not a requirement.

### 3. Drag-and-drop onto the résumé — in addition to the editable render
- The user can **drag a suggestion bubble and drop it onto the résumé** to apply it. This complements (does **not** replace) the editable document render and the manual editor — both paths stay.
- **Drop targets on the rendered résumé:** dropping a bubble **onto a specific bullet/line** → replace that line (the P4 "drag right→left to replace" interaction, now also driven from the suggestion bubbles); dropping into a **section** (Experience, Summary, Skills) → insert/add there; a clear **drop-zone highlight** shows where it will land while dragging, and a **snap/confirm** on drop.
- **Applies through the one save path** (`POST /api/v1/resumes/{id}/versions` via the existing apply-edits/match-bullets flow, P4/P152) → new version → the **preview updates immediately** with the "Updated — N change(s)" cue (P4b), and **Undo** = version switch. Honesty rule intact: placeholder brackets for metrics, never fabricated numbers (P152).
- **Touch + keyboard parity:** drag works on touch; for keyboard/non-drag, the bubble's **Apply** (with a "replace which line?" picker) does the same thing. Nothing is drag-only.

### Acceptance
The assistant's suggestions appear as **prominent, clearly-labeled bubbles** in their own surface (count + heading, highlighted on arrival) — easy to find, never buried in narration — using the app's existing AI-suggestion bubble style. The user can **drag a bubble onto the rendered résumé** and drop it on a line (replace) or a section (insert), with a visible drop-zone highlight, and it applies through the normal versions save path with immediate preview update and Undo. The **editable document render and manual editor remain** and work alongside drag-and-drop; every bubble also has Apply/Replace/Undo buttons so drag is optional, not required.

## P160 — Assistant prompts as a readable choice overlay (Yes/No + multiple-choice bubble cards), and a big, obvious hold-mic button

**Frontend only. No backend change.** When the assistant asks the user something — "Want me to continue?" (P158), yes/no confirmations (P114), disambiguation ("which cover letter?"), or "pick one of these" — it currently reads/prints into the clutter and is easy to miss. Present every choice as a **distinct, readable choice overlay** with real tappable options, and make the **push-to-talk (hold-mic) button big and easy to find**.

### 1. Questions/options become a readable choice overlay — not buried text
Whenever the assistant poses a decision, show a **dedicated choice card** (its own panel, comfortably sized and readable per P155 translucency — not tiny, not inline in a paragraph):
- **Yes/No questions** → a clear prompt line + two prominent buttons **Yes / No** (and, where it fits, "Not now"). "Want me to continue?" (P158) renders this way: the question + **Continue / Stop** as big buttons, not a sentence the user has to act on by voice alone.
- **Multiple choice** → render each option as a **selectable bubble card** (reuse the suggestion-bubble style, P159): one card per choice, each showing a short readable label (+ brief meta when useful — e.g. "Cover letter · Williams, Bayete · v4"). Tapping a card selects it. Number them so voice ("the second one" / "number 2") and the P-NLU `choose`/`index` path (ASSISTANT_INTENT) map onto the same cards.
- The overlay is **readable-sized** (grows to fit the question + options, scrolls within if many — P158 scroll rules), clearly separated from the chat narration, and dismissable. If voice is on, the assistant asks the question **once** and points to the cards ("pick one below, or say the number") — it does **not** read every option aloud (P153/P158 ask-don't-monologue).
- Every choice is actionable by **tap, voice, or keyboard** (focusable cards, Enter to pick) — parity, nothing voice-only.

### 2. Make the hold-mic (push-to-talk) button big, visible, and easy to access
The mic button is hard to find/hit. In the **pinned Voice bar** (P158), make the push-to-talk control the **primary, prominent affordance**:
- A **large, clearly-labeled mic button** (generous tap target, mic icon + a short "Hold to talk" / "Tap to talk" label), high-contrast, always visible in the pinned bar at **every** window size (never clipped — P158 §2).
- **Obvious states:** idle → clearly tappable; pressed/listening → active color + the live input meter animates right there (P157 Voice zone) so it's unmistakable it's capturing; releasing runs the command (P156 release-to-run).
- Keep it reachable the same way across sizes — if the bar is narrow it stays as a prominent icon button (don't shrink it into the chip cluster). Support **both** press-and-hold and a tap-to-toggle mode for accessibility.

### Acceptance
Every time the assistant asks a question or offers options, it appears as a **readable, clearly-separated choice overlay**: Yes/No (and "Want me to continue?") render as prominent **buttons**, and multiple choices render as **numbered selectable bubble cards** (tap / say the number / keyboard) — never lost in narration, readable-sized, scrollable when long. The **hold-mic button is large, labeled, high-contrast, and always visible** in the pinned Voice bar at any window size, shows clear idle/listening states with the live meter, and runs the command on release. P153/P158 "ask, don't monologue" is preserved — the assistant points to the cards rather than reading them all.

## P161 — Give the assistant a modern "player" transport: replay / play-pause / stop / skip + mic + speed in one control, with suggestions paced in sync below

**Frontend only. No backend change.** The voice controls are still too scattered — there's **no easy replay**, you **can't see the suggestion it's currently talking about** (the paced list below isn't tied to the speech), and **stop/pause/mic aren't concentrated** in one obvious place. Pull them together into a single, **modern media-player-style transport** (think a clean podcast/music player bar), and sync the spoken item with what's shown below.

### 1. One concentrated transport bar (the pinned Voice zone, P157/P158 — now a real player)
Replace the loose buttons with a **single modern player strip** that holds, left-to-right, as clearly-labeled icon controls:
- **Replay / restart** (↺) — re-speak the current item from the start. *This is the missing "easy replay."*
- **Previous / back** (⏮) — jump to the previous spoken segment/suggestion.
- **Play / Pause** (▶/⏸) — one prominent primary button; pauses/resumes speech instantly (P158 §3).
- **Stop** (⏹) — ends narration now.
- **Next / skip** (⏭) — skip to the next segment/suggestion.
- **Mic / push-to-talk** — the big, always-visible hold-mic (P160 §2), grouped into the same transport so voice-in and voice-out controls live together.
- **Speed** — the always-reachable speed control (1.0× chip → slider/steppers, P158 §2).
- **Mute** 🔊/🔇.
Modern styling: a compact rounded bar, clear hit targets, the **output wave + mic meter** integrated as the player's "now-playing" visualization (P157 Voice zone), with an optional **thin progress indicator** showing position through the current read. It stays **pinned and fully visible at every window size** (P158) — the transport never gets clipped.

### 2. The suggestions it's talking about are visible and paced in sync below
The list the assistant narrates (suggestion bubbles, P159) sits **directly below the transport**, and the player and the list are **linked**:
- As the assistant speaks each item, **highlight/elevate the matching bubble** (active state) and **auto-scroll it into view**, so the user can always see the one being discussed — "paced below" actually tracks the speech.
- **Replay / Previous / Next on the transport move through these same items** — replay re-reads the highlighted bubble; next advances the highlight to the next bubble and speaks it; previous steps back. Tapping a bubble jumps the player to it.
- Honor **ask-don't-monologue** (P153/P158): by default it speaks one item, highlights it, then the P158 "continue?" check-in — the transport's **Next** is how the user advances, instead of it auto-reading the whole list.
- Keep **tap/keyboard parity**: every bubble is still directly actionable (Apply/drag, P159) regardless of the player.

### Acceptance
The assistant's voice controls are consolidated into **one modern player-style transport** — **Replay, Previous, Play/Pause, Stop, Next, mic, speed, mute** in a single pinned bar with the wave/meter as its visualization and a position indicator — easy to find and fully visible at any window size. **Replay is one tap.** As it speaks, the **matching suggestion bubble below is highlighted and scrolled into view**, and the transport's **Previous/Next/Replay navigate those same items**; tapping a bubble jumps the player to it. Pause/Stop are immediate, speed is always reachable, and the ask-don't-monologue pacing (one item + "continue?") is preserved with Next as the advance control.

## P162 — Make the Matches Brief prominent: an engaging, eye-catching results reveal

**Frontend only. No backend change.** The **Matches Brief** (the scored rundown from the `walk_matches` / "Rate my matches" playbook — P115/P151) still reads as plain text tucked into the assistant and is easy to overlook. Give the **results their own prominent, engaging introduction** so they land as the highlight of the Matches page, not a footnote.

### 1. A headline results reveal — eye-catching, not a paragraph
- Open the brief with a **hero/summary card** at the top of Matches: a bold headline + a **top-line stat** — e.g. *"You have 12 matches — 3 strong fits this week"* — with the standout number large and styled. Use the design tokens (P60) so it reads as a designed moment, not body text.
- Add a light **reveal animation** when the brief arrives (count-up on the number, cards easing in) so it's clearly the result of the action and draws the eye — tasteful, fast, and respects reduced-motion (`prefers-reduced-motion`).
- If voice is on, the assistant gives a short, upbeat one-liner pointing at it ("Here's your brief — 3 strong fits, take a look") and then the P153/P158 ask-don't-monologue pacing — it does not read the whole list.

### 2. The matches themselves as prominent, scannable cards
- Below the hero, show the top matches as **ranked result cards** — each with the **match score** shown prominently (a ring/badge/meter, color-graded strong→weak via tokens), the role + company, and a one-line "why it fits / gap" (the brief's reasoning). Rank them clearly (1, 2, 3…).
- Make them **actionable right there** (Apply / Save / Tailor / "tell me more"), consistent with the suggestion-bubble affordances (P159) — the brief is a launchpad, not just a readout.
- Keep it **scannable first, detail on demand**: the strong fits and scores are visible at a glance; deeper reasoning expands on tap. Scrolls within its region (P158).

### 3. Prominence + placement
- The brief is the **top, dominant element** of the Matches section when it's current (above secondary filters/lists), with a clear **"Matches Brief"** label and a **timestamp/refresh** (works with "refresh my matches", P151). It shouldn't compete with or hide inside the assistant chat — the assistant *introduces* it, but the brief lives prominently on the page.

### Acceptance
When the user runs "rate/score my matches" (or lands on Matches with a current brief), the results **introduce themselves prominently**: a bold hero card with a standout headline stat and a tasteful reveal animation (reduced-motion safe), followed by **ranked match cards with prominent scores**, one-line reasoning, and inline actions — scannable at a glance, detail on tap, placed as the dominant element of the Matches page. Voice gives a short upbeat intro and points to it without reading the whole list (P153/P158).

## P163 — The grand tour / guided walkthrough (built on P164's minimized driving mode)

**Frontend only. No backend change.** P164 already governs *when* the assistant shrinks and moves aside and *how* it points at things (any navigate/point-out → compact bar on the opposite edge, coach-mark + connector, restore afterward). **This prompt does NOT re-specify that** — it defines the **multi-step guided tour** that runs inside that minimized mode. Assume the overlay is already in P164's compact/aside state for every step.

### What the tour is
- A short, **step-by-step walkthrough** of the core app (triggered from the P167 welcome's "Give me the tour", or on request). Each step: navigate/scroll to the thing, let P164 spotlight it (coach-mark + connector), and show **one short caption** of what it is and why it matters — not a monologue (P153/P158).
- **Stepping:** the compact bar's **Next/Previous** (P161) move through tour steps; each step waits on the user (the "continue?" / Next control) rather than auto-advancing through everything. **Pause/Stop** ends the tour at any time.
- **Keep it quick and skippable:** a handful of steps (Matches, Documents, Auto-apply, the assistant itself), a visible **"Skip tour"**, and Skip for anything already set up or unavailable (P165 §3). Progress like "2 of 5".
- **Voice optional:** if voice is on, it speaks each step's caption while minimized; muted/again, the caption is printed (P165 §1).
- **Lifecycle:** on finish or Skip, mark it seen (don't re-run every load) and **restore** the overlay to its prior size/position (P157, via P164's restore). Offer a one-tap way to **re-run the tour later** (Setup menu, P165 §2).

### Acceptance
Launching the tour runs a **short, numbered, skippable** sequence of steps; for each step the assistant (already compact/aside per P164) navigates to the target, it's spotlighted, and a **one-line caption** explains it, advancing only on the user's **Next** (or voice "continue"), with **Previous**, **Pause/Stop**, and **Skip tour** always available. Voice narrates each step if on; the tour marks itself seen on completion/skip, restores the overlay afterward, and can be re-run from the Setup menu. It never monologues and never covers the thing it's showing (P164).


## P164 — The assistant auto-shrinks and moves aside WHENEVER it points something out (not just the formal tour), with a visible pointer to the target

**Frontend only. No backend change.** P163 added a minimize-during-tour mode, but it isn't firing in practice: the window still covers the screen when the assistant **points something out**. Broaden and strengthen the trigger so the overlay **automatically gets out of the way any time it references, highlights, or navigates to something on screen** — and make that moment feel interactive and enjoyable.

### 1. Enter "pointing / showing" mode on ANY of these — not only the grand tour
Whenever the assistant's turn does any of the following, it must **auto-shrink to the compact transport+caption bar (P161/P163) and reposition clear of the target**:
- Highlights / points at / references a specific on-screen element ("see this button", "up here", "your matches are here", "notice the score").
- **Navigates** the user to a page or scrolls to a section on their behalf.
- Runs any playbook step (walk_matches, tailor, apply, upload/download — P115), or the grand tour.
- Opens a document/item it's about to talk about (P156).
Detection: if the assistant's action/response **targets a UI element or a route** (it has a target selector/ref or a nav intent), that alone triggers pointing mode — don't gate it behind a "tour" flag. Default to showing mode for anything that directs the user's attention to the screen.

### 2. Actually clear the target + point to it
- **Shrink + move:** collapse to the minimal bar AND **move it to the opposite edge from the highlighted target** so the target is never covered. If the target is near the bar's docked spot, relocate the bar; never let them overlap.
- **Spotlight the target:** apply a coach-mark/highlight (ring, dim-the-rest, or arrow) on the element being pointed at, and draw a subtle **connector/pointer** from the minimized assistant to the target so it's obvious the assistant is referring to *that* thing — this is the interactive, enjoyable cue the user wants.
- **Smooth + fast:** animate the shrink/move (respect `prefers-reduced-motion`); it should feel like the assistant stepping aside to show you, not a jarring resize.

### 3. Control + restore
- From the minimal bar, keep Pause/Stop, Next/Previous, mic, and one-tap **re-expand** (P161/P163). Voice keeps narrating while minimized.
- When the pointing/showing moment ends (the step completes, the user moves on, or they re-expand), **restore** the overlay to its prior size/position (persisted `hw_assist_*`, P157) and remove the highlight.
- Honor ask-don't-monologue (P153/P158): point, say one short line, then the "continue?"/Next control — don't re-expand to a big panel to read at length.

### Acceptance
Any time the assistant **points something out, highlights an element, navigates, scrolls to a section, or opens an item** — not just during the named tour — the overlay **automatically shrinks to the compact bar and moves to the opposite edge so the target stays fully visible**, with a coach-mark on the target and a visible pointer/connector from the assistant to it. The shrink/move is smooth (reduced-motion safe), controls (pause/stop/next/mic/re-expand) stay available, voice continues, and the overlay **restores** to its prior size/position when the moment ends. It never covers the thing it's talking about.

## P165 — Read-along mute (wave keeps moving), assistant can run any wizard step stand-alone, and the wizard offers Skip for done/unavailable steps

**Frontend only. No backend change.** Three things:

### 1. A Mute that lets the user READ while still seeing it's "speaking"
Some users prefer to read the assistant's output rather than hear it — but they still want assurance it's actively narrating.
- **Mute button** in the player transport / Voice zone (P161) that **silences the audio output only** — it does **not** stop narration. When muted, the assistant keeps "speaking" on its timeline: the **caption/printed output advances** (P138) and the **audio wave keeps animating** so the user can see it's still going, just with no sound.
- Drive the wave from the **narration timeline** when muted (not the muted audio's amplitude, which would read as flat/silent) so it visibly moves in step with the words being shown — the reassurance the user asked for.
- Muted state is **obvious and persisted** (`hw_voice_muted`): a clear 🔇 icon, and the output text is shown prominently so reading is comfortable. Unmuting resumes audio from the current point. Mute is independent of Pause/Stop (muted ≠ paused; the read continues).
- Pair with the pacing rules (P158/P160): even muted, it still **pauses to ask "continue?"** as a printed Continue/Stop prompt.

### 2. The assistant can pull up any wizard step on its own, to run stand-alone
The setup wizard (P150: connect a job source, résumé/documents setup, AI-assistant/voice setup, preferences, etc.) shouldn't only run start-to-finish.
- Give each wizard **step/section a stable id**, and let the **assistant launch any one of them individually** on demand — by voice or chip ("set up my résumé", "connect a job board", "set up the assistant voice", "redo onboarding step X"). Map these through the NLU (a `start_playbook`/`open_setup` intent with a `step` slot) so a single step opens as a **focused, stand-alone task** (its own panel/overlay), completes, saves, and returns — without forcing the whole wizard.
- A **"Setup" menu** lists every step so the user can jump to any one directly too (tap parity, not voice-only). Completing a stand-alone step updates the same setup state the full wizard reads.

### 3. The general wizard offers Skip for already-done or unavailable steps
- When running the **full wizard**, **detect each step's state** and offer **Skip** (clearly, per step) when it's **already set up** (e.g. a source is already connected, a résumé already exists) — show it as done/optional with a "Skip" / "Review" choice rather than forcing the user through it again.
- Offer **Skip** when a step is **unavailable** (e.g. a capability not ready, no account for it yet) — mark it skipped with a short reason, don't dead-end.
- Skip is **non-destructive** (skipping never clears existing setup), reversible (the step stays reachable later via the Setup menu / the assistant, §2), and the wizard tracks completion so finished/skipped steps aren't re-nagged. Use the P160 choice-card style for the Skip/Continue/Review prompt.

### Acceptance
Muting silences audio **without stopping narration**: the caption/printed output keeps advancing and the **wave keeps animating** (driven by the narration timeline) so the user can read along and still see it's speaking; muted state is clear, persisted, and independent of pause. The assistant can **launch any individual wizard step stand-alone** (by voice or a Setup menu) to complete that one task and return, not only run the whole wizard. The full wizard **detects each step's state and offers Skip** for already-set-up or unavailable steps (non-destructive, reversible, not re-nagged), presented as a clear choice.

## P166 — The assistant must DOCK to a side and never cover the content; default size is far too large and it isn't position-aware

**Frontend only. No backend change.** Verified live on `/dashboard/matches`: the assistant window renders at **961×730 on a 1264×768 viewport — 76% of the width, 95% of the height — floating dead-center over the content** (`coversContentCenter: true`, `isDockedToEdge: false`). It stays there statically while the matches/content are manipulated, so the user can't see what's happening. The minimize-on-point-out (P163/P164) isn't engaging, and the **default resting size is itself the problem.** Fix both.

### 1. Default resting state = a compact SIDE-DOCKED panel, never a centered cover
- The assistant's **default/resting** form is a **narrow panel docked to one edge** (right rail by default), roughly **380–440px wide** and **not full height** — it must **never cover the center of the content area** and must **leave the main content column visible** beside it. It is **not** a near-fullscreen centered modal. (Today's 961×730 center float is the bug.)
- The large size is **opt-in only** (the user's own expand/maximize or drag, P157) — never the default, and even then it's the user's explicit choice, not the resting state. On load and after any reset, come up compact and docked.
- Keep it draggable/resizable (P157), but **persist a sane compact default**; if a stored size would cover the content center, clamp it back to the docked compact form.

### 2. Position-awareness: get out of the way whenever the content is being used
The overlay must know where it sits relative to the content and move itself so the user can watch:
- **While any action manipulates the content screen** — refresh, matches re-scoring, navigation, scroll-to, a playbook step, or pointing something out (P164) — the assistant **shrinks and docks to a side/corner** so the content is fully visible and the user can follow along, then returns to its resting dock when idle.
- **Never occlude the content center at a large size.** If the assistant (at any size) would cover the content the user needs to see, it **auto-docks to the opposite side** or shrinks to the compact bar (P161/P163). Detect overlap with the active content region and reposition — don't sit on top of it.
- The side it docks to should avoid the element being pointed at (P164's opposite-edge rule) and avoid the left nav rail.

### 3. Still fully usable while docked/compact
- Docked compact still shows the essentials: greeting/one line, the suggestion bubbles (P159), the Voice transport + mic + mute (P160/P161/P165) pinned, with the body scrollable (P158). The user can read suggestions and drive voice without the window ever blocking the matches.
- One-tap **expand** when the user *wants* the big view (e.g. to read a long before→after), and it collapses back to docked when they move on or an action starts.

### Acceptance
On load, the assistant comes up as a **compact panel docked to a side (~380–440px), not covering the content center** (`coversContentCenter` must be false at rest). Whenever the content screen is refreshed, navigated, re-scored, or pointed at, the assistant **shrinks/docks aside so the content stays visible** and the user can follow the action, then returns to its resting dock. It **never floats large over the center of the content**; a stored/forced size that would cover the content is clamped or re-docked. Compact/docked, it still shows suggestions + the pinned voice transport and remains fully usable. The big/expanded view is strictly user-opt-in.

## P167 — New-user welcome + obvious "get connected" path, and periodic tips for returning users

**Frontend only. No backend change.** Real tester feedback: a new user (sundaij2@gmail.com) signed in and **couldn't find how to get connected**. The assistant must **notice a new user**, give a short, friendly, non-technical welcome, and make getting connected the obvious first action — then offer the wizard or a grand tour. Returning users should get the occasional helpful tip, not the welcome.

### 1. Detect a new user and greet them specially
- On sign-in, detect "new / not set up yet" — e.g. first session (`hw_intro_seen` unset) **or** nothing connected yet (no job source linked / empty state). Treat that user as new even if they've logged in before but never connected.
- Show a **special welcome** (distinct from the per-page greeting, P153): a warm one-liner + a **2–3 bullet "what this does / how to start"** overview in plain language — no jargon, nothing time-consuming. Example tone: *"Welcome! Project Harbor finds jobs that fit you and helps you apply. The quickest start: connect a job board so I can pull in matches. Want me to set that up?"*

### 2. Make "get connected" the obvious next step (the actual pain)
- The welcome's **primary, prominent call-to-action is "Connect a job board"** (a big, unmissable button) — because that's what the tester couldn't find. One tap launches the connect-source step **stand-alone** (P165 §2), the fastest path, without forcing the whole wizard.
- Also surface a persistent, obvious **"Get connected"** affordance in the empty/matches state itself (not only inside the assistant), so a user who dismisses the assistant can still find it.

### 3. Offer the wizard or the grand tour — as a simple choice
- Right in the welcome, ask with **choice cards** (P160): **"Set me up" (run the setup wizard, P150/P165)** · **"Give me the tour" (grand tour, P163/P164)** · **"I'll explore" (dismiss)**. Keep it to a quick, friendly question — not a wall of steps.
- The wizard/tour honor Skip for anything already done or unavailable (P165 §3), and the assistant minimizes/docks while touring so the screen stays visible (P164/P166).
- Mark `hw_intro_seen` once they've been welcomed so it doesn't repeat every load, but re-offer "Connect a job board" until a source is actually connected.

### 4. Returning users: periodic tips, not the welcome
- For established users, **don't** show the new-user welcome. Instead, **occasionally** (periodically, with a sensible cooldown — e.g. once every few sessions, persisted like `hw_last_tip_ts`) surface a **single tip/trick card**: a short "Did you know…" pointing at a **useful feature they haven't used much** (detect from their activity — e.g. never tailored a résumé, never tried auto-apply, never used voice) or a getting-more-from-it tip for a feature they do use.
- Tips are **one at a time, dismissible, non-nagging** (never block the screen; respect a "don't show tips" toggle), use the choice-card style, and each offers a one-tap **"Show me"** that runs/opens that feature (stand-alone, P165 §2).

### Acceptance
A new or not-yet-connected user gets a **special, plain-language welcome** with a prominent **"Connect a job board"** CTA that launches connecting stand-alone, plus a simple **"Set me up / Give me the tour / I'll explore"** choice — quick, non-technical, skippable, and not repeated every load (but "get connected" persists until a source is linked). A separate persistent "Get connected" affordance exists in the empty state. **Returning users don't see the welcome**; they occasionally get a **single, dismissible tip card** highlighting an underused or useful feature with a one-tap "Show me", on a cooldown and with an off switch.

## P168 — Put the assistant's answer where the user is looking, fix "can't hear me", and make minimize/dock actually work

**Frontend only. No backend change.** Tester sundaij2@gmail.com hit three things. Two are verified live on `/dashboard/matches`.

### 1. The answer lands at the TOP; the user has to scroll up to find it (verified)
Measured region order inside the window: **response area at top (y≈82)**, but the **input is in the middle (y≈446)** and the **mic/transport below it (y≈523–659)**. So a user asks from the bottom and the reply appears up top, out of view — "a response at the top she had to scroll to find."
- **Make the latest answer appear where the user is acting.** Either lay it out like a normal chat (newest message at the **bottom, directly above the input**, conversation scrolls up) **or** keep the current order but **auto-scroll the new response into view** the instant it arrives and briefly highlight it. The user must **never have to hunt** for the reply.
- **Keep the input + response visually adjacent.** The question field, the answer, and the voice transport should read as one connected exchange, not separated by other panels. When a response (or a formulated question's result) is produced, it is the thing in view.
- Respect P158 scroll + P161 pacing, but the **newest content is always auto-revealed**, not stranded.

### 2. "The assistant couldn't hear her"
Voice input failed for her entirely. Make capture robust and, when it can't hear, **say so and offer a fallback** instead of failing silently:
- **Mic permission:** if the mic permission isn't granted, the first press must **trigger the browser permission prompt** and show a clear inline state ("Allow mic access to talk, or type below"). If denied/blocked, show that plainly with a one-tap path to typing. Never appear to listen while actually having no stream.
- **Reliable capture:** use the pre-warmed MediaRecorder→server transcribe path (P156); confirm the live input meter actually moves on her voice (if the meter is flat, the stream isn't live — surface that). On empty/failed transcription, show **"I didn't catch that — try again or type it"**, not silence.
- **Always-available typing fallback:** the "Type to the assistant" field stays obvious so a user whose mic won't work is never stuck (this is how she should have been able to report her issue).
- If feasible, a quick **mic check** affordance in the voice zone ("tap to test your mic") so a new user can confirm it's working.

### 3. Still blocking the screen; couldn't minimize (reinforces P166)
She couldn't get the window out of the way. P166 (compact side-dock default + position-awareness) is the core fix; additionally:
- **Minimize must be obvious and must work:** a clearly-labeled minimize/collapse control that reliably shrinks the window to the small "Assistant" pill, leaving the content fully visible, with an equally obvious way to reopen. Verify the collapse actually frees the screen (no leftover full-size overlay).
- On first welcome (P167), default to the **compact docked** form so a new user is never confronted with a near-fullscreen panel they must figure out how to shrink.

### Acceptance
When the assistant answers (including a formulated-question result), the reply is **immediately visible where the user is acting** — newest content auto-revealed next to the input, never stranded at the top requiring a scroll. Voice input either works or **clearly tells the user why not** (permission prompt, "I didn't catch that", visible meter) with an always-obvious **typing fallback** — no silent failure. The window can be **reliably minimized/docked** to free the screen (P166), and new users start in the compact docked form.

## P169 — Mobile / Android phone: the assistant must be a collapsible bottom sheet, with touch push-to-talk and a visible content area (the tester is on an Android phone)

**Frontend only. No backend change.** Tester sundaij2@gmail.com is on an **Android phone**, which reframes her three issues (P168): on a phone a floating panel is the *whole screen*, push-to-talk needs **touch** events, and mobile mic/autoplay permissions behave differently. Make the assistant genuinely mobile-first. (This recasts P166/P168 for phones; desktop behavior from those stays.)

### 1. On phone widths, the assistant is a bottom sheet — never a full-screen floating panel
- Detect phone width (and touch) and render the assistant as a **bottom sheet**, not the desktop floating window. Default to a **partial "peek" height** (about 40–55% of the screen) so the **content above it stays visible** — the user can see their matches/page while the assistant is open. This is the fix for "blocking too much of the screen."
- **Drag the sheet handle up/down** to expand to near-full or collapse. A collapsed state leaves a small, obvious **floating assistant bubble/FAB** (and/or a slim bar) to reopen — this is the mobile "minimize" she couldn't find. Minimize must be a **big, obvious touch target**, not a tiny desktop icon.
- Honor safe-area insets (notch/home bar), no horizontal overflow, full-width sheet with rounded top. The P166 "never cover the content center" rule becomes "never occupy the whole phone screen by default."

### 2. Touch push-to-talk that actually captures on Android Chrome
"Couldn't hear her" is most likely mobile input wiring:
- Wire the hold-mic to **touch/pointer events** (`pointerdown`/`pointerup`, `touchstart`/`touchend`) — not just `mousedown` — and call `preventDefault` so holding doesn't select text or scroll the sheet. Also offer **tap-to-toggle** record (hold-to-talk is awkward one-handed on a phone).
- **Request mic permission on the first tap** (Android requires a user gesture); show a clear inline state if it's not granted or is blocked, with a one-tap path to typing. Never appear to listen with no stream — the **input meter must visibly move**; if it's flat, say the mic isn't being heard.
- Use the pre-warmed MediaRecorder→server transcribe path (P156); on empty/failed capture show **"I didn't catch that — try again or type it"**. Keep the **"Type to the assistant" field always visible** so she can report issues by typing when voice fails.
- Respect mobile **autoplay rules**: unlock audio output on the same first tap so TTS can play (P150's unlock-in-the-gesture), or the voice stays silent on mobile.

### 3. Mobile response placement + connect path
- The newest answer **auto-scrolls into view inside the sheet** right above the input (P168 §1) — on a small screen she must never scroll up past the input to find the reply.
- The P167 **"Connect a job board" CTA is a full-width, unmissable button** in the sheet and in the empty state, sized for touch — the first thing a new mobile user sees.
- All controls are **≥44px touch targets**, no hover-only affordances, and the transport/mic/mute (P161) stay pinned and reachable one-handed.

### Acceptance
On an Android phone, opening the assistant shows a **bottom sheet at partial height with the page content still visible above it**, draggable to expand and collapsible to an obvious floating bubble (the mobile minimize). **Push-to-talk works via touch** (plus tap-to-toggle), requests mic permission on first tap, shows a moving input meter, and falls back to an always-visible typing field with a clear "couldn't hear" message — no silent failure. TTS audio unlocks on the first gesture. The newest answer auto-reveals above the input, and the **"Connect a job board" CTA is a full-width touch button**. No part of the UI requires hover or a desktop-size click target.

## P170 — URGENT HOTFIX: the whole dashboard is crashing on "connectionsKnown" (undefined) after the latest publish

**Frontend only. No backend change. TOP PRIORITY — the app is down.** Verified live (signed-in, `hlrtlg.readdy.co`): **every authenticated page crashes to the error boundary** with:

> **Cannot read properties of undefined (reading 'connectionsKnown')** — at `index-CnMGBNrC.js`

Confirmed on **both `/dashboard` and `/dashboard/matches`**, reproducible (Try again does not recover), and the assistant never mounts (`.hw-glass` absent) because the page dies first. This appeared **after the latest publish** (the new-user / connection-detection work, P167). The code reads `.connectionsKnown` off an **undefined** object — which is exactly the state a **brand-new / not-yet-connected user has**, so this likely also explains the tester's experience.

### Fix
- Find the read of **`connectionsKnown`** (introduced with the new-user/"is the user connected" detection, P167) and **guard it**: it's being accessed on an object that is `undefined` (the connections/profile/setup state before it loads, or for a user who has no connections). Use optional chaining + a safe default, e.g. `state?.connectionsKnown ?? false` / `(connections ?? {}).connectionsKnown`, and treat **undefined as "new / not connected yet"** (show the welcome + Connect CTA, P167) rather than throwing.
- **Default the whole new-user detection to null-safe:** any field it reads (connections known, source linked, intro seen, setup state) must tolerate `undefined`/not-loaded and fall back to the new-user path — never crash. While the data is still loading, render a normal/empty state, not an exception.
- This runs in a **shared layout/provider** (it's on every dashboard page), so an unguarded read takes down the entire app — wrap the detection so a failure there can **never** blank the page (and the error boundary should degrade to the app, not a full stop).

### Acceptance
`/dashboard` and `/dashboard/matches` **load without the error boundary** for a signed-in user, including a brand-new/not-yet-connected user whose connection state is undefined (they see the P167 welcome + Connect CTA, not a crash). No `connectionsKnown` (or related undefined-read) exception appears in the console. The assistant (`.hw-glass`) mounts again. Re-verify on the live published site.
