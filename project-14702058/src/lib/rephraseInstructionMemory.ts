/**
 * Remembers the last rephrase instruction used per document — either a quick
 * preset ("Concise", "Stronger verb"…) or a custom instruction — so the
 * rephrase toolbar opens with that choice already applied next time.
 *
 * Best-effort and scoped to localStorage; storage failures are swallowed so the
 * toolbar still works for the current session.
 */

export type RephraseInstructionKind = "preset" | "custom";

export interface RememberedRephraseInstruction {
  kind: RephraseInstructionKind;
  value: string;
}

const PREFIX = "hirewave_rephrase_instr_";
/** Broadcast so the viewer's toolbar hint updates the moment the choice changes. */
const CHANGE_EVENT = "hirewave_rephrase_instruction_changed";

/** Let interested components (e.g. the viewer hint) react to memory changes. */
export function subscribeRephraseInstruction(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** Tell listeners the stored choice changed. */
function notifyRephraseInstructionChanged(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Ignore — the memory still works, only the live hint won't refresh.
  }
}

/** Read the remembered rephrase instruction for one document (null when unset). */
export function readRephraseInstruction(
  key: string
): RememberedRephraseInstruction | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    if (
      (rec.kind === "preset" || rec.kind === "custom") &&
      typeof rec.value === "string" &&
      rec.value.trim()
    ) {
      return { kind: rec.kind, value: rec.value };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the last rephrase instruction for one document (empty clears it). */
export function writeRephraseInstruction(
  key: string,
  instruction: RememberedRephraseInstruction
): void {
  if (!key) return;
  try {
    const value = instruction.value.trim();
    if (!value) {
      localStorage.removeItem(PREFIX + key);
    } else {
      localStorage.setItem(
        PREFIX + key,
        JSON.stringify({ kind: instruction.kind, value })
      );
    }
  } catch {
    // Ignore storage failures — the choice still applies for this session.
  }
  notifyRephraseInstructionChanged();
}

/** Forget the remembered rephrase instruction for one document. */
export function clearRephraseInstruction(key: string): void {
  if (!key) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore storage failures.
  }
  notifyRephraseInstructionChanged();
}