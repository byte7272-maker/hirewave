/**
 * One-shot hand-off for the "My Work Highlights" flow started outside the
 * editor (from the Documents list or the dashboard).
 *
 * The wizard can kick off without a résumé open: the user picks a résumé, runs
 * the prompts, and pastes the answer back. The facts they keep are stashed here,
 * then the launcher sends them into that résumé's editor, which runs the SAME
 * incorporate preview + accept path. The stash is read-once so a stale hand-off
 * never re-fires.
 */

const PREFIX = "hirewave_evidence_handoff";

function storageKey(resumeId: string | number): string {
  return `${PREFIX}_${resumeId}`;
}

/** Stash the chosen facts so the editor can pick them up after navigation. */
export function stashEvidenceIdeas(resumeId: string | number, ideas: string[]): void {
  try {
    const clean = ideas.map((i) => i.trim()).filter(Boolean);
    if (!clean.length) {
      sessionStorage.removeItem(storageKey(resumeId));
      return;
    }
    sessionStorage.setItem(storageKey(resumeId), JSON.stringify(clean));
  } catch {
    /* storage unavailable — the editor simply opens with the wizard instead */
  }
}

/** Read and clear the stashed facts for a résumé (read-once). */
export function takeEvidenceIdeas(resumeId: string | number): string[] | null {
  try {
    const raw = sessionStorage.getItem(storageKey(resumeId));
    if (!raw) return null;
    sessionStorage.removeItem(storageKey(resumeId));
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ideas = parsed.filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
    return ideas.length ? ideas : null;
  } catch {
    return null;
  }
}