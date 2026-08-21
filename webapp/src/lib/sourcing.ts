// Multi-site job sourcing agent — on-demand search + scheduled saved searches.
import { api, apiUpload } from "./api";

export interface AggregationResult {
  found: number;
  ingested: number;
  duplicates: number;
  hidden: number;
  sources: string[];
  job_ids: string[];
  drafts_prepared?: number;
}

export interface SavedSearch {
  id: string;
  role: string;
  location: string;
  remote: boolean | null;
  sources: string[];
  interval_minutes: number;
  active: boolean;
  last_run_at: string | null;
  last_new_count: number;
  created_at: string;
}

export interface SearchQuery {
  role: string;
  location?: string;
  remote?: boolean | null;
  sources?: string[];
}

export interface EmailImport {
  source: string;
  parsed: number;
  result: AggregationResult;
}

export function runJobSearch(q: SearchQuery) {
  return api<AggregationResult>("/api/v1/job-search/run", { method: "POST", body: q });
}

/** Ingest roles from a forwarded/uploaded job-alert email (.eml). */
export function importEmailAlert(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<EmailImport>("/api/v1/job-search/import-email", form);
}

export function listSavedSearches() {
  return api<SavedSearch[]>("/api/v1/job-search/searches");
}

export function createSavedSearch(body: SearchQuery & { interval_minutes?: number }) {
  return api<SavedSearch>("/api/v1/job-search/searches", { method: "POST", body });
}

export function updateSavedSearch(id: string, active: boolean) {
  return api<SavedSearch>(`/api/v1/job-search/searches/${id}`, { method: "PUT", body: { active } });
}

export function deleteSavedSearch(id: string) {
  return api<void>(`/api/v1/job-search/searches/${id}`, { method: "DELETE" });
}

export function runSavedSearch(id: string) {
  return api<AggregationResult>(`/api/v1/job-search/searches/${id}/run`, { method: "POST", body: {} });
}
