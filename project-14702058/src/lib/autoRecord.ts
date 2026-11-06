/**
 * Hands-free mock-interview capture: preferences + voice-activity tuning.
 *
 * Everything a user can tune (mic sensitivity + trailing-silence duration) is
 * persisted in localStorage, wrapped so a storage hiccup never breaks the run.
 */

export interface AutoRecordPrefs {
  /** Hands-free answering on/off (auto-open the mic after the question is read). */
  enabled: boolean;
  /** 0-100 — higher makes quieter speech register as "speaking". */
  sensitivity: number;
  /** Continuous trailing silence (ms) that ends an answer after the min guard. */
  trailingSilenceMs: number;
}

const KEY = "hw_interview_auto_record";

/** How often we sample the mic level for voice-activity detection. */
export const VAD_SAMPLE_MS = 100;
/** Ambient-noise calibration window at the start of each answer. */
export const VAD_CALIBRATION_MS = 500;
/** Minimum *speaking* time before an answer is allowed to auto-end. */
export const MIN_SPEAKING_MS = 3000;
/** Minimum words before an answer is allowed to auto-end. */
export const MIN_ANSWER_WORDS = 8;
/** Hard cap on a single answer's length. */
export const MAX_ANSWER_MS = 150000;
/** If nothing intelligible is captured within this long, re-prompt (never submit). */
export const NO_SPEECH_TIMEOUT_MS = 8000;
/** Required trailing silence when a completed utterance (final result) just landed. */
export const FINAL_UTTERANCE_SILENCE_MS = 1200;

export const TRAILING_MIN_MS = 1000;
export const TRAILING_MAX_MS = 5000;
export const TRAILING_STEP_MS = 250;

/** Absolute floor for the speech threshold, so pure-silence rooms still work. */
const MIN_THRESHOLD = 0.008;

export const defaultAutoRecordPrefs: AutoRecordPrefs = {
  enabled: true,
  sensitivity: 60,
  trailingSilenceMs: 2500,
};

export function clampSensitivity(value: number): number {
  if (!Number.isFinite(value)) return defaultAutoRecordPrefs.sensitivity;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function clampTrailingSilence(value: number): number {
  if (!Number.isFinite(value)) return defaultAutoRecordPrefs.trailingSilenceMs;
  const snapped = Math.round(value / TRAILING_STEP_MS) * TRAILING_STEP_MS;
  return Math.min(TRAILING_MAX_MS, Math.max(TRAILING_MIN_MS, snapped));
}

export function readAutoRecordPrefs(): AutoRecordPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultAutoRecordPrefs };
    const parsed = JSON.parse(raw) as Partial<AutoRecordPrefs>;
    return {
      enabled:
        typeof parsed.enabled === "boolean" ? parsed.enabled : defaultAutoRecordPrefs.enabled,
      sensitivity: clampSensitivity(
        typeof parsed.sensitivity === "number"
          ? parsed.sensitivity
          : defaultAutoRecordPrefs.sensitivity
      ),
      trailingSilenceMs: clampTrailingSilence(
        typeof parsed.trailingSilenceMs === "number"
          ? parsed.trailingSilenceMs
          : defaultAutoRecordPrefs.trailingSilenceMs
      ),
    };
  } catch {
    return { ...defaultAutoRecordPrefs };
  }
}

export function writeAutoRecordPrefs(prefs: AutoRecordPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage failures — the run still works, prefs just won't persist.
  }
}

/**
 * Turn the calibrated ambient noise floor + the user's sensitivity into a
 * speech/non-speech threshold. Higher sensitivity = a lower bar over the noise.
 */
export function speechThresholdFor(noiseFloor: number, sensitivity: number): number {
  const s = clampSensitivity(sensitivity) / 100;
  const multiplier = 1.5 + (1 - s) * 3; // 1.5 (sensitive) .. 4.5 (strict)
  return Math.max(noiseFloor * multiplier, MIN_THRESHOLD);
}

/** Human label for the trailing-silence slider, e.g. "2.5s pause". */
export function formatTrailingSilence(ms: number): string {
  const seconds = clampTrailingSilence(ms) / 1000;
  return `${Number(seconds.toFixed(2))}s pause`;
}