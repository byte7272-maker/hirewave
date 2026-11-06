// Remembers that a visitor already joined the extension's "email me when live"
// waitlist, so returning visitors see the confirmation instead of the empty form.
// Best-effort only — private mode / disabled storage simply means we forget.

const WAITLIST_EMAIL_KEY = "hw-extension-waitlist-email";

/** The email a visitor joined the waitlist with, or null if they haven't. */
export function readWaitlistEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(WAITLIST_EMAIL_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/** Remember a successful waitlist signup. No-op for empty input or storage failures. */
export function rememberWaitlistEmail(email: string): void {
  if (typeof window === "undefined") return;
  const value = (email || "").trim();
  if (!value) return;
  try {
    window.localStorage.setItem(WAITLIST_EMAIL_KEY, value);
  } catch {
    // Ignore — remembering is a convenience, not a requirement.
  }
}