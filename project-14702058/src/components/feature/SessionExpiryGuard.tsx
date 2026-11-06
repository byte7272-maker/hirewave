import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { rememberReturnTo, subscribeSessionExpired } from "@/lib/session";
import { useToast } from "@/components/base/ToastProvider";

/**
 * Watches for session-expired events fired by the API layer when a 401 can't be
 * recovered by refreshing the token. It remembers the page the user was on and
 * sends them to sign-in, so once they sign back in they return to exactly what
 * they were opening — a résumé, a cover letter, the review, wherever they were.
 *
 * It also raises a brief "session expired" toast the moment it happens, so the
 * jump to sign-in reads as an explanation rather than an abrupt redirect.
 *
 * Rendered once, inside the router (and inside the toast provider), so it works
 * from any page.
 */

// Latch so several concurrent 401s firing at once only produce one toast.
let lastToastAt = 0;

export default function SessionExpiryGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  // Keep the latest location in a ref so the subscription never re-binds.
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    return subscribeSessionExpired(() => {
      const current = locationRef.current;
      // Already on the auth screens? Nothing to protect.
      if (current.pathname.startsWith("/auth/")) return;

      const backTo = `${current.pathname}${current.search}`;
      rememberReturnTo(backTo);

      const now = Date.now();
      if (now - lastToastAt > 3000) {
        lastToastAt = now;
        showToast("Your session expired — please sign in again.", "info");
      }

      navigate(`/auth/login?returnTo=${encodeURIComponent(backTo)}`, { replace: true });
    });
  }, [navigate, showToast]);

  return null;
}