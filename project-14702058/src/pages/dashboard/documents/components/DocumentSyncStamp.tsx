import { useEffect, useState } from "react";

interface DocumentSyncStampProps {
  /** Epoch millis of the last successful list load (null = nothing loaded yet). */
  lastSyncedAt: number | null;
  /** True when that load was a retry after a failure, so the user can tell it apart. */
  retried?: boolean;
  /** Whether a load is in flight right now. */
  loading?: boolean;
}

function relativeTime(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * A tiny, unobtrusive sync status for a document list: it shows when the list
 * was last loaded live, and marks a load that succeeded only after a retry, so
 * it's obvious at a glance whether the list is fresh or recovered.
 *
 * Preview builds have no backend to sync with, so the stamp stays hidden there.
 */
export default function DocumentSyncStamp({
  lastSyncedAt,
  retried,
  loading,
}: DocumentSyncStampProps) {
  // Keep the relative label honest without re-rendering the whole list.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  if (__IS_PREVIEW__) return null;

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-foreground-500 whitespace-nowrap">
        <i className="ri-loader-4-line animate-spin"></i>
        Syncing…
      </span>
    );
  }

  if (!lastSyncedAt) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-foreground-500 whitespace-nowrap"
      title={new Date(lastSyncedAt).toLocaleString()}
    >
      <span className="w-3.5 h-3.5 flex items-center justify-center">
        <i className={retried ? "ri-history-line" : "ri-cloud-line"}></i>
      </span>
      {retried ? "Retried" : "Last synced"} · {relativeTime(lastSyncedAt)}
    </span>
  );
}