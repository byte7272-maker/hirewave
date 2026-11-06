import type {
  EvidenceDataPoint,
  EvidencePrompt,
  HighlightEditAction,
  HighlightSuggestion,
} from "./documents";

/**
 * Shared helpers for the consolidated "My Work Highlights" workspace page.
 *
 * The workspace keeps its three zones on one page (generate prompts → paste &
 * extract → review & add), so the extracted facts and their tick/edit state live
 * in page state rather than a step-scoped wizard. These helpers convert between
 * the API's data-point shape and the workspace's editable review rows, and pull
 * out the facts the user has actually kept.
 */

/** One reviewable, editable fact in the workspace's Zone C. */
export interface HighlightPoint {
  id: string;
  text: string;
  /** All facts arrive ticked; the user unticks the ones they don't want. */
  checked: boolean;
}

/** Turn extracted API data points into editable review rows (all ticked by default). */
export function toHighlightPoints(points: EvidenceDataPoint[]): HighlightPoint[] {
  return points.map((p, i) => ({
    id: p.id || `dp-${i + 1}`,
    text: p.text,
    checked: true,
  }));
}

/** The facts the user kept (ticked + non-empty), ready for the incorporate call. */
export function selectedHighlightIdeas(points: HighlightPoint[]): string[] {
  return points
    .filter((p) => p.checked && p.text.trim().length > 0)
    .map((p) => p.text.trim());
}

/** A collision-free id for a manually-typed highlight row. */
export function newManualPointId(existing: HighlightPoint[]): string {
  let n = existing.length + 1;
  const ids = new Set(existing.map((p) => p.id));
  while (ids.has(`own-${n}`)) n += 1;
  return `own-${n}`;
}

/**
 * Flatten a set of prompts into the plain-text block the copy actions put on the
 * clipboard — one "Category — Title\nPrompt" block per prompt, separated by a
 * blank line. Shared by Zone A's "Copy all prompts" button and the workspace's
 * one-tap "Copy all + Clear draft" shortcut, so both produce identical text and
 * the user can reuse the prompts for the next résumé.
 */
export function formatPromptsClipboard(prompts: EvidencePrompt[]): string {
  return prompts
    .map((p) => `${p.category} — ${p.title}\n${p.prompt}`)
    .join("\n\n");
}

/**
 * Flatten just the kept (ticked + non-empty) highlights into the plain-text
 * bullet block Zone C's "Copy bullets" action puts on the clipboard — one
 * "• …" line per kept highlight. Kept deliberately separate from the prompts
 * copy so the user can grab the polished facts they kept without the prompts,
 * and non-destructive (unlike "Copy all + Clear draft" it never resets the run).
 */
export function formatBulletsClipboard(points: HighlightPoint[]): string {
  return selectedHighlightIdeas(points)
    .map((text) => `• ${text}`)
    .join("\n");
}

/**
 * The editor route for a résumé, optionally opening it straight on a version.
 * The editor reads `?version=` on arrival and activates it, so "Open in full
 * editor" from the viewer lands on exactly the version the user was looking at.
 */
export function resumeEditorHref(
  resumeId: string | number,
  version?: string | number
): string {
  const base = `/dashboard/documents/resumes/${resumeId}`;
  return version !== undefined && version !== null && String(version) !== ""
    ? `${base}?version=${encodeURIComponent(String(version))}`
    : base;
}

/**
 * One reviewable, editable edit in the workspace's review zone. This is the
 * editable UI shape of a {@link HighlightSuggestion}: the same action / section /
 * before / after / rationale, plus a stable id and the per-card Accept toggle
 * (default accept) so the user can approve or reject each edit individually.
 */
export interface EditableSuggestion {
  id: string;
  action: HighlightEditAction;
  section: string;
  before: string;
  after: string;
  rationale: string;
  /** All edits arrive accepted; the user rejects the ones they don't want. */
  accepted: boolean;
}

/** Human labels for the three edit actions (the review card's action badge). */
export const HIGHLIGHT_ACTION_LABELS: Record<HighlightEditAction, string> = {
  add: "Add",
  remove: "Remove",
  reword: "Reword",
};

/** Turn the API's suggested edits into reviewable rows (all accepted by default). */
export function toEditableSuggestions(
  items: HighlightSuggestion[]
): EditableSuggestion[] {
  return (items ?? []).map((s, i) => ({
    id: `sg-${i + 1}`,
    action: s.action,
    section: s.section ?? "",
    before: s.before ?? "",
    after: s.after ?? "",
    rationale: s.rationale ?? "",
    accepted: true,
  }));
}

/**
 * The payload for `POST /resumes/{id}/apply-edits` — ONLY the accepted edits, in
 * their current (possibly inline-edited) form, as plain API suggestions.
 */
export function acceptedSuggestionPayload(
  list: EditableSuggestion[]
): HighlightSuggestion[] {
  return list
    .filter((s) => s.accepted)
    .map((s) => ({
      action: s.action,
      section: s.section,
      before: s.before,
      after: s.after,
      rationale: s.rationale,
    }));
}