import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useExtensionName } from "@/hooks/useBranding";
import { useToast } from "@/components/base/ToastProvider";
import { useExtensionInstall } from "@/hooks/useExtensionInstall";
import { hasSeenExtensionPromo, markExtensionPromoSeen } from "@/lib/extensionPromoMemory";

/** How long to wait before nudging, so it lands after the page has settled. */
const PROMO_DELAY_MS = 2200;

/**
 * One-time nudge for signed-in users pointing them at the dedicated extension
 * page. Only fires for people who don't already have the extension, once per
 * browser (guarded by a local flag), with an "Open page" action that takes them
 * straight to /extension.
 */
export function useExtensionPromoToast(): void {
  const extensionName = useExtensionName();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { installed } = useExtensionInstall();

  useEffect(() => {
    // Already have it? No need to nudge them to go find it.
    if (installed) return;
    if (hasSeenExtensionPromo()) return;
    const timer = window.setTimeout(() => {
      markExtensionPromoSeen();
      showToast(`New: connect any site in one click with ${extensionName}`, "info", {
        label: "Open page",
        onUndo: () => navigate("/extension"),
      });
    }, PROMO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [extensionName, showToast, navigate, installed]);
}