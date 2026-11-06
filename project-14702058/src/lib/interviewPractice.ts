/**
 * Practice-mode preferences + small helpers.
 *
 * Everything is persisted in localStorage (wrapped in try/catch so a storage
 * hiccup never breaks the interview flow).
 */

export interface PracticePrefs {
  /** Practice mode on/off. */
  on: boolean;
  /** Sub-mode: true = Study (model answer shown + read), false = Test (hidden). */
  study: boolean;
  /** Read the question (and model answer) aloud automatically. */
  autoRead: boolean;
  /** Auto-open the mic once reading finishes. */
  micAutoStart: boolean;
  /** Show the live vocabulary coaching panel while answering. */
  liveVocab: boolean;
}

const KEY = "hw_interview_practice";

/** Fallback answer time when the coach doesn't suggest one. */
export const DEFAULT_ANSWER_SECONDS = 120;

export const ANSWER_MAX_LENGTH = 2000;

export const defaultPracticePrefs: PracticePrefs = {
  on: false,
  study: false,
  autoRead: true,
  micAutoStart: true,
  liveVocab: true,
};

export function readPracticePrefs(): PracticePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultPracticePrefs };
    const parsed = JSON.parse(raw) as Partial<PracticePrefs>;
    return {
      on: typeof parsed.on === "boolean" ? parsed.on : defaultPracticePrefs.on,
      study: typeof parsed.study === "boolean" ? parsed.study : defaultPracticePrefs.study,
      autoRead:
        typeof parsed.autoRead === "boolean" ? parsed.autoRead : defaultPracticePrefs.autoRead,
      micAutoStart:
        typeof parsed.micAutoStart === "boolean"
          ? parsed.micAutoStart
          : defaultPracticePrefs.micAutoStart,
      liveVocab:
        typeof parsed.liveVocab === "boolean"
          ? parsed.liveVocab
          : defaultPracticePrefs.liveVocab,
    };
  } catch {
    return { ...defaultPracticePrefs };
  }
}

export function writePracticePrefs(prefs: PracticePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage failures — prefs simply won't persist.
  }
}

/** Format a second count as m:ss. */
export function formatCountdown(total: number): string {
  const s = Math.max(0, Math.round(total));
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Normalize the coach's `tips` field (array, newline list, or bullet string). */
export function normalizeTips(tips: string[] | string | null | undefined): string[] {
  if (!tips) return [];
  if (Array.isArray(tips)) return tips.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tips === "string") {
    return tips
      .split(/\r?\n|•|;/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}