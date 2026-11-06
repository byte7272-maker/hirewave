import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useExtensionName } from "@/hooks/useBranding";
import { useToast } from "@/components/base/ToastProvider";
import { useExtensionInstall } from "@/hooks/useExtensionInstall";
import { EXTENSION_LATEST_VERSION } from "@/lib/connectExtension";
import { getUpdateNotifiedVersion, markUpdateNotified } from "@/lib/extensionUpdateMemory";

/** Wait a beat so the nudge lands after the dashboard has settled. */
const UPDATE_DELAY_MS = 2600;

/**
 * One-time nudge for signed-in users whose installed extension is behind the
 * latest build. Fires once per outdated version (guarded by a local flag keyed to
 * the target version), with an "Update" action that opens the store listing — or
 * falls back to the extension page when no store URL is configured yet.
 */
export function useExtensionUpdateToast(): void {
  const extensionName = useExtensionName();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { installed, outdated, storeUrl } = useExtensionInstall();

  useEffect(() => {
    if (!installed || !outdated) return;
    if (getUpdateNotifiedVersion() === EXTENSION_LATEST_VERSION) return;
    const timer = window.setTimeout(() => {
      markUpdateNotified(EXTENSION_LATEST_VERSION);
      showToast(`${extensionName} has an update available`, "info", {
        label: "Update",
        onUndo: () => {
          if (storeUrl) {
            window.open(storeUrl, "_blank", "noopener,noreferrer");
          } else {
            navigate("/extension");
          }
        },
      });
    }, UPDATE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [extensionName, showToast, navigate, installed, outdated, storeUrl]);
}