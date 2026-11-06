import { useEffect } from "react";
import { subscribeSessionRefreshed } from "@/lib/session";
import { useToast } from "@/components/base/ToastProvider";

/**
 * Surfaces the otherwise-silent token refresh as a single, subtle toast.
 *
 * The API layer renews the access token quietly ahead of expiry (or after an
 * idle spell) so nothing interrupts the user. That's correct behavior, but it's
 * completely invisible — so after a long idle period a session that "just kept
 * working" can feel accidental. This raises one gentle info toast the moment a
 * refresh actually produces fresh tokens, so the recovery reads as intentional.
 *
 * Rendered once, inside the toast provider. Latched so several refreshes (or a
 * proactive refresh racing a reactive one) never stack duplicate toasts.
 */

// Only one confirmation per this window, even if refreshes fire back-to-back.
const NOTICE_COOLDOWN_MS = 8000;

let lastNoticeAt = 0;

export default function SessionRefreshNotice() {
  const { showToast } = useToast();

  useEffect(() => {
    return subscribeSessionRefreshed(() => {
      const now = Date.now();
      if (now - lastNoticeAt < NOTICE_COOLDOWN_MS) return;
      lastNoticeAt = now;
      showToast("Session refreshed — you're still signed in.", "info");
    });
  }, [showToast]);

  return null;
}