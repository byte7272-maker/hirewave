import { api } from "./api";

// ---- Types ----

export interface InboxMessage {
  id: string | number;
  from?: string;
  from_address?: string;
  subject?: string;
  snippet?: string;
  body?: string;
  received_at?: string;
  read?: boolean;
  unread?: boolean;
  job_match?: boolean;
  [key: string]: unknown;
}

// ---- Inbox ----

export function getInboxAddress() {
  return api<{ address?: string; email?: string }>("/api/v1/inbox/address");
}

export function listInbox() {
  return api<InboxMessage[]>("/api/v1/inbox");
}

export function markInboxRead(id: string | number) {
  return api<unknown>(`/api/v1/inbox/${id}/read`, { method: "POST" });
}

export function syncGmail() {
  return api<unknown>("/api/v1/inbox/sync-gmail", { method: "POST" });
}