import { useCallback, useEffect, useState } from "react";
import { readTransient, writeTransient } from "@/lib/routeMemory";

/**
 * A small, session-only UI bag keyed by route — for ephemeral state such as an
 * open accordion. Survives back/forward within the tab; cleared when the tab
 * closes. Not for durable selection/filters (use `useViewState` for those).
 */
export default function useTransientState<T extends Record<string, unknown>>(
  key: string,
): [Partial<T>, (patch: Partial<T>) => void] {
  const [state, setState] = useState<Partial<T>>(() => readTransient<T>(key));

  useEffect(() => {
    setState(readTransient<T>(key));
  }, [key]);

  const update = useCallback(
    (patch: Partial<T>) => {
      setState((cur) => {
        const next = { ...cur, ...patch };
        writeTransient(key, next);
        return next;
      });
    },
    [key],
  );

  return [state, update];
}