/**
 * Local memory for which prompt categories the user collapsed in Step 1 of the
 * "My Work Highlights" wizard.
 *
 * The prompt set grows over time, so users fold the categories they've already
 * used. That choice is kept per résumé — separate from the wizard draft so it
 * survives even after a run is handed off — and restored when the panel reopens,
 * so a large list comes back exactly the way it was left.
 *
 * It also tracks whether the user has ever copied a prompt for a résumé, which
 * the workspace's zone nav reads to show "Prompts" as done — the first zone's
 * only real "attention" signal, since the prompts are now generated on demand
 * (and then held) rather than loaded automatically.
 *
 * Local-only scratch preference; never synced.
 */

const PREFIX = "hirewave_evidence_prompt_collapsed";
const COPIED_PREFIX = "hirewave_evidence_prompt_copied";

function storageKey(resumeId: string | number): string {
  return `${PREFIX}_${resumeId}`;
}

function copiedKey(resumeId: string | number): string {
  return `${COPIED_PREFIX}_${resumeId}`;
}

/** The categories the user had collapsed for this résumé (empty when none). */
export function readCollapsedCategories(resumeId: string | number): string[] {
  try {
    const raw = localStorage.getItem(storageKey(resumeId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((c): c is string => typeof c === "string")
      : [];
  } catch {
    return [];
  }
}

/** Persist the collapsed categories. An empty list clears the stored value. */
export function writeCollapsedCategories(
  resumeId: string | number,
  categories: string[]
): void {
  try {
    if (categories.length === 0) {
      localStorage.removeItem(storageKey(resumeId));
      return;
    }
    localStorage.setItem(storageKey(resumeId), JSON.stringify(categories));
  } catch {
    /* storage unavailable — collapse state still applies for this session */
  }
}

/** Whether the user has ever copied a prompt for this résumé. */
export function readPromptCopied(resumeId: string | number): boolean {
  try {
    return localStorage.getItem(copiedKey(resumeId)) === "1";
  } catch {
    return false;
  }
}

/** Remember that the user copied a prompt for this résumé. */
export function writePromptCopied(resumeId: string | number): void {
  try {
    localStorage.setItem(copiedKey(resumeId), "1");
  } catch {
    /* storage unavailable — the zone nav just won't mark Prompts done this session */
  }
}

/**
 * Forget that the user copied a prompt for this résumé — used by the workspace's
 * "Reset this run" so the Prompts zone dot goes back to "still to do".
 */
export function clearPromptCopied(resumeId: string | number): void {
  try {
    localStorage.removeItem(copiedKey(resumeId));
  } catch {
    /* best-effort */
  }
}