/**
 * Local bookkeeping for the tester-program setup checklist.
 *
 * The checklist lives entirely in the browser (no backend), so we persist just
 * enough to answer one question when a tester sends feedback: *where did they
 * get stuck?* The SetupChecklist writes progress here on every tick; the
 * feedback form reads it at submit time and attaches the first unfinished step
 * as the "abandon point". That gives us a signal on which steps trip people up
 * without asking testers to self-report it.
 */

export interface TesterStep {
  id: string;
  title: string;
}

export interface SetupProgress {
  done: Record<string, boolean>;
  steps: TesterStep[];
}

const STORAGE_KEY = "harbor:tester:setup-progress";

/** Read the last-known checklist progress, or null when nothing's stored yet. */
export function readSetupProgress(): SetupProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SetupProgress> | null;
    if (!parsed || !Array.isArray(parsed.steps)) return null;
    return {
      done: parsed.done && typeof parsed.done === "object" ? parsed.done : {},
      steps: parsed.steps.filter(
        (s): s is TesterStep => !!s && typeof s.id === "string" && typeof s.title === "string",
      ),
    };
  } catch {
    return null;
  }
}

/** Persist the current checklist progress (best-effort; ignores storage failures). */
export function writeSetupProgress(progress: SetupProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* storage unavailable — abandon tracking is a nice-to-have, never fatal */
  }
}

/**
 * The first step left unticked — i.e. where a tester appears stuck. Returns an
 * empty string when every step is done (nothing to report) or there's no data.
 */
export function stuckStepLabel(progress: SetupProgress | null): string {
  if (!progress) return "";
  const stuck = progress.steps.find((step) => !progress.done[step.id]);
  return stuck ? stuck.title : "";
}

/** A short "N of M steps done" summary, or "" when there's nothing to report. */
export function setupProgressLabel(progress: SetupProgress | null): string {
  if (!progress || progress.steps.length === 0) return "";
  const total = progress.steps.length;
  const done = progress.steps.filter((step) => progress.done[step.id]).length;
  return `${done} of ${total} steps done`;
}