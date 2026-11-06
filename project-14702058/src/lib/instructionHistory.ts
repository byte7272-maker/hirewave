/**
 * Local history of the directives typed into the "AI instructions" box.
 *
 * These are COMMANDS for the AI (e.g. "comma-separate the skills", "keep it to
 * one page"), not document content. Keeping the last few lets the user re-run a
 * past command in one click instead of retyping it. Newest first, de-duplicated
 * case-insensitively, capped to a handful of entries.
 *
 * Local-only (like the sibling draft + submission log) because it is working
 * scratch material tied to this device.
 */

export type InstructionHistoryKind = "resume" | "cover-letter";

const PREFIX = "hirewave_instruction_history";
/** Fired whenever the history changes, so every mounted panel re-reads it. */
export const INSTRUCTION_HISTORY_EVENT = "hirewave:instruction-history-change";
/** How many recent instructions to keep (enough to pick from, not a wall). */
const MAX_ENTRIES = 6;

function storageKey(kind: InstructionHistoryKind, docId: string | number): string {
  return `${PREFIX}_${kind}_${docId}`;
}

/** Read a document's recent instructions (newest first). */
export function readInstructionHistory(
  kind: InstructionHistoryKind,
  docId: string | number
): string[] {
  try {
    const raw = localStorage.getItem(storageKey(kind, docId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    return [];
  }
}

/** Persist a document's recent instructions (an empty list clears it). */
function writeInstructionHistory(
  kind: InstructionHistoryKind,
  docId: string | number,
  entries: string[]
): void {
  try {
    if (!entries.length) {
      localStorage.removeItem(storageKey(kind, docId));
      return;
    }
    localStorage.setItem(storageKey(kind, docId), JSON.stringify(entries));
  } catch {
    /* storage unavailable — the list still applies for this session */
  }
}

/** Tell every other mounted panel for the same document to re-read storage. */
export function notifyInstructionHistoryChange(
  kind: InstructionHistoryKind,
  docId: string | number
): void {
  try {
    window.dispatchEvent(
      new CustomEvent(INSTRUCTION_HISTORY_EVENT, {
        detail: { kind, docId: String(docId) },
      })
    );
  } catch {
    /* no window (SSR) — nothing to sync */
  }
}

/**
 * Push a freshly-applied instruction to the top of the list. Re-running an old
 * command just moves it back to the front rather than duplicating it. Returns
 * the next list.
 */
export function pushInstructionHistory(
  kind: InstructionHistoryKind,
  docId: string | number,
  instruction: string
): string[] {
  const text = instruction.trim();
  const current = readInstructionHistory(kind, docId);
  if (!text) return current;
  const lower = text.toLowerCase();
  const rest = current.filter((entry) => entry.toLowerCase() !== lower);
  const next = [text, ...rest].slice(0, MAX_ENTRIES);
  writeInstructionHistory(kind, docId, next);
  notifyInstructionHistoryChange(kind, docId);
  return next;
}

/** Forget a document's recent instructions. */
export function clearInstructionHistory(
  kind: InstructionHistoryKind,
  docId: string | number
): string[] {
  writeInstructionHistory(kind, docId, []);
  notifyInstructionHistoryChange(kind, docId);
  return [];
}