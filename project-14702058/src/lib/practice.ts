import { api } from "./api";

// ---- Types ----

export interface PracticeSession {
  id: string | number;
  peer_name?: string;
  topic?: string;
  role?: string;
  status?: string;
  scheduled_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface PracticeQuestion {
  id: string | number;
  question?: string;
  body?: string;
  text?: string;
  [key: string]: unknown;
}

export interface IceServersResponse {
  ice_servers?: unknown[];
  iceServers?: unknown[];
  [key: string]: unknown;
}

// ---- Peer practice ----

export function listPractice() {
  return api<PracticeSession[]>("/api/v1/practice");
}

export function createPractice(body: {
  topic?: string;
  role?: string;
  [k: string]: unknown;
}) {
  return api<PracticeSession>("/api/v1/practice", { method: "POST", body });
}

export function acceptPractice(id: string | number) {
  return api<unknown>(`/api/v1/practice/${id}/accept`, { method: "POST" });
}

export function endPractice(id: string | number) {
  return api<unknown>(`/api/v1/practice/${id}/end`, { method: "POST" });
}

export function listPracticeQuestions(id: string | number) {
  return api<PracticeQuestion[]>(`/api/v1/practice/${id}/questions`);
}

export function sendSignal(id: string | number, signal: Record<string, unknown>) {
  return api<unknown>(`/api/v1/practice/${id}/signal`, { method: "POST", body: signal });
}

export function listSignals(id: string | number) {
  return api<unknown[]>(`/api/v1/practice/${id}/signals`);
}

export function getIceServers() {
  return api<IceServersResponse>("/api/v1/webrtc/ice-servers");
}