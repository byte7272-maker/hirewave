import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import {
  listSessions,
  deleteSession,
  type AutoApplySession,
} from "@/lib/autoApply";
import {
  sessionState,
  sessionTimeAgo,
  sessionExpiry,
  sessionFreshness,
  sessionHygiene,
  summarizeSessions,
  type FreshnessState,
} from "@/lib/sessionStatus";
import {
  getSessionsRefreshedAt,
  markSessionsRefreshed,
  isSessionsRefreshStale,
} from "@/lib/sessionRefreshMemory";
import { sessionMeta } from "@/lib/sessionMeta";
import { notifyConnectionsChanged } from "@/lib/integrations";
import { useToast } from "@/components/base/ToastProvider";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import { useBrandName, useExtensionName } from "@/hooks/useBranding";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";

const STATUS_META = {
  active: {
    label: "Connected",
    icon: "ri-check-line",
    tone: "bg-primary-100 text-primary-900",
  },
  expired: {
    label: "Needs reconnect",
    icon: "ri-time-line",
    tone: "bg-accent-100 text-accent-900",
  },
  revoked: {
    label: "Access revoked",
    icon: "ri-close-circle-line",
    tone: "bg-accent-100 text-accent-900",
  },
  unknown: {
    label: "Unknown",
    icon: "ri-question-line",
    tone: "bg-background-200 text-foreground-600",
  },
} as const;

/** The "last used" freshness pill, keyed by the bucketed recency state. */
const FRESHNESS_META: Record<FreshnessState, { label: string; icon: string; tone: string }> = {
  fresh: {
    label: "Active now",
    icon: "ri-flashlight-line",
    tone: "bg-primary-100 text-primary-900",
  },
  today: {
    label: "Active today",
    icon: "ri-timer-line",
    tone: "bg-secondary-100 text-secondary-900",
  },
  week: {
    label: "This week",
    icon: "ri-calendar-line",
    tone: "bg-secondary-100 text-secondary-900",
  },
  stale: {
    label: "Stale",
    icon: "ri-alarm-warning-line",
    tone: "bg-accent-100 text-accent-900",
  },
};

/**
 * "Connected sites" — the place to see and manage the job-site sessions the
 * Connect extension has linked. Lists each session, lets the user disconnect
 * (with a confirm), flags how fresh each one is, nudges housekeeping on cold
 * sessions, and points expired ones back at the connect flow — with a one-tap
 * bulk reconnect when several have lapsed. Reads and writes the production
 * auto-apply API with the signed-in user's bearer token; it never renders any
 * cookie/session secret (the API never returns one).
 */
export default function ConnectedSitesPanel() {
  const brandName = useBrandName();
  const extensionName = useExtensionName();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<AutoApplySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AutoApplySession | null>(null);
  // When the list was last refreshed — remembered across visits so a stale list is obvious.
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(() =>
    getSessionsRefreshedAt()
  );
  // Ticks so the "refreshed X ago" label and the stale flag stay live.
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    setLoading(true);
    setError("");
    setUnauthorized(false);
    try {
      const next = (await listSessions()) ?? [];
      setSessions(Array.isArray(next) ? next : []);
      setLastRefreshedAt(markSessionsRefreshed());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUnauthorized(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not load your connected sites.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Re-pull when the user returns to this tab, so a reconnect completed in
  // another tab shows up in the list (and its refreshed-at stamp) immediately.
  useRefreshOnFocus(load);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleDisconnect(session: AutoApplySession) {
    const provider = session.provider;
    const name = sessionMeta(provider).name;
    setBusy(provider);
    setError("");
    try {
      await deleteSession(provider);
      setSessions((prev) => prev.filter((s) => s.provider !== provider));
      notifyConnectionsChanged();
      showToast(`Disconnected ${name}.`, "info");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUnauthorized(true);
      } else {
        setError(err instanceof ApiError ? err.message : `Could not disconnect ${name}.`);
      }
    } finally {
      setBusy(null);
    }
  }

  // Revoked sessions are ignored — they are no longer connected sites, so they
  // are neither listed nor counted. summary + the visible list share this set.
  const visibleSessions = sessions.filter((s) => sessionState(s) !== "revoked");
  const summary = summarizeSessions(visibleSessions);
  const stale = isSessionsRefreshStale(lastRefreshedAt, now);

  /** Hand the bulk reconnect off to the hub, which walks the connect flow per site. */
  function reconnectAllExpired() {
    navigate("/dashboard/auto-apply?reconnect=expired");
  }

  if (unauthorized) {
    return (
      <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up">
        <div className="px-5 py-4 border-b border-background-200">
          <h2 className="font-heading text-lg font-medium text-foreground-950">Connected sites</h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Sessions the extension can act on
          </p>
        </div>
        <div className="p-8 text-center">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-accent-100 text-accent-900">
            <i className="ri-lock-line text-xl"></i>
          </div>
          <p className="text-sm font-medium text-foreground-900 mt-3">Your session expired</p>
          <p className="text-sm text-foreground-500 mt-1">
            Sign in again to see and manage your connected sites.
          </p>
          <button
            type="button"
            onClick={() => navigate("/auth/login")}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-login-box-line"></i>
            Sign in
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up">
      <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading text-lg font-medium text-foreground-950">Connected sites</h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Sessions the extension can act on for you
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {loading ? (
            <span className="inline-flex items-center gap-1 text-xs text-foreground-500 whitespace-nowrap">
              <i className="ri-loader-4-line animate-spin"></i>
              Checking…
            </span>
          ) : stale ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-accent-100 text-accent-900 whitespace-nowrap">
              <i className="ri-alert-line"></i>
              {lastRefreshedAt
                ? `Stale · refreshed ${sessionTimeAgo(new Date(lastRefreshedAt).toISOString())}`
                : "Not refreshed yet"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-foreground-500 whitespace-nowrap">
              <i className="ri-history-line"></i>
              Refreshed {sessionTimeAgo(new Date(lastRefreshedAt as number).toISOString())}
            </span>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-600 hover:text-foreground-900 px-2.5 py-1.5 rounded-md hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            <i className={`ri-refresh-line ${loading ? "animate-spin" : ""}`}></i>
            Refresh
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
            <i className="ri-error-warning-line text-base mt-0.5"></i>
            <div className="flex-1">{error}</div>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {summary.expired > 0 && !loading && (
          <div className="flex items-center gap-3 flex-wrap rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
            <i className="ri-refresh-line text-base"></i>
            <span className="flex-1">
              {summary.expired} site{summary.expired === 1 ? "" : "s"} need reconnect — auto-apply is
              paused for them.
            </span>
            <button
              type="button"
              onClick={reconnectAllExpired}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-refresh-line"></i>
              Reconnect all expired
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-sm text-foreground-500 flex items-center justify-center gap-2">
            <i className="ri-loader-4-line animate-spin"></i>
            Loading connected sites…
          </div>
        ) : visibleSessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-background-300 bg-background-50 py-12 px-6 text-center">
            <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
              <i className="ri-plug-line text-xl"></i>
            </div>
            <p className="text-sm font-medium text-foreground-900 mt-3">No sites connected yet</p>
            <p className="text-sm text-foreground-500 mt-1 max-w-md mx-auto leading-relaxed">
              Install the {extensionName} extension, sign in to a job site, then click Connect.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {visibleSessions.map((session) => {
              const meta = sessionMeta(session.provider);
              const state = sessionState(session);
              const statusMeta = STATUS_META[state];
              const expiry = sessionExpiry(session.expires_at);
              const freshness = sessionFreshness(session.last_used_at);
              const hygiene = sessionHygiene(session);
              const expired = state === "expired" || expiry?.tone === "expired";
              const isBusy = busy === session.provider;
              return (
                <li
                  key={session.provider}
                  className="rounded-xl bg-background-50 border border-background-200 p-4"
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    <span
                      className={`w-10 h-10 flex items-center justify-center rounded-xl text-background-50 dark:text-foreground-950 text-lg flex-shrink-0 ${meta.tone}`}
                    >
                      <i className={meta.icon}></i>
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground-950">
                          {meta.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusMeta.tone}`}
                        >
                          <i className={statusMeta.icon}></i>
                          {statusMeta.label}
                        </span>
                        {expiry && (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                              expiry.tone === "expired"
                                ? "bg-accent-100 text-accent-900"
                                : "bg-secondary-100 text-secondary-900"
                            }`}
                          >
                            <i
                              className={
                                expiry.tone === "expired" ? "ri-error-warning-line" : "ri-timer-line"
                              }
                            ></i>
                            {expiry.label}
                          </span>
                        )}
                      </div>

                      {session.label && (
                        <p className="flex items-center gap-1.5 text-xs text-foreground-600 mt-1.5 min-w-0">
                          <i className="ri-user-3-line flex-shrink-0"></i>
                          <span className="truncate">{session.label}</span>
                        </p>
                      )}

                      <p className="flex items-center gap-1.5 text-xs text-foreground-500 mt-1 flex-wrap">
                        <i className="ri-time-line flex-shrink-0"></i>
                        <span>
                          {session.last_used_at
                            ? `Last used ${sessionTimeAgo(session.last_used_at)}`
                            : "Not used yet"}
                        </span>
                        {freshness && (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${FRESHNESS_META[freshness.state].tone}`}
                          >
                            <i className={FRESHNESS_META[freshness.state].icon}></i>
                            {FRESHNESS_META[freshness.state].label}
                          </span>
                        )}
                      </p>

                      {hygiene && (
                        <p className="mt-2 inline-flex items-start gap-1.5 rounded-md bg-secondary-100 text-secondary-900 px-2 py-1 text-[11px] font-medium">
                          <i className={`${hygiene.icon} flex-shrink-0 mt-px`}></i>
                          <span>{hygiene.label}</span>
                        </p>
                      )}

                      {expired && (
                        <p className="flex items-center gap-1.5 text-xs text-accent-900 mt-1.5">
                          <i className="ri-refresh-line flex-shrink-0"></i>
                          <span>This session expired — reconnect to resume acting on the site.</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {expired && (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/dashboard/auto-apply?connect=${encodeURIComponent(session.provider)}`)
                          }
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 px-3 py-2 rounded-md border border-primary-300 hover:bg-primary-100 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-refresh-line"></i>
                          Reconnect
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmTarget(session)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-700 hover:text-foreground-950 px-3 py-2 rounded-md border border-background-300 hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                      >
                        {isBusy ? (
                          <>
                            <i className="ri-loader-4-line animate-spin"></i>
                            Working…
                          </>
                        ) : (
                          <>
                            <i className="ri-link-unlink"></i>
                            Disconnect
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-start gap-2 rounded-lg bg-secondary-100 text-secondary-900 px-3 py-2.5 text-xs leading-relaxed">
          <i className="ri-shield-check-line text-sm mt-0.5"></i>
          <span>
            {brandName} stores only the session it needs to act on your behalf — never your password,
            and never the session cookie itself. Revoke anytime.
          </span>
        </div>
      </div>

      {confirmTarget && (
        <ConfirmDialog
          title={`Disconnect ${sessionMeta(confirmTarget.provider).name}?`}
          message={`${brandName} will no longer be able to act on that site until you reconnect. This only drops the stored session — nothing changes on your actual account.`}
          confirmLabel="Disconnect"
          onConfirm={async () => {
            await handleDisconnect(confirmTarget);
            setConfirmTarget(null);
          }}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </section>
  );
}