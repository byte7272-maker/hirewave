import { useCallback, useEffect, useState } from "react";
import {
  detectExtension,
  extensionVersion,
  onHarborConnectReady,
  isExtensionOutdated,
  EXTENSION_LATEST_VERSION,
  EXTENSION_STORE_URL,
  EXTENSION_STORE_READY,
  type ExtensionMode,
} from "@/lib/connectExtension";
import { useExtensionName } from "@/hooks/useBranding";
import {
  listConnectedApps,
  needsReconnect,
  connectedAppKey,
  CONNECTIONS_CHANGED_EVENT,
  type ConnectedApp,
} from "@/lib/integrations";
import { appMetaFor } from "@/pages/dashboard/autoapply/appMeta";
import ExtensionWaitlistForm from "@/components/feature/ExtensionWaitlistForm";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";

type Status = "checking" | ExtensionMode;

interface HarborExtensionStatusProps {
  /** Jump to the connected-apps tab (used by the "need reconnect" list). */
  onShowReconnect?: () => void;
  /** Open the pairing-code flow (State C primary action). */
  onConnectWithCode?: () => void;
}

/**
 * At-a-glance status for the Connect extension. One config constant
 * (`EXTENSION_STORE_READY`) drives three states:
 *   A. installed            → "installed" + version, chip "Installed"
 *   B. not installed, ready → chip "Not installed", Install link
 *   C. not installed, soon  → chip "In review", coming-soon panel
 */
export default function HarborExtensionStatus({
  onShowReconnect,
  onConnectWithCode,
}: HarborExtensionStatusProps) {
  const extensionName = useExtensionName();
  const [status, setStatus] = useState<Status>("checking");
  const [version, setVersion] = useState<string | null>(null);
  const [reconnectApps, setReconnectApps] = useState<ConnectedApp[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const apply = (mode: ExtensionMode) => {
      if (cancelled) return;
      setStatus(mode);
    };
    const reDetect = (v?: string) => {
      const detected = v ?? extensionVersion();
      if (!cancelled) setVersion(detected);
      detectExtension().then(apply);
    };
    reDetect();
    // Re-run if the extension injects late, so it upgrades without a refresh.
    const off = onHarborConnectReady(reDetect);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // At-a-glance reconnect list: fetch once, then re-count when connections change
  // or the window regains focus. Best-effort — a failure just leaves the list empty.
  const load = useCallback(async () => {
    try {
      const apps = (await listConnectedApps()) ?? [];
      setReconnectApps(apps.filter(needsReconnect));
    } catch {
      // Glance only — ignore transient errors.
    }
  }, []);

  useEffect(() => {
    void load();
    const onChanged = () => {
      void load();
    };
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CONNECTIONS_CHANGED_EVENT, onChanged);
  }, [load]);

  // Re-count on tab focus so a reconnect finished in another tab lands here too.
  useRefreshOnFocus(load);

  // Collapse the list whenever there's nothing left to show.
  useEffect(() => {
    if (reconnectApps.length === 0) setExpanded(false);
  }, [reconnectApps.length]);

  const installed = status === "direct" || status === "legacy";
  const legacy = status === "legacy";
  const absent = status === "absent";
  const comingSoon = absent && !EXTENSION_STORE_READY;
  // Installed, but on an older build than what's published in the store.
  const outdated = installed && isExtensionOutdated(version);

  const subtitle =
    status === "checking"
      ? `Looking for ${extensionName}…`
      : status === "direct"
        ? outdated
          ? `v${version} is out of date — update to v${EXTENSION_LATEST_VERSION} for the latest fixes.`
          : "One-click connect is available."
        : legacy
          ? EXTENSION_STORE_READY
            ? "Update for one-click connect (pairing code works now)."
            : "Pairing code works now — one-click arrives with the next update."
          : EXTENSION_STORE_READY
            ? `Install ${extensionName} to connect sites in a single click.`
            : `${extensionName} is in review on the Chrome Web Store.`;

  const badgeLabel =
    status === "checking"
      ? "Checking…"
      : installed
        ? "Installed"
        : EXTENSION_STORE_READY
          ? "Not installed"
          : "In review";

  const badgeCls =
    status === "checking"
      ? "bg-background-200 text-foreground-500"
      : installed
        ? "bg-primary-100 text-primary-900"
        : EXTENSION_STORE_READY
          ? "bg-background-200 text-foreground-600"
          : "bg-secondary-100 text-secondary-900";

  const reconnectCount = reconnectApps.length;
  const reconnectLabel = `${reconnectCount} site${reconnectCount === 1 ? "" : "s"} need reconnect`;

  return (
    <div className="rounded-xl bg-background-100/60 border border-background-200">
      <div className="flex items-center gap-3 flex-wrap px-4 py-3">
        <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary-100 text-secondary-900 flex-shrink-0">
          {status === "checking" ? (
            <i className="ri-loader-4-line animate-spin"></i>
          ) : (
            <i className="ri-puzzle-2-line"></i>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground-900 flex items-center gap-1.5 flex-wrap">
            {installed ? (
              <>
                <span className="inline-flex w-4 h-4 items-center justify-center text-primary-700">
                  <i className="ri-check-line"></i>
                </span>
                <span>{extensionName} installed</span>
                {version && (
                  <span className="text-xs font-normal text-foreground-500">v{version}</span>
                )}
              </>
            ) : (
              extensionName
            )}
          </p>
          <p className="text-xs text-foreground-500">{subtitle}</p>
        </div>
        {reconnectCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-accent-100 text-accent-900 whitespace-nowrap cursor-pointer hover:bg-accent-200 transition-colors"
          >
            <i className="ri-refresh-line"></i>
            {reconnectLabel}
            <i
              className={`ri-arrow-down-s-line transition-transform ${expanded ? "rotate-180" : ""}`}
            ></i>
          </button>
        )}
        {/* Installed but older than the latest published build: nudge to update. */}
        {outdated && EXTENSION_STORE_READY && EXTENSION_STORE_URL && (
          <a
            href={EXTENSION_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-accent-100 text-accent-900 whitespace-nowrap cursor-pointer hover:bg-accent-200 transition-colors"
          >
            <i className="ri-arrow-up-circle-line"></i>
            Update available
          </a>
        )}
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${badgeCls}`}
        >
          {installed && <i className="ri-check-line"></i>}
          {badgeLabel}
        </span>
        {/* State B only: a real, clickable install link once the store listing is live. */}
        {absent && EXTENSION_STORE_READY && EXTENSION_STORE_URL && (
          <a
            href={EXTENSION_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-download-line"></i>
            Install
          </a>
        )}
        {/* State A only: nudge to update when the extension is present but old. */}
        {legacy && EXTENSION_STORE_READY && EXTENSION_STORE_URL && (
          <a
            href={EXTENSION_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line"></i>
            Update
          </a>
        )}
      </div>

      {/* State C: the extension isn't installed and the store item is still in review. */}
      {comingSoon && (
        <div className="border-t border-background-200 px-4 py-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground-900">
              {extensionName} — coming soon
            </p>
            <p className="text-xs text-foreground-600 mt-1 leading-relaxed">
              The one-click browser extension is in review on the Chrome Web Store. Until it&apos;s
              live, you can connect any site in a few seconds with a pairing code.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={onConnectWithCode}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-link"></i>
              Connect with a pairing code
            </button>
            <div className="relative inline-flex group">
              <button
                type="button"
                disabled
                aria-disabled="true"
                aria-describedby="extension-install-tip"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-background-100 text-foreground-400 border border-background-300 px-3.5 py-2 rounded-md whitespace-nowrap cursor-not-allowed pointer-events-none"
              >
                <i className="ri-download-line"></i>
                Install
              </button>
              <span
                id="extension-install-tip"
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[220px] rounded-md bg-foreground-900 text-background-50 text-[11px] leading-snug px-2.5 py-1.5 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10"
              >
                Install link available once approved.
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground-900"></span>
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-secondary-100 text-secondary-900 px-3 py-2.5 text-xs leading-relaxed">
            <i className="ri-shield-check-line text-sm mt-0.5"></i>
            <span>cookies only, never your password.</span>
          </div>
          <div className="rounded-lg border border-background-200 bg-background-50 px-3 py-3">
            <p className="text-xs font-semibold text-foreground-900 flex items-center gap-1.5">
              <i className="ri-notification-3-line text-sm text-primary-700"></i>
              Want a nudge the moment it&apos;s live?
            </p>
            <p className="text-[11px] text-foreground-500 mt-0.5 mb-2">
              Leave your email and we&apos;ll tell you as soon as it&apos;s approved.
            </p>
            <ExtensionWaitlistForm tone="secondary" />
          </div>
        </div>
      )}

      {expanded && reconnectCount > 0 && (
        <div className="border-t border-background-200 px-4 py-2.5 space-y-0.5">
          {reconnectApps.map((app) => {
            const meta = appMetaFor(app);
            const key = connectedAppKey(app);
            const expired = String(app.status ?? "").toLowerCase() === "expired";
            return (
              <button
                key={key}
                type="button"
                onClick={onShowReconnect}
                className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-background-200/60 transition-colors cursor-pointer"
              >
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded-md text-background-50 dark:text-foreground-950 text-xs flex-shrink-0 ${meta.tone}`}
                >
                  <i className={meta.icon}></i>
                </span>
                <span className="text-sm text-foreground-800 flex-1 truncate">{meta.name}</span>
                <span className="text-[11px] text-foreground-500 whitespace-nowrap">
                  {expired ? "Session expired" : "Access revoked"}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-900 whitespace-nowrap">
                  Reconnect
                  <i className="ri-arrow-right-s-line"></i>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}