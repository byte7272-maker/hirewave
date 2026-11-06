import { api } from "./api";

// ---- Types ----

export type AssistantFeatureKey =
  | "prepare_drafts"
  | "autofill"
  | "auto_submit"
  | "notifications";

/** Per-feature permission toggles. Everything is opt-in (off by default). */
export type ConsentMap = Partial<Record<AssistantFeatureKey, boolean>>;

export interface AssistantAction {
  id?: string | number;
  type?: string;
  description?: string;
  status?: string;
  job_title?: string;
  company?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface AutofillPreview {
  job_id: string | number;
  fields?: Record<string, unknown>;
  credentials_refused?: boolean;
  warnings?: string[];
  [key: string]: unknown;
}

// ---- API calls ----

export function getConsent() {
  return api<ConsentMap>("/api/v1/assistant/consent");
}

export function updateConsent(body: ConsentMap) {
  return api<ConsentMap>("/api/v1/assistant/consent", { method: "PUT", body });
}

export function listActions() {
  return api<AssistantAction[]>("/api/v1/assistant/actions");
}

export function prepareDrafts() {
  return api<unknown>("/api/v1/assistant/prepare-drafts", { method: "POST" });
}

export function autofillPreview(jobId: string | number) {
  return api<AutofillPreview>(`/api/v1/assistant/autofill/${jobId}`, { method: "POST" });
}

export function autofillExecute(jobId: string | number, submit: boolean) {
  return api<unknown>(`/api/v1/assistant/autofill/${jobId}/execute`, {
    method: "POST",
    body: { submit },
  });
}