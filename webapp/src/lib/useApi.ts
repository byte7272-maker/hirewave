import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

export function useApi<T>(path: string | null, reloadOn?: string[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await api<T>(path));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Re-fetch when one of the named window events fires (e.g. after an
  // ingest/apply/submit elsewhere in the app changes shared server state).
  const events = reloadOn?.join(",") ?? "";
  useEffect(() => {
    if (!events) return;
    const names = events.split(",");
    const onChange = () => reload();
    names.forEach((n) => window.addEventListener(n, onChange));
    return () => names.forEach((n) => window.removeEventListener(n, onChange));
  }, [events, reload]);

  return { data, loading, error, reload, setData };
}
