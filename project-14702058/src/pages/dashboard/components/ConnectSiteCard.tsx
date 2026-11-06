import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useExtensionName } from "@/hooks/useBranding";
import { useExtensionInstall } from "@/hooks/useExtensionInstall";
import { listSessions, type AutoApplySession } from "@/lib/autoApply";
import { sessionTimeAgo, summarizeSessions } from "@/lib/sessionStatus";
import { CONNECTIONS_CHANGED_EVENT } from "@/lib/integrations";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";

/**
 * Dashboard-home shortcut for people who already have the extension installed.
 * Shows the detected version + last-seen time so they can confirm they're on the
 * latest build, and flips to a warmer "connect your first site" empty state when
 * nothing is linked yet. Renders nothing for everyone else, so it never nags
 * folks who haven't installed.
 */
export default function ConnectSiteCard() {
  const extensionName = useExtensionName();
  const { installed, version, outdated, lastSeenAt } = useExtensionInstall();
  const [sessions, setSessions] = useState<AutoApplySession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const next = (await listSessions()) ?? [];
      setSessions(Array.isArray(next) ? next : []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!installed) return;
    void load();
    const refresh = () => {
      void load();
    };
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONNECTIONS_CHANGED_EVENT, refresh);
  }, [installed, load]);

  // Once installed, re-check on tab focus so a site connected elsewhere lands here.
  useRefreshOnFocus(load, installed);

  if (!installed) return null;

  const summary = summarizeSessions(sessions);
  const connectedCount = summary.connected;
  const isFirstSite = !loading && summary.total === 0;
  const lastSeenLabel = lastSeenAt ? sessionTimeAgo(new Date(lastSeenAt).toISOString()) : null;
  const versionLabel = version ? `v${version}` : "Installed";

  return (
    <section
      className={`flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border p-4 animate-fade-in-up ${
        isFirstSite ? "bg-accent-100/70 border-accent-200" : "bg-background-100/60 border-background-200"
      }`}
      style={{ animationDelay: "0.06s" }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span
          className={`w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl ${
            isFirstSite
              ? "bg-accent-500 text-background-50 dark:text-foreground-950"
              : "bg-secondary-100 text-secondary-700"
          }`}
        >
          <i className="ri-plug-line text-lg"></i>
        </span>
        <div className="min-w-0">
          <p
            className={`text-sm font-semibold ${isFirstSite ? "text-accent-900" : "text-foreground-950"}`}
          >
            {isFirstSite ? "Connect your first site" : "Connect a site"}
          </p>
          <p
            className={`text-xs mt-0.5 leading-relaxed ${
              isFirstSite ? "text-accent-900/80" : "text-foreground-600"
            }`}
          >
            {loading
              ? `${extensionName} is installed — checking your connected sites…`
              : isFirstSite
                ? `${extensionName} is installed, but nothing is connected yet. Open a job board and link it in one click.`
                : `${connectedCount} site${connectedCount === 1 ? "" : "s"} connected · ${extensionName} is ready.`}
          </p>

          {!loading && (
            <div
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] ${
                isFirstSite ? "text-accent-900/75" : "text-foreground-500"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <i className="ri-puzzle-2-line"></i>
                {versionLabel}
              </span>
              {lastSeenLabel && (
                <span className="inline-flex items-center gap-1">
                  <i className="ri-eye-line"></i>
                  Last seen {lastSeenLabel}
                </span>
              )}
              {outdated && (
                <span className="inline-flex items-center gap-1 font-semibold text-accent-700">
                  <i className="ri-refresh-line"></i>
                  Update available
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <Link
        to="/dashboard/auto-apply?tab=apps"
        className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
      >
        <i className="ri-add-line"></i>
        {isFirstSite ? "Connect your first site" : "Connect a site"}
      </Link>
    </section>
  );
}