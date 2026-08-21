// In-app inbox — job-alert emails forwarded to the user's account.
import { api } from "./api";

export interface InboxMessage {
  id: string;
  source: string;
  sender: string;
  subject: string;
  snippet: string;
  job_ids: string[];
  ingested: number;
  is_read: boolean;
  received_at: string;
}

export function getInboxAddress() {
  return api<{ address: string }>("/api/v1/inbox/address");
}
export function listInbox() {
  return api<InboxMessage[]>("/api/v1/inbox");
}
export function markInboxRead(id: string) {
  return api<InboxMessage>(`/api/v1/inbox/${id}/read`, { method: "POST", body: {} });
}
export function deleteInboxMessage(id: string) {
  return api<void>(`/api/v1/inbox/${id}`, { method: "DELETE" });
}
export function syncGmail() {
  return api<{ fetched: number; ingested: number; message_ids: string[] }>("/api/v1/inbox/sync-gmail", { method: "POST", body: {} });
}
