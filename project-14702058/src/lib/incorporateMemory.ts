/**
 * Local memory for the "Add your own points" draft.
 *
 * The ideas and a single free-text field (notes + instructions) are kept per
 * document so a half-written list isn't lost when the user switches tabs, reopens
 * the quick preview or comes back later. It is deliberately local-only (unlike
 * the Improve picks, which sync to the account) because the draft is scratch
 * material rather than a durable preference.
 *
 * Older drafts stored "notes" and "instruction" as separate fields. They are now
 * one box, so a legacy instruction is folded into notes on read — nothing lost.
 */

export type IncorporateKind = "resume" | "cover-letter";

export interface IncorporateDraft {
  /** The user's own points, one per chip. */
  ideas: string[];
  /** Free-text notes and instructions the AI should honor / carry out. */
  notes: string;
}

const PREFIX = "hirewave_incorporate";

function storageKey(kind: IncorporateKind, docId: string | number): string {
  return `${PREFIX}_${kind}_${docId}`;
}

function emptyDraft(): IncorporateDraft {
  return { ideas: [], notes: "" };
}

/** Read the saved draft for a document, falling back to an empty one. */
export function readIncorporateDraft(
  kind: IncorporateKind,
  docId: string | number
): IncorporateDraft {
  try {
    const raw = localStorage.getItem(storageKey(kind, docId));
    if (!raw) return emptyDraft();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyDraft();
    const rec = parsed as Record<string, unknown>;
    const notes = typeof rec.notes === "string" ? rec.notes : "";
    // Fold a legacy separate instruction into the single notes field.
    const legacyInstruction = typeof rec.instruction === "string" ? rec.instruction : "";
    return {
      ideas: Array.isArray(rec.ideas)
        ? rec.ideas.filter(
            (v): v is string => typeof v === "string" && v.trim().length > 0
          )
        : [],
      notes: notes.trim() ? notes : legacyInstruction,
    };
  } catch {
    return emptyDraft();
  }
}

/** Persist a draft. A fully-empty draft clears the stored value. */
export function writeIncorporateDraft(
  kind: IncorporateKind,
  docId: string | number,
  draft: IncorporateDraft
): void {
  try {
    if (!draft.ideas.length && !draft.notes.trim()) {
      localStorage.removeItem(storageKey(kind, docId));
      return;
    }
    localStorage.setItem(
      storageKey(kind, docId),
      JSON.stringify({ ideas: draft.ideas, notes: draft.notes })
    );
  } catch {
    /* storage unavailable — the draft still applies for this session */
  }
}

/** Forget a document's draft. */
export function clearIncorporateDraft(
  kind: IncorporateKind,
  docId: string | number
): void {
  try {
    localStorage.removeItem(storageKey(kind, docId));
  } catch {
    /* best-effort */
  }
}