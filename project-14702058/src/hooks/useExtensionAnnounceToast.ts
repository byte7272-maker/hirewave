import { useEffect } from "react";
import { useExtensionName } from "@/hooks/useBranding";
import { useToast } from "@/components/base/ToastProvider";
import { extensionVersion, onHarborConnectReady } from "@/lib/connectExtension";
import {
  hasSeenExtensionAnnounce,
  markExtensionAnnounceSeen,
} from "@/lib/extensionAnnounceMemory";

/**
 * Fires a single, subtle confirmation toast the moment the Connect extension
 * announces itself on the app origin, so installing gives instant feedback.
 * Guarded by a local "seen" flag so it only ever shows once — it handles both a
 * late injection (the ready event) and an extension that was already present
 * before this mounted (the version tag on <html>).
 */
export function useExtensionAnnounceToast(): void {
  const extensionName = useExtensionName();
  const { showToast } = useToast();

  useEffect(() => {
    if (hasSeenExtensionAnnounce()) return;
    let done = false;
    const announce = (version?: string) => {
      if (done) return;
      const v = version ?? extensionVersion();
      // Only announce once we truly have the extension's version — that's the signal
      // it actually tagged the page, so we never toast on a bare mis-fire.
      if (!v) return;
      done = true;
      markExtensionAnnounceSeen();
      showToast(`${extensionName} ready — v${v}`, "success");
    };
    // The extension may already be tagged by the time this mounts.
    announce();
    // ...or it may inject later without a refresh.
    return onHarborConnectReady(announce);
  }, [extensionName, showToast]);
}