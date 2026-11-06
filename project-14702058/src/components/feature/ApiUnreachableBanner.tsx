import { useEffect, useRef, useState } from "react";
import { subscribeApiReachability } from "@/lib/apiReachability";
import { pingApi } from "@/lib/api";
import { useToast } from "@/components/base/ToastProvider";

/**
 * A slim, app-wide banner shown only when the current host can't reach the API.
 *
 * Some hosts (notably the in-app preview) can't make the cross-origin API calls
 * the published site can, so every request fails with "can't reach the server".
 * Rather than leaving the user staring at a spinner or an empty page, this
 * surfaces a clear message and — pointedly — a link to the published site, where
 * the same session and data load normally.
 *
 * It appears only after a short grace period (so a one-off blip doesn't flash it)
 * and disappears the instant any request succeeds again.
 */

// Where to send the user when the current host is blocked. Configurable via
// VITE_PUBLIC_PUBLISHED_SITE_URL; falls back to the project's published origin.
const PUBLISHED_SITE_URL =
  (import.meta.env.VITE_PUBLIC_PUBLISHED_SITE_URL as string | undefined)?.trim() ||
  "https://hlrtlg.readdy.co";

/** How long the API must stay unreachable before the banner shows. */
const SHOW_GRACE_MS = 1200;

export default function ApiUnreachableBanner() {
  const [visible, setVisible] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const timerRef = useRef<number | null>(null);
  const visibleRef = useRef(false);
  visibleRef.current = visible;
  const { showToast } = useToast();

  // When the banner hides because the host is reachable again, confirm the
  // recovery as loudly as the outage was shown — a brief "Back online" toast.
  // Only fires on a real visible→hidden transition, so the initial mount (which
  // is already reachable) never raises a spurious confirmation.
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (wasVisibleRef.current && !visible) {
      showToast("Back online — reconnected to the server.", "success");
    }
    wasVisibleRef.current = visible;
  }, [visible, showToast]);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const unsubscribe = subscribeApiReachability((unreachable) => {
      if (unreachable) {
        // Start the grace timer unless one is already running / it's already shown.
        if (!visibleRef.current && timerRef.current === null) {
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            setVisible(true);
          }, SHOW_GRACE_MS);
        }
      } else {
        // Reachable again — hide immediately and cancel any pending show.
        clearTimer();
        setVisible(false);
      }
    });

    return () => {
      clearTimer();
      unsubscribe();
    };
  }, []);

  if (!visible) return null;

  const onPublishedSite =
    typeof window !== "undefined" && window.location.origin === PUBLISHED_SITE_URL;

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    // A success clears the reachability flag, which the subscription above turns
    // into an immediate hide — so the banner disappears the moment the host replies.
    await pingApi();
    setRetrying(false);
  }

  return (
    <div className="w-full bg-secondary-100 text-secondary-900 border-b border-secondary-200">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs md:text-sm">
        <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <i className="ri-wifi-off-line"></i>
        </span>
        <p className="flex-1 min-w-0 leading-relaxed">
          {onPublishedSite
            ? "Can't reach the server right now. We'll keep retrying — your data is safe."
            : "This preview can't reach the app's API. Open the published site to sign in and see your real data — nothing you're seeing here is lost."}
        </p>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-background-50 text-secondary-900 border border-secondary-300 px-3 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <i className={`${retrying ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}`}></i>
            {retrying ? "Trying…" : "Try again now"}
          </button>
          {!onPublishedSite && (
            <a
              href={PUBLISHED_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-secondary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-external-link-line"></i>
              Open published site
            </a>
          )}
        </div>
      </div>
    </div>
  );
}