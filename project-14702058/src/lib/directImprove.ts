import { ApiError } from "./api";
import {
  aiEditCoverLetter,
  aiEditResume,
  createCoverLetterVersion,
  createResumeVersion,
  improveCoverLetterStructured,
  improveResumeStructured,
  type CoverLetter,
  type FlaggedMetric,
  type Resume,
} from "./documents";
import type { JsonResume } from "./jsonResume";
import type { CoverLetterStructured } from "./coverLetterTemplate";
import { resumeToMarkdown } from "@/pages/dashboard/documents/templates/resumeFields";
import { coverLetterToMarkdown } from "@/pages/dashboard/documents/templates/coverLetterFields";
import {
  stripCoverLetterInstructionEcho,
  stripResumeInstructionEcho,
} from "@/pages/dashboard/documents/templates/instructionEcho";

/**
 * The self-entry "Improve" action, applied directly.
 *
 * Where the review-preview flow returns a result for the user to inspect and
 * accept, this path takes the user's OWN typed instruction, asks the AI to apply
 * it, and — when something actually changed — saves the result straight away as
 * a new version (so it is always reversible from the version history). It never
 * fails silently: the caller gets either a saved document, an explicit
 * "no changes" result, or a thrown error to surface.
 */

/** Marker that separates the résumé body from the user's own notes, if any. */
const NOTES_MARKER = "\n\n<!-- Notes -->\n";

/** Split a document's saved text into its body and the trailing notes block. */
function splitNotes(raw: string): { body: string; notes: string } {
  const idx = raw.lastIndexOf(NOTES_MARKER);
  if (idx >= 0) {
    return { body: raw.slice(0, idx), notes: raw.slice(idx + NOTES_MARKER.length) };
  }
  return { body: raw, notes: "" };
}

export type DirectImproveKind = "resume" | "cover-letter";

export interface RunDirectImproveArgs {
  kind: DirectImproveKind;
  docId: string | number;
  /** The user's typed self-entry improvement (required — that's what this is for). */
  instruction: string;
  /** Any selected preset chips, applied together with the instruction. */
  instructions?: string[];
  /** Ticked review findings to target. */
  focusPoints?: string[];
  jobPostingId?: string | number;
  /** The document text exactly as it reads on screen right now (unsaved edits included). */
  content?: string;
  /**
   * The structured document exactly as it reads on screen right now. Used to
   * protect pre-existing content from the guidance-echo guard: a returned field
   * is only treated as an echo of the instruction when its exact text did NOT
   * already exist in this document.
   */
  original?: JsonResume | CoverLetterStructured;
}

export interface RunDirectImproveResult {
  /** False when the AI returned the text unchanged — nothing was saved. */
  changed: boolean;
  /** The AI's returned markdown. */
  markdown: string;
  /** Figures the AI introduced that aren't in the original — likely invented. */
  flaggedMetrics: FlaggedMetric[];
  /** The saved document — present only when a new version was actually written. */
  updated?: Resume | CoverLetter;
  /**
   * The resolved structured document the markdown was serialized from (echo-safe),
   * when the server returned one. Lets the caller report which sections changed.
   */
  structured?: JsonResume | CoverLetterStructured;
}

/** Collapse whitespace so purely cosmetic differences don't read as a change. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The comparison used to decide whether an "Ask AI to change it" edit really
 * landed: the document BODY (the user's trailing notes block dropped) with runs
 * of whitespace collapsed, so purely cosmetic spacing can't read as a change.
 */
function comparableBody(text: string): string {
  return normalize(splitNotes(text).body);
}

/**
 * Improve the document with the user's own instruction and apply it directly.
 * Resolves with the outcome; throws on any request failure so the caller can
 * show an error (never a silent no-op).
 */
export async function runDirectImprove(
  args: RunDirectImproveArgs
): Promise<RunDirectImproveResult> {
  const { kind, docId, instruction, content } = args;
  const instructions = args.instructions ?? [];
  const focusPoints = args.focusPoints ?? [];
  const input = {
    instructions,
    instruction,
    content,
    job_posting_id: args.jobPostingId,
    focus_points: focusPoints.length ? focusPoints : undefined,
  };

  const result =
    kind === "resume"
      ? await improveResumeStructured(docId, input)
      : await improveCoverLetterStructured(docId, input);

  const flaggedMetrics = result.flagged_metrics ?? [];
  const serverMarkdown = result.markdown ?? "";

  // Rebuild the saved text from the AI's STRUCTURED result through the SAME
  // serializer the review-preview accept path uses. Saving the server's own
  // markdown let its re-formatting overwrite the user's direction (e.g. a Skills
  // section quietly reverting to bullets), so the change looked applied in the
  // preview and then snapped back on save. One serializer = one source of truth.
  //
  // The user's instruction is GUIDANCE, not content — if the AI echoed it back
  // verbatim as document text, strip those echoes before serializing so a
  // directive can never be saved as a résumé bullet or cover-letter paragraph.
  const guidance = [instruction, ...instructions];
  const cleaned =
    result.structured === undefined || result.structured === null
      ? undefined
      : kind === "resume"
        ? stripResumeInstructionEcho(
            result.structured as JsonResume,
            (args.original as JsonResume | undefined) ?? null,
            guidance
          )
        : stripCoverLetterInstructionEcho(
            result.structured as CoverLetterStructured,
            (args.original as CoverLetterStructured | undefined) ?? null,
            guidance
          );

  const serialized =
    kind === "resume"
      ? cleaned
        ? resumeToMarkdown(cleaned)
        : serverMarkdown
      : cleaned
        ? coverLetterToMarkdown(cleaned)
        : serverMarkdown;

  // Keep the user's own trailing notes block, which the structured serializer
  // doesn't carry — so a direct apply never silently drops them.
  const { notes } = splitNotes(content ?? "");
  const markdown = serialized + (notes.trim() ? NOTES_MARKER + notes : "");

  // Guard against applying an empty rewrite over real content.
  if (!markdown.trim() && (content ?? "").trim()) {
    throw new Error("the AI returned an empty result");
  }

  // "No changes" is judged against what the user currently sees on screen.
  const changed = normalize(markdown) !== normalize(content ?? "");
  if (!changed) {
    return { changed: false, markdown, flaggedMetrics, structured: cleaned };
  }

  const versionInput = {
    text: markdown,
    instructions: instructions.length ? instructions : undefined,
    instruction,
    job_posting_id: args.jobPostingId,
  };
  const updated =
    kind === "resume"
      ? await createResumeVersion(docId, versionInput)
      : await createCoverLetterVersion(docId, versionInput);

  return { changed: true, markdown, flaggedMetrics, updated, structured: cleaned };
}

export interface RunAiEditArgs {
  kind: DirectImproveKind;
  docId: string | number;
  /** The user's instruction — a command that steers the change, never content. */
  instruction: string;
  /** The document text exactly as it reads on screen right now (unsaved edits included). */
  content?: string;
  /** The document's active version BEFORE this edit — used to detect whether it applied. */
  prevVersion?: string | number;
}

export interface RunAiEditResult {
  /** True when the active version increased — the change applied and was saved. */
  applied: boolean;
  /** The full, updated document returned by the endpoint (the new source of truth). */
  updated: Resume | CoverLetter;
  /** The active version before the edit (for one-click Undo). */
  prevVersion?: string | number;
  /** The new active version after the edit, when it applied. */
  newVersion?: string | number;
  /**
   * How many edits the change applied (>= 1 when it landed). Computed from the
   * before/after text, so the applied change can be shown inline ("1 edit → v14").
   */
  editCount: number;
}

/** Parse a version token to a number, or NaN when it's absent / unparseable. */
function versionNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return NaN;
  return Number(value);
}

/**
 * A lightweight, positional count of how many text lines the edit changed — a
 * multiset difference between the before and after text. A single replaced line
 * counts once (one added + one removed → max = 1), which is what a targeted
 * "Ask AI to change it" command produces. It is intentionally approximate: the
 * trace is a hint, not an audit.
 */
function countTextEdits(before: string, after: string): number {
  const lines = (text: string) =>
    text
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const a = lines(before);
  const b = lines(after);
  if (a.join("\n") === b.join("\n")) return 0;
  const remaining = new Map<string, number>();
  for (const line of a) remaining.set(line, (remaining.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of b) {
    const left = remaining.get(line) ?? 0;
    if (left > 0) remaining.set(line, left - 1);
    else added += 1;
  }
  let removed = 0;
  for (const left of remaining.values()) removed += left;
  return Math.max(added, removed);
}

/**
 * Apply one targeted change IMMEDIATELY via `…/ai-edit` and report whether it
 * landed. The endpoint makes ONLY the requested edit and saves it as a new active
 * version — no preview, no Apply-all, no Accept step. "Applied" is decided purely
 * by the returned `active_version` moving forward: an unchanged version means
 * nothing matched, so the caller can say so plainly (and never silently no-op).
 *
 * Throws on any request failure so the caller can show a retryable error toast
 * (the shared API wrapper already refreshes the session on a 401 and retries).
 */
export async function runAiEdit(args: RunAiEditArgs): Promise<RunAiEditResult> {
  const { kind, docId, instruction, content, prevVersion } = args;
  const input = {
    instruction,
    ...(content !== undefined ? { content } : {}),
  };
  const updated =
    kind === "resume"
      ? await aiEditResume(docId, input)
      : await aiEditCoverLetter(docId, input);
  const newVersion = updated.active_version;
  const prevNum = versionNumber(prevVersion);
  const newNum = versionNumber(newVersion);
  const versionBumped =
    !Number.isNaN(newNum) && (Number.isNaN(prevNum) || newNum > prevNum);
  const before = content ?? "";
  const after =
    kind === "resume"
      ? ((updated as Resume).rendered_text ?? "")
      : ((updated as CoverLetter).content ?? "");
  // "Applied" requires the text to ACTUALLY move — not just the version number.
  // A backend (or route) can bump `active_version` while returning the same body,
  // which would otherwise report a change that never happened and leave the page
  // looking byte-identical. When we can't compare (no content was sent) we fall
  // back to the version bump alone.
  const sentBody = comparableBody(before);
  const returnedBody = comparableBody(after);
  const textChanged = sentBody === "" ? versionBumped : sentBody !== returnedBody;
  const applied = versionBumped && textChanged;
  // At least 1 for an applied change, so a formatting-only edit still shows a trace.
  const editCount = applied ? Math.max(1, countTextEdits(before, after)) : 0;
  return { applied, updated, prevVersion, newVersion, editCount };
}

/**
 * A plain-language, status-carrying message for a failed direct improve — so the
 * error toast always names the HTTP status and the server's message.
 */
export function directImproveErrorMessage(err: unknown, kindLabel: string): string {
  if (err instanceof ApiError) {
    const status = err.status ? `${err.status} — ` : "";
    return `Couldn't update your ${kindLabel} (${status}${err.message}).`;
  }
  const detail = err instanceof Error && err.message ? ` — ${err.message}` : "";
  return `Couldn't update your ${kindLabel}${detail}. Please try again.`;
}