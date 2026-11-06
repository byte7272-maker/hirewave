/**
 * Local memory for the "My Work Highlights" wizard.
 *
 * The wizard is three steps: fetch prompts → paste the assistant's answer →
 * tick + lightly edit the extracted facts. Users often leave halfway (run the
 * prompt, come back, paste later), so the in-progress state — the paste and the
 * ticked/edited selections (plus which step they were on) — is kept per résumé.
 *
 * Local-only, like the "Add your own points" draft, because it is scratch
 * material tied to this device. It is cleared once the facts are handed off to
 * the polish flow (or when the user clears the wizard).
 */

/** One reviewable fact with its checkbox + editable wording. */
export interface EvidenceDraftPoint {
  id: string;
  text: string;
  checked: boolean;
}

/**
 * One reviewable EDIT pending in the workspace's review zone — the editable form
 * of a suggested add / remove / reword. Kept so a half-reviewed run is restored
 * exactly (including its per-card Accept state and any inline edits).
 */
export interface EvidenceDraftSuggestion {
  id: string;
  action: "add" | "remove" | "reword";
  section: string;
  before: string;
  after: string;
  rationale: string;
  accepted: boolean;
}

/** The wizard state worth keeping between opens. */
export interface EvidenceDraft {
  step: 1 | 2 | 3;
  /** The text the user pasted back from their company AI. */
  pasted: string;
  /** The extracted facts, with their tick state + any inline edits. */
  points: EvidenceDraftPoint[];
  /** The suggested edits awaiting review, with their Accept state + inline edits. */
  suggestions?: EvidenceDraftSuggestion[];
  /**
   * When the draft was last touched (epoch ms). Used to pick the stalled-longest
   * wizard first — the one the user has neglected the longest. Older drafts saved
   * before this field existed simply read back as 0.
   */
  savedAt?: number;
}

/** Human labels for the three wizard steps (shared by the badge + tooltip). */
export const EVIDENCE_STEP_LABELS: Record<1 | 2 | 3, string> = {
  1: "Get prompts",
  2: "Paste results",
  3: "Review & add",
};

/**
 * A short "Step 2 · Paste results" label for the step a draft is paused on,
 * so a stalled wizard is easy to place at a glance (row badge + tooltip).
 */
export function evidenceStepLabel(step: number): string {
  const n = (isStep(step) ? step : 1) as 1 | 2 | 3;
  return `Step ${n} · ${EVIDENCE_STEP_LABELS[n]}`;
}

/**
 * Just the step number as a short label, e.g. "Step 2" — for tight spots like
 * the sidebar badge tooltip where the full “… · Paste results” would crowd it.
 */
export function evidenceStepShortLabel(step: number): string {
  const n = (isStep(step) ? step : 1) as 1 | 2 | 3;
  return `Step ${n}`;
}

/**
 * A one-line "what's waiting" summary for a paused draft, so a stalled wizard
 * says what it actually needs next (e.g. "6 facts to review") instead of just
 * naming its step. Shared by the résumé row pill and the dashboard shortcut.
 */
export function evidenceDraftSummary(draft: EvidenceDraft): string {
  const edits = draft.suggestions ?? [];
  if (edits.length > 0) {
    const accepted = edits.filter((s) => s.accepted).length;
    return `${accepted} of ${edits.length} edit${edits.length === 1 ? "" : "s"} accepted — review the rest`;
  }
  const total = draft.points.length;
  if (total > 0) {
    const kept = draft.points.filter((p) => p.checked).length;
    if (kept > 0) {
      return `${kept} of ${total} fact${total === 1 ? "" : "s"} kept — review the rest`;
    }
    return `${total} fact${total === 1 ? "" : "s"} to review`;
  }
  if (draft.step === 2) {
    return draft.pasted.trim()
      ? "Results pasted — ready to pull out the facts"
      : "Waiting for you to paste your results";
  }
  return "Prompts ready to run";
}

const PREFIX = "hirewave_evidence_draft";

/**
 * Fired on `window` whenever a résumé gains or loses a saved wizard draft, so
 * live surfaces (the dashboard sidebar count, the Documents tab badge, …) can
 * refresh instantly without polling. Only presence changes are broadcast — not
 * every step change — so the listeners stay cheap.
 */
export const EVIDENCE_DRAFTS_EVENT = "hirewave:evidence-drafts-changed";

function notifyDraftsChanged(): void {
  try {
    window.dispatchEvent(new Event(EVIDENCE_DRAFTS_EVENT));
  } catch {
    /* no window available — nothing to notify */
  }
}

function storageKey(resumeId: string | number): string {
  return `${PREFIX}_${resumeId}`;
}

function isStep(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function isPoint(value: unknown): value is EvidenceDraftPoint {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.id === "string" &&
    typeof rec.text === "string" &&
    typeof rec.checked === "boolean"
  );
}

function isSuggestion(value: unknown): value is EvidenceDraftSuggestion {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  const action = rec.action;
  return (
    typeof rec.id === "string" &&
    (action === "add" || action === "remove" || action === "reword") &&
    typeof rec.section === "string" &&
    typeof rec.before === "string" &&
    typeof rec.after === "string" &&
    typeof rec.rationale === "string" &&
    typeof rec.accepted === "boolean"
  );
}

/** A draft with nothing worth restoring (so it can be dropped). */
function isEmpty(draft: EvidenceDraft): boolean {
  return (
    draft.step === 1 &&
    !draft.pasted.trim() &&
    draft.points.length === 0 &&
    (draft.suggestions?.length ?? 0) === 0
  );
}

/** Read the saved wizard draft for a résumé, or null when there's nothing to restore. */
export function readEvidenceDraft(resumeId: string | number): EvidenceDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(resumeId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    const draft: EvidenceDraft = {
      step: isStep(rec.step) ? rec.step : 1,
      pasted: typeof rec.pasted === "string" ? rec.pasted : "",
      points: Array.isArray(rec.points) ? rec.points.filter(isPoint) : [],
      suggestions: Array.isArray(rec.suggestions)
        ? rec.suggestions.filter(isSuggestion)
        : [],
      savedAt: typeof rec.savedAt === "number" ? rec.savedAt : 0,
    };
    return isEmpty(draft) ? null : draft;
  } catch {
    return null;
  }
}

/** Persist the wizard draft. A draft with nothing in it clears the stored value. */
export function writeEvidenceDraft(
  resumeId: string | number,
  draft: EvidenceDraft
): void {
  try {
    const key = storageKey(resumeId);
    const hadDraft = localStorage.getItem(key) !== null;
    if (isEmpty(draft)) {
      localStorage.removeItem(key);
      if (hadDraft) notifyDraftsChanged();
      return;
    }
    localStorage.setItem(
      key,
      JSON.stringify({
        step: draft.step,
        pasted: draft.pasted,
        points: draft.points.map((p) => ({
          id: p.id,
          text: p.text,
          checked: p.checked,
        })),
        suggestions: (draft.suggestions ?? []).map((s) => ({
          id: s.id,
          action: s.action,
          section: s.section,
          before: s.before,
          after: s.after,
          rationale: s.rationale,
          accepted: s.accepted,
        })),
        // Stamped on every write, so "oldest" tracks the least-recently-touched
        // wizard — an actively edited draft is never the stalled one.
        savedAt: Date.now(),
      })
    );
    if (!hadDraft) notifyDraftsChanged();
  } catch {
    /* storage unavailable — the draft still applies for this session */
  }
}

/** Forget a résumé's wizard draft (called once the facts have been handed off). */
export function clearEvidenceDraft(resumeId: string | number): void {
  try {
    const key = storageKey(resumeId);
    const hadDraft = localStorage.getItem(key) !== null;
    localStorage.removeItem(key);
    if (hadDraft) notifyDraftsChanged();
  } catch {
    /* best-effort */
  }
}

/**
 * Forget every listed résumé's wizard draft in one shot — for a "clean slate".
 *
 * Returns how many drafts were actually cleared. Broadcasts a single
 * drafts-changed event when anything was removed, so every live surface (the
 * sidebar badge, the Documents tab badge) refreshes at once.
 */
export function clearAllEvidenceDrafts(resumeIds: Array<string | number>): number {
  let cleared = 0;
  try {
    for (const id of resumeIds) {
      const key = storageKey(id);
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        cleared += 1;
      }
    }
  } catch {
    /* storage unavailable — nothing to clear */
  }
  if (cleared > 0) notifyDraftsChanged();
  return cleared;
}

/**
 * How many of the given résumés still have a kept in-progress wizard draft.
 *
 * Takes the real résumé ids so a draft left behind by a since-deleted résumé
 * isn't counted — the "In progress" count matches what the list actually shows.
 * Drives the badge on the Documents tab switcher, so a stalled wizard is visible
 * even from the cover-letter tab.
 */
export function countEvidenceDrafts(resumeIds: Array<string | number>): number {
  return resumeIds.reduce(
    (total, id) => (readEvidenceDraft(id) ? total + 1 : total),
    0
  );
}