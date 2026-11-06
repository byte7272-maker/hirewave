import { useCallback, useEffect, useRef, useState } from "react";
import { clearViewState, fetchViewState, saveViewState } from "@/lib/viewState";

export interface ViewStateApi<T> {
  /** The durable object last read from the backend (null until loaded). */
  saved: Partial<T> | null;
  /** True once the initial backend read has settled. */
  loaded: boolean;
  /** Debounced, merge-save of changed keys onto the stored object. */
  save: (patch: Partial<T>) => void;
  /** Delete the stored view state ("reset this page"). */
  reset: () => void;
}

/**
 * Read a page's durable view-state on mount and expose a debounced merge-save.
 *
 * Pages seed their local state from `saved` once `loaded` flips true, then call
 * `save` on every change. `saved` is intentionally the value read on mount (a
 * snapshot), so restoration only happens once and never fights live edits.
 */
export default function useViewState<T extends Record<string, unknown>>(
  view: string,
): ViewStateApi<T> {
  const [saved, setSaved] = useState<Partial<T> | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    let alive = true;
    setSaved(null);
    void fetchViewState<T>(view).then((data) => {
      if (alive) setSaved(data ?? {});
    });
    return () => {
      alive = false;
    };
  }, [view]);

  const save = useCallback((patch: Partial<T>) => {
    saveViewState(viewRef.current, patch as Record<string, unknown>);
  }, []);

  const reset = useCallback(() => {
    void clearViewState(viewRef.current);
    setSaved({});
  }, []);

  return { saved, loaded: saved !== null, save, reset };
}