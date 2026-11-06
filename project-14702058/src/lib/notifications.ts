import { api } from "./api";

// ---- Types ----

export interface Notification {
  id: string | number;
  title?: string;
  text?: string;
  body?: string;
  message?: string;
  type?: string;
  read?: boolean;
  unread?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

export interface ReminderPrefs {
  in_app?: boolean;
  email?: boolean;
  sms?: boolean;
  push?: boolean;
  phone?: string;
  timezone?: string;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  daily_digest_hour?: number | string;
  notify_on_apply?: boolean;
  [key: string]: unknown;
}

export type NotificationTone = "primary" | "accent" | "secondary" | "foreground";

// ---- Helpers ----

export function notificationMeta(type?: string): {
  icon: string;
  tone: NotificationTone;
} {
  const t = (type ?? "").toLowerCase();

  if (t.includes("interview") || t.includes("schedule") || t.includes("calendar")) {
    return { icon: "ri-calendar-check-line", tone: "primary" };
  }
  if (t.includes("match")) {
    return { icon: "ri-focus-3-line", tone: "secondary" };
  }
  if (t.includes("reply") || t.includes("message")) {
    return { icon: "ri-mail-line", tone: "accent" };
  }
  if (t.includes("verify") || t.includes("scam") || t.includes("authentic")) {
    return { icon: "ri-shield-check-line", tone: "foreground" };
  }
  if (t.includes("application") || t.includes("apply") || t.includes("submitted")) {
    return { icon: "ri-send-plane-line", tone: "accent" };
  }
  if (t.includes("save") || t.includes("bookmark")) {
    return { icon: "ri-bookmark-line", tone: "secondary" };
  }

  return { icon: "ri-notification-3-line", tone: "primary" };
}

export function notificationText(n: Notification): string {
  return n.text ?? n.title ?? n.body ?? n.message ?? "";
}

// ---- Notifications ----

export function listNotifications() {
  return api<Notification[]>("/api/v1/notifications");
}

export function markAllNotificationsRead() {
  return api<unknown>("/api/v1/notifications/read-all", { method: "PUT" });
}

export function markNotificationRead(id: string | number) {
  return api<unknown>(`/api/v1/notifications/${id}/read`, { method: "PUT" });
}

// ---- Reminders ----

export function getReminderPrefs() {
  return api<ReminderPrefs>("/api/v1/reminders/prefs");
}

export function updateReminderPrefs(body: ReminderPrefs) {
  return api<ReminderPrefs>("/api/v1/reminders/prefs", { method: "PUT", body });
}

export function pushSubscribe() {
  return api<unknown>("/api/v1/reminders/push/subscribe", { method: "POST" });
}

export function pushUnsubscribe() {
  return api<unknown>("/api/v1/reminders/push/unsubscribe", { method: "POST" });
}

export function sendTestReminder() {
  return api<unknown>("/api/v1/reminders/test", { method: "POST" });
}