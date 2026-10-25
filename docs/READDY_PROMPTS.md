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
