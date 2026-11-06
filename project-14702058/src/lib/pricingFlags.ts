/**
 * Pricing rollout flags — TEMPORARY.
 *
 * Paid plans are being re-priced, so all paid pricing is hidden for now. This is
 * the single switch that drives BOTH temporary behaviors:
 *
 *   false → Free-only pricing section + "Upgrade" reads as a coming-soon reminder
 *   true  → the ORIGINAL paid pricing cards and the real Upgrade behavior return
 *
 * The paid-tier markup and the real upgrade handler are intentionally kept in the
 * code behind this flag (not deleted), so restoring everything is one line.
 */
export const PAID_PLANS_ENABLED = false;

/** Copy shown wherever paid plans are temporarily suppressed. */
export const PAID_PLANS_COMING_SOON_LINE =
  "Paid plans coming soon — pricing to be announced.";

export const UPGRADE_COMING_SOON_MESSAGE =
  "Paid plans are coming soon — you're on the Free plan for now. We'll let you know when upgrades are available.";