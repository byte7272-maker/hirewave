// Shared job-authenticity ledger — community real/dubious/scam feedback.
import { api } from "./api";

export interface Authenticity {
  key: string;
  company: string;
  title: string;
  verdict: string;
  employer_status: string;
  employer_detail: string;
  min_authenticity_score: number;
  tally: { legit: number; dubious: number; scam: number };
  reasons: string[];
  your_vote: string | null;
  last_checked_at: string | null;
}

export const VERDICT_META: Record<string, { label: string; icon: string; cls: string }> = {
  verified_real: { label: "Verified real", icon: "ri-verified-badge-fill", cls: "bg-primary-100 text-primary-800" },
  likely_real: { label: "Likely real", icon: "ri-checkbox-circle-line", cls: "bg-primary-50 text-primary-700" },
  unverified: { label: "Unverified", icon: "ri-question-line", cls: "bg-background-200 text-foreground-600" },
  dubious: { label: "Dubious", icon: "ri-error-warning-line", cls: "bg-secondary-100 text-secondary-900" },
  likely_scam: { label: "Likely scam", icon: "ri-alarm-warning-fill", cls: "bg-accent-100 text-accent-900" },
};

export const EMPLOYER_META: Record<string, string> = {
  listed: "Listed on the employer site",
  not_found: "Not found on the employer site",
  invalid_domain: "No verifiable employer domain",
  unknown: "Employer site not checked",
};

export function getJobAuthenticity(jobId: string) {
  return api<Authenticity>(`/api/v1/authenticity/job/${jobId}`);
}

export function reportJob(jobId: string, verdict: "legit" | "dubious" | "scam", reason = "") {
  return api<Authenticity>(`/api/v1/authenticity/job/${jobId}/report`, { method: "POST", body: { verdict, reason } });
}

export function verifyEmployer(jobId: string) {
  return api<Authenticity>(`/api/v1/authenticity/job/${jobId}/verify-employer`, { method: "POST", body: {} });
}

export function listFlagged() {
  return api<Authenticity[]>("/api/v1/authenticity/flagged");
}
