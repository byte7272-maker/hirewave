/**
 * A tiny per-document trace of the LAST immediate AI edit, so the applied change
 * is visible at a glance next to the version badge — e.g. "1 edit \u2192 v14" —
 * without opening the version history.
 *
 * An "immediate AI edit" is the "Ask AI to change it" action that hits `…/ai-edit`,
 * makes ONE targeted change, and saves it as a new active version in a single
 * shot. We remember how many edits it applied and which version it produced, then
 * show that beside the version badge while that version is the active one.
 *
 * Stored per document (r\u00e9sum\u00e9 vs cover letter), best-effort in localStorage;
 * failures are swallowed, mirroring the sibling version memories.
 */

export interface AiEditTrace {
  /** How many edits the immediate AI change applied (>= 1 when it landed). */
  count: number;
  /** The active version the edit produced. */
  version: string | number;
  /** When the edit landed (epoch ms) — used only to pick the freshest trace. */
  at: number;
}

const PREFIX = "hirewave_ai_edit_trace_";

function storageKey(kind: string, docId: string | number): string {
  return `${PREFIX}${kind}_${docId}`;
}

/** Read the last immediate-AI-edit trace for a document (null when none). */
export function readAiEditTrace(
  kind: string,
  docId: string | number
): AiEditTrace | null {
  try {
    const raw = localStorage.getItem(storageKey(kind, docId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AiEditTrace> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const count = Number(parsed.count);
    const version = parsed.version;
    if (!Number.isFinite(count) || count <= 0) return null;
    if (version === undefined || version === null || version === "") return null;
    return {
      count: Math.max(1, Math.round(count)),
      version,
      at: Number(parsed.at) || 0,
    };
  } catch {
    return null;
  }
}

/** Record the last immediate-AI-edit trace for a document. */
export function saveAiEditTrace(
  kind: string,
  docId: string | number,
  trace: AiEditTrace
): void {
  if (trace.version === "" || trace.version === null || trace.version === undefined) return;
  const clean: AiEditTrace = {
    count: Math.max(1, Math.round(Number(trace.count) || 1)),
    version: trace.version,
    at: Number(trace.at) || Date.now(),
  };
  try {
    localStorage.setItem(storageKey(kind, docId), JSON.stringify(clean));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
}

/** Forget the immediate-AI-edit trace for a document. */
export function clearAiEditTrace(kind: string, docId: string | number): void {
  try {
    localStorage.removeItem(storageKey(kind, docId));
  } catch {
    /* non-fatal */
  }
}