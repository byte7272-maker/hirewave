import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listSessions, type AutoApplySession } from "@/lib/autoApply";
import { sessionMeta } from "@/lib/sessionMeta";
import { sessionState, sessionFreshness } from "@/lib/sessionStatus";
import { CONNECTIONS_CHANGED_EVENT } from "@/lib/integrations";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";

const STATE_META = {
  active: { label: "Connected", dot: "bg-primary-500", text: "text-primary-700" },
  expired: { label: "Needs reconnect", dot: "bg-accent-500", text: "text-accent-800" },
  revoked: { label: "Revoked", dot: "bg-accent-500", text: "text-accent-800" },
  unknown: { label: "Unknown", dot: "bg-background-300", text: "text-foreground-500" },
} as const;

/**
 * A small, glanceable strip that tells a tester which job sites are already
 * linked — so they instantly know whether they still need to run the connect
 * step. It reuses the same session API + provider metadata as the full panels,
 * refreshes when sessions change or the tab regains focus, and stays quiet on
 * failure (it's a status hint, not a blocker).
 */
export default function ConnectedSitesStrip() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<AutoApplySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = (await listSessions()) ?? [];
      setSessions(Array.isArray(next) ? next : []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => {
      void load();
    };
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONNECTIONS_CHANGED_EVENT, refresh);
  }, [load]);

  // Re-pull on tab focus so a reconnect made elsewhere updates the counts here.
  useRefreshOnFocus(load);

  // Revoked sessions are ignored — not listed and not counted.
  const visibleSessions = sessions.filter((s) => sessionState(s) !== "revoked");
  const total = visibleSessions.length;
  const connected = visibleSessions.filter((s) => sessionState(s) === "active").length;
  const expired = visibleSessions.filter((s) => sessionState(s) === "expired").length;
  // Connected sites whose session was used within the last 24 hours — a live
  // "how many are actually working right now" signal for testers.
  const active24h = visibleSessions.filter((s) => {
    if (sessionState(s) !== "active") return false;
    const freshness = sessionFreshness(s.last_used_at)?.state;
    return freshness === "fresh" || freshness === "today";
  }).length;

  return (
    <section
      className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-4 animate-fade-in-up"
      style={{ animationDelay: "0.04s" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary-100 text-secondary-700 flex-shrink-0">
            <i className="ri-links-line"></i>
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-base font-medium text-foreground-950">
              Connected sites
            </h2>
            <p className="text-xs text-foreground-500 mt-0.5">
              {loading
                ? "Checking which sites are linked…"
                : failed
                  ? "Couldn't check right now"
                  : total === 0
                    ? "Nothing linked yet — run the connect step"
                    : `${connected} connected${expired > 0 ? ` · ${expired} need reconnect` : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!loading && !failed && total > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-100 text-primary-900 whitespace-nowrap">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary-500 opacity-60 animate-ping"></span>
                <span className="relative inline-flex w-2 h-2 rounded-full bg-primary-500"></span>
              </span>
              {active24h} active in 24h
            </span>
          )}
          <Link
            to="/dashboard/auto-apply?tab=apps"
            className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-600 hover:text-foreground-900 px-2.5 py-1.5 rounded-md hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            Manage all sites
            <i className="ri-arrow-right-line"></i>
          </Link>
        </div>
      </div>

      {!loading && !failed && expired > 0 && (
        <div className="mb-3 flex items-center gap-3 flex-wrap rounded-lg bg-accent-100 text-accent-900 px-3.5 py-2.5 text-xs">
          <i className="ri-alert-line text-sm flex-shrink-0"></i>
          <span className="flex-1 min-w-[12rem]">
            {expired} site{expired === 1 ? "" : "s"} need to be reconnected — auto-apply is paused for
            {expired === 1 ? " it" : " them"}.
          </span>
          <Link
            to="/dashboard/auto-apply?reconnect=expired"
            className="inline-flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line"></i>
            Reconnect now
          </Link>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 flex-wrap">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-8 w-28 rounded-full bg-background-200/70 animate-pulse"
            ></span>
          ))}
        </div>
      ) : failed ? (
        <div className="flex items-center gap-2 text-xs text-foreground-500">
          <i className="ri-error-warning-line text-sm"></i>
          We&apos;ll show your linked sites once the connection service is reachable.
        </div>
      ) : total === 0 ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-background-200 text-foreground-500 text-xs font-medium">
            <i className="ri-plug-line"></i>
            No sites connected yet
          </span>
          <button
            type="button"
            onClick={() => navigate("/dashboard/auto-apply?tab=apps")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Connect a site
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          {visibleSessions.map((session) => {
            const meta = sessionMeta(session.provider);
            const state = sessionState(session);
            const stateMeta = STATE_META[state];
            return (
              <span
                key={session.provider}
                className="inline-flex items-center gap-2 h-8 pl-1.5 pr-3 rounded-full bg-background-50 border border-background-200"
              >
                <span
                  className={`w-5 h-5 flex items-center justify-center rounded-full text-background-50 dark:text-foreground-950 text-[11px] flex-shrink-0 ${meta.tone}`}
                >
                  <i className={meta.icon}></i>
                </span>
                <span className="text-xs font-medium text-foreground-800 whitespace-nowrap">
                  {meta.name}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold ${stateMeta.text} whitespace-nowrap`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${stateMeta.dot}`}></span>
                  {stateMeta.label}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}