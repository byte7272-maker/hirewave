/**
 * One-time flag for the "meet the extension" nudge shown to signed-in users,
 * pointing them at the dedicated landing page. Shown once per browser, then
 * never again — it's a discovery aid, not a recurring promotion.
 */

export const EXTENSION_PROMO_SEEN_KEY = "hirewave_extension_promo_seen";

/** Whether the one-time extension promo nudge has already been shown. */
export function hasSeenExtensionPromo(): boolean {
  try {
    return localStorage.getItem(EXTENSION_PROMO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember that the one-time extension promo nudge was shown. */
export function markExtensionPromoSeen(): void {
  try {
    localStorage.setItem(EXTENSION_PROMO_SEEN_KEY, "1");
  } catch {
    /* storage may be unavailable — the nudge still hides for this session */
  }
}