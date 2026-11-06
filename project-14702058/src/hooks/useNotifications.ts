import { useCallback, useEffect, useState } from "react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/notifications";

export function useNotifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems((await listNotifications()) ?? []);
    } catch {
      setError("Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unreadCount = items.filter((n) => n.unread || !n.read).length;

  async function markRead(id: string | number) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true, unread: false } : n))
    );
    try {
      await markNotificationRead(id);
    } catch {
      // Best-effort; state already optimistically updated.
    }
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true, unread: false })));
    try {
      await markAllNotificationsRead();
    } catch {
      // Best-effort; state already optimistically updated.
    }
  }

  return { items, loading, error, unreadCount, markRead, markAllRead, reload: load };
}