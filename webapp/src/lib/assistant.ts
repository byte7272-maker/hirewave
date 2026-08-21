// Permissioned automation assistant — consent, auto form-fill, audit.
import { api } from "./api";

export interface Consent {
  granted: string[];
  available: Record<string, string>;
}
export interface FillEntry {
  field: string;
  label: string;
  value: string;
  source: string;
  status: "filled" | "blocked" | "needs_input";
  reason: string;
}
export interface FillPlan {
  entries: FillEntry[];
  filled: number;
  blocked: number;
  needs_input: number;
}
export interface AutomationAction {
  id: string;
  kind: string;
  job_id: string | null;
  status: string;
  detail: string;
  created_at: string;
}

export const prepareDrafts = (minFit = 70, limit = 5) =>
  api<{ prepared: number; application_ids: string[] }>("/api/v1/assistant/prepare-drafts", { method: "POST", body: { min_fit: minFit, limit } });

export const getConsent = () => api<Consent>("/api/v1/assistant/consent");
export const setConsent = (scopes: string[]) =>
  api<Consent>("/api/v1/assistant/consent", { method: "PUT", body: { scopes } });
export const listActions = () => api<AutomationAction[]>("/api/v1/assistant/actions");
export const autofill = (jobId: string) =>
  api<FillPlan>(`/api/v1/assistant/autofill/${jobId}`, { method: "POST", body: {} });

export interface LiveFillResult {
  status: string;
  filled: string[];
  unknown_required: string[];
  confirmation: string;
  detail: string;
  live: boolean;
}
export const executeFill = (jobId: string, submit: boolean) =>
  api<LiveFillResult>(`/api/v1/assistant/autofill/${jobId}/execute`, { method: "POST", body: { submit } });
