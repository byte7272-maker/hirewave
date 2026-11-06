import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  listConnectedApps,
  disconnectIntegration,
  connectedAppKey as appKey,
  connectedAppStatus,
  needsReconnect,
  notifyConnectionsChanged,
  type ConnectedApp,
  type ConnectedAppStatus,
} from "@/lib/integrations";
import { deleteSession } from "@/lib/autoApply";
import { useToast } from "@/components/base/ToastProvider";
import ConnectedSitesPanel from "@/pages/dashboard/components/ConnectedSitesPanel";
import ConnectSessionModal from "./ConnectSessionModal";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import { appMetaFor } from "@/pages/dashboard/autoapply/appMeta";
import {
  readConnectMethod,
  writeConnectMethod,
  type ConnectMethod,
} from "@/lib/connectMethodMemory";
import { useBrandName } from "@/hooks/useBranding";

/** Connection state we surface on each card, derived from `status` + the connected flags. */
const STATUS_META: Record<ConnectedAppStatus, { label: string; icon: string; tone: string }> = {
  connected: {
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
  disconnected: {
    label: "Not connected",
    icon: "ri-links-line",
    tone: "bg-background-200 text-foreground-500",
  },
};

/**
 * The link-method tag, derived from the API's `method` field so it stays identical
 * on every device. The remembered per-provider method is only a fallback for rows
 * that arrive without a `method`.
 */
type LinkTag = ConnectMethod;

const LINK_TAG_META: Record<LinkTag, { label: string; icon: string; tone: string }> = {
  oauth: {
    label: "OAuth",
    icon: "ri-shield-keyhole-line",
    tone: "bg-accent-100 text-accent-900",
  },
  browser_session: {
    label: "Browser session",
    icon: "ri-window-line",
    tone: "bg-secondary-100 text-secondary-900",
  },
};

function formatDate(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return formatDate(v);
}

function linkTagFor(app: ConnectedApp): LinkTag | null {
  const method = String(app.method ?? "").toLowerCase();
  // The API's `method` is the cross-device source of truth.
  if (method === "oauth" || method === "browser_session") return method;
  // Fallback for rows that arrive without a method: the provider's last-seen method.
  return readConnectMethod(appKey(app));
}

/** Grid order: expired/revoked float to the top, then connected, then the rest. */
const RECONNECT_RANK: Record<ConnectedAppStatus, number> = {
  expired: 0,
  revoked: 0,
  connected: 1,
  disconnected: 2,
};

function reconnectRank(app: ConnectedApp): number {
  return RECONNECT_RANK[connectedAppStatus(app)];
}

interface AuthenticatedAppsTabProps {
  connectProvider?: string | null;
  onConnectConsumed?: () => void;
  /** When true, open the reconnect flow for every site that needs it, in one pass. */
  bulkReconnect?: boolean;
  onBulkReconnectConsumed?: () => void;
}

export default function AuthenticatedAppsTab({
  connectProvider,
  onConnectConsumed,
  bulkReconnect,
  onBulkReconnectConsumed,
}: AuthenticatedAppsTabProps) {
  const brandName = useBrandName();
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<ConnectedApp | null>(null);
  const [reconnectQueue, setReconnectQueue] = useState<string[]>([]);
  const { showToast } = useToast();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = (await listConnectedApps()) ?? [];
      setApps(next);
      // Remember each provider's API method so the tag stays consistent across devices.
      for (const app of next) {
        const method = String(app.method ?? "").toLowerCase();
        if (method === "oauth" || method === "browser_session") {
          writeConnectMethod(appKey(app), method);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load connected apps.");
    } finally {
      setLoading(false);
      notifyConnectionsChanged();
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Deep-link: if a ?connect=<provider> param is present, open that app's connect modal.
  useEffect(() => {
    if (!connectProvider || loading || apps.length === 0) return;
    const key = connectProvider.toLowerCase();
    const target = apps.find((a) => appKey(a) === key);
    if (target && !(target.connected ?? target.authenticated) && (target.supports_auto_apply ?? target.ai_access)) {
      setConnecting(key);
    }
    onConnectConsumed?.();
  }, [connectProvider, loading, apps, onConnectConsumed]);

  async function handleDisconnect(app: ConnectedApp) {
    const key = appKey(app);
    setBusy(key);
    setError("");
    try {
      // Disconnect routes by how the app was linked.
      // OAuth connections live in /integrations; browser sessions live in /auto-apply/sessions.
      const method = String(app.method ?? "").toLowerCase();
      if (method === "oauth") {
        await disconnectIntegration(key);
      } else {
        await deleteSession(key);
      }
      load();
      showToast(`${appMetaFor(app).name} disconnected.`, "info", {
        label: "Undo",
        onUndo: () => {
          setConnecting(key);
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not disconnect ${appMetaFor(app).name}.`);
    } finally {
      setBusy(null);
    }
  }

  // Sites that need re-authentication, and the grid order that floats them to the top.
  const reconnectList = apps.filter(needsReconnect);
  const orderedApps = [...apps].sort((a, b) => reconnectRank(a) - reconnectRank(b));

  // Bulk "Reconnect all" walks the modal through each affected site, one at a time.
  const modalProvider = reconnectQueue[0] ?? connecting;
  const modalApp = modalProvider ? apps.find((a) => appKey(a) === modalProvider) : undefined;

  function reconnectAll() {
    setConnecting(null);
    setReconnectQueue(reconnectList.map((a) => appKey(a)));
  }

  // The ConnectedSitesPanel's "Reconnect all expired" hands control here via
  // ?reconnect=expired — walk the connect flow through each affected site.
  useEffect(() => {
    if (!bulkReconnect || loading || apps.length === 0) return;
    if (reconnectList.length > 0) reconnectAll();
    onBulkReconnectConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkReconnect, loading, apps]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg bg-secondary-100 text-secondary-900 px-4 py-3 text-sm">
        <i className="ri-lock-line text-base mt-0.5"></i>
        <span>
          You log in on each site directly — {brandName} never sees your password, only the session so
          the assistant can apply on your behalf. Disconnect anytime.
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{error}</div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {reconnectList.length > 0 && !loading && (
        <div className="flex items-center gap-3 flex-wrap rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
          <i className="ri-refresh-line text-base"></i>
          <span className="flex-1">
            {reconnectList.length} site{reconnectList.length === 1 ? "" : "s"} need reconnect —
            auto-apply is paused for them.
          </span>
          <button
            onClick={reconnectAll}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line"></i>
            Reconnect all
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading apps…
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 border-dashed py-16 text-center">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
            <i className="ri-plug-line text-xl"></i>
          </div>
          <p className="text-sm font-medium text-foreground-900 mt-3">No apps available</p>
          <p className="text-sm text-foreground-500 mt-1">
            There are no sites to connect right now.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {orderedApps.map((app) => {
            const meta = appMetaFor(app);
            const key = appKey(app);
            const status = connectedAppStatus(app);
            const isConnected = status === "connected";
            const mustReconnect = status === "expired" || status === "revoked";
            const supportsAA = !!(app.supports_auto_apply ?? app.ai_access);
            const hasAI = !!(app.ai_access) || (supportsAA && isConnected);
            const isBusy = busy === key;
            const lastConnectedAt = app.last_connected_at ?? app.connected_at;
            const tag = linkTagFor(app);
            const statusMeta = STATUS_META[status];
            return (
              <div
                key={key}
                className="rounded-2xl bg-background-100/60 border border-background-200 p-5 flex flex-col"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`w-11 h-11 flex items-center justify-center rounded-xl text-background-50 dark:text-foreground-950 text-xl ${meta.tone}`}
                  >
                    <i className={meta.icon}></i>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${statusMeta.tone}`}
                    >
                      <i className={statusMeta.icon}></i>
                      {statusMeta.label}
                    </span>
                    {hasAI && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-accent-100 text-accent-900 whitespace-nowrap">
                        <i className="ri-sparkling-2-line"></i>
                        AI access
                      </span>
                    )}
                  </div>
                </div>

                <h2 className="font-heading text-lg font-medium text-foreground-950 mt-4">
                  {meta.name}
                </h2>
                <p className="text-sm text-foreground-600 mt-1 flex-1">{meta.desc}</p>

                {(isConnected || mustReconnect) && (
                  <div className="mt-2 space-y-1.5">
                    {(app.label ?? app.account_label) && (
                      <p className="flex items-center gap-1.5 text-xs text-foreground-600 min-w-0">
                        <i className="ri-user-3-line flex-shrink-0"></i>
                        <span className="truncate">{app.label ?? app.account_label}</span>
                      </p>
                    )}
                    {app.email && (
                      <p className="text-xs text-foreground-500 truncate">{app.email}</p>
                    )}
                    <p className="flex items-center gap-1.5 text-xs text-foreground-500">
                      <i className="ri-time-line flex-shrink-0"></i>
                      <span>
                        {lastConnectedAt ? `Last connected ${timeAgo(lastConnectedAt)}` : "Connected"}
                      </span>
                    </p>
                    {mustReconnect && (
                      <p className="flex items-center gap-1.5 text-xs text-accent-900">
                        <i className="ri-refresh-line flex-shrink-0"></i>
                        <span>
                          {status === "expired"
                            ? "Session expired — reconnect to resume auto-apply."
                            : "Access revoked — reconnect to resume auto-apply."}
                        </span>
                      </p>
                    )}
                    {tag && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${LINK_TAG_META[tag].tone}`}
                      >
                        <i className={LINK_TAG_META[tag].icon}></i>
                        {LINK_TAG_META[tag].label}
                      </span>
                    )}
                  </div>
                )}

                {supportsAA && (
                  <button
                    onClick={() => {
                      if (isConnected) {
                        setConfirmDisconnect(app);
                      } else {
                        setReconnectQueue([]);
                        setConnecting(key);
                      }
                    }}
                    disabled={isBusy}
                    className={`mt-4 inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                      isConnected
                        ? "text-foreground-700 bg-background-100 border border-background-300 hover:bg-background-200"
                        : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600"
                    }`}
                  >
                    {isBusy ? (
                      <>
                        <i className="ri-loader-4-line animate-spin"></i>
                        Working…
                      </>
                    ) : isConnected ? (
                      <>
                        <i className="ri-close-line"></i>
                        Disconnect
                      </>
                    ) : mustReconnect ? (
                      <>
                        <i className="ri-refresh-line"></i>
                        Reconnect
                      </>
                    ) : (
                      <>
                        <i className="ri-link"></i>
                        Connect
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Manage the sessions the extension created — right where they're made. */}
      <ConnectedSitesPanel />

      {modalApp && (
        <ConnectSessionModal
          key={modalProvider}
          provider={appKey(modalApp)}
          name={appMetaFor(modalApp).name}
          loginUrl={appMetaFor(modalApp).loginUrl}
          onClose={() => {
            setConnecting(null);
            setReconnectQueue([]);
          }}
          onConnected={() => {
            const name = appMetaFor(modalApp).name;
            load();
            if (reconnectQueue.length > 0) {
              showToast(`${name} reconnected.`);
              setReconnectQueue((q) => q.slice(1));
            } else {
              setConnecting(null);
              showToast(`${name} connected — the AI can now apply on your behalf.`);
            }
          }}
        />
      )}

      {confirmDisconnect && (
        <ConfirmDialog
          title={`Disconnect ${appMetaFor(confirmDisconnect).name}?`}
          message="This removes the saved session, so the assistant will stop applying on your behalf using this app. You can reconnect anytime."
          confirmLabel="Disconnect"
          onConfirm={async () => {
            await handleDisconnect(confirmDisconnect);
            setConfirmDisconnect(null);
          }}
          onCancel={() => setConfirmDisconnect(null)}
        />
      )}
    </div>
  );
}