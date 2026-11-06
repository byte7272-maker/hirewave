/**
 * Live vocabulary coaching while the candidate is speaking.
 *
 * Advisory only — it debounces after speech pauses, hard-caps its own call
 * rate, and can be cancelled wholesale on stop/submit/unmount. It must never
 * block the mic or auto-submit.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeVocabulary,
  type VocabularyKind,
  type VocabularyResult,
  type VocabularySuggestion,
} from "./interview";

/** Wait this long after the last transcript change before analyzing. */
export const LIVE_DEBOUNCE_MS = 1500;
/** Never fire more than once inside this window. */
export const LIVE_MIN_INTERVAL_MS = 2000;
/** Below this many words (with no pace yet) a read is too thin to judge. */
export const LIVE_MIN_WORDS = 8;

export interface UseLiveVocabularyArgs {
  /** The pause is live (answering / mic capturing). */
  active: boolean;
  /** The running transcript. */
  text: string;
}

/**
 * Debounced + throttled vocabulary polling for the current transcript.
 * Elapsed time is measured from the moment the pause became active.
 */
export function useLiveVocabulary({ active, text }: UseLiveVocabularyArgs) {
  const [result, setResult] = useState<VocabularyResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const timerRef = useRef<number | null>(null);
  const lastCallRef = useRef(0);
  const startedAtRef = useRef(0);
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const activeRef = useRef(active);
  const textRef = useRef(text);
  const scheduleRef = useRef<(delay: number) => void>(() => {});

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    reqIdRef.current += 1;
  }, []);

  const doFetch = useCallback(() => {
    const value = textRef.current.trim();
    if (!activeRef.current || !value) return;
    cancelInFlight();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++reqIdRef.current;
    const elapsed = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
    setAnalyzing(true);
    analyzeVocabulary({ text: value, elapsed_seconds: elapsed }, controller.signal)
      .then((r) => {
        if (id === reqIdRef.current) setResult(r ?? null);
      })
      .catch(() => {
        // Advisory — a failed poll simply leaves the last good read in place.
      })
      .finally(() => {
        if (id === reqIdRef.current) setAnalyzing(false);
      });
  }, [cancelInFlight]);

  const schedule = useCallback(
    (delay: number) => {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (!activeRef.current) return;
        const now = Date.now();
        const since = now - lastCallRef.current;
        if (since < LIVE_MIN_INTERVAL_MS) {
          // Too soon — wait out the cap, then try again.
          scheduleRef.current(LIVE_MIN_INTERVAL_MS - since);
          return;
        }
        lastCallRef.current = now;
        doFetch();
      }, delay);
    },
    [clearTimer, doFetch]
  );

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  // Reset the clock + read whenever the pause starts or stops.
  useEffect(() => {
    if (active) {
      startedAtRef.current = Date.now();
      lastCallRef.current = 0;
      setResult(null);
      return;
    }
    clearTimer();
    cancelInFlight();
    setAnalyzing(false);
    setResult(null);
  }, [active, clearTimer, cancelInFlight]);

  // Debounce each transcript change; empty speech clears the read.
  useEffect(() => {
    if (!active) return undefined;
    if (!text.trim()) {
      clearTimer();
      setResult(null);
      setAnalyzing(false);
      return undefined;
    }
    schedule(LIVE_DEBOUNCE_MS);
    return clearTimer;
  }, [text, active, schedule, clearTimer]);

  // Full teardown on unmount / navigation.
  useEffect(
    () => () => {
      clearTimer();
      cancelInFlight();
    },
    [clearTimer, cancelInFlight]
  );

  return { result, analyzing };
}

/** Skip rendering while there's too little speech to judge. */
export function liveVocabularyVisible(result: VocabularyResult | null): boolean {
  if (!result) return false;
  const pace = result.pace ?? "";
  const words = typeof result.word_count === "number" ? result.word_count : 0;
  if (pace === "" && words < LIVE_MIN_WORDS) return false;
  return true;
}

// ---- Transcript highlighting ----

export interface HighlightSegment {
  text: string;
  kind?: VocabularyKind;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turn a (possibly multi-word) phrase into a whitespace-tolerant pattern. */
function phrasePattern(original: string): string {
  return original
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Swap the first case-insensitive, word-boundary occurrence of a (possibly
 * multi-word) phrase with `replacement`. Returns the text unchanged when there's
 * nothing to swap, so callers can safely no-op.
 */
export function replacePhraseOnce(text: string, original: string, replacement: string): string {
  const source = text ?? "";
  const needle = (original ?? "").trim();
  const next = (replacement ?? "").trim();
  if (!source || !needle || !next) return source;
  let re: RegExp;
  try {
    re = new RegExp(`\\b${phrasePattern(needle)}\\b`, "i");
  } catch {
    return source;
  }
  return source.replace(re, next);
}

/**
 * Split the live transcript into plain + flagged segments. Case-insensitive,
 * word-boundary matched, and multi-word phrases like "responsible for" work.
 * Returns a single plain segment when there's nothing to flag.
 */
export function highlightTranscript(
  text: string,
  suggestions: VocabularySuggestion[] | undefined
): HighlightSegment[] {
  const source = text ?? "";
  if (!source) return [];
  const usable = (suggestions ?? []).filter((s) => s.original && s.original.trim());
  if (!usable.length) return [{ text: source }];

  const kindByKey = new Map<string, VocabularyKind>();
  for (const s of usable) kindByKey.set(normalizeKey(s.original), s.kind);

  const patterns = Array.from(new Set(usable.map((s) => phrasePattern(s.original))))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!patterns.length) return [{ text: source }];

  let re: RegExp;
  try {
    re = new RegExp(`\\b(?:${patterns.join("|")})\\b`, "gi");
  } catch {
    return [{ text: source }];
  }

  const segments: HighlightSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null = re.exec(source);
  while (match !== null) {
    const index = match.index;
    if (index > last) segments.push({ text: source.slice(last, index) });
    segments.push({ text: match[0], kind: kindByKey.get(normalizeKey(match[0])) });
    last = index + match[0].length;
    if (match[0].length === 0) re.lastIndex += 1;
    match = re.exec(source);
  }
  if (last < source.length) segments.push({ text: source.slice(last) });
  return segments.length ? segments : [{ text: source }];
}