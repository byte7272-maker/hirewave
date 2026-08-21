"use client";

import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { PageHeader, Empty } from "@/components/ui";
import type { Notification } from "@/lib/types";

export default function NotificationsPage() {
  const notes = useApi<Notification[]>("/api/v1/notifications");
  const toast = useToast();

  async function markAll() {
    try {
      await api("/api/v1/notifications/read-all", { method: "PUT" });
      notes.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed.", "error");
    }
  }

  async function markOne(id: string) {
    try {
      await api(`/api/v1/notifications/${id}/read`, { method: "PUT" });
      notes.reload();
    } catch {
      /* ignore */
    }
  }

  const hasUnread = (notes.data ?? []).some((n) => !n.is_read);

  return (
    <>
      <PageHeader
        title="Notifications"
        action={
          hasUnread ? (
            <button className="btn sm" onClick={markAll}>Mark all read</button>
          ) : undefined
        }
      />
      {notes.loading ? (
        <span className="spinner" />
      ) : notes.data && notes.data.length > 0 ? (
        <div className="stack">
          {notes.data.map((n) => (
            <div
              key={n.id}
              className="list-item row between"
              style={{ opacity: n.is_read ? 0.6 : 1 }}
            >
              <div>
                <span className="badge blue" style={{ marginRight: 8 }}>
                  {n.type.replace(/_/g, " ")}
                </span>
                {n.message}
                <div className="faint" style={{ marginTop: 4 }}>
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
              {!n.is_read && (
                <button className="btn ghost sm" onClick={() => markOne(n.id)}>
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty>No notifications yet.</Empty>
      )}
    </>
  );
}
