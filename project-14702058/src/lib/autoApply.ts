import { api } from "./api";

// ---- Types ----

export interface AutoApplyGrant {
  id: string | number;
  name?: string;
  role?: string;
  title?: string;
  provider?: string;
  location?: string;
  remote?: boolean;
  enabled?: boolean;
  limit?: number;
  created_at?: string;
  last_run_at?: string;
  [key: string]: unknown;
}

export interface GrantInput {
  name?: string;
  role?: string;
  title?: string;
  location?: string;
  remote?: boolean;
  limit?: number;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface QueueItem {
  id: string | number;
  job_id?: string | number;
  title: string;
  company: string;
  source?: string;
  provider?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ---- Sessions ----

/**
 * A stored job-site session captured by the Connect extension. The API
 * intentionally never returns the cookie/session secret — only these safe fields.
 */
export interface AutoApplySession {
  provider: string;
  label?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string;
  expires_at?: string;
  [key: string]: unknown;
}

/** List the sessions the extension has connected for the signed-in user. */
export function listSessions() {
  return api<AutoApplySession[]>("/api/v1/auto-apply/sessions");
}

export function deleteSession(provider: string) {
  return api<void>(`/api/v1/auto-apply/sessions/${provider}`, { method: "DELETE" });
}

// ---- Connect-intent pairing (helper-assisted session capture) ----

export interface ConnectIntent {
  code: string;
  provider: string;
  status: string;
  expires_at: string;
  [key: string]: unknown;
}

export function startConnectIntent(provider: string) {
  return api<ConnectIntent>("/api/v1/auto-apply/sessions/connect-intent", {
    method: "POST",
    body: { provider },
  });
}

export function pollConnectIntent(code: string) {
  return api<ConnectIntent>(`/api/v1/auto-apply/sessions/connect-intent/${code}`);
}

/** Token-free: the pairing code authorizes this call. Used by the helper and the in-app paste fallback. */
export function submitConnect(code: string, storage_state: unknown, label?: string) {
  return api<unknown>("/api/v1/auto-apply/sessions/connect", {
    method: "POST",
    auth: false,
    body: { code, storage_state, label },
  });
}

// ---- Grants (rules) ----

export function listGrants() {
  return api<AutoApplyGrant[]>("/api/v1/auto-apply/grants");
}

export function createGrant(body: GrantInput) {
  return api<AutoApplyGrant>("/api/v1/auto-apply/grants", { method: "POST", body });
}

export function getGrant(id: string | number) {
  return api<AutoApplyGrant>(`/api/v1/auto-apply/grants/${id}`);
}

export function patchGrant(id: string | number, body: Partial<GrantInput>) {
  return api<AutoApplyGrant>(`/api/v1/auto-apply/grants/${id}`, { method: "PATCH", body });
}

export function deleteGrant(id: string | number) {
  return api<void>(`/api/v1/auto-apply/grants/${id}`, { method: "DELETE" });
}

export function runGrant(id: string | number, body: { dry_run: boolean; limit?: number }) {
  return api<unknown>(`/api/v1/auto-apply/grants/${id}/run`, { method: "POST", body });
}

// ---- Queue + scheduler ----

export function listQueue() {
  return api<QueueItem[]>("/api/v1/auto-apply/queue");
}

export function runDueRules() {
  return api<unknown>("/api/v1/auto-apply/run-due", { method: "POST" });
}