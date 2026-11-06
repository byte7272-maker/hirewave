import { useEffect, useState } from "react";
import {
  getLastSessionRefresh,
  getSessionRefreshHistory,
  subscribeSessionRefreshLog,
} from "@/lib/sessionRefreshLog";
import { sessionTimeAgo } from "@/lib/sessionStatus";

/**
 * A small session-status chip.
 *
 * The access token refreshes silently ahead of expiry (or after an idle spell),
 * so a long-lived session "just keeps working" — but that recovery used to be
 * visible only as a passing toast. This keeps the last refresh time on hand, so
 * the refresh history stays inspectable: the account menu shows the latest
 * refresh, and the Settings page (panel variant) adds a short history line of
 * the most recent refreshes. Updates live (via the refresh log) and re-renders
 * on a slow timer so the relative time never goes stale.
 */

interface SessionStatusChipProps {
  /** "menu" fits the account-menu dropdown; "panel" sits inside a Settings card. */
  variant?: "menu" | "panel";
  /** Show a short line of the most recent refresh times (used on Settings). */
  showHistory?: boolean;
}

export default function SessionStatusChip({
  variant = "menu",
  showHistory = false,
}: SessionStatusChipProps) {
  const [lastRefresh, setLastRefresh] = useState<number | null>(() => getLastSessionRefresh());
  const [history, setHistory] = useState<number[]>(() => getSessionRefreshHistory());
  // A slow tick keeps the relative "x min ago" honest while the surface is open.
  const [, setTick] = useState(0);

  useEffect(
    () =>
      subscribeSessionRefreshLog((at) => {
        setLastRefresh(at);
        setHistory(getSessionRefreshHistory());
      }),
    [],
  );

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const hasRefresh = lastRefresh !== null;
  const recent = history.slice(0, 3);
  const historyLine =
    recent.length > 0
      ? `Recent refreshes: ${recent
          .map((t) => sessionTimeAgo(new Date(t).toISOString()))
          .join(" · ")}`
      : "No refreshes needed yet — the session is active.";

  const isPanel = variant === "panel";

  return (
    <div className={isPanel ? "" : "px-4 py-2.5 border-b border-background-200"}>
      <div
        className="flex items-center gap-2"
        title={hasRefresh ? new Date(lastRefresh).toLocaleString() : undefined}
      >
        <span
          className={`${isPanel ? "w-8 h-8" : "w-6 h-6"} flex items-center justify-center rounded-full flex-shrink-0 ${
            hasRefresh ? "bg-secondary-100 text-secondary-700" : "bg-background-100 text-foreground-500"
          }`}
        >
          <i
            className={`${hasRefresh ? "ri-refresh-line" : "ri-shield-check-line"} ${
              isPanel ? "text-sm" : "text-xs"
            }`}
          ></i>
        </span>
        <span className="flex-1 min-w-0">
          <span
            className={`block font-semibold text-foreground-900 ${isPanel ? "text-sm" : "text-xs"}`}
          >
            Session
          </span>
          <span
            className={`block text-foreground-500 truncate ${isPanel ? "text-xs" : "text-[11px]"}`}
          >
            {hasRefresh
              ? `Refreshed ${sessionTimeAgo(new Date(lastRefresh).toISOString())}`
              : "Active — no refresh needed yet"}
          </span>
        </span>
      </div>
      {showHistory && (
        <p className="mt-3 pt-3 text-xs text-foreground-600 leading-relaxed border-t border-background-200">
          {historyLine}
        </p>
      )}
    </div>
  );
}