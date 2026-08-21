// Peer connections + direct messaging — invite, connect, message, share jobs.
import { api } from "./api";

export interface Invite { id: string; code: string; status: string; created_at: string }
export interface ConnectionBrief { user_id: string; name: string }
export interface Thread { user_id: string; name: string; last_message: string; last_at: string | null; unread: number }
export interface SharedJob { id: string; title: string; company: string }
export interface Message {
  id: string; from_user_id: string; to_user_id: string; body: string;
  shared_job: SharedJob | null; mine: boolean; created_at: string;
}

export function createInvite() {
  return api<Invite>("/api/v1/social/invites", { method: "POST", body: {} });
}
export function inviteByEmail(email: string) {
  return api<{ code: string; link: string; emailed: boolean }>("/api/v1/social/invites/email", { method: "POST", body: { email } });
}
export function acceptInvite(code: string) {
  return api<ConnectionBrief>("/api/v1/social/invites/accept", { method: "POST", body: { code } });
}
export function listConnections() {
  return api<ConnectionBrief[]>("/api/v1/social/connections");
}
export function listThreads() {
  return api<Thread[]>("/api/v1/social/threads");
}
export function getConversation(userId: string) {
  return api<Message[]>(`/api/v1/social/messages/${userId}`);
}
export function sendMessage(toUserId: string, body: string, sharedJobId?: string) {
  return api<Message>("/api/v1/social/messages", { method: "POST", body: { to_user_id: toUserId, body, shared_job_id: sharedJobId } });
}
