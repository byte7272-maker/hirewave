import { useEffect, useState } from "react";

/**
 * Return a copy of `value` that only updates once `delayMs` has passed without a
 * further change. Used by the document editors to keep typing smooth: the
 * textarea keeps the LIVE value (so the caret never lags), while the expensive
 * document scans it drives — section detection, Find-match counting, the
 * match-context lookup — read this debounced copy and therefore re-run at most a
 * few times a second instead of on EVERY keystroke.
 */
export default function useDebouncedValue<T>(value: T, delayMs = 180): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}