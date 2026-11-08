# Rich-text (word-processor) editing — Option B backend task

**Goal:** let the user edit a résumé / cover letter like a word processor — type anywhere, and apply **per-word** formatting (bold/italic/underline, font family, font size, text color, alignment, line spacing, lists, headings, links). This needs a rich **content layer** the current Markdown-only storage can't hold, **without breaking** the AI tailoring / ATS / review pipeline, which must keep operating on clean text.

Audited against the live code 2026-11-08.

## Current state (what we build on)
- A document's text lives in `DocumentVersion.content` (Markdown) and the doc's active text (`Resume.rendered_text` / `CoverLetter.content`). `models/document.py`.
- Export: `docpreview.build_docx(text, …)` / `build_pdf(text, …)` render **Markdown → .docx/.pdf**. `docpreview.py:338,403`.
- Upload: `textextract.py` extracts text; the frontend also renders the **Original** faithfully via mammoth (P94).
- AI/ATS/review (`resume_assistant.py`, matching, `review_cover_letter`, the new salutation check) all read **plain text**.
- Save path: `POST /api/v1/{resumes|cover-letters}/{id}/versions { content }`.

## Design — add a rich layer, keep text as the source of truth for AI

### 1. Storage (additive, back-compatible)
Add to `DocumentVersion` (and mirror on the document for the active version):
- `content_html: str = ""` — sanitized rich HTML (the editable, formatted body). Empty ⇒ this is a legacy Markdown-only version; render/export exactly as today.
- Keep `content: str` as the **plain-text / Markdown projection** — the single source of truth for AI, ATS, matching, review, and search.
- No destructive migration: existing versions keep working (`content_html == ""` → old path).

### 2. The text projection is derived server-side (critical)
On every save that includes `content_html`, the **backend derives `content`** from the HTML (strip tags → normalized text / light Markdown: headings, bold, bullets). The client never has to send two bodies, and **the AI pipeline is guaranteed to see clean text** that matches what the user sees. One function: `html_to_text(content_html) -> str`. The AI, ATS score, review, and salutation check all continue to read `content` unchanged.

### 3. Sanitization (security — required)
`content_html` is rendered back into the app, so it is **stored HTML from the user → sanitize on save** to prevent stored XSS. Allowlist only the subset the editor emits:
- Tags: `p, br, h1, h2, h3, strong, b, em, i, u, s, ul, ol, li, a, span, blockquote`.
- Attrs: `a[href]` (http/https/mailto only), `style` limited to `color, background-color, font-family, font-size, text-align, line-height, font-weight, font-style, text-decoration`.
- Strip everything else (`script`, `style` tags, event handlers, `data:`/`javascript:` URLs, images unless we opt in). Use `bleach` (allowlist sanitizer) or an equivalent; add as a dependency in the `documents` extra.

### 4. Export renders from the rich HTML
`build_docx` / `build_pdf` gain an HTML path: when `content_html` is present, render **HTML subset → .docx/.pdf** preserving the formatting; otherwise fall back to the current Markdown path.
- **.docx:** a focused mapper over the known subset using `python-docx` — paragraphs (alignment, line spacing, space-after), runs (`bold/italic/underline/strike`, `font.name`, `font.size`, `font.color`), headings (h1–h3 → styles), `ul/ol` → list paragraphs, `a` → hyperlink. Because **we control the editor's output**, the subset is small and a hand-mapper is reliable (preferred over a heavyweight converter). `htmldocx` is an acceptable alternative if we'd rather not hand-roll.
- **.pdf:** either FPDF2 `write_html` over the subset, or (higher fidelity, later) a headless renderer. Keep the Markdown fallback meanwhile.
- `export.docx` / `export.pdf` / the Drive "Open in Google Docs" (which takes `build_docx` bytes) all benefit automatically.

### 5. Upload seeds a rich, editable Working copy (ties into P94)
On `.docx` upload, convert to the sanitized HTML subset (server-side, or accept the client's mammoth HTML and sanitize it) and store it as the **Original** version's `content_html`, so the Working copy opens **already formatted** like the uploaded file — not a flattened text block. `.pdf`/`.txt` seed `content_html=""` (text path) as today; the faithful Original view (P94) still shows the exact file.

### 6. Endpoints
- `POST /{resumes|cover-letters}/{id}/versions` accepts an optional `content_html`; when present, backend sanitizes it, derives `content`, and saves both on the new version (and active doc).
- `GET /{…}/{id}` and the version render endpoints return `content_html` so the editor can load the formatted body; `content` remains for callers that want text.
- Export endpoints unchanged in shape; they just render from `content_html` when set.

## Acceptance (backend)
- Saving a version with `content_html` persists sanitized HTML **and** a derived plain-text `content`; the AI/ATS/review pipeline reads the derived text and behaves exactly as before.
- Malicious HTML (`<script>`, `onerror=`, `javascript:` links) is stripped on save (tests).
- `export.docx` of a rich version reproduces bold/italic/underline, font family/size, color, alignment, spacing, lists and headings; a legacy Markdown-only version still exports via the old path (tests for both).
- `.docx` upload seeds `content_html` so the Working copy opens formatted; `.pdf`/`.txt` keep the text path; the Original view is unaffected.
- All existing document tests stay green; new tests cover html_to_text, sanitization, the docx mapper, and back-compat.

## Open decisions for sign-off
1. **.docx exporter:** hand-mapped subset (recommended, no heavy dep) vs `htmldocx`.
2. **.pdf fidelity now vs later:** FPDF2 `write_html` subset now, or keep Markdown PDF until a headless renderer is added.
3. **Per-word color/highlight:** include from v1 (allowlist already covers it) — confirm we want colored text in a résumé/cover letter at all, or restrict to font/size/weight for a cleaner, ATS-safe document.
