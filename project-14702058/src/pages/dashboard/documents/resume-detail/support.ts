import { jobMatches } from "@/mocks/dashboard";
import type { Resume } from "@/lib/documents";

/** Marker that separates the résumé body from its trailing saved notes block. */
export const NOTES_MARKER = "\n\n<!-- Notes -->\n";

export const TAILOR_JOB_STORAGE_PREFIX = "hirewave_tailor_job_id_";
export const REVIEW_JOB_STORAGE_PREFIX = "hirewave_review_job_id_";
/** Remembered layout for the improve preview: "replace" (single pane) or "split". */
export const PREVIEW_COMPARE_STORAGE_KEY = "hirewave_preview_compare_mode";

export const jobOptions = jobMatches.map((j) => ({
  value: String(j.id),
  label: `${j.title} · ${j.company}`,
}));

export function detectFormat(res: Resume): string {
  const fmt = (res.format ?? "").toLowerCase();
  if (fmt) return fmt;
  const name = (res.original_filename ?? res.filename ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  if (name.endsWith(".txt")) return "text";
  return "";
}

export function formatDate(v?: string | null) {
  if (!v || v === "null" || v === "undefined") return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function splitNotes(raw: string) {
  const idx = raw.lastIndexOf(NOTES_MARKER);
  if (idx >= 0) {
    return { body: raw.slice(0, idx), notes: raw.slice(idx + NOTES_MARKER.length) };
  }
  return { body: raw, notes: "" };
}

export function combineText(body: string, notes: string) {
  return body + (notes.trim() ? NOTES_MARKER + notes : "");
}