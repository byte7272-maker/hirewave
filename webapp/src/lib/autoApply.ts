// Standing auto-apply — connected provider sessions + pre-authorized grants.
import { api } from "./api";

export interface BrowserSession {
  provider: string;
  label: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface AutoApplyCriteria {
  title_keywords: string[];
  locations: string[];
  remote: boolean | null;
  companies_allow: string[];
  companies_deny: string[];
  sources: string[];
  min_fit_score: number | null;
}

export interface Grant {
  id: string;
  name: string;
  scope: "jobs" | "criteria";
  job_ids: string[];
  criteria: AutoApplyCriteria;
  require_verified: boolean;
  max_submits: number;
  daily_cap: number;
  submits_used: number;
  submitted_today: number;
  remaining_total: number;
  status: string;
  mode: "auto" | "assisted";
  interval_minutes: number;
  expires_at: string | null;
  created_at: string;
  last_run_at: string | null;
}

export interface QueueItem {
  job_id: string;
  title: string;
  company: string;
  url: string;
  provider: string;
  grant_id: string;
  fields: Record<string, string>;
  resume_name: string;
}

export interface JobOutcome {
  job_id: string;
  title: string;
  company: string;
  status: string;
  detail: string;
}

export interface RunResult {
  grant_id: string;
  dry_run: boolean;
  eligible: number;
  attempted: number;
  submitted: number;
  remaining_total: number;
  remaining_today: number;
  grant_status: string;
  outcomes: JobOutcome[];
  detail: string;
}

export interface CreateGrantInput {
  name?: string;
  scope?: "jobs" | "criteria";
  job_ids?: string[];
  criteria?: Partial<AutoApplyCriteria>;
  require_verified?: boolean;
  max_submits?: number;
  daily_cap?: number;
  expires_at?: string | null;
  mode?: "auto" | "assisted";
  interval_minutes?: number;
}

// Sessions
export const listSessions = () => api<BrowserSession[]>("/api/v1/auto-apply/sessions");
export const disconnectSession = (provider: string) =>
  api<void>(`/api/v1/auto-apply/sessions/${provider}`, { method: "DELETE" });

// Grants
export const listGrants = () => api<Grant[]>("/api/v1/auto-apply/grants");
export const createGrant = (input: CreateGrantInput) =>
  api<Grant>("/api/v1/auto-apply/grants", { method: "POST", body: input });
export const setGrantStatus = (id: string, status: "active" | "paused" | "revoked") =>
  api<Grant>(`/api/v1/auto-apply/grants/${id}`, { method: "PATCH", body: { status } });
export const deleteGrant = (id: string) =>
  api<void>(`/api/v1/auto-apply/grants/${id}`, { method: "DELETE" });
export const runGrant = (id: string, dryRun: boolean, limit?: number) =>
  api<RunResult>(`/api/v1/auto-apply/grants/${id}/run`, { method: "POST", body: { dry_run: dryRun, limit } });
export const runDue = () => api<RunResult[]>("/api/v1/auto-apply/run-due", { method: "POST", body: {} });
export const getApplyQueue = () => api<QueueItem[]>("/api/v1/auto-apply/queue");
