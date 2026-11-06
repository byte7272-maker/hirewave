/**
 * Shared storage for the editor's first-run keyboard-shortcut tips, so they can
 * be shown once, dismissed anywhere, and brought back on demand from the
 * Shortcuts panel ("Show shortcut tips again").
 */

export const SAVE_TIP_SEEN_KEY = "hirewave_save_shortcut_tip_seen";

/** Fired when the tips are reset so a mounted tip can reappear immediately. */
export const SHORTCUT_TIPS_RESET_EVENT = "hirewave:shortcut-tips-reset";

/** Whether the first-run shortcut tip has already been dismissed. */
export function isSaveShortcutTipSeen(): boolean {
  try {
    return localStorage.getItem(SAVE_TIP_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember that the first-run shortcut tip was dismissed. */
export function markSaveShortcutTipSeen(): void {
  try {
    localStorage.setItem(SAVE_TIP_SEEN_KEY, "1");
  } catch {
    /* storage may be unavailable — the tip still hides for this session */
  }
}

/** Bring the first-run shortcut tip back, and tell any mounted tip to reappear. */
export function resetShortcutTips(): void {
  try {
    localStorage.removeItem(SAVE_TIP_SEEN_KEY);
  } catch {
    /* storage may be unavailable — non-fatal */
  }
  try {
    window.dispatchEvent(new Event(SHORTCUT_TIPS_RESET_EVENT));
  } catch {
    /* window may be unavailable in some environments */
  }
}