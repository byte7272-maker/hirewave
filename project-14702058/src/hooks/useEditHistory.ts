import { useCallback, useEffect, useRef, useState } from "react";

/** Edits within this window are coalesced into a single undo step (per-word typing). */
const COALESCE_MS = 550;
/** Cap the undo stack so a long editing session can't grow unbounded. */
const MAX_HISTORY = 120;

/**
 * A lightweight undo/redo stack for a single text surface.
 *
 * The caller keeps owning the text state (`value` + `apply`); this hook only
 * watches it. Consecutive keystrokes are coalesced into one step so a single
 * undo doesn't peel back one character at a time. The stack resets whenever the
 * server baseline changes (initial load, a version switch, or a save).
 */
export default function useEditHistory(
  value: string,
  apply: (next: string) => void,
  baseline: string
) {
  const historyRef = useRef<string[]>([value]);
  const indexRef = useRef(0);
  const applyingRef = useRef(false);
  const lastPushRef = useRef(0);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  // A new server baseline (load / version switch / save) starts a fresh stack.
  useEffect(() => {
    historyRef.current = [baseline];
    indexRef.current = 0;
    lastPushRef.current = 0;
    rerender();
  }, [baseline, rerender]);

  // Record each distinct text value, coalescing rapid edits.
  useEffect(() => {
    if (applyingRef.current) {
      applyingRef.current = false;
      return;
    }
    if (historyRef.current[indexRef.current] === value) return;
    const now = Date.now();
    const atTop = indexRef.current === historyRef.current.length - 1;
    if (atTop && indexRef.current > 0 && now - lastPushRef.current < COALESCE_MS) {
      historyRef.current[indexRef.current] = value;
    } else {
      historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
      historyRef.current.push(value);
      if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
      indexRef.current = historyRef.current.length - 1;
    }
    lastPushRef.current = now;
    rerender();
  }, [value, rerender]);

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    applyingRef.current = true;
    apply(historyRef.current[indexRef.current]);
    rerender();
  }, [apply, rerender]);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    applyingRef.current = true;
    apply(historyRef.current[indexRef.current]);
    rerender();
  }, [apply, rerender]);

  return {
    undo,
    redo,
    canUndo: indexRef.current > 0,
    canRedo: indexRef.current < historyRef.current.length - 1,
  };
}