// Review-checkpoint reminders — channel prefs + web-push subscription.
import { api } from "./api";

export interface ReminderPrefs {
  inapp_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  phone: string;
  push_subscription_count: number;
  notify_on_apply: boolean;
  timezone: string;
  quiet_hours_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
  digest_enabled: boolean;
  digest_hour: number;
  renewed_at: string;
  review_due: boolean;
  vapid_public_key: string;
}

export type ReminderPrefsUpdate = Partial<
  Pick<
    ReminderPrefs,
    | "inapp_enabled" | "email_enabled" | "sms_enabled" | "push_enabled" | "phone"
    | "notify_on_apply" | "timezone" | "quiet_hours_enabled" | "quiet_start" | "quiet_end"
    | "digest_enabled" | "digest_hour"
  >
>;

export const getReminderPrefs = () => api<ReminderPrefs>("/api/v1/reminders/prefs");
export const updateReminderPrefs = (patch: ReminderPrefsUpdate) =>
  api<ReminderPrefs>("/api/v1/reminders/prefs", { method: "PUT", body: patch });
export const renewReminders = () => api<ReminderPrefs>("/api/v1/reminders/renew", { method: "POST", body: {} });
export const testReminder = () => api<{ channels: Record<string, number> }>("/api/v1/reminders/test", { method: "POST", body: {} });
const subscribePush = (subscription: unknown) =>
  api<ReminderPrefs>("/api/v1/reminders/push/subscribe", { method: "POST", body: { subscription } });
const unsubscribePush = (subscription: unknown) =>
  api<ReminderPrefs>("/api/v1/reminders/push/unsubscribe", { method: "POST", body: { subscription } });

/** Best-effort: sync the server-side consent anchor (called on sign-in / renew). */
export const syncRenew = () => renewReminders().catch(() => {});

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Register the SW, ask permission, subscribe, and store the subscription. */
export async function enablePush(vapidPublicKey: string): Promise<ReminderPrefs> {
  if (!pushSupported()) throw new Error("Push notifications aren't supported in this browser.");
  if (!vapidPublicKey) throw new Error("Push isn't configured on the server yet.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission was denied.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
  return subscribePush(sub.toJSON());
}

/** Unsubscribe locally and on the server. */
export async function disablePush(): Promise<ReminderPrefs | void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  const json = sub.toJSON();
  await sub.unsubscribe().catch(() => {});
  return unsubscribePush(json);
}
