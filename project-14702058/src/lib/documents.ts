import { api, apiBlob, apiUpload, ApiError } from "./api";
import { mockTailorResult } from "@/mocks/tailor";
import { mockCoverLetterTailorResult } from "@/mocks/coverLetterTailor";
import { mockStructuredResume } from "@/mocks/structuredResume";
import { mockStructuredImprovement } from "@/mocks/structuredImprovement";
import { mockCoverLetterImprovement } from "@/mocks/coverLetterImprovement";
import { mockRephraseOptions } from "@/mocks/rephrase";
import { evidencePromptsMock } from "@/mocks/evidence";
import { resumeTemplatesMock } from "@/mocks/resumeTemplates";
import { buildCoverLetterStructured } from "./coverLetterTemplate";
import { normalizeResume, type JsonResume } from "./jsonResume";
import { parseResumeMarkdown } from "./resumeMarkdown";
import { resumeToMarkdown } from "@/pages/dashboard/documents/templates/resumeFields";
import { markdownToHtml } from "@/pages/dashboard/documents/templates/markdownDocument";
import type { CoverLetterStructured } from "./coverLetterTemplate";
import {
  mockDocumentsResumes,
  mockDocumentsCoverLetters,
  mockDocumentReview,
} from "@/mocks/documents";

// ---------------------------------------------------------------------------
// Preview mode: an in-memory document store + render helpers.
//
// The live app reads and writes every document through the backend API. In a
// real build a 401, a 404, or an unreachable server each surface as a real
// state — this sample store is NEVER substituted for a signed-in user's
// documents. It is used ONLY when a build runs in demo/preview mode
// (__IS_PREVIEW__), where there is no backend at all and the app is clearly a demo.
// ---------------------------------------------------------------------------

let previewResumeCache: Resume[] | null = null;
let previewCoverLetterCache: CoverLetter[] | null = null;

function resumeStore(): Resume[] {
  if (!previewResumeCache) {
    previewResumeCache = (mockDocumentsResumes as unknown as Resume[]).map((r) => ({ ...r }));
  }
  return previewResumeCache;
}

function coverLetterStore(): CoverLetter[] {
  if (!previewCoverLetterCache) {
    previewCoverLetterCache = (mockDocumentsCoverLetters as unknown as CoverLetter[]).map(
      (c) => ({ ...c }),
    );
  }
  return previewCoverLetterCache;
}

/**
 * Serve realistic sample data ONLY in the demo/preview build (where there is no
 * backend at all). In a real build this calls the API and lets every error
 * propagate — a 401 (session expired → sign in), a 404 (deleted / not yours),
 * and a genuine network failure each become their own real state. We never swap
 * a signed-in user's document for sample content.
 */
async function withDemoFallback<T>(
  demo: () => T | Promise<T>,
  run: () => Promise<T>,
): Promise<T> {
  if (__IS_PREVIEW__) return demo();
  return run();
}

/**
 * A single-record GET and a rendered preview should both return quickly. When
 * they don't — e.g. the request stalls on a blocked CORS preflight — we abandon
 * it after this long so the page surfaces a retryable "can't reach the server"
 * state instead of a spinner that never resolves.
 */
const DOC_LOAD_TIMEOUT_MS = 20000;
const PREVIEW_TIMEOUT_MS = 15000;

/**
 * A single version's content fetch and its per-version render should both settle
 * quickly. When one stalls (a blocked CORS preflight, or a backend that accepts
 * the request and never answers), we abandon it after this long so the viewer and
 * the version thumbnails surface a retryable error instead of an endless spinner.
 * The render call is the one that can hang a "Rendering this version…" state, so
 * it must never be allowed to wait indefinitely.
 */
const VERSION_LOAD_TIMEOUT_MS = 15000;

/**
 * The sample résumé for an id. A live backend id (e.g. one remembered from an
 * earlier session) won't be in the sample set, so a clone of the first sample is
 * materialized under that id — the editor still renders and in-memory edits
 * persist for the session.
 */
function resumeOrSample(id: string | number): Resume {
  const store = resumeStore();
  const found = store.find((r) => String(r.id) === String(id));
  if (found) return found;
  const clone: Resume = { ...store[0], id };
  store.push(clone);
  return clone;
}

/** Cover-letter twin of {@link resumeOrSample}. */
function coverLetterOrSample(id: string | number): CoverLetter {
  const store = coverLetterStore();
  const found = store.find((c) => String(c.id) === String(id));
  if (found) return found;
  const clone: CoverLetter = { ...store[0], id };
  store.push(clone);
  return clone;
}

/**
 * Per-version content captured in preview mode, keyed `kind:id:version` — the
 * canonical per-version source of truth. It is NEVER the document's current text.
 */
const previewVersionContent = new Map<string, string>();

function versionContentKey(
  kind: "resume" | "cover-letter",
  id: string | number,
  version: string | number
): string {
  return `${kind}:${id}:${version}`;
}

/**
 * Marker separating a document's body from its trailing saved-notes block
 * (mirrors the editor's `NOTES_MARKER`). Notes are the user's private scratch
 * pad, so they are dropped before ANY render — never shown on the page.
 */
const PREVIEW_NOTES_MARKER = "\n\n<!-- Notes -->\n";

/** Strip a document's trailing saved-notes block so it never renders. */
function stripNotesBlock(text: string): string {
  const idx = text.lastIndexOf(PREVIEW_NOTES_MARKER);
  return idx >= 0 ? text.slice(0, idx) : text;
}

/**
 * A version's OWN captured text in preview mode. The document's `rendered_text`
 * is deliberately NOT consulted here: that is the ACTIVE body and may belong to a
 * different version — reading it is exactly what let a preview show the wrong
 * version. Returns "" when the version has no captured text of its own.
 */
function previewVersionOwnMarkdown(
  kind: "resume" | "cover-letter",
  id: string | number,
  version: string | number
): string {
  const doc = kind === "cover-letter" ? coverLetterOrSample(id) : resumeOrSample(id);
  const meta = (doc.versions ?? []).find((v) => String(v.version) === String(version));
  const stored = previewVersionContent.get(versionContentKey(kind, id, version));
  const own = stored ?? versionEmbeddedText(meta) ?? "";
  // Drop any saved-notes block so it can never leak into the render.
  if (own.trim()) return stripNotesBlock(own);
  // The document's ACTIVE body IS this version's body when this version is the
  // active one — so fall back to it ONLY then. Never for a non-active version:
  // that is exactly the "preview showed the wrong version" bug this guards.
  const active =
    kind === "cover-letter"
      ? (doc as CoverLetter).active_version
      : (doc as Resume).active_version;
  if (String(active) === String(version)) {
    const body =
      kind === "cover-letter"
        ? asStr((doc as CoverLetter).content)
        : asStr((doc as Resume).rendered_text);
    return stripNotesBlock(body);
  }
  return "";
}

/**
 * Canonical markdown for the sample structured résumé, built once. Used ONLY to
 * seed a freshly uploaded / generated preview résumé's own version-1 text — never
 * as a stand-in for a different saved version.
 */
let previewResumeMarkdownCache: string | null = null;
function previewResumeVersionMarkdown(): string {
  if (previewResumeMarkdownCache === null) {
    previewResumeMarkdownCache = resumeToMarkdown(
      normalizeResume(mockStructuredResume as JsonResume)
    );
  }
  return previewResumeMarkdownCache;
}

function previewNow(): string {
  return new Date().toISOString();
}

function nextPreviewId(items: Array<{ id: string | number }>): number {
  return items.reduce((max, it) => Math.max(max, Number(it.id) || 0), 100) + 1;
}

function filterByQuery<T extends { archived?: boolean; flagged?: boolean }>(
  items: T[],
  params?: ListDocumentsQuery,
): T[] {
  if (!params) return items;
  return items.filter((it) => {
    if (params.archived !== undefined && Boolean(it.archived) !== params.archived) return false;
    if (params.flagged !== undefined && Boolean(it.flagged) !== params.flagged) return false;
    return true;
  });
}

/** Deterministic literal find & replace against in-memory text (preview only). */
function previewLiteralReplace(text: string, input: ReplaceTextInput): ReplaceTextResult {
  const find = input.find ?? "";
  const replace = input.replace ?? "";
  const all = input.all ?? true;
  const caseSensitive = input.case_sensitive ?? false;
  if (!find) return { rendered_text: text, count: 0 };
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = all ? (caseSensitive ? "g" : "gi") : caseSensitive ? "" : "i";
  const re = new RegExp(escaped, flags);
  let count = 0;
  const rendered_text = text.replace(re, () => {
    count += 1;
    return replace;
  });
  return { rendered_text, count };
}

const PREVIEW_GENERATED_LETTER =
  "Dear Hiring Team,\n\nI'm excited to apply for this role. Across eight years in product design I've shipped design systems, analytics dashboards, and growth surfaces used by tens of thousands of people.\n\nWhat stood out about your team is the emphasis on craft paired with measurable outcomes — the exact balance I try to strike in my own work. Most recently I built a token-driven design system adopted by six product teams and cut new-screen build time by 38%.\n\nI'd welcome the chance to talk about how I can help.\n\nBest regards,\nJordan Reyes";

/** Shared styled page shell for every rendered-markdown document preview. */
function previewMarkdownDocument(markdown: string): string {
  const body = markdownToHtml(markdown);
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;}body{font-family:Georgia,'Times New Roman',serif;color:#1f2933;margin:0;padding:56px 64px;line-height:1.6;background:#fff;}h1{font-size:28px;margin:0 0 6px;color:#111827;}h2{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#14532d;border-bottom:1px solid #d9e2ec;padding-bottom:6px;margin:24px 0 12px;}h3{font-size:15px;margin:14px 0 4px;color:#111827;}p{font-size:13.5px;margin:0 0 9px;}ul{margin:6px 0 9px;padding-left:20px;}li{font-size:13.5px;margin-bottom:4px;}strong{font-weight:700;}em{font-style:italic;}a{color:#14532d;}.vd-plain{white-space:pre-wrap;font-size:13.5px;}</style></head><body>${body}</body></html>`;
}

/**
 * The résumé's CURRENT body text — its active version's own text (which the live
 * backend keeps as the document body), else its saved `rendered_text`. The
 * trailing saved-notes block is dropped so notes never leak into the render.
 */
function previewResumeBody(id: string | number): string {
  const doc = resumeOrSample(id);
  const own = previewVersionOwnMarkdown("resume", id, doc.active_version ?? "");
  return own.trim() ? own : stripNotesBlock(asStr(doc.rendered_text));
}

/**
 * Build a standalone HTML résumé page from the document's CURRENT text. Rebuilt
 * on every read — so a direct edit OR an AI change repaints the render at once,
 * instead of always serving one static sample for every résumé.
 */
function previewResumeHtml(id: string | number): string {
  return previewMarkdownDocument(previewResumeBody(id));
}

/** Build a standalone HTML cover-letter page from the letter's own text. */
function previewCoverLetterHtml(letter: CoverLetter): string {
  const s = buildCoverLetterStructured(letter.content, {
    date: letter.created_at,
    basics: mockStructuredResume.basics as unknown as JsonResume["basics"],
  });
  const contact = s.contact.join("   ·   ");
  const paragraphs = s.paragraphs.map((p) => `<p>${p}</p>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;}body{font-family:Georgia,'Times New Roman',serif;color:#1f2933;margin:0;padding:64px 72px;line-height:1.7;background:#fff;}.head{border-bottom:2px solid #14532d;padding-bottom:14px;margin-bottom:28px;}h1{font-size:26px;margin:0 0 4px;color:#111827;}.label{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#14532d;font-weight:700;}.contact{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#52606d;margin-top:8px;}.date{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#829ab1;margin-bottom:22px;}p{font-size:14px;margin:0 0 16px;}.salutation{font-size:14px;margin-bottom:16px;}.sign{margin-top:26px;font-size:14px;}</style></head><body><div class="head"><h1>${s.name ?? "Your name"}</h1>${s.label ? `<div class="label">${s.label}</div>` : ""}${contact ? `<div class="contact">${contact}</div>` : ""}</div>${s.date ? `<div class="date">${s.date}</div>` : ""}${s.salutation ? `<div class="salutation">${s.salutation}</div>` : ""}${paragraphs}${s.closing ? `<div class="sign">${s.closing}${s.signature ? `<br>${s.signature}` : ""}</div>` : ""}</body></html>`;
}

/**
 * Build a standalone HTML page for ONE version in the demo/preview build (no
 * backend at all), from the version's OWN captured text — never the document's
 * active body. Returns null when the version carries no text, so callers surface
 * the honest "no content yet" state instead of rendering an empty page.
 *
 * On the live site this is never used: the server returns the version's real
 * `preview.html`. This only keeps the demo build's readable surfaces populated.
 */
function previewVersionHtml(
  kind: "resume" | "cover-letter",
  id: string | number,
  version: string | number
): string | null {
  const markdown = previewVersionOwnMarkdown(kind, id, version);
  if (!markdown.trim()) return null;
  return previewMarkdownDocument(markdown);
}

/**
 * Turn a preview HTML page into a downloadable file. Preview has no
 * server-rendered PDF/DOCX, so exports and downloads hand back the rendered
 * page as an .html file instead of dead-ending on a missing backend.
 */
function previewDownloadHtml(
  html: string,
  filename: string | undefined,
  fallbackName: string
): void {
  const base = (filename ?? fallbackName).replace(/\.(pdf|docx|txt|md|html)$/i, "");
  downloadBlob(new Blob([html], { type: "text/html" }), `${base}.html`);
}


export interface DocumentVersion {
  version: string | number;
  label: string;
  change_summary?: string;
  source?: string;
  job_title?: string;
  created_at?: string;
  /**
   * This VERSION's own design, independent of the document's `template_id`. An
   * empty/absent value means the version INHERITS the document's design. The
   * per-version render resolves version → document → default, so a version can
   * legitimately look different from another (and from the document itself).
   */
  template_id?: string;
  /**
   * Some backends embed a version's full text directly in the list/detail
   * payload (`GET /resumes/{id}`). When present we render the thumbnail straight
   * from it — no separate per-version request that could fail or 404.
   */
  content?: string;
  rendered_text?: string;
  text?: string;
}

/**
 * One saved version's own content, fetched on demand (see
 * {@link getResumeVersion} / {@link getCoverLetterVersion}). The list response
 * carries only version metadata, so the compare view reads each version's text
 * here rather than from a cached copy.
 */
export interface VersionContent {
  version: string | number;
  label?: string;
  change_summary?: string;
  source?: string;
  job_title?: string;
  created_at?: string;
  /** The version's OWN text (its `content`). */
  content: string;
  /**
   * Alternate field names the backend may use for the same own-version text,
   * tolerated so a version preview never comes up blank over a naming difference.
   * The document model's `rendered_text` (its ACTIVE body) is never used here.
   */
  rendered_text?: string;
  text?: string;
}

export interface ReuseResult {
  reuse_recommended: boolean;
  recommendation?: string;
  best_version?: string | number;
  best_label?: string;
  fit?: number;
  covered?: string[];
  missing?: string[];
}

export interface Resume {
  id: string | number;
  title?: string;
  filename?: string;
  original_filename?: string;
  target_role?: string;
  /** The template this résumé is currently rendered on (persisted via "Use this template"). */
  template_id?: string;
  created_at?: string;
  updated_at?: string;
  is_ai_generated?: boolean;
  tone?: string;
  format?: string;
  rendered_text?: string;
  source?: "uploaded" | "generated";
  ats_score?: number;
  approved?: boolean;
  file_url?: string;
  quality_grade?: string;
  quality_score?: number;
  /** User-controlled "needs attention" toggle (set only via the flag action). */
  flagged?: boolean;
  /** User-controlled archive toggle — affects which list the doc appears in only. */
  archived?: boolean;
  /** When the doc was archived (ISO). Used for the "Archived on" label. */
  archived_at?: string;
  versions?: DocumentVersion[];
  active_version?: string | number;
  /**
   * Set once the résumé has been reviewed (ISO). When present the page opens
   * "preview-first" (rendered preview + cached summary) instead of the raw upload.
   * Running POST /resumes/{id}/review is what sets it.
   */
  summarized_at?: string | null;
  /** Cached factual summary from the last review — shown instantly, no re-review. */
  content_summary?: string;
}

export interface GenerateResumeInput {
  job_posting_id: string | number;
  tone: string;
  format: string;
}

export interface CoverLetter {
  id: string | number;
  content: string;
  source?: "uploaded" | "generated";
  original_filename?: string;
  content_type?: string;
  file_url?: string;
  job_posting_id?: string | number;
  resume_id?: string | number;
  /** The template this cover letter is currently rendered on (persisted via "Use this template"). */
  template_id?: string;
  tone?: string;
  created_at?: string;
  generated_at?: string;
  format?: string;
  quality_grade?: string;
  quality_score?: number;
  /** User-controlled "needs attention" toggle (set only via the flag action). */
  flagged?: boolean;
  /** User-controlled archive toggle — affects which list the letter appears in only. */
  archived?: boolean;
  /** When the letter was archived (ISO). Used for the "Archived on" label. */
  archived_at?: string;
  versions?: DocumentVersion[];
  active_version?: string | number;
}

export interface GenerateCoverLetterInput {
  job_posting_id: string | number;
  resume_id?: string | number;
  tone: string;
}

/** True for a non-empty string that isn't a stray "null"/"undefined". */
function hasText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const t = value.trim();
  return t !== "" && t !== "null" && t !== "undefined";
}

/**
 * Coerce any API value to a plain string (no trimming). A field the response
 * types as `string` can still arrive as a number, and every string operation on
 * it (`.trim()`, `.toLowerCase()`, `.slice()`) would then throw and blank the
 * page. Routing render outputs through this makes that impossible — a numeric
 * template id or markdown simply becomes its text form.
 */
function asStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * A saved version's OWN text — the version-scoped `content` (or its `text`
 * alias). The document model's `rendered_text` is deliberately NOT used: that is
 * the ACTIVE body of the document and can differ from the version being viewed,
 * so reading it here is what let a preview show the wrong version. Returns ""
 * only when the version genuinely carries no text of its own, letting callers
 * show an honest empty state instead of a wrong render.
 */
export function versionContentText(
  version: Partial<VersionContent> | null | undefined,
): string {
  if (!version) return "";
  const candidates = [version.content, version.text];
  for (const candidate of candidates) {
    if (hasText(candidate)) return candidate;
  }
  return "";
}

/**
 * A version's OWN text when the backend embedded it in the version record itself
 * (list/detail payload) rather than behind the per-version content endpoint —
 * `content` (or its `text` alias), never the document's `rendered_text`. Returns
 * "" when the version only carries metadata, so callers fall back to a lazy
 * fetch. This is the preferred source — it needs no extra request.
 */
export function versionEmbeddedText(
  version: Partial<DocumentVersion> | null | undefined,
): string {
  if (!version) return "";
  const candidates = [version.content, version.text];
  for (const candidate of candidates) {
    if (hasText(candidate)) return candidate;
  }
  return "";
}

/**
 * Coerce whatever the per-version content endpoint returned into a VersionContent.
 * A live backend has been seen to answer with the text at the top level, wrapped
 * in `{ data: … }`, nested under `{ version: … }`, or as a bare string — all of
 * these are unwrapped here so a version preview never comes up empty over shape.
 */
export function normalizeVersionContent(
  raw: unknown,
  fallbackVersion: string | number,
): VersionContent {
  if (typeof raw === "string") {
    return { version: fallbackVersion, content: raw };
  }
  if (!raw || typeof raw !== "object") {
    return { version: fallbackVersion, content: "" };
  }
  const outer = raw as Record<string, unknown>;
  const nested =
    outer.data && typeof outer.data === "object"
      ? (outer.data as Record<string, unknown>)
      : outer.version && typeof outer.version === "object"
        ? (outer.version as Record<string, unknown>)
        : outer;
  const text = [nested.content, nested.text].find(hasText);
  const str = (key: string): string | undefined =>
    typeof nested[key] === "string" ? (nested[key] as string) : undefined;
  return {
    version: (nested.version as string | number) ?? fallbackVersion,
    label: str("label"),
    change_summary: str("change_summary"),
    source: str("source"),
    job_title: str("job_title"),
    created_at: str("created_at"),
    content: text ?? "",
  };
}

/**
 * A résumé's display title, resilient to null/empty metadata: the original
 * filename (e.g. "Williams, Bayete, IT Director.docx"), else the target role or
 * title, else the filename, else a neutral "Untitled résumé" — never blank and
 * never the literal "null".
 */
export function resolveResumeTitle(res: Resume | null | undefined): string {
  if (!res) return "Untitled résumé";
  const found = [res.original_filename, res.target_role, res.title, res.filename].find(hasText);
  return found ? found.trim() : "Untitled résumé";
}

/** The newest version's own date (a real, parseable timestamp), or null. */
export function latestVersionDate(versions?: DocumentVersion[] | null): string | null {
  let best: { iso: string; ms: number } | null = null;
  for (const v of versions ?? []) {
    const iso = v?.created_at;
    if (!hasText(iso)) continue;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) continue;
    if (!best || ms > best.ms) best = { iso, ms };
  }
  return best ? best.iso : null;
}

/**
 * Resolve the timestamp to display as a document's "updated" time, tolerating a
 * null/absent field: updated_at → the latest version's date → created_at. Returns
 * null when nothing usable exists, so the caller can hide the whole line instead
 * of rendering a broken date.
 */
export function resolveUpdatedAt(res: Resume | null | undefined): string | null {
  if (!res) return null;
  const candidates = [res.updated_at, latestVersionDate(res.versions), res.created_at];
  for (const c of candidates) {
    if (hasText(c)) return c;
  }
  return null;
}

/** Keep only well-formed flagged metrics — drops null/garbage entries the API might return. */
function normalizeFlaggedMetrics(raw: unknown): FlaggedMetric[] {
  if (!Array.isArray(raw)) return [];
  const out: FlaggedMetric[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const value =
      typeof o.value === "string"
        ? o.value
        : typeof o.value === "number"
          ? String(o.value)
          : "";
    const field = typeof o.field === "string" ? o.field : "";
    if (!value && !field) continue;
    out.push({ value, field, text: typeof o.text === "string" ? o.text : undefined });
  }
  return out;
}

/** Normalize a résumé structured-improvement payload: safe arrays + clean figures. */
function normalizeResumeImprovement(res: StructuredImprovement): StructuredImprovement {
  return {
    ...res,
    structured: normalizeResume(res.structured),
    flagged_metrics: normalizeFlaggedMetrics(res.flagged_metrics),
  };
}

/** Normalize any structured response's flagged metrics only (keeps its own doc shape). */
function withCleanFlags<T extends { flagged_metrics?: FlaggedMetric[] }>(res: T): T {
  return { ...res, flagged_metrics: normalizeFlaggedMetrics(res.flagged_metrics) } as T;
}

// ---- AI review / revise (shared) ----

export interface ReviewSuggestion {
  category: string;
  severity: "critical" | "important" | "suggestion" | string;
  title: string;
  detail: string;
}

export interface ReviewRating {
  standard: string;
  score: number;
  grade: string;
  note?: string;
}

export interface ReviewResult {
  score: number;
  grade?: string;
  summary: string;
  content_summary?: string;
  strengths: string[];
  suggestions: ReviewSuggestion[];
  ratings?: ReviewRating[];
  word_count?: number;
  missing_keywords?: string[];
}

export interface ReviseResult {
  instruction: string;
  preview: string;
}

/** A figure the AI added that isn't present in the original résumé — likely invented. */
export interface FlaggedMetric {
  /** The numeric value the AI produced, e.g. "30%". */
  value: string;
  /** JSON path to where it landed, e.g. "work[0].highlights[0]". */
  field: string;
  /** The surrounding sentence, so the user can spot it in context. */
  text?: string;
}

/**
 * Response of `POST /resumes/{id}/improve-structured` — a preview only.
 * Nothing is saved until the returned markdown is posted to `…/versions`.
 */
export interface StructuredImprovement {
  structured: JsonResume;
  markdown: string;
  flagged_metrics: FlaggedMetric[];
}

export interface ImproveStructuredInput {
  /** Selected improvement prompts, applied together in one rewrite. */
  instructions?: string[];
  /** Optional free-text / focused instruction (e.g. "improve the summary"). */
  instruction?: string;
  job_posting_id?: string | number;
  /**
   * The document text exactly as it reads on screen right now — including any
   * bullet points the user has typed but not yet saved. When provided, the AI
   * improves THIS text instead of the last-saved version, so on-screen edits are
   * never ignored. Sending it is a preview only: it does not overwrite the saved
   * document (the existing accept/versions save path is unchanged).
   */
  content?: string;
  /**
   * Specific review findings to target (e.g. the AI Review suggestion titles the
   * user ticked). Omit or leave empty for the default, which already targets the
   * whole review.
   */
  focus_points?: string[];
}

/**
 * Response of `POST /cover-letters/{id}/improve-structured` — a preview only.
 * `structured` is the same shape the cover-letter templates render, so the
 * improvement renders through the chosen layout. Nothing is saved until the
 * returned markdown is posted to `…/versions`.
 */
export interface CoverLetterStructuredImprovement {
  structured: CoverLetterStructured;
  markdown: string;
  flagged_metrics: FlaggedMetric[];
}

export interface TailorChange {
  title: string;
  detail: string;
  severity: "critical" | "important" | "suggestion" | string;
  category?: string;
}

/** The job a document was tailored against, as returned inside a tailor response. */
export interface TailorJob {
  title: string;
  company: string;
  company_logo?: string;
  salary_display?: string;
  source_display?: string;
  source_platform?: string;
  url?: string;
}

export interface TailorResult {
  fit_score: number;
  matching_skills: string[];
  missing_keywords: string[];
  qualifications: string;
  summary: string;
  tailoring: TailorChange[];
  job?: TailorJob;
  resume_id?: string | number;
}

export interface CoverLetterTailorResult {
  fit_score: number;
  addressed: string[];
  missing_points: string[];
  qualifications: string;
  summary: string;
  tailoring: TailorChange[];
  job?: TailorJob;
}

/**
 * Map a tailor/revise API failure to a plain-language message.
 * 404 on tailor = the job_posting_id is bad/removed; 502 = the AI service is busy.
 */
export function tailorErrorMessage(err: unknown, kind = "document"): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return "That job posting couldn't be found — it may have been removed. Pick another job and try again.";
    }
    if (err.status === 502) {
      return "The AI service is busy right now. Your document is unchanged — please try again in a moment.";
    }
    return err.message;
  }
  return `Could not tailor this ${kind} to that job.`;
}

/**
 * Every AI call (edit / improve / incorporate / review / revise / tailor /
 * rephrase) is abandoned after this long, so a slow or stalled model can never
 * leave a spinner running forever. On timeout the shared wrapper throws a
 * retryable `ApiError` (status 0, `timedOut: true`) that the UI renders as an
 * inline error + Retry — never an infinite spinner.
 */
export const AI_TIMEOUT_MS = 45000;
/**
 * The deterministic review score (no narrative) returns effectively instantly,
 * so it gets a much tighter leash — a slow score should surface as a retry, not
 * hold the page's first paint hostage.
 */
export const REVIEW_SCORE_TIMEOUT_MS = 15000;

/** Build the `?job_posting_id=` suffix the review GET endpoints accept. */
function reviewJobQuery(jobPostingId?: string | number): string {
  return jobPostingId ? `job_posting_id=${encodeURIComponent(String(jobPostingId))}` : "";
}

/**
 * The FAST, deterministic half of the AI review: score, grade, ratings, and the
 * missing-keyword/suggestion skeleton — everything the backend can compute
 * WITHOUT the LLM (`GET /resumes/{id}/review?narrative=false`). It returns
 * almost immediately, so the editor can show the score the moment a résumé
 * opens while the narrative is fetched separately in the background.
 */
export function getResumeReviewScore(id: string | number, job_posting_id?: string | number) {
  const q = reviewJobQuery(job_posting_id);
  return withDemoFallback(
    () => ({ ...(mockDocumentReview as unknown as ReviewResult) }),
    () =>
      api<ReviewResult>(
        `/api/v1/resumes/${id}/review?narrative=false${q ? `&${q}` : ""}`,
        { method: "GET", timeoutMs: REVIEW_SCORE_TIMEOUT_MS },
      ),
  );
}

/**
 * The SLOW half of the AI review: the narrative assessment / content summary the
 * LLM writes (`GET /resumes/{id}/review`, narrative included). Fetched in the
 * background AFTER the deterministic score is already on screen, then swapped in
 * when it lands — a slow or failed narrative never blocks or freezes the page.
 */
export function getResumeReviewNarrative(id: string | number, job_posting_id?: string | number) {
  const q = reviewJobQuery(job_posting_id);
  return withDemoFallback(
    () => ({ ...(mockDocumentReview as unknown as ReviewResult) }),
    () =>
      api<ReviewResult>(`/api/v1/resumes/${id}/review${q ? `?${q}` : ""}`, {
        method: "GET",
        timeoutMs: AI_TIMEOUT_MS,
      }),
  );
}

/**
 * Legacy single-call review (full result in one POST). Kept for callers that
 * genuinely want the whole object at once; the editor uses the two-phase
 * {@link getResumeReviewScore} + {@link getResumeReviewNarrative} pair instead so
 * the deterministic score is never held back by the LLM narrative.
 */
export function reviewResume(id: string | number, job_posting_id?: string | number) {
  return withDemoFallback(
    () => ({ ...(mockDocumentReview as unknown as ReviewResult) }),
    () =>
      api<ReviewResult>(`/api/v1/resumes/${id}/review`, {
        method: "POST",
        body: job_posting_id ? { job_posting_id } : {},
        timeoutMs: AI_TIMEOUT_MS,
      }),
  );
}

export interface ReviseInput {
  /** Selected improvement prompts, applied together in one rewrite. */
  instructions?: string[];
  /** Optional free-text custom instruction. */
  instruction?: string;
  /**
   * The document text exactly as it reads on screen right now — including any
   * edits the user has typed but not yet saved. When provided, the AI improves
   * THIS text instead of the last-saved version, so on-screen edits are never
   * ignored.
   */
  content?: string;
  job_posting_id?: string | number;
  /** Specific review findings to target (the AI Review suggestion titles ticked). */
  focus_points?: string[];
}

/**
 * Normalize revise input to the API body. Accepts the modern object form
 * (`{ instructions, instruction, job_posting_id }`) plus the legacy string /
 * string[] form so other callers keep working.
 */
function normalizeReviseInput(
  input: ReviseInput | string | string[],
  jobPostingId?: string | number
): Record<string, unknown> {
  if (typeof input === "string") {
    return {
      instructions: [input],
      instruction: input,
      ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
    };
  }
  if (Array.isArray(input)) {
    return {
      instructions: input,
      instruction: input.join("\n"),
      ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
    };
  }
  return {
    instructions: input.instructions ?? [],
    instruction: input.instruction ?? "",
    ...(input.content ? { content: input.content } : {}),
    ...(input.job_posting_id ? { job_posting_id: input.job_posting_id } : {}),
    ...(input.focus_points && input.focus_points.length
      ? { focus_points: input.focus_points }
      : {}),
  };
}

export function reviseResume(
  id: string | number,
  input: ReviseInput | string | string[],
  job_posting_id?: string | number
) {
  return withDemoFallback(
    () =>
      ({
        instruction: String(normalizeReviseInput(input, job_posting_id).instruction ?? ""),
        preview: mockStructuredImprovement.markdown,
      }) as ReviseResult,
    () =>
      api<ReviseResult>(`/api/v1/resumes/${id}/revise`, {
        method: "POST",
        body: normalizeReviseInput(input, job_posting_id),
        timeoutMs: AI_TIMEOUT_MS,
      }),
  );
}

export function tailorResume(id: string | number, job_posting_id: string | number) {
  return withDemoFallback(
    () => mockTailorResult as TailorResult,
    () =>
      api<TailorResult>(`/api/v1/resumes/${id}/tailor`, {
        method: "POST",
        body: { job_posting_id },
        timeoutMs: AI_TIMEOUT_MS,
      }),
  );
}

export function tailorCoverLetter(id: string | number, job_posting_id: string | number) {
  return withDemoFallback(
    () => mockCoverLetterTailorResult as CoverLetterTailorResult,
    () =>
      api<CoverLetterTailorResult>(`/api/v1/cover-letters/${id}/tailor`, {
        method: "POST",
        body: { job_posting_id },
        timeoutMs: AI_TIMEOUT_MS,
      }),
  );
}

/** Cover-letter twin of {@link getResumeReviewScore} — the instant deterministic review. */
export function getCoverLetterReviewScore(id: string | number, job_posting_id?: string | number) {
  const q = reviewJobQuery(job_posting_id);
  return withDemoFallback(
    () => ({ ...(mockDocumentReview as unknown as ReviewResult) }),
    () =>
      api<ReviewResult>(
        `/api/v1/cover-letters/${id}/review?narrative=false${q ? `&${q}` : ""}`,
        { method: "GET", timeoutMs: REVIEW_SCORE_TIMEOUT_MS },
      ),
  );
}

/** Cover-letter twin of {@link getResumeReviewNarrative} — the background narrative. */
export function getCoverLetterReviewNarrative(
  id: string | number,
  job_posting_id?: string | number,
) {
  const q = reviewJobQuery(job_posting_id);
  return withDemoFallback(
    () => ({ ...(mockDocumentReview as unknown as ReviewResult) }),
    () =>
      api<ReviewResult>(`/api/v1/cover-letters/${id}/review${q ? `?${q}` : ""}`, {
        method: "GET",
        timeoutMs: AI_TIMEOUT_MS,
      }),
  );
}

/** Legacy single-call cover-letter review (full result in one POST). */
export function reviewCoverLetter(id: string | number, job_posting_id?: string | number) {
  return withDemoFallback(
    () => ({ ...(mockDocumentReview as unknown as ReviewResult) }),
    () =>
      api<ReviewResult>(`/api/v1/cover-letters/${id}/review`, {
        method: "POST",
        body: job_posting_id ? { job_posting_id } : {},
        timeoutMs: AI_TIMEOUT_MS,
      }),
  );
}

export function reviseCoverLetter(
  id: string | number,
  input: ReviseInput | string | string[],
  job_posting_id?: string | number
) {
  return withDemoFallback(
    () =>
      ({
        instruction: String(normalizeReviseInput(input, job_posting_id).instruction ?? ""),
        preview: mockCoverLetterImprovement.markdown,
      }) as ReviseResult,
    () =>
      api<ReviseResult>(`/api/v1/cover-letters/${id}/revise`, {
        method: "POST",
        body: normalizeReviseInput(input, job_posting_id),
        timeoutMs: AI_TIMEOUT_MS,
      }),
  );
}

// ---- Inline rephrase (document-agnostic) ----
//
// A single text surface: select any span (word / sentence / paragraph) in the
// rendered document and ask the AI to rephrase it. The endpoint is
// document-agnostic — the caller just passes the selected text, so this works
// identically for résumés and cover letters.

export type RephraseMode = "word" | "sentence" | "paragraph";

export interface RephraseInput {
  /** The exact selected span to rephrase. */
  text: string;
  /** Inferred from the selection: a single token, one sentence, or a paragraph. */
  mode: RephraseMode;
  /** A preset (e.g. "Concise") or the user's free-text instruction. */
  instruction?: string;
  /** ~1–2 sentences of surrounding text so the rephrase fits (never rephrased). */
  context?: string;
  /** How many suggestions to return. */
  count?: number;
}

/** One rephrase suggestion. `flagged_metrics` lists any invented figures in it. */
export interface RephraseOption {
  text: string;
  flagged_metrics: FlaggedMetric[];
}

export interface RephraseResult {
  options: RephraseOption[];
}

/**
 * Normalize the rephrase response into a stable options list. Tolerates the
 * likely response shapes (`options` / `suggestions` / `variants` of strings or
 * objects, with metrics attached per-option or at the top level).
 */
function normalizeRephraseList(raw: unknown, topFlags: FlaggedMetric[]): RephraseOption[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const candidate = obj.options ?? obj.suggestions ?? obj.variants ?? obj.results;
    if (Array.isArray(candidate)) list = candidate;
  }
  const out: RephraseOption[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      const text = item.trim();
      if (text) out.push({ text, flagged_metrics: [] });
      continue;
    }
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const rawText =
        typeof obj.text === "string"
          ? obj.text
          : typeof obj.replacement === "string"
            ? obj.replacement
            : typeof obj.value === "string"
              ? obj.value
              : "";
      const text = rawText.trim();
      if (!text) continue;
      const flags = Array.isArray(obj.flagged_metrics)
        ? (obj.flagged_metrics as FlaggedMetric[])
        : [];
      out.push({ text, flagged_metrics: flags });
    }
  }
  // If the API flagged figures only at the top level, attribute each to any
  // option that actually contains it — so the guardrail still fires.
  if (topFlags.length) {
    for (const opt of out) {
      if (opt.flagged_metrics.length) continue;
      const matched = topFlags.filter((f) => f.value && opt.text.includes(f.value));
      if (matched.length) opt.flagged_metrics = matched;
    }
  }
  return out;
}

/**
 * Ask the AI to rephrase a selected span. Works for any document — just pass the
 * selected text plus a little surrounding context.
 */
export async function rephraseDocument(input: RephraseInput): Promise<RephraseResult> {
  const demo = () => ({ options: mockRephraseOptions.map((o) => ({ ...o })) });
  if (__IS_PREVIEW__) return demo();
  const res = await api<unknown>("/api/v1/documents/rephrase", {
    method: "POST",
    body: {
      text: input.text,
      mode: input.mode,
      ...(input.instruction ? { instruction: input.instruction } : {}),
      ...(input.context ? { context: input.context } : {}),
      count: input.count ?? 3,
    },
    timeoutMs: AI_TIMEOUT_MS,
  });
  const raw = (res ?? {}) as Record<string, unknown>;
  const topFlags = Array.isArray(raw.flagged_metrics)
    ? (raw.flagged_metrics as FlaggedMetric[])
    : [];
  const options = normalizeRephraseList(
    raw.options ?? raw.suggestions ?? raw.variants ?? raw,
    topFlags
  );
  return { options };
}

/** Retry a preview fetch with backoff — preview generation is often async right after upload. */
export async function fetchPreviewWithRetry(
  fetchPreview: () => Promise<string | null>,
  attempts = 3
): Promise<string | null> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const url = await fetchPreview();
      if (url) return url;
    } catch {
      // Ignore individual failures and retry — preview generation may be async.
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 700 * (i + 1)));
    }
  }
  return null;
}

/** Fetch an auth-scoped file endpoint and return an object URL (for PDF `<iframe>` etc). */
export async function getResumeFileUrl(id: string | number): Promise<string> {
  if (__IS_PREVIEW__) {
    return URL.createObjectURL(new Blob([previewResumeHtml(id)], { type: "text/html" }));
  }
  const blob = await apiBlob(`/api/v1/resumes/${id}/file`);
  return URL.createObjectURL(blob);
}

/** Fetch the rendered document preview image; returns null when there's no readable text (404). */
export async function getResumePreviewUrl(id: string | number): Promise<string | null> {
  if (__IS_PREVIEW__) return null;
  try {
    const blob = await apiBlob(`/api/v1/resumes/${id}/preview.png?scale=2`, {
      timeoutMs: PREVIEW_TIMEOUT_MS,
    });
    return URL.createObjectURL(blob);
  } catch (err) {
    // 404 = there's no readable text to render — not an error the user must fix.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Fetch the rendered HTML preview for the in-iframe viewer; returns null on 404 (no readable text). */
export async function getResumePreviewHtml(id: string | number): Promise<string | null> {
  if (__IS_PREVIEW__) return previewResumeHtml(id);
  try {
    const blob = await apiBlob(`/api/v1/resumes/${id}/preview.html`, {
      timeoutMs: PREVIEW_TIMEOUT_MS,
    });
    return await blob.text();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getCoverLetterFileUrl(id: string | number): Promise<string> {
  if (__IS_PREVIEW__) {
    return URL.createObjectURL(
      new Blob([previewCoverLetterHtml(coverLetterOrSample(id))], { type: "text/html" })
    );
  }
  const blob = await apiBlob(`/api/v1/cover-letters/${id}/file`);
  return URL.createObjectURL(blob);
}

/** Fetch the rendered cover letter preview image; returns null when there's no readable text (404). */
export async function getCoverLetterPreviewUrl(id: string | number): Promise<string | null> {
  if (__IS_PREVIEW__) return null;
  try {
    const blob = await apiBlob(`/api/v1/cover-letters/${id}/preview.png?scale=2`, {
      timeoutMs: PREVIEW_TIMEOUT_MS,
    });
    return URL.createObjectURL(blob);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Fetch the rendered cover letter HTML preview for the in-iframe viewer; returns null on 404 (no readable text). */
export async function getCoverLetterPreviewHtml(id: string | number): Promise<string | null> {
  if (__IS_PREVIEW__) return previewCoverLetterHtml(coverLetterOrSample(id));
  try {
    const blob = await apiBlob(`/api/v1/cover-letters/${id}/preview.html`, {
      timeoutMs: PREVIEW_TIMEOUT_MS,
    });
    return await blob.text();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Fetch ONE saved VERSION's rendered PAGE IMAGE, auth-scoped
 * (`GET /resumes/{id}/versions/{version}/preview.png?scale=1|2`). Returns an
 * object URL the caller must revoke, or null when the version has no readable
 * text (404).
 *
 * This is the lightweight source every version THUMBNAIL paints from — a single
 * rasterised page per card instead of the version's full document DOM — so a
 * strip of many versions never mounts a dozen résumés at once (which pegged the
 * main thread). `scale=1` for the small thumbnail, `scale=2` for the hover bubble
 * and the full-size readable view.
 */
export async function getResumeVersionPreviewUrl(
  id: string | number,
  version: string | number,
  scale: 1 | 2 = 1
): Promise<string | null> {
  if (__IS_PREVIEW__) return null;
  try {
    const blob = await apiBlob(
      `/api/v1/resumes/${id}/versions/${version}/preview.png?scale=${scale}`,
      { timeoutMs: PREVIEW_TIMEOUT_MS }
    );
    return URL.createObjectURL(blob);
  } catch (err) {
    // 404 = there's no readable text to render — not an error the user must fix.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Cover-letter twin of {@link getResumeVersionPreviewUrl}. */
export async function getCoverLetterVersionPreviewUrl(
  id: string | number,
  version: string | number,
  scale: 1 | 2 = 1
): Promise<string | null> {
  if (__IS_PREVIEW__) return null;
  try {
    const blob = await apiBlob(
      `/api/v1/cover-letters/${id}/versions/${version}/preview.png?scale=${scale}`,
      { timeoutMs: PREVIEW_TIMEOUT_MS }
    );
    return URL.createObjectURL(blob);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Fetch ONE saved VERSION's rendered HTML page, auth-scoped
 * (`GET /resumes/{id}/versions/{version}/preview.html`). Returns the HTML source
 * string, or null when the version has no readable text (404).
 *
 * This is the crisp, reflowable, selectable-text source behind the MAIN document
 * viewer and the full-size "Read full size" lightbox — the readable surfaces,
 * as opposed to the lightweight rasterised page IMAGES the marquee thumbnails
 * paint from. The HTML is rendered client-side inside a styled, scaled iframe so
 * it stays sharp at any size and its text can be selected and copied.
 */
export async function getResumeVersionPreviewHtml(
  id: string | number,
  version: string | number
): Promise<string | null> {
  if (__IS_PREVIEW__) return previewVersionHtml("resume", id, version);
  try {
    const blob = await apiBlob(
      `/api/v1/resumes/${id}/versions/${version}/preview.html`,
      { timeoutMs: PREVIEW_TIMEOUT_MS }
    );
    return await blob.text();
  } catch (err) {
    // 404 = there's no readable text to render — not an error the user must fix.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Cover-letter twin of {@link getResumeVersionPreviewHtml}. */
export async function getCoverLetterVersionPreviewHtml(
  id: string | number,
  version: string | number
): Promise<string | null> {
  if (__IS_PREVIEW__) return previewVersionHtml("cover-letter", id, version);
  try {
    const blob = await apiBlob(
      `/api/v1/cover-letters/${id}/versions/${version}/preview.html`,
      { timeoutMs: PREVIEW_TIMEOUT_MS }
    );
    return await blob.text();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// ---- Resumes ----

/** Query params supported by both document list endpoints. */
export interface ListDocumentsQuery {
  /** true = archived only, false = hide archived. Omit for no archive filter. */
  archived?: boolean;
  /** true = flagged (needs attention) only. Omit for no flag filter. */
  flagged?: boolean;
}

function listQuery(params?: ListDocumentsQuery): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.archived !== undefined) sp.set("archived", String(params.archived));
  if (params.flagged !== undefined) sp.set("flagged", String(params.flagged));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function uploadResume(file: File, fields?: { target_role?: string }) {
  const demo = () => {
    const store = resumeStore();
    const created: Resume = {
      id: nextPreviewId(store),
      original_filename: file.name,
      target_role: fields?.target_role,
      source: "uploaded",
      template_id: "modern",
      created_at: previewNow(),
      updated_at: previewNow(),
      quality_grade: "B",
      quality_score: 80,
      flagged: false,
      archived: false,
      active_version: 1,
      versions: [
        {
          version: 1,
          label: "Original upload",
          source: "uploaded",
          created_at: previewNow(),
          content: previewResumeVersionMarkdown(),
        },
      ],
    };
    store.unshift(created);
    return created;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  const form = new FormData();
  form.append("file", file);
  if (fields?.target_role) form.append("target_role", fields.target_role);
  return apiUpload<Resume>("/api/v1/resumes/upload", form);
}

export function listResumes(params?: ListDocumentsQuery) {
  return withDemoFallback(
    () => filterByQuery(resumeStore(), params),
    () => api<Resume[]>(`/api/v1/resumes${listQuery(params)}`, { timeoutMs: DOC_LOAD_TIMEOUT_MS }),
  );
}

export function generateResume(input: GenerateResumeInput) {
  const demo = () => {
    const store = resumeStore();
    const created: Resume = {
      id: nextPreviewId(store),
      original_filename: `Generated-${(input.tone || "Resume").replace(/\s+/g, "-")}.pdf`,
      target_role: "Generated résumé",
      source: "generated",
      template_id: "modern",
      tone: input.tone,
      format: input.format,
      created_at: previewNow(),
      updated_at: previewNow(),
      quality_grade: "B",
      quality_score: 82,
      flagged: false,
      archived: false,
      active_version: 1,
      versions: [
        {
          version: 1,
          label: "Generated",
          source: "generated",
          created_at: previewNow(),
          content: previewResumeVersionMarkdown(),
        },
      ],
    };
    store.unshift(created);
    return created;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<Resume>("/api/v1/resumes/generate", { method: "POST", body: input });
}

export function getResume(id: string | number) {
  return withDemoFallback(
    () => resumeOrSample(id),
    () => api<Resume>(`/api/v1/resumes/${id}`, { timeoutMs: DOC_LOAD_TIMEOUT_MS }),
  );
}

/**
 * Deterministic literal find & replace on a résumé — the reliable path for an
 * exact "replace X with Y" edit. The AI rewrite routinely declines a verbatim
 * swap, so a literal replacement is routed here instead of through improve.
 *
 * The response `{ rendered_text, count }` is the document AFTER the swap:
 * `count` is how many occurrences were replaced. When `count === 0` nothing
 * matched, so the caller must leave the document untouched and tell the user the
 * text they typed wasn't found. A blank `find` is rejected by the API with 400.
 */
export interface ReplaceTextInput {
  /** The literal text to find. */
  find: string;
  /** The literal text to substitute in. */
  replace: string;
  /** Replace every occurrence (default true); false replaces the first only. */
  all?: boolean;
  /** Case-sensitive match (default false). */
  case_sensitive?: boolean;
}

export interface ReplaceTextResult {
  /** The document text after the replacement — the new source of truth. */
  rendered_text: string;
  /** How many occurrences were replaced (0 = no match). */
  count: number;
}

export function replaceResumeText(id: string | number, input: ReplaceTextInput) {
  const demo = () => {
    const resume = resumeOrSample(id);
    const result = previewLiteralReplace(resume.rendered_text ?? "", input);
    resume.rendered_text = result.rendered_text;
    resume.updated_at = previewNow();
    return result;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<ReplaceTextResult>(`/api/v1/resumes/${id}/replace`, {
    method: "POST",
    body: {
      find: input.find,
      replace: input.replace,
      all: input.all ?? true,
      case_sensitive: input.case_sensitive ?? false,
    },
  });
}

/**
 * Cover-letter twin of {@link replaceResumeText}: the exact, deterministic
 * literal swap. Same request/response contract, so a verbatim "replace X with Y"
 * always lands instead of being fed to the AI rewrite.
 */
export function replaceCoverLetterText(id: string | number, input: ReplaceTextInput) {
  const demo = () => {
    const letter = coverLetterOrSample(id);
    const result = previewLiteralReplace(letter.content ?? "", input);
    letter.content = result.rendered_text;
    return result;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<ReplaceTextResult>(`/api/v1/cover-letters/${id}/replace`, {
    method: "POST",
    body: {
      find: input.find,
      replace: input.replace,
      all: input.all ?? true,
      case_sensitive: input.case_sensitive ?? false,
    },
  });
}

export function updateResume(id: string | number, body: Partial<Resume>) {
  const demo = () => {
    const resume = resumeOrSample(id);
    Object.assign(resume, body, { updated_at: previewNow() });
    // The active version IS the document's body on the live backend, so keep its
    // captured text in step with the saved body. Without this, a save-in-place
    // left every version-keyed preview (the main viewer) showing stale text.
    const text = body.rendered_text;
    if (
      typeof text === "string" &&
      resume.active_version !== undefined &&
      resume.active_version !== null
    ) {
      previewVersionContent.set(
        versionContentKey("resume", id, resume.active_version),
        text
      );
    }
    return resume;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<Resume>(`/api/v1/resumes/${id}`, { method: "PUT", body });
}

/** Flag/unflag a résumé as "needs attention". Returns the updated résumé. */
export function setResumeFlagged(id: string | number, flagged: boolean) {
  const demo = () => {
    const resume = resumeOrSample(id);
    resume.flagged = flagged;
    resume.updated_at = previewNow();
    return resume;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<Resume>(`/api/v1/resumes/${id}`, { method: "PUT", body: { flagged } });
}

/** Archive/restore a résumé. Returns the updated résumé. */
export function setResumeArchived(id: string | number, archived: boolean) {
  const demo = () => {
    const resume = resumeOrSample(id);
    resume.archived = archived;
    resume.archived_at = archived ? previewNow() : undefined;
    resume.updated_at = previewNow();
    return resume;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<Resume>(`/api/v1/resumes/${id}`, { method: "PUT", body: { archived } });
}

export function deleteResume(id: string | number) {
  const demo = () => {
    const store = resumeStore();
    const idx = store.findIndex((r) => String(r.id) === String(id));
    if (idx >= 0) store.splice(idx, 1);
    return undefined as void;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<void>(`/api/v1/resumes/${id}`, { method: "DELETE" });
}

export async function downloadResume(
  id: string | number,
  filename?: string
): Promise<void> {
  if (__IS_PREVIEW__) {
    previewDownloadHtml(previewResumeHtml(id), filename, `resume-${id}`);
    return;
  }
  // Route through the shared blob fetcher so an expired access token is
  // refreshed and the request retried once (a raw fetch here would 401 and
  // die instead of transparently recovering the session).
  const blob = await apiBlob(`/api/v1/resumes/${id}/file`);
  downloadBlob(blob, filename ?? `resume-${id}`);
}

/** Trigger a browser download for a fetched blob. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Fetch the résumé as a canonical JSON Resume object.
 * Feeds the template gallery — every theme renders this same shape.
 */
export function getResumeStructured(id: string | number) {
  return withDemoFallback(
    () => normalizeResume(mockStructuredResume as JsonResume),
    () => api<JsonResume>(`/api/v1/resumes/${id}/structured`).then(normalizeResume),
  );
}

/** A rendered document: the template it is rendered on plus the structured data it fills. */
export interface RenderResult<T> {
  /** The template id the document is rendered with (e.g. "modern"). */
  template: string;
  /** The structured document data for that template. */
  data: T;
  /**
   * The version's FULL raw text (canonical markdown), carried alongside the
   * structured data by the per-version render endpoints. It is always present
   * when the version has any content — even when the structured `data` is sparse
   * (e.g. a plainly-formatted / docx-extracted résumé), which is exactly why the
   * previews render from THIS rather than from the structured data.
   */
  markdown?: string;
}

/**
 * Render a résumé on a template.
 * Omit `templateId` to render on the résumé's SAVED template (the server's
 * `template_id`); pass one to preview a candidate template live while browsing.
 */
export function getResumeRender(id: string | number, templateId?: string) {
  const qs = templateId ? `?template_id=${encodeURIComponent(templateId)}` : "";
  return withDemoFallback(
    () =>
      ({
        template: templateId || "modern",
        data: normalizeResume(mockStructuredResume as JsonResume),
      }) as RenderResult<JsonResume>,
    () =>
      api<RenderResult<JsonResume>>(`/api/v1/resumes/${id}/render${qs}`).then((res) => ({
        template: asStr(res.template),
        data: normalizeResume(res.data),
      })),
  );
}

// ---- Design chooser: the template catalog ----

export type ResumeTemplateFontFamily = "sans" | "serif" | "mono";
export type ResumeTemplateHeadingStyle = "underline" | "bar" | "plain" | "caps";

/** A template's full presentation style — everything needed to render it. */
export interface ResumeTemplateStyle {
  /** Accent color — an accent id or a raw hex. */
  accent_color: string;
  /** Typeface family: sans, serif, or mono. */
  font_family: ResumeTemplateFontFamily;
  /** Heading treatment. */
  heading_style: ResumeTemplateHeadingStyle;
}

/** One entry in the design catalog (`GET /api/v1/resume-templates`). */
export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  /** Paper color for the thumbnail frame. */
  paper?: string;
  style: ResumeTemplateStyle;
  /** Community-contributed looks are kept behind the Advanced disclosure. */
  community?: boolean;
}

/**
 * The template catalog, fetched ONCE. Every thumbnail and the large preview are
 * rendered locally from this payload with the already-loaded résumé data, so no
 * per-template request is ever made. Falls back to the local catalog in preview.
 */
export function listResumeTemplates() {
  return withDemoFallback(
    () => resumeTemplatesMock as unknown as ResumeTemplate[],
    () => api<ResumeTemplate[]>("/api/v1/resume-templates"),
  );
}

/** The catalog's categories, for the filter chips (`GET /api/v1/resume-templates/categories`). */
export function listResumeTemplateCategories() {
  return withDemoFallback(
    () => {
      const cats: string[] = [];
      for (const t of resumeTemplatesMock) if (!cats.includes(t.category)) cats.push(t.category);
      return cats;
    },
    () => api<string[]>("/api/v1/resume-templates/categories"),
  );
}

export interface GenerateTemplateInput {
  /** A plain-language description of the look the user wants. */
  description: string;
  /** Optional layout to start from. */
  base_template_id?: string;
}

/** Ask the AI for a brand-new template (`POST /api/v1/resume-templates/generate`). */
export function generateResumeTemplate(input: GenerateTemplateInput) {
  const demo = () => {
    const description = input.description.trim();
    return {
      id: "ai-generated",
      name: description.slice(0, 40) || "AI design",
      description: `Generated from “${description.slice(0, 60)}”`,
      category: "Generated",
      paper: "#ffffff",
      style: { accent_color: "cobalt", font_family: "sans", heading_style: "underline" },
    } as ResumeTemplate;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<ResumeTemplate>("/api/v1/resume-templates/generate", {
    method: "POST",
    body: {
      description: input.description,
      ...(input.base_template_id ? { base_template_id: input.base_template_id } : {}),
    },
  });
}

/**
 * Ask the AI to improve the résumé and return the result as structured data
 * (rendered through the chosen template), plus the canonical markdown and the
 * figures it invented. This is a preview — nothing is saved until you POST the
 * returned markdown to `…/versions`.
 */
export function improveResumeStructured(
  id: string | number,
  input: ImproveStructuredInput
) {
  return withDemoFallback(
    () => normalizeResumeImprovement(mockStructuredImprovement as StructuredImprovement),
    () =>
      api<StructuredImprovement>(`/api/v1/resumes/${id}/improve-structured`, {
        method: "POST",
        body: {
          instructions: input.instructions ?? [],
          ...(input.instruction ? { instruction: input.instruction } : {}),
          ...(input.content ? { content: input.content } : {}),
          ...(input.job_posting_id ? { job_posting_id: input.job_posting_id } : {}),
          ...(input.focus_points && input.focus_points.length
            ? { focus_points: input.focus_points }
            : {}),
        },
        timeoutMs: AI_TIMEOUT_MS,
      }).then(normalizeResumeImprovement),
  );
}

/**
 * Ask the AI to improve a cover letter and return the result as structured data
 * (rendered through the chosen template), plus the canonical markdown and the
 * figures it invented. A preview only — save by POSTing the markdown (or the
 * re-serialized kept-edits text) to `…/versions`.
 */
export function improveCoverLetterStructured(
  id: string | number,
  input: ImproveStructuredInput
) {
  return withDemoFallback(
    () => withCleanFlags(mockCoverLetterImprovement as CoverLetterStructuredImprovement),
    () =>
      api<CoverLetterStructuredImprovement>(
        `/api/v1/cover-letters/${id}/improve-structured`,
        {
          method: "POST",
          body: {
            instructions: input.instructions ?? [],
            ...(input.instruction ? { instruction: input.instruction } : {}),
            ...(input.content ? { content: input.content } : {}),
            ...(input.job_posting_id ? { job_posting_id: input.job_posting_id } : {}),
            ...(input.focus_points && input.focus_points.length
              ? { focus_points: input.focus_points }
              : {}),
          },
          timeoutMs: AI_TIMEOUT_MS,
        },
      ).then(withCleanFlags),
  );
}

/**
 * Input for the "Ask AI to change it" immediate edit request.
 *
 * Unlike the improve flow (which returns a preview to accept), this endpoint
 * makes ONLY the change the instruction asks for, applies it, and saves it as a
 * new active version in one shot — the response is the fully updated document.
 */
export interface AiEditInput {
  /** The user's instruction — a command that steers the change, never content. */
  instruction: string;
  /** The document text exactly as it reads on screen right now (unsaved edits included). */
  content?: string;
}

/** Escape a literal string for safe use inside a RegExp. */
function escapeRegExpLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Preview-only simulation of the "Ask AI to change it" edit. The demo build has
 * no AI backend, so — to keep the apply → save → re-render loop demonstrable — an
 * instruction is carried out as a small deterministic text operation: an explicit
 * "replace X with Y" or "remove X" ask, otherwise a light tightening of the copy.
 * Returns the text UNCHANGED when nothing applies, so the caller honestly reports
 * "no change made" instead of faking a new version that looks byte-identical.
 */
function simulateAiEdit(text: string, instruction: string): string {
  const instr = (instruction ?? "").trim();
  if (!instr || !text.trim()) return text;
  let out = text;

  const replaceMatch =
    instr.match(
      /(?:replace|change|rename)\s+["“]?(.+?)["”]?\s+(?:to|with|into)\s+["“]?(.+?)["”]?\s*$/i
    ) || instr.match(/^(.+?)\s*(?:->|→)\s*(.+)$/);
  const removeMatch = instr.match(
    /(?:remove|delete|drop|cut|take out|get rid of)\s+(?:the\s+)?["“]?(.+?)["”]?\s*(?:from\s+.+|in\s+.+)?$/i
  );

  if (replaceMatch) {
    const from = replaceMatch[1]?.trim();
    const to = replaceMatch[2]?.trim();
    if (from && to && from.length <= 120 && out.includes(from)) {
      out = out.split(from).join(to);
    }
  } else if (removeMatch) {
    const target = removeMatch[1]?.trim();
    if (target && target.length <= 80 && out.toLowerCase().includes(target.toLowerCase())) {
      out = out.replace(new RegExp(escapeRegExpLiteral(target), "gi"), "");
      out = out
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+([,.;:])/g, "$1")
        .replace(/\n{3,}/g, "\n\n");
    }
  } else {
    // A generic "polish": tighten filler, drop the optional "that", and trade a
    // couple of weak phrasings for stronger verbs — visible on most documents.
    out = out
      .replace(/\b(very|really|just|actually|basically|quite|simply|literally|truly)\s+/gi, "")
      .replace(/\bin order to\b/gi, "to")
      .replace(/\butilis(e|ed|ing|ation)\b/gi, "use")
      .replace(/\bresponsible for\b/gi, "Owned")
      .replace(/\bworked on\b/gi, "Delivered")
      .replace(/\bthat\s+(?=(we|I|they|he|she|it|the|a|an)\b)/gi, "")
      .replace(/[ \t]{2,}/g, " ");
  }

  return out;
}

/**
 * Apply one targeted change to a résumé IMMEDIATELY (`POST /resumes/{id}/ai-edit`).
 * The server makes only the requested edit and returns the full, updated résumé —
 * its `active_version` moves forward when the change actually landed. Nothing is
 * previewed or accepted here: the returned document is the new source of truth.
 *
 * In preview mode (no backend) a new version is simulated from the sent content,
 * so the immediate apply + Undo flow stays demonstrable end-to-end.
 */
export function aiEditResume(id: string | number, input: AiEditInput) {
  const demo = () => {
    const resume = resumeOrSample(id);
    const text = typeof input.content === "string" ? input.content : resume.rendered_text ?? "";
    const nextText = simulateAiEdit(text, input.instruction);
    // Only advance the version when the simulated edit actually changed the text,
    // so "applied" honestly means the document visibly re-rendered — never a new
    // version that looks byte-identical.
    if (nextText.trim() === text.trim()) return resume;
    const version = (resume.versions?.length ?? 0) + 1;
    resume.versions = [
      ...(resume.versions ?? []),
      {
        version,
        label: input.instruction ? input.instruction.slice(0, 60) : "AI edit",
        source: "generated",
        created_at: previewNow(),
      },
    ];
    resume.rendered_text = nextText;
    resume.active_version = version;
    resume.updated_at = previewNow();
    previewVersionContent.set(versionContentKey("resume", id, version), nextText);
    return resume;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<Resume>(`/api/v1/resumes/${id}/ai-edit`, {
    method: "POST",
    body: {
      instruction: input.instruction,
      ...(input.content !== undefined ? { content: input.content } : {}),
    },
    timeoutMs: AI_TIMEOUT_MS,
  });
}

/**
 * Cover-letter twin of {@link aiEditResume} (`POST /cover-letters/{id}/ai-edit`):
 * one targeted, immediately-saved change, returning the full updated letter.
 */
export function aiEditCoverLetter(id: string | number, input: AiEditInput) {
  const demo = () => {
    const letter = coverLetterOrSample(id);
    const text = typeof input.content === "string" ? input.content : letter.content ?? "";
    const nextText = simulateAiEdit(text, input.instruction);
    // Only advance the version when the edit actually changed the text (see the
    // résumé twin) — an identical re-save would look like nothing happened.
    if (nextText.trim() === text.trim()) return letter;
    const version = (letter.versions?.length ?? 0) + 1;
    letter.versions = [
      ...(letter.versions ?? []),
      {
        version,
        label: input.instruction ? input.instruction.slice(0, 60) : "AI edit",
        source: "generated",
        created_at: previewNow(),
      },
    ];
    letter.content = nextText;
    letter.active_version = version;
    previewVersionContent.set(versionContentKey("cover-letter", id, version), nextText);
    return letter;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<CoverLetter>(`/api/v1/cover-letters/${id}/ai-edit`, {
    method: "POST",
    body: {
      instruction: input.instruction,
      ...(input.content !== undefined ? { content: input.content } : {}),
    },
    timeoutMs: AI_TIMEOUT_MS,
  });
}

/**
 * Input for the "Add your own points" incorporate request.
 *
 * Lets the user supply their OWN material (points + notes) that the AI weaves
 * into the document — the counterpart to the preset-driven Improve flow. The
 * response is the SAME shape as an improve (structured + markdown +
 * flagged_metrics), so it renders through the existing preview UI.
 */
export interface IncorporateInput {
  /** The user's own points, added as a list of chips. */
  ideas?: string[];
  /** Free-text notes the AI should fold in. */
  notes?: string;
  /** Optional extra directive that steers how the points are woven in. */
  instruction?: string;
  /** Optional target job the points should be tailored toward. */
  job_posting_id?: string | number;
}

/**
 * Weave the user's own points + notes into a résumé and return the result as
 * structured data (rendered through the chosen template), plus the canonical
 * markdown and any figures the AI invented. This is a preview only — nothing is
 * saved until the returned markdown is POSTed to `…/versions`, exactly like the
 * Improve flow.
 */
export function incorporateResume(id: string | number, input: IncorporateInput) {
  return withDemoFallback(
    () => normalizeResumeImprovement(mockStructuredImprovement as StructuredImprovement),
    () =>
      api<StructuredImprovement>(`/api/v1/resumes/${id}/incorporate`, {
        method: "POST",
        body: {
          ideas: input.ideas ?? [],
          notes: input.notes ?? "",
          ...(input.instruction ? { instruction: input.instruction } : {}),
          ...(input.job_posting_id ? { job_posting_id: input.job_posting_id } : {}),
        },
        timeoutMs: AI_TIMEOUT_MS,
      }).then(normalizeResumeImprovement),
  );
}

/**
 * Cover-letter twin of {@link incorporateResume}: same request shape, same
 * structured preview response, same accept-to-`…/versions` save path.
 */
export function incorporateCoverLetter(id: string | number, input: IncorporateInput) {
  return withDemoFallback(
    () => withCleanFlags(mockCoverLetterImprovement as CoverLetterStructuredImprovement),
    () =>
      api<CoverLetterStructuredImprovement>(
        `/api/v1/cover-letters/${id}/incorporate`,
        {
          method: "POST",
          body: {
            ideas: input.ideas ?? [],
            notes: input.notes ?? "",
            ...(input.instruction ? { instruction: input.instruction } : {}),
            ...(input.job_posting_id ? { job_posting_id: input.job_posting_id } : {}),
          },
          timeoutMs: AI_TIMEOUT_MS,
        },
      ).then(withCleanFlags),
  );
}

/**
 * The presentation a document should be exported with, so a server-rendered
 * PDF/Word matches the on-screen preview exactly — the same template, accent,
 * and (crucially) the chosen typeface.
 */
export interface ExportStyleOptions {
  templateId?: string;
  accentId?: string;
  fontId?: string;
}

/** Build the `?template_id=&accent_id=&font_id=` query for an export endpoint. */
function exportStyleQuery(style?: ExportStyleOptions): string {
  if (!style) return "";
  const sp = new URLSearchParams();
  if (style.templateId) sp.set("template_id", style.templateId);
  if (style.accentId) sp.set("accent_id", style.accentId);
  if (style.fontId) sp.set("font_id", style.fontId);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Download the server-rendered PDF export. Pass the current style so the file is
 * rendered with the same template, accent, and typeface as the live preview.
 */
export async function exportResumePdf(
  id: string | number,
  filename?: string,
  style?: ExportStyleOptions
): Promise<void> {
  if (__IS_PREVIEW__) {
    previewDownloadHtml(previewResumeHtml(id), filename, `resume-${id}`);
    return;
  }
  const blob = await apiBlob(`/api/v1/resumes/${id}/export.pdf${exportStyleQuery(style)}`);
  downloadBlob(blob, filename ?? `resume-${id}.pdf`);
}

/** Download the server-rendered DOCX export (styled like the preview). */
export async function exportResumeDocx(
  id: string | number,
  filename?: string,
  style?: ExportStyleOptions
): Promise<void> {
  if (__IS_PREVIEW__) {
    previewDownloadHtml(previewResumeHtml(id), filename, `resume-${id}`);
    return;
  }
  const blob = await apiBlob(`/api/v1/resumes/${id}/export.docx${exportStyleQuery(style)}`);
  downloadBlob(blob, filename ?? `resume-${id}.docx`);
}

// ---- Cover letters ----

export function generateCoverLetter(input: GenerateCoverLetterInput) {
  const demo = () => {
    const store = coverLetterStore();
    const created: CoverLetter = {
      id: nextPreviewId(store),
      content: PREVIEW_GENERATED_LETTER,
      source: "generated",
      job_posting_id: input.job_posting_id,
      resume_id: input.resume_id,
      tone: input.tone,
      template_id: "modern",
      created_at: previewNow(),
      quality_grade: "B",
      quality_score: 84,
      flagged: false,
      archived: false,
      active_version: 1,
      versions: [{ version: 1, label: "Generated", source: "generated", created_at: previewNow() }],
    };
    store.unshift(created);
    return created;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<CoverLetter>("/api/v1/cover-letters/generate", {
    method: "POST",
    body: input,
  });
}

export function getCoverLetter(id: string | number) {
  return withDemoFallback(
    () => coverLetterOrSample(id),
    () => api<CoverLetter>(`/api/v1/cover-letters/${id}`, { timeoutMs: DOC_LOAD_TIMEOUT_MS }),
  );
}

export function updateCoverLetter(id: string | number, body: Partial<CoverLetter>) {
  const demo = () => {
    const letter = coverLetterOrSample(id);
    Object.assign(letter, body);
    // Keep the active version's captured text in step with the saved content (the
    // active version IS the letter's body), so version-keyed previews repaint.
    const text = body.content;
    if (
      typeof text === "string" &&
      letter.active_version !== undefined &&
      letter.active_version !== null
    ) {
      previewVersionContent.set(
        versionContentKey("cover-letter", id, letter.active_version),
        text
      );
    }
    return letter;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<CoverLetter>(`/api/v1/cover-letters/${id}`, { method: "PUT", body });
}

/** Flag/unflag a cover letter as "needs attention". Returns the updated letter. */
export function setCoverLetterFlagged(id: string | number, flagged: boolean) {
  const demo = () => {
    const letter = coverLetterOrSample(id);
    letter.flagged = flagged;
    return letter;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<CoverLetter>(`/api/v1/cover-letters/${id}`, { method: "PUT", body: { flagged } });
}

/** Archive/restore a cover letter. Returns the updated letter. */
export function setCoverLetterArchived(id: string | number, archived: boolean) {
  const demo = () => {
    const letter = coverLetterOrSample(id);
    letter.archived = archived;
    letter.archived_at = archived ? previewNow() : undefined;
    return letter;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<CoverLetter>(`/api/v1/cover-letters/${id}`, { method: "PUT", body: { archived } });
}

export function listCoverLetters(params?: ListDocumentsQuery) {
  return withDemoFallback(
    () => filterByQuery(coverLetterStore(), params),
    () => api<CoverLetter[]>(`/api/v1/cover-letters${listQuery(params)}`, { timeoutMs: DOC_LOAD_TIMEOUT_MS }),
  );
}

export function uploadCoverLetter(
  file: File,
  fields?: { job_posting_id?: string | number; resume_id?: string | number }
) {
  if (__IS_PREVIEW__) {
    const store = coverLetterStore();
    const created: CoverLetter = {
      id: nextPreviewId(store),
      content: PREVIEW_GENERATED_LETTER,
      source: "uploaded",
      original_filename: file.name,
      job_posting_id: fields?.job_posting_id,
      resume_id: fields?.resume_id,
      template_id: "classic",
      created_at: previewNow(),
      quality_grade: "B",
      quality_score: 80,
      flagged: false,
      archived: false,
      active_version: 1,
      versions: [{ version: 1, label: "Original upload", source: "uploaded", created_at: previewNow() }],
    };
    store.unshift(created);
    return Promise.resolve(created);
  }
  const form = new FormData();
  form.append("file", file);
  if (fields?.job_posting_id) form.append("job_posting_id", String(fields.job_posting_id));
  if (fields?.resume_id) form.append("resume_id", String(fields.resume_id));
  return apiUpload<CoverLetter>("/api/v1/cover-letters/upload", form);
}

export function deleteCoverLetter(id: string | number) {
  const demo = () => {
    const store = coverLetterStore();
    const idx = store.findIndex((c) => String(c.id) === String(id));
    if (idx >= 0) store.splice(idx, 1);
    return undefined as void;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<void>(`/api/v1/cover-letters/${id}`, { method: "DELETE" });
}

export async function downloadCoverLetter(
  id: string | number,
  filename?: string
): Promise<void> {
  if (__IS_PREVIEW__) {
    previewDownloadHtml(
      previewCoverLetterHtml(coverLetterOrSample(id)),
      filename,
      `cover-letter-${id}`
    );
    return;
  }
  const blob = await apiBlob(`/api/v1/cover-letters/${id}/file`);
  downloadBlob(blob, filename ?? `cover-letter-${id}`);
}

/** Download the server-rendered PDF export of a cover letter (styled like the preview). */
export async function exportCoverLetterPdf(
  id: string | number,
  filename?: string,
  style?: ExportStyleOptions
): Promise<void> {
  if (__IS_PREVIEW__) {
    previewDownloadHtml(
      previewCoverLetterHtml(coverLetterOrSample(id)),
      filename,
      `cover-letter-${id}`
    );
    return;
  }
  const blob = await apiBlob(`/api/v1/cover-letters/${id}/export.pdf${exportStyleQuery(style)}`);
  downloadBlob(blob, filename ?? `cover-letter-${id}.pdf`);
}

/** Download the server-rendered DOCX export of a cover letter (styled like the preview). */
export async function exportCoverLetterDocx(
  id: string | number,
  filename?: string,
  style?: ExportStyleOptions
): Promise<void> {
  if (__IS_PREVIEW__) {
    previewDownloadHtml(
      previewCoverLetterHtml(coverLetterOrSample(id)),
      filename,
      `cover-letter-${id}`
    );
    return;
  }
  const blob = await apiBlob(`/api/v1/cover-letters/${id}/export.docx${exportStyleQuery(style)}`);
  downloadBlob(blob, filename ?? `cover-letter-${id}.docx`);
}

// ---- Document versions (shared) ----

export function activateResumeVersion(id: string | number, version: string | number) {
  const demo = () => {
    const resume = resumeOrSample(id);
    resume.active_version = version;
    // Mirror the live backend: activating a version makes its text the document's
    // current body, so the editor AND the viewer re-render the version you picked.
    const meta = (resume.versions ?? []).find((v) => String(v.version) === String(version));
    const text = versionEmbeddedText(meta);
    if (text) resume.rendered_text = text;
    resume.updated_at = previewNow();
    return resume;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<Resume>(`/api/v1/resumes/${id}/versions/${version}/activate`, {
    method: "POST",
  });
}

/**
 * Delete one saved version of a résumé. Returns the FULL updated résumé (with the
 * surviving `versions[]` and the reassigned `active_version`), which is the new
 * source of truth — the caller re-renders from it directly.
 *
 * The backend refuses to delete a document's only remaining version (400), so a
 * last-version delete is rejected with the same contract here rather than
 * silently emptying the document.
 */
export function deleteResumeVersion(id: string | number, version: string | number) {
  const demo = () => {
    const resume = resumeOrSample(id);
    const list = (resume.versions ?? []).filter(
      (v) => String(v.version) !== String(version)
    );
    if (list.length === 0) {
      throw new ApiError(400, "You can't delete your only version.");
    }
    resume.versions = list;
    // Deleting the active version reassigns active to the newest remaining one.
    if (String(resume.active_version) === String(version)) {
      const newest = list.reduce(
        (max, v) => (Number(v.version) > Number(max.version) ? v : max),
        list[0]
      );
      resume.active_version = newest.version;
    }
    resume.updated_at = previewNow();
    return resume;
  };
  if (__IS_PREVIEW__) {
    try {
      return Promise.resolve(demo());
    } catch (err) {
      return Promise.reject(err);
    }
  }
  return api<Resume>(`/api/v1/resumes/${id}/versions/${version}`, {
    method: "DELETE",
  });
}

/**
 * Read a single saved version's content (`GET /resumes/{id}/versions/{version}`).
 * Used by the compare view — the version list carries metadata only, so the text
 * of a non-active version has to be fetched explicitly.
 */
export function getResumeVersion(id: string | number, version: string | number) {
  const demo = (): VersionContent => {
    const resume = resumeOrSample(id);
    const meta = (resume.versions ?? []).find((v) => String(v.version) === String(version));
    const stored = previewVersionContent.get(versionContentKey("resume", id, version));
    const embedded = versionEmbeddedText(meta);
    // The version's OWN text only. The document's `rendered_text` is its ACTIVE
    // body and can differ from the version asked for — fall back to it ONLY when
    // this IS the active version (then they are the same thing by definition).
    const isActive = String(resume.active_version) === String(version);
    const own = stored ?? embedded;
    const content =
      own ?? (isActive && hasText(resume.rendered_text) ? resume.rendered_text : "");
    return {
      version,
      label: meta?.label,
      change_summary: meta?.change_summary,
      source: meta?.source,
      job_title: meta?.job_title,
      created_at: meta?.created_at,
      content,
    };
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<unknown>(`/api/v1/resumes/${id}/versions/${version}`, {
    timeoutMs: VERSION_LOAD_TIMEOUT_MS,
  }).then((raw) => normalizeVersionContent(raw, version));
}

/**
 * Render ONE saved version of a résumé through a template
 * (`GET /resumes/{id}/versions/{version}/render?template_id=<template>` →
 * `{ template, data }`).
 *
 * This is server-authoritative: the backend renders the version that was ASKED
 * FOR, so the returned `data` can never be the document's active body. The
 * viewer, the marquee thumbnails and the full-size lightbox all paint the chosen
 * version from here, so the version marked Current, the one captioned Current,
 * and the one on the paper can never drift apart. Omit `templateId` to let the
 * server use the version's saved template. In preview mode it renders the
 * version's OWN captured text — never the active body.
 */
export function getResumeVersionRender(
  id: string | number,
  version: string | number,
  templateId?: string
) {
  const qs = templateId ? `?template_id=${encodeURIComponent(templateId)}` : "";
  return withDemoFallback(
    () => {
      const markdown = previewVersionOwnMarkdown("resume", id, version);
      const doc = resumeOrSample(id);
      const meta = (doc.versions ?? []).find(
        (v) => String(v.version) === String(version)
      );
      return {
        template: asStr(templateId || meta?.template_id || doc.template_id || "modern"),
        data: parseResumeMarkdown(markdown),
        markdown,
      } as RenderResult<JsonResume>;
    },
    () =>
      api<RenderResult<JsonResume>>(
        `/api/v1/resumes/${id}/versions/${version}/render${qs}`,
        { timeoutMs: VERSION_LOAD_TIMEOUT_MS }
      ).then((res) => ({
        template: asStr(res.template),
        data: normalizeResume(res.data),
        markdown: asStr(res.markdown),
      })),
  );
}

/**
 * Cover-letter twin of {@link getResumeVersionRender}: render ONE saved version
 * of a cover letter through a template
 * (`GET /cover-letters/{id}/versions/{version}/render?template_id=<template>` →
 * `{ template, data }`).
 *
 * Server-authoritative: the backend renders the version that was ASKED FOR, so
 * the returned `data` can never be the letter's active body. The shared marquee
 * thumbnails and the full-size lightbox paint letters from here too, so a letter
 * version is as reliable as a résumé one. Omit `templateId` to let the server use
 * the version's saved template. In preview mode it renders the version's OWN
 * captured text — never the active body.
 */
export function getCoverLetterVersionRender(
  id: string | number,
  version: string | number,
  templateId?: string
) {
  const qs = templateId ? `?template_id=${encodeURIComponent(templateId)}` : "";
  return withDemoFallback(
    () => {
      const markdown = previewVersionOwnMarkdown("cover-letter", id, version);
      const doc = coverLetterOrSample(id);
      const meta = (doc.versions ?? []).find(
        (v) => String(v.version) === String(version)
      );
      return {
        template: asStr(templateId || meta?.template_id || doc.template_id || "classic"),
        data: buildCoverLetterStructured(markdown),
        markdown,
      } as RenderResult<CoverLetterStructured>;
    },
    () =>
      api<RenderResult<CoverLetterStructured>>(
        `/api/v1/cover-letters/${id}/versions/${version}/render${qs}`,
        { timeoutMs: VERSION_LOAD_TIMEOUT_MS }
      ).then((res) => ({
        template: asStr(res.template),
        data: res.data,
        markdown: asStr(res.markdown),
      })),
  );
}

/**
 * Nickname one saved version of a résumé
 * (`PATCH /resumes/{id}/versions/{version}` with `{ label }`), or — when a
 * `templateId` is supplied — rename AND re-design in the SAME request via the
 * combined `{ label, template_id }` body. Returns the FULL updated résumé, which
 * the caller re-renders from — the same contract as the other version
 * operations. An empty label clears the nickname (the API caps it at 80
 * characters); an empty `template_id` clears the version's own design so it
 * inherits the résumé's again.
 */
export function renameResumeVersion(
  id: string | number,
  version: string | number,
  label: string,
  templateId?: string
) {
  const demo = () => {
    const resume = resumeOrSample(id);
    resume.versions = (resume.versions ?? []).map((v) =>
      String(v.version) === String(version)
        ? { ...v, label, ...(templateId !== undefined ? { template_id: templateId } : {}) }
        : v
    );
    resume.updated_at = previewNow();
    return resume;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<Resume>(`/api/v1/resumes/${id}/versions/${version}`, {
    method: "PATCH",
    body: templateId !== undefined ? { label, template_id: templateId } : { label },
  });
}

/**
 * Set (or clear) a single saved version's OWN design
 * (`PATCH /resumes/{id}/versions/{version}` with `{ template_id }`). An empty
 * string clears it so the version inherits the résumé's design again. Returns the
 * FULL updated résumé (its `versions[]` now carry the version's own template),
 * which is the source of truth the caller re-renders from so the change shows at
 * once. A 400 means the template id is unknown/unavailable.
 */
export function setResumeVersionTemplate(
  id: string | number,
  version: string | number,
  templateId: string
) {
  const demo = () => {
    const resume = resumeOrSample(id);
    resume.versions = (resume.versions ?? []).map((v) =>
      String(v.version) === String(version) ? { ...v, template_id: templateId } : v
    );
    resume.updated_at = previewNow();
    return resume;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<Resume>(`/api/v1/resumes/${id}/versions/${version}`, {
    method: "PATCH",
    body: { template_id: templateId },
  });
}

export interface SaveVersionInput {
  /** Final document text. `text` is preferred; legacy `content`/`rendered_text` still accepted. */
  text?: string;
  content?: string;
  rendered_text?: string;
  job_posting_id?: string | number;
  instruction?: string;
  instructions?: string[];
}

export function createResumeVersion(id: string | number, body: SaveVersionInput) {
  const demo = () => {
    const resume = resumeOrSample(id);
    const text = body.text ?? body.content ?? body.rendered_text ?? "";
    const version = (resume.versions?.length ?? 0) + 1;
    resume.versions = [
      ...(resume.versions ?? []),
      { version, label: body.instruction ? body.instruction.slice(0, 60) : "Saved edit", source: "generated", created_at: previewNow() },
    ];
    resume.rendered_text = text;
    resume.active_version = version;
    resume.updated_at = previewNow();
    previewVersionContent.set(versionContentKey("resume", id, version), text);
    return resume;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  const text = body.text ?? body.content ?? body.rendered_text ?? "";
  // Saving a version returns the full résumé (with versions[] + active_version),
  // which is what the version switcher reads from.
  return api<Resume>(`/api/v1/resumes/${id}/versions`, {
    method: "POST",
    body: {
      content: text,
      rendered_text: text,
      ...(body.job_posting_id ? { job_posting_id: body.job_posting_id } : {}),
      ...(body.instructions && body.instructions.length
        ? { instructions: body.instructions }
        : {}),
      ...(body.instruction ? { instruction: body.instruction } : {}),
    },
  });
}

/**
 * "Restore this version as a copy" for a résumé — branch an older version into a
 * brand-new version instead of just activating it. We activate the source
 * version to read its content back from the API, then save that content as a NEW
 * version (the copy), which becomes active. Nothing is destroyed and the source
 * version is left in place.
 *
 * This composes the two confirmed endpoints (activate + create version) so it
 * works against the existing API surface.
 */
export async function restoreResumeVersionAsCopy(
  id: string | number,
  version: string | number
) {
  const activated = await activateResumeVersion(id, version);
  return createResumeVersion(id, {
    text: activated.rendered_text ?? "",
    instruction: `Restored from version ${version}`,
  });
}

export function getResumeReuse(id: string | number, job_posting_id: string | number) {
  return withDemoFallback(
    () => ({ reuse_recommended: false }) as ReuseResult,
    () =>
      api<ReuseResult>(
        `/api/v1/resumes/${id}/reuse?job_posting_id=${encodeURIComponent(String(job_posting_id))}`
      ),
  );
}

export function activateCoverLetterVersion(id: string | number, version: string | number) {
  const demo = () => {
    const letter = coverLetterOrSample(id);
    letter.active_version = version;
    return letter;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<CoverLetter>(`/api/v1/cover-letters/${id}/versions/${version}/activate`, {
    method: "POST",
  });
}

/**
 * Cover-letter twin of {@link deleteResumeVersion}: delete one saved version and
 * return the FULL updated letter (surviving `versions[]` and the reassigned
 * `active_version`), which is the new source of truth. The backend refuses to
 * delete a document's only remaining version (400), matched here so a
 * last-version delete is rejected rather than silently emptying the letter.
 */
export function deleteCoverLetterVersion(id: string | number, version: string | number) {
  const demo = () => {
    const letter = coverLetterOrSample(id);
    const list = (letter.versions ?? []).filter(
      (v) => String(v.version) !== String(version)
    );
    if (list.length === 0) {
      throw new ApiError(400, "You can't delete your only version.");
    }
    letter.versions = list;
    // Deleting the active version reassigns active to the newest remaining one.
    if (String(letter.active_version) === String(version)) {
      const newest = list.reduce(
        (max, v) => (Number(v.version) > Number(max.version) ? v : max),
        list[0]
      );
      letter.active_version = newest.version;
    }
    return letter;
  };
  if (__IS_PREVIEW__) {
    try {
      return Promise.resolve(demo());
    } catch (err) {
      return Promise.reject(err);
    }
  }
  return api<CoverLetter>(`/api/v1/cover-letters/${id}/versions/${version}`, {
    method: "DELETE",
  });
}

/**
 * Cover-letter twin of {@link getResumeVersion}: read a single saved version's
 * content (`GET /cover-letters/{id}/versions/{version}`) for the compare view.
 */
export function getCoverLetterVersion(id: string | number, version: string | number) {
  const demo = (): VersionContent => {
    const letter = coverLetterOrSample(id);
    const meta = (letter.versions ?? []).find((v) => String(v.version) === String(version));
    const stored = previewVersionContent.get(versionContentKey("cover-letter", id, version));
    // The version's OWN text. The letter's `content` is its ACTIVE body, so it is
    // used only when this IS the active version — never as another version's text.
    const isActive = String(letter.active_version) === String(version);
    const content =
      stored ?? (isActive && hasText(letter.content) ? letter.content : "");
    return {
      version,
      label: meta?.label,
      change_summary: meta?.change_summary,
      source: meta?.source,
      job_title: meta?.job_title,
      created_at: meta?.created_at,
      content,
    };
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<unknown>(`/api/v1/cover-letters/${id}/versions/${version}`, {
    timeoutMs: VERSION_LOAD_TIMEOUT_MS,
  }).then((raw) => normalizeVersionContent(raw, version));
}

/**
 * Cover-letter twin of {@link renameResumeVersion}: nickname one saved version
 * (`PATCH`), optionally re-designing it in the same request, and return the FULL
 * updated letter. An empty label clears the nickname; an empty `template_id`
 * clears the version's own design so it inherits the letter's again.
 */
export function renameCoverLetterVersion(
  id: string | number,
  version: string | number,
  label: string,
  templateId?: string
) {
  const demo = () => {
    const letter = coverLetterOrSample(id);
    letter.versions = (letter.versions ?? []).map((v) =>
      String(v.version) === String(version)
        ? { ...v, label, ...(templateId !== undefined ? { template_id: templateId } : {}) }
        : v
    );
    return letter;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<CoverLetter>(`/api/v1/cover-letters/${id}/versions/${version}`, {
    method: "PATCH",
    body: templateId !== undefined ? { label, template_id: templateId } : { label },
  });
}

/**
 * Cover-letter twin of {@link setResumeVersionTemplate}: set (or clear) a single
 * saved version's OWN design (`PATCH /cover-letters/{id}/versions/{version}` with
 * `{ template_id }`). An empty string clears it so the version inherits the
 * letter's design again. Returns the FULL updated letter, the source of truth the
 * caller re-renders from.
 */
export function setCoverLetterVersionTemplate(
  id: string | number,
  version: string | number,
  templateId: string
) {
  const demo = () => {
    const letter = coverLetterOrSample(id);
    letter.versions = (letter.versions ?? []).map((v) =>
      String(v.version) === String(version) ? { ...v, template_id: templateId } : v
    );
    return letter;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  return api<CoverLetter>(`/api/v1/cover-letters/${id}/versions/${version}`, {
    method: "PATCH",
    body: { template_id: templateId },
  });
}

export function createCoverLetterVersion(id: string | number, body: SaveVersionInput) {
  const demo = () => {
    const letter = coverLetterOrSample(id);
    const text = body.text ?? body.content ?? body.rendered_text ?? "";
    const version = (letter.versions?.length ?? 0) + 1;
    letter.versions = [
      ...(letter.versions ?? []),
      { version, label: body.instruction ? body.instruction.slice(0, 60) : "Saved edit", source: "generated", created_at: previewNow() },
    ];
    letter.content = text;
    letter.active_version = version;
    previewVersionContent.set(versionContentKey("cover-letter", id, version), text);
    return letter;
  };
  if (__IS_PREVIEW__) return Promise.resolve(demo());
  const text = body.text ?? body.content ?? body.rendered_text ?? "";
  // Saving a version returns the full cover letter (with versions[] +
  // active_version), mirroring the résumé save contract.
  return api<CoverLetter>(`/api/v1/cover-letters/${id}/versions`, {
    method: "POST",
    body: {
      content: text,
      ...(body.job_posting_id ? { job_posting_id: body.job_posting_id } : {}),
      ...(body.instructions && body.instructions.length
        ? { instructions: body.instructions }
        : {}),
      ...(body.instruction ? { instruction: body.instruction } : {}),
    },
  });
}

/**
 * Cover-letter twin of {@link restoreResumeVersionAsCopy} — branch an older
 * version into a brand-new version instead of just activating it. Activates the
 * source version to read its content back, then saves that content as a NEW
 * version (the copy).
 */
export async function restoreCoverLetterVersionAsCopy(
  id: string | number,
  version: string | number
) {
  const activated = await activateCoverLetterVersion(id, version);
  return createCoverLetterVersion(id, {
    text: activated.content ?? "",
    instruction: `Restored from version ${version}`,
  });
}

export function getCoverLetterReuse(id: string | number, job_posting_id: string | number) {
  return withDemoFallback(
    () => ({ reuse_recommended: false }) as ReuseResult,
    () =>
      api<ReuseResult>(
        `/api/v1/cover-letters/${id}/reuse?job_posting_id=${encodeURIComponent(String(job_posting_id))}`
      ),
  );
}

// ---- My Work Highlights (evidence) ----
//
// The user copies a prompt out, runs it in their own company AI (Copilot, Teams,
// chat, docs, calendar), and pastes the answer back. Project Harbor never reads
// company data itself — it only turns the pasted facts into polished bullets.

/** One ready-to-run prompt, grouped by category. */
export interface EvidencePrompt {
  category: string;
  title: string;
  prompt: string;
}

/** Response of `POST /resumes/{id}/evidence-prompts`. */
export interface EvidencePromptsResult {
  prompts: EvidencePrompt[];
  /** Consent / data-policy guidance shown prominently at the top of step 1. */
  guidance: string;
}

/** One fact extracted from the pasted assistant output — the user's own material. */
export interface EvidenceDataPoint {
  id: string;
  text: string;
  category?: string;
}

/** Response of `POST /resumes/{id}/evidence/extract`. */
export interface EvidenceExtractResult {
  data_points: EvidenceDataPoint[];
}

/**
 * Fetch the prompts to run in the user's company AI. Pass the target job id
 * (when one is set) so the prompts can lean toward that role.
 */
export function resumeEvidencePrompts(
  id: string | number,
  jobPostingId?: string | number
) {
  return withDemoFallback(
    () => evidencePromptsMock as EvidencePromptsResult,
    () =>
      api<EvidencePromptsResult>(`/api/v1/resumes/${id}/evidence-prompts`, {
        method: "POST",
        body: jobPostingId ? { job_posting_id: jobPostingId } : {},
      }),
  );
}

/** Turn pasted assistant output into plain lines, so the demo still yields data points. */
function previewDataPoints(text: string): EvidenceDataPoint[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s>*\-•\d.)]+/, "").trim())
    .filter((line) => line.length >= 3)
    .slice(0, 12)
    .map((line, i) => ({ id: `dp-${i + 1}`, text: line }));
}

/**
 * Extract structured facts from the pasted assistant output. An empty/whitespace
 * paste is rejected by the caller with a friendly message before this is called.
 */
export function resumeEvidenceExtract(
  id: string | number,
  text: string,
  jobPostingId?: string | number
) {
  return withDemoFallback(
    () => ({ data_points: previewDataPoints(text) }),
    () =>
      api<EvidenceExtractResult>(`/api/v1/resumes/${id}/evidence/extract`, {
        method: "POST",
        body: {
          text,
          ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
        },
      }),
  );
}

// ---- My Work Highlights: suggestion-based edits ----
//
// After the user pastes their company AI's output, Project Harbor turns it into a
// set of REVIEWABLE EDITS against the current résumé (add / remove / reword).
// Nothing is written until the user accepts: apply-edits returns a PREVIEW of the
// whole résumé, and only the explicit "Accept & Save" posts a new version.

/** What a suggested edit does to the résumé. */
export type HighlightEditAction = "add" | "remove" | "reword";

/** One reviewable edit proposed against the résumé. */
export interface HighlightSuggestion {
  action: HighlightEditAction;
  /** The résumé section the edit targets (e.g. "Experience"). */
  section?: string;
  /** The text to find (reword / remove). Empty for an add. */
  before?: string;
  /** The replacement / new text (add / reword). Empty for a remove. */
  after?: string;
  /** Why the edit is proposed, in plain language. */
  rationale?: string;
}

/** Response of `POST /resumes/{id}/highlights/suggest`. */
export interface HighlightSuggestResult {
  suggestions: HighlightSuggestion[];
}

/** Response of `POST /resumes/{id}/apply-edits` — a preview only, never saved here. */
export interface ApplyEditsResult {
  /** The whole résumé after the accepted edits — the text to review / save. */
  rendered_text: string;
  /** How many edits were applied. */
  applied: number;
  /** Edits whose `before` text could no longer be found (so they were left out). */
  skipped: HighlightSuggestion[];
}

/** Coerce one API suggestion into a well-formed HighlightSuggestion (or drop it). */
function normalizeSuggestion(raw: unknown): HighlightSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const action =
    o.action === "add" || o.action === "remove" || o.action === "reword" ? o.action : null;
  if (!action) return null;
  const str = (key: string): string => (typeof o[key] === "string" ? (o[key] as string) : "");
  return {
    action,
    section: str("section"),
    before: str("before"),
    after: str("after"),
    rationale: str("rationale"),
  };
}

/**
 * Coerce one `skipped` entry. The backend may echo the original suggestion
 * object, or just a bare string identifying the text it couldn't find — both are
 * tolerated so the skipped set (and its count) is never silently dropped.
 */
function normalizeSkipped(raw: unknown): HighlightSuggestion | null {
  if (typeof raw === "string") {
    const text = raw.trim();
    return text ? { action: "reword", before: text } : null;
  }
  return normalizeSuggestion(raw);
}

/** Strip a pasted line down to its bare text (drops bullets / numbering). */
function cleanSuggestionLine(line: string): string {
  return line.replace(/^[\s>*\-•\d.)]+/, "").trim();
}

/** Preview-only: turn the pasted text into reviewable edits against the résumé. */
function previewSuggestions(id: string | number, text: string): HighlightSuggestion[] {
  const existing = previewResumeBody(id)
    .split(/\r?\n/)
    .map(cleanSuggestionLine)
    .filter((line) => line.length >= 8);
  const pasted = text
    .split(/\r?\n/)
    .map(cleanSuggestionLine)
    .filter((line) => line.length >= 4)
    .slice(0, 8);
  const out: HighlightSuggestion[] = [];
  const first = existing[0] ?? "";
  if (first) {
    out.push({
      action: "reword",
      section: "Experience",
      before: first,
      after: `${first.replace(/[.\s]+$/, "")} — delivering measurable impact`,
      rationale: "Reword to lead with the outcome and make the result concrete.",
    });
  }
  pasted.forEach((line) => {
    out.push({
      action: "add",
      section: "Experience",
      before: "",
      after: `• ${line}`,
      rationale: "Add this accomplishment as a new résumé bullet.",
    });
  });
  return out;
}

/** Preview-only: apply the accepted edits, honestly skipping ones whose `before` is gone. */
function previewApplyEdits(
  id: string | number,
  suggestions: HighlightSuggestion[]
): ApplyEditsResult {
  let text = previewResumeBody(id);
  let applied = 0;
  const skipped: HighlightSuggestion[] = [];
  for (const s of suggestions) {
    if (s.action === "add") {
      const bullet = (s.after ?? "").trim();
      if (!bullet) {
        skipped.push(s);
        continue;
      }
      text = `${text.trimEnd()}\n${/^[•\-*]/.test(bullet) ? bullet : `• ${bullet}`}`;
      applied += 1;
      continue;
    }
    const before = (s.before ?? "").trim();
    if (!before || !text.includes(before)) {
      skipped.push(s);
      continue;
    }
    const after = s.action === "reword" ? (s.after ?? "").trim() : "";
    text = text.split(before).join(after);
    applied += 1;
  }
  return { rendered_text: text, applied, skipped };
}

/**
 * Turn the pasted assistant output into reviewable edits against the résumé
 * (`POST /resumes/{id}/highlights/suggest`). An empty paste is refused by the
 * caller before this runs; the API also answers an empty paste with a 400.
 */
export function suggestResumeHighlights(
  id: string | number,
  text: string,
  jobPostingId?: string | number
) {
  const clean = text ?? "";
  return withDemoFallback(
    () => ({ suggestions: previewSuggestions(id, clean) }),
    () =>
      api<HighlightSuggestResult>(`/api/v1/resumes/${id}/highlights/suggest`, {
        method: "POST",
        body: {
          text: clean,
          ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
        },
        timeoutMs: AI_TIMEOUT_MS,
      }).then((res) => ({
        suggestions: (Array.isArray(res?.suggestions) ? res.suggestions : [])
          .map(normalizeSuggestion)
          .filter((s): s is HighlightSuggestion => s !== null),
      })),
  );
}

/**
 * Apply ONLY the accepted edits and return a preview of the whole résumé
 * (`POST /resumes/{id}/apply-edits`). This is a preview: nothing is saved until
 * the returned `rendered_text` is posted to `…/versions` by an explicit accept.
 */
export function applyResumeEdits(id: string | number, suggestions: HighlightSuggestion[]) {
  return withDemoFallback(
    () => previewApplyEdits(id, suggestions),
    () =>
      api<ApplyEditsResult>(`/api/v1/resumes/${id}/apply-edits`, {
        method: "POST",
        body: { suggestions },
        timeoutMs: AI_TIMEOUT_MS,
      }).then((res) => ({
        rendered_text: asStr(res?.rendered_text),
        applied: typeof res?.applied === "number" ? res.applied : 0,
        skipped: (Array.isArray(res?.skipped) ? res.skipped : [])
          .map(normalizeSkipped)
          .filter((s): s is HighlightSuggestion => s !== null),
      })),
  );
}