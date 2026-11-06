import type { DocumentVersion } from "@/lib/documents";

/**
 * Coerce any API value to a trimmed string. Version metadata comes from the
 * backend, and a field the type declares as `string` can still arrive as a
 * number (e.g. a numeric `template_id` or `template`), which makes `value.trim()`
 * throw and takes the whole page down with it. Every caller goes through this so
 * a stray non-string can never crash a render.
 */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Coerce any API value to a string WITHOUT trimming — for CONTENT fields (a
 * version's markdown, a document's body) where surrounding whitespace/newlines
 * are meaningful. `null`/`undefined` become `""`; anything else (including a
 * number the backend typed as a string) becomes its text form, so a later
 * `.trim()` / `.toLowerCase()` / `.slice()` can never throw on it.
 */
export function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * A version's OWN design id, coerced to a string. The backend types
 * `template_id` as a string but can send it as a number; every read that feeds a
 * render, a design chooser, or a revision marker goes through this so a numeric
 * id can never break a string operation downstream.
 */
export function versionTemplateId(version?: { template_id?: unknown } | null): string {
  return asText(version?.template_id);
}

/** Either document kind the versions UI can render. */
export type VersionKind = "resume" | "cover-letter";

/**
 * The minimal shape every version rail / dialog needs — both `Resume` and
 * `CoverLetter` satisfy it, so the same UI serves both document types.
 */
export interface VersionedDoc {
  versions?: DocumentVersion[];
  active_version?: string | number;
}

/** Which of the three visual families a version belongs to. */
export type SourceKind = "original" | "tailored" | "revision";

/** The in-flight action on a single card, so the right glyph can spin. */
export type BusyAction = "activate" | "delete" | "restore" | "rename" | "reset";

/** Classify a version into Original / Tailored / Revision for its chip. */
export function sourceKind(v: DocumentVersion): SourceKind {
  const s = asText(v.source).toLowerCase();
  if (s === "original" || s === "uploaded") return "original";
  if (s === "tailored" || asText(v.job_title)) return "tailored";
  return "revision";
}

/** The API's own cap for a version nickname (kept in sync with the endpoint). */
export const NICKNAME_MAX = 80;
/** Show the nickname character counter once the draft reaches this length. */
export const NICKNAME_COUNTER_FROM = 60;

export const SOURCE_META: Record<SourceKind, { label: string; cls: string; icon: string }> = {
  original: {
    label: "Original",
    cls: "text-secondary-900 bg-secondary-100",
    icon: "ri-upload-2-line",
  },
  tailored: {
    label: "Tailored",
    cls: "text-primary-900 bg-primary-100",
    icon: "ri-focus-3-line",
  },
  revision: {
    label: "Revision",
    cls: "text-accent-900 bg-accent-100",
    icon: "ri-sparkling-2-line",
  },
};

/**
 * The card's title. A user-set NICKNAME (a custom label) always wins over the
 * default; with no nickname it falls back to the original version, then the job
 * title it was tailored to, then "Version N". Auto-generated labels ("Original
 * upload", "Saved edit", …) are NOT treated as nicknames — see
 * {@link isCustomLabel} — so an untouched version still reads by its default.
 */
export function versionTitle(v: DocumentVersion): string {
  if (isCustomLabel(v)) return asText(v.label);
  const s = asText(v.source).toLowerCase();
  if (s === "original") return "Original";
  if (asText(v.job_title)) return asText(v.job_title);
  return `Version ${v.version}`;
}

/** Format a version date, tolerating a missing / malformed timestamp. */
export function formatDate(v?: string): string {
  const t = asText(v);
  if (!t) return "";
  if (!t || t === "null" || t === "undefined") return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Trim a change summary to a compact single line. */
export function truncate(text: string, max: number): string {
  const t = asText(text).replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max).trimEnd()}\u2026` : t;
}

/**
 * The label shapes the system generates on its own — an untouched version reads
 * "Original upload", "Generated for X", "Saved edit", "Restored from version N",
 * and so on. Anything OUTSIDE this set was named by the user, so it earns the
 * "Renamed" marker on its card.
 */
const AUTO_LABEL_PATTERNS: RegExp[] = [
  /^original(\s+(upload|resume|file|version))?$/i,
  /^uploaded$/i,
  /^generated(\s+for\s+.+)?$/i,
  /^tailored\b/i,
  /^saved edit$/i,
  /^restored from version \d+$/i,
  /^version \d+$/i,
];

/** True when a version's label was written by the user rather than auto-generated. */
export function isCustomLabel(v: DocumentVersion): boolean {
  const label = asText(v.label);
  if (!label) return false;
  return !AUTO_LABEL_PATTERNS.some((re) => re.test(label));
}