import { api } from "./api";

// ---- Types ----

export interface Connection {
  id: string | number;
  name?: string;
  email?: string;
  headline?: string;
  avatar?: string;
  status?: string;
  connected_at?: string;
  [key: string]: unknown;
}

export interface Invite {
  id: string | number;
  email?: string;
  name?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface Thread {
  other_id: string | number;
  name?: string;
  avatar?: string;
  last_message?: string;
  unread?: boolean | number;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Message {
  id: string | number;
  sender_id?: string | number;
  from_me?: boolean;
  body?: string;
  content?: string;
  text?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ---- Connections & invites ----

export function listConnections() {
  return api<Connection[]>("/api/v1/social/connections");
}

export function createInviteLink() {
  return api<{ url?: string; link?: string; token?: string; code?: string }>(
    "/api/v1/social/invites",
    { method: "POST" }
  );
}

export function inviteByEmail(email: string) {
  return api<unknown>("/api/v1/social/invites/email", {
    method: "POST",
    body: { email },
  });
}

export function acceptInvite(inviteId: string | number) {
  return api<unknown>("/api/v1/social/invites/accept", {
    method: "POST",
    body: { invite_id: inviteId, id: inviteId },
  });
}

// ---- Messages ----

export function listThreads() {
  return api<Thread[]>("/api/v1/social/threads");
}

export function listMessages(otherId: string | number) {
  return api<Message[]>(`/api/v1/social/messages/${otherId}`);
}

export function sendMessage(otherId: string | number, body: string) {
  return api<Message>("/api/v1/social/messages", {
    method: "POST",
    body: { to: otherId, other_id: otherId, body },
  });
}