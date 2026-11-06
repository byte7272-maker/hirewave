/**
 * Local history of "Add your own points" submissions.
 *
 * Every time the user weaves their own notes / instructions into a document one
 * entry is recorded here. It starts "pending"; when the user accepts a preview it
 * becomes "implemented" (carrying the sections the AI actually changed) or
 * "not-implemented" (the rewrite landed nothing), and a submission superseded by
 * a newer one is closed as "not-implemented" too. The panel uses this to show
 * which past notes took effect, highlight where they landed, and offer a one-click
 * re-run of everything that never made it in.
 *
 * Local-only, like the draft (`src/lib/incorporateMemory.ts`), because it is
 * working scratch material tied to this device.
 */

export type IncorporateKind = "resume" | "cover-letter";

/** A submission's lifecycle: awaiting a decision, landed, or never applied. */
export type IncorporateStatus = "pending" | "implemented" | "not-implemented";

export interface IncorporateEntry {
  /** Stable id, also used as the React key. */
  id: string;
  /** The note / instruction the user wrote ("" when only points were added). */
  text: string;
  /** The individual points added alongside the note. */
  ideas: string[];
  /** ISO timestamp of the submission. */
  submittedAt: string;
  status: IncorporateStatus;
  /** Human section names the accepted rewrite actually changed. */
  impacted: string[];
  /**
   * The exact new wording the accepted rewrite wrote — used to paint the change
   * onto the rendered paper when the user opens this entry.
   */
  passages?: string[];
}

const PREFIX = "hirewave_incorporate_history";
/** Fired whenever the history changes, so every mounted panel re-reads it. */
export const INCORPORATE_HISTORY_EVENT = "hirewave:incorporate-history-change";

const STATUSES: IncorporateStatus[] = ["pending", "implemented", "not-implemented"];

function storageKey(kind: IncorporateKind, docId: string | number): string {
  return `${PREFIX}_${kind}_${docId}`;
}

function isEntry(value: unknown): value is IncorporateEntry {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.id === "string" &&
    typeof rec.text === "string" &&
    Array.isArray(rec.ideas) &&
    typeof rec.submittedAt === "string" &&
    STATUSES.includes(rec.status as IncorporateStatus) &&
    Array.isArray(rec.impacted)
  );
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/** A fresh, collision-safe entry id. */
export function makeIncorporateEntryId(): string {
  return `inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Read a document's submission history (oldest first). */
export function readIncorporateHistory(
  kind: IncorporateKind,
  docId: string | number
): IncorporateEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(kind, docId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).map((e) => ({
      ...e,
      ideas: toStringArray(e.ideas),
      impacted: toStringArray(e.impacted),
      passages: toStringArray(e.passages),
    }));
  } catch {
    return [];
  }
}

/** Persist a document's submission history (an empty list clears it). */
export function writeIncorporateHistory(
  kind: IncorporateKind,
  docId: string | number,
  entries: IncorporateEntry[]
): void {
  try {
    if (!entries.length) {
      localStorage.removeItem(storageKey(kind, docId));
      return;
    }
    localStorage.setItem(storageKey(kind, docId), JSON.stringify(entries));
  } catch {
    /* storage unavailable — the history still applies for this session */
  }
}

/** Tell every other mounted panel for the same document to re-read storage. */
export function notifyIncorporateHistoryChange(
  kind: IncorporateKind,
  docId: string | number
): void {
  try {
    window.dispatchEvent(
      new CustomEvent(INCORPORATE_HISTORY_EVENT, { detail: { kind, docId: String(docId) } })
    );
  } catch {
    /* no window (SSR) — nothing to sync */
  }
}