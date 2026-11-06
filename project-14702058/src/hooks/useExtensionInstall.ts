import { useCallback, useEffect, useState } from "react";
import {
  EXTENSION_STORE_READY,
  EXTENSION_STORE_URL,
  extensionVersion,
  isExtensionOutdated,
  onHarborConnectReady,
} from "@/lib/connectExtension";
import { getExtensionLastSeen, markExtensionLastSeen } from "@/lib/extensionLastSeen";

/**
 * Best-effort check for a Chromium-family browser (Chrome, Edge, Brave, Opera,
 * Chrome on iOS). Firefox and Safari can't install the extension, so they get the
 * "Available for Chrome and Edge" fallback + email capture instead of an install CTA.
 */
function isChromiumBrowser(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  const chromium = /chrome|chromium|crios|edg\/|edg |opr\/|opios/i.test(ua);
  const firefox = /firefox|fxios/i.test(ua);
  const safari = /safari/i.test(ua) && !chromium;
  return chromium && !firefox && !safari;
}

export interface ExtensionInstallState {
  /** Browser can host a Chromium extension. */
  chromium: boolean;
  /** Extension content script already tagged the page. */
  installed: boolean;
  /** Detected installed version, if any. */
  version: string | null;
  /** Installed build is older than the latest published one. */
  outdated: boolean;
  /** Store link is live and the browser supports it — show the install CTA. */
  canInstall: boolean;
  /** Published Chrome Web Store URL, or null while in review. */
  storeUrl: string | null;
  /** Epoch ms when the extension was last detected on this browser, if known. */
  lastSeenAt: number | null;
  /** Re-run detection on demand (e.g. a "Check again" button). */
  refresh: () => void;
}

/**
 * Single source of truth for the extension's install state, shared by the public
 * landing page and the homepage teaser so they never disagree. Reads the store
 * config + live install signal on mount and re-syncs whenever the content script
 * announces itself.
 */
export function useExtensionInstall(): ExtensionInstallState {
  const [chromium] = useState(() => isChromiumBrowser());
  const [installed, setInstalled] = useState(() => extensionVersion() !== null);
  const [version, setVersion] = useState<string | null>(() => extensionVersion());
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(() => getExtensionLastSeen());

  const sync = useCallback((v?: string) => {
    const detected = v ?? extensionVersion();
    const present = extensionVersion() !== null;
    setInstalled(present);
    setVersion(detected);
    // Refresh the "last seen" stamp every time we confirm it's still present.
    if (present) setLastSeenAt(markExtensionLastSeen());
  }, []);

  useEffect(() => {
    sync();
    return onHarborConnectReady(sync);
  }, [sync]);

  return {
    chromium,
    installed,
    version,
    outdated: isExtensionOutdated(version),
    canInstall: chromium && EXTENSION_STORE_READY && !!EXTENSION_STORE_URL,
    storeUrl: EXTENSION_STORE_URL,
    lastSeenAt,
    refresh: sync,
  };
}