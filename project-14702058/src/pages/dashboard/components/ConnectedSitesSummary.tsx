import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import {
  listSessions,
  deleteSession,
  type AutoApplySession,
} from "@/lib/autoApply";
import {
  summarizeSessions,
  sessionState,
  sessionAttention,
  sessionExpiry,
  sessionHygiene,
} from "@/lib/sessionStatus";
import { sessionMeta } from "@/lib/sessionMeta";
import { CONNECTIONS_CHANGED_EVENT, notifyConnectionsChanged } from "@/lib/integrations";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useToast } from "@/components/base/ToastProvider";
import ConfirmDialog from "@/components/base/ConfirmDialog";

/**
 * Dashboard home widget: a glance at how many job-site sessions the Connect
 * extension has linked, plus anything expiring, expired, or gone cold. Clicking
 * the card expands it inline so lapsed sites can be reconnected and cold ones
 * disconnected without leaving home, and a one-tap shortcut opens the connect
 * flow for a brand-new site. Loading and errors stay quiet — the card is a
 * shortcut, not a blocker. It refreshes when sessions change or the tab regains
 * focus.
 */
export default function ConnectedSitesSummary() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<AutoApplySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AutoApplySession | null>(null);

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

  // Re-pull whenever the tab regains focus so a reconnect made in another tab
  // updates the counter without a manual refresh.
  useRefreshOnFocus(load);

  const summary = summarizeSessions(sessions);

  // Revoked sessions are ignored — they are no longer connected sites.
  const visibleSessions = sessions.filter((s) => sessionState(s) !== "revoked");

  // Anything worth a look when the card expands: needs a reconnect, or has gone
  // cold enough that disconnecting is a reasonable cleanup.
  const flagged = visibleSessions.filter(
    (s) => sessionAttention(s) !== null || sessionHygiene(s) !== null
  );
  const staleCount = visibleSessions.filter((s) => sessionHygiene(s) !== null).length;

  const total = summary.total;
  const connected = summary.connected;
  const expired = summary.expired;
  const expiring = summary.expiring;
  const needsAttention = expired + expiring;
  const expandable = !loading && !failed && total > 0;

  /** Open the hub's connect flow so a new site can be linked via the extension. */
  function connectNewSite() {
    navigate("/dashboard/auto-apply?tab=apps");
  }

  async function handleDisconnect(session: AutoApplySession) {
    const provider = session.provider;
    const name = sessionMeta(provider).name;
    setBusy(provider);
    try {
      await deleteSession(provider);
      setSessions((prev) => prev.filter((s) => s.provider !== provider));
      notifyConnectionsChanged();
      showToast(`Disconnected ${name}.`, "info");
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : `Could not disconnect ${name}.`,
        "error"
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative animate-fade-in-up" style={{ animationDelay: "0.18s" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="connected-sites-summary-detail"
        className="group relative overflow-hidden w-full text-left rounded-2xl bg-background-100/60 border border-background-200 p-5 transition-colors hover:border-primary-300 cursor-pointer"
      >
        <span className="pointer-events-none absolute -right-8 -top-10 w-32 h-32 rounded-full blur-3xl opacity-70 bg-secondary-200/50"></span>
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-secondary-100 text-secondary-700">
              <i className="ri-plug-line text-lg"></i>
            </div>
            {needsAttention > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-accent-100 text-accent-900 whitespace-nowrap">
                <i className={expired > 0 ? "ri-alert-line" : "ri-timer-line"}></i>
                {expired > 0 ? `${expired} expired` : `${expiring} expiring`}
              </span>
            ) : (
              <span className="w-7 h-7 flex items-center justify-center rounded-lg text-foreground-400 group-hover:text-primary-700 group-hover:bg-primary-100 transition-colors">
                <i className={`ri-arrow-down-s-line text-base transition-transform ${open ? "rotate-180" : ""}`}></i>
              </span>
            )}
          </div>

          <div className="mt-4 font-heading text-3xl md:text-4xl text-foreground-950 font-medium">
            {loading ? (
              <span className="inline-block w-10 h-8 rounded bg-background-200/70 animate-pulse align-middle"></span>
            ) : failed ? (
              <span className="text-foreground-400">—</span>
            ) : (
              connected
            )}
          </div>
          <div className="text-sm text-foreground-600 mt-0.5">Connected sites</div>

          {!loading && failed && (
            <p className="mt-1 text-xs text-accent-900">Couldn&apos;t check your connected sites</p>
          )}

          {!loading && !failed && (
            <p className="mt-1 text-xs text-foreground-500">
              {total === 0
                ? "No sites connected yet"
                : expired > 0
                  ? `${expired} need reconnect`
                  : expiring > 0
                    ? `${expiring} expiring soon`
                    : "All connected"}
            </p>
          )}

          {/* Hygiene nudge — surfaces a cold/never-used session before you expand. */}
          {!loading && !failed && staleCount > 0 && (
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
              <i className="ri-eraser-line"></i>
              {staleCount} stale session{staleCount === 1 ? "" : "s"}
            </span>
          )}

          {expandable && (
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700">
              {open ? "Hide details" : flagged.length > 0 ? "Tap to review" : "Tap for details"}
              <i className={open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
            </p>
          )}
        </div>
      </button>

      {open && (
        <div
          id="connected-sites-summary-detail"
          className="absolute left-0 right-0 top-full mt-2 z-30 rounded-2xl bg-background-50 border border-background-200 p-4 animate-fade-in-up"
        >
          {loading ? (
            <div className="py-6 text-sm text-foreground-500 flex items-center justify-center gap-2">
              <i className="ri-loader-4-line animate-spin"></i>
              Checking…
            </div>
          ) : failed ? (
            <p className="flex items-center gap-2 text-sm text-accent-900">
              <i className="ri-error-warning-line"></i>
              Couldn&apos;t load your connected sites.
            </p>
          ) : total === 0 ? (
            <div className="text-sm text-foreground-600 leading-relaxed">
              <p className="font-medium text-foreground-950">No sites connected yet</p>
              <p className="mt-1">
                Install the extension, sign in to a job site, then click Connect.
              </p>
              <button
                type="button"
                onClick={connectNewSite}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line"></i>
                Connect a new site
              </button>
            </div>
          ) : flagged.length === 0 ? (
            <div className="flex items-center gap-2.5 text-sm text-foreground-700">
              <span className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-100 text-primary-700 flex-shrink-0">
                <i className="ri-check-line"></i>
              </span>
              All {connected} connected site{connected === 1 ? "" : "s"} look healthy.
            </div>
          ) : (
            <ul className="space-y-2">
              {flagged.map((session) => {
                const meta = sessionMeta(session.provider);
                const attention = sessionAttention(session);
                const hygiene = sessionHygiene(session);
                const expiry = sessionExpiry(session.expires_at);
                const isBusy = busy === session.provider;
                // A cold session shows "Stale"; attention wins when a session is both.
                const tone =
                  attention === "expired"
                    ? { label: "Expired", icon: "ri-time-line", cls: "bg-accent-100 text-accent-900" }
                    : attention === "expiring"
                      ? { label: "Expiring soon", icon: "ri-timer-line", cls: "bg-secondary-100 text-secondary-900" }
                      : { label: "Stale", icon: "ri-eraser-line", cls: "bg-secondary-100 text-secondary-900" };
                return (
                  <li
                    key={session.provider}
                    className="flex items-center gap-3 rounded-xl bg-background-100/60 border border-background-200 p-2.5"
                  >
                    <span
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-background-50 dark:text-foreground-950 flex-shrink-0 ${meta.tone}`}
                    >
                      <i className={meta.icon}></i>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground-950 truncate">
                          {meta.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${tone.cls}`}
                        >
                          <i className={tone.icon}></i>
                          {tone.label}
                        </span>
                      </div>
                      {session.label && (
                        <p className="text-xs text-foreground-500 truncate mt-0.5">{session.label}</p>
                      )}
                      {attention === "expiring" && expiry?.tone === "soon" && (
                        <p className="text-[11px] text-foreground-500 mt-0.5">{expiry.label}</p>
                      )}
                      {!attention && hygiene && (
                        <p className="text-[11px] text-foreground-500 mt-0.5">{hygiene.label}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {attention === "expired" && (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/dashboard/auto-apply?connect=${encodeURIComponent(session.provider)}`)
                          }
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 px-2.5 py-1.5 rounded-md border border-primary-300 hover:bg-primary-100 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-refresh-line"></i>
                          Reconnect
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmTarget(session)}
                        disabled={isBusy}
                        title={`Disconnect ${meta.name}`}
                        aria-label={`Disconnect ${meta.name}`}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-600 hover:text-foreground-950 border border-background-300 hover:bg-background-200 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {isBusy ? (
                          <i className="ri-loader-4-line animate-spin"></i>
                        ) : (
                          <i className="ri-link-unlink"></i>
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 pt-3 border-t border-background-200 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {expired > 0 && (
                <button
                  type="button"
                  onClick={() => navigate("/dashboard/auto-apply?reconnect=expired")}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-refresh-line"></i>
                  Reconnect all expired
                </button>
              )}
              <button
                type="button"
                onClick={connectNewSite}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line"></i>
                Connect a new site
              </button>
            </div>
            <Link
              to="/dashboard/auto-apply?tab=apps"
              className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-600 hover:text-foreground-900 px-2 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              Manage all sites
              <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        </div>
      )}

      {confirmTarget && (
        <ConfirmDialog
          title={`Disconnect ${sessionMeta(confirmTarget.provider).name}?`}
          message="The extension will no longer be able to act on that site until you reconnect. This only drops the stored session — nothing changes on your actual account."
          confirmLabel="Disconnect"
          onConfirm={async () => {
            await handleDisconnect(confirmTarget);
            setConfirmTarget(null);
          }}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}