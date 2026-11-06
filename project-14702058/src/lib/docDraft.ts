/**
 * Per-document local autosave for manual edits, so an in-progress edit survives
 * a reload or an accidental tab close. Best-effort and scoped to localStorage:
 * storage failures are swallowed so the editor still works for this session.
 */

const PREFIX = "hirewave_doc_draft_";

export interface DocDraft {
  text: string;
  savedAt: string;
}

function keyFor(kind: string, id: string | number): string {
  return `${PREFIX}${kind}_${id}`;
}

/** Read the autosaved draft for a document (null when none / unreadable). */
export function readDocDraft(kind: string, id: string | number): DocDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(kind, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DocDraft>;
    if (typeof parsed?.text !== "string") return null;
    return {
      text: parsed.text,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

/** Persist the in-progress edit for a document. */
export function writeDocDraft(kind: string, id: string | number, text: string): void {
  try {
    localStorage.setItem(
      keyFor(kind, id),
      JSON.stringify({ text, savedAt: new Date().toISOString() })
    );
  } catch {
    // Ignore storage failures — the edit still works for this session.
  }
}

/** Forget the autosaved draft (called once an edit is saved or discarded). */
export function clearDocDraft(kind: string, id: string | number): void {
  try {
    localStorage.removeItem(keyFor(kind, id));
  } catch {
    // Ignore storage failures.
  }
}