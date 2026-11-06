import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ApiErrorKind } from "@/lib/api";

interface DocumentLoadErrorProps {
  /** The bucket the failure falls into — drives which state is shown. */
  kind: ApiErrorKind | "";
  /** Singular noun for the document, e.g. "résumé" or "cover letter". */
  entity: string;
  /** The raw server / fallback message, shown for the "other" case. */
  message?: string;
  /** Retry handler — used for the network / other cases. */
  onRetry?: () => void;
  /**
   * Attempt to recover an expired session in place (refresh the token and reload).
   * Returns a message to show when recovery didn't work, or nothing when it did
   * (the page re-renders itself). When omitted, only the sign-in fallback shows.
   */
  onRefreshSession?: () => Promise<string | null | void>;
  /** Where "back" goes (defaults to the Documents list). */
  backHref?: string;
  backLabel?: string;
  /**
   * A plain-text diagnostics block (failing request path + status/timeout +
   * message) built with `buildApiDiagnostics`. When provided, a "Copy
   * diagnostics" button lets the user hand a backend issue straight to support.
   */
  diagnostics?: string;
}

/**
 * The real, non-destructive state shown when a document surface can't be loaded
 * for a signed-in user. It never stands in for the user's document with sample
 * content:
 *
 *  - not-found → a genuine "couldn't be found" state with a link back
 *  - network   → "Can't reach the server" with a Retry (nothing was changed)
 *  - auth      → "session expired" with a sign-in link that returns you here
 *  - other     → the server's own message with a retry
 */
export default function DocumentLoadError({
  kind,
  entity,
  message,
  onRetry,
  onRefreshSession,
  backHref = "/dashboard/documents",
  backLabel = "Back to documents",
  diagnostics,
}: DocumentLoadErrorProps) {
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  async function handleRefresh() {
    if (!onRefreshSession || refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      const result = await onRefreshSession();
      if (typeof result === "string" && result) setRefreshError(result);
    } catch {
      setRefreshError("Couldn't refresh your session. Please sign in again.");
    } finally {
      setRefreshing(false);
    }
  }

  let icon = "ri-error-warning-line";
  let title = `Couldn't load this ${entity}`;
  let detail =
    message?.trim() || `Something went wrong while loading your ${entity}. Please try again.`;
  let tone: "accent" | "secondary" = "accent";

  if (kind === "not-found") {
    icon = "ri-file-unknow-line";
    tone = "secondary";
    title = `This ${entity} couldn't be found`;
    detail = "It may have been deleted, or it belongs to another account.";
  } else if (kind === "network") {
    icon = "ri-wifi-off-line";
    title = "Can't reach the server";
    detail = `We couldn't reach the server to load your ${entity}. Check your connection and try again — nothing has been changed.`;
  } else if (kind === "auth") {
    icon = "ri-lock-line";
    title = "Your session expired";
    detail = "Refresh to pick up where you left off, or sign in again.";
  }

  const backTo = `${location.pathname}${location.search}`;
  const signInHref = `/auth/login?returnTo=${encodeURIComponent(backTo)}`;

  const iconWrap =
    tone === "secondary"
      ? "bg-secondary-100 text-secondary-700"
      : "bg-accent-100 text-accent-700";

  async function copyDiagnostics() {
    if (!diagnostics) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(diagnostics);
      } else {
        // Fallback for browsers/contexts without the async clipboard API.
        const area = document.createElement("textarea");
        area.value = diagnostics;
        area.setAttribute("readonly", "");
        area.style.position = "absolute";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setCopied(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="py-16 text-center">
      <div className={`w-14 h-14 mx-auto flex items-center justify-center rounded-2xl ${iconWrap}`}>
        <i className={`${icon} text-2xl`}></i>
      </div>
      <p className="mt-4 text-sm font-medium text-foreground-900">{title}</p>
      <p className="mt-1 text-xs text-foreground-500 max-w-sm mx-auto">{detail}</p>

      <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
        {kind === "auth" ? (
          <>
            {onRefreshSession && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <i className={refreshing ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
                {refreshing ? "Refreshing…" : "Refresh now"}
              </button>
            )}
            <Link
              to={signInHref}
              className="inline-flex items-center gap-2 text-sm font-semibold text-foreground-700 bg-background-50 border border-background-200 px-4 py-2 rounded-md hover:border-background-300 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-login-box-line"></i>
              {onRefreshSession ? "Sign in instead" : "Sign in"}
            </Link>
          </>
        ) : kind === "network" || kind === "other" ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line"></i>
            Try again
          </button>
        ) : null}

        <Link
          to={backHref}
          className="text-sm font-medium text-foreground-600 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
        >
          {backLabel}
        </Link>
      </div>

      {refreshError && (
        <p className="mt-3 text-xs text-accent-700 flex items-center justify-center gap-1.5">
          <i className="ri-error-warning-line"></i>
          {refreshError}
        </p>
      )}

      {diagnostics && (
        <div className="mt-5 max-w-md mx-auto">
          <button
            type="button"
            onClick={copyDiagnostics}
            title="Copy the failing request path, status, and message to share with support"
            className="inline-flex items-center gap-2 text-xs font-semibold text-foreground-700 bg-background-50 border border-background-200 hover:border-background-300 hover:text-foreground-950 px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className={copied ? "ri-check-line text-primary-700" : "ri-file-copy-line"}></i>
            {copied ? "Copied diagnostics" : "Copy diagnostics"}
          </button>
          <details className="mt-2 text-left">
            <summary className="text-[11px] text-foreground-400 cursor-pointer hover:text-foreground-600 select-none">
              Show details
            </summary>
            <pre className="mt-2 text-[11px] leading-relaxed text-foreground-600 bg-background-100 border border-background-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
              {diagnostics}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}