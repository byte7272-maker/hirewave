/**
 * Remembers the last résumé the user picked in the "My Work Highlights"
 * launcher, so reopening it defaults to that same résumé (falling back to the
 * most recently edited one when there's no pick yet).
 *
 * Local-only scratch, like the wizard draft — it just drives which row the
 * launcher highlights and puts first.
 */

const KEY = "hirewave_evidence_last_resume";

/** The last résumé id chosen in the launcher, or null when none has been picked. */
export function readLastEvidenceResume(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

/** Remember the résumé chosen in the launcher. */
export function writeLastEvidenceResume(id: string | number): void {
  try {
    localStorage.setItem(KEY, String(id));
  } catch {
    /* storage unavailable — the launcher simply won't remember across visits */
  }
}