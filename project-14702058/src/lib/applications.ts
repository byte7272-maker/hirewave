import { api, isBackendUnreachable } from "./api";
import type { CrossPosting } from "./jobs";
import { mockApplications } from "@/mocks/jobs";

export type ApplicationStatus = "draft" | "submitted" | "interviewing" | "offer";

/** The posting embedded on an application (null if the underlying posting was deleted). */
export interface ApplicationJob {
  company?: string;
  title?: string;
  url?: string;
  company_logo?: string;
  salary_display?: string;
  salary_range?: string;
  source_display?: string;
  source_platform?: string;
  likely_duplicate?: boolean;
  duplicate_group_id?: string | number;
  cross_posting_ids?: Array<string | number>;
  cross_postings?: CrossPosting[];
  consolidated_count?: number;
  consolidated_sources?: string[];
}

export interface Application {
  id: string | number;
  job_id?: string | number;
  title: string;
  company: string;
  status: ApplicationStatus;
  location?: string;
  salary?: string;
  salary_display?: string;
  salary_range?: string;
  source_display?: string;
  source_platform?: string;
  created_at?: string;
  updated_at?: string;
  job?: ApplicationJob | null;
  [key: string]: unknown;
}

export interface CreateApplicationInput {
  title: string;
  company: string;
  job_id?: string | number;
}

/** Stage order for the kanban board (Draft → Submitted → Interviewing → Offer). */
export const APPLICATION_STAGES: {
  id: ApplicationStatus;
  label: string;
  tone: "background" | "primary" | "accent" | "secondary";
}[] = [
  { id: "draft", label: "Draft", tone: "background" },
  { id: "submitted", label: "Submitted", tone: "primary" },
  { id: "interviewing", label: "Interviewing", tone: "accent" },
  { id: "offer", label: "Offer", tone: "secondary" },
];

/** Coerce an unknown backend status string into one of our four stages. */
export function normalizeStatus(value: unknown): ApplicationStatus {
  const v = String(value ?? "draft").trim().toLowerCase();
  const known: ApplicationStatus[] = ["draft", "submitted", "interviewing", "offer"];
  return known.includes(v as ApplicationStatus) ? (v as ApplicationStatus) : "draft";
}

export async function listApplications() {
  if (__IS_PREVIEW__) return mockApplications as Application[];
  try {
    return await api<Application[]>("/api/v1/applications");
  } catch (err) {
    // The pipeline should still show roles when the API is offline, rather than
    // rendering an empty board.
    if (isBackendUnreachable(err)) return mockApplications as Application[];
    throw err;
  }
}

export function getApplication(id: string | number) {
  return api<Application>(`/api/v1/applications/${id}`);
}

let mockApplicationSeq = 9000;

export function createApplication(body: CreateApplicationInput) {
  if (__IS_PREVIEW__) {
    // Mirror listApplications' mock behaviour so quick-apply actually lands in
    // the shared pipeline cache when no backend is connected.
    mockApplicationSeq += 1;
    const now = new Date().toISOString();
    return Promise.resolve({
      id: mockApplicationSeq,
      job_id: body.job_id,
      title: body.title,
      company: body.company,
      status: "draft",
      created_at: now,
      updated_at: now,
    } as Application);
  }
  return api<Application>("/api/v1/applications", { method: "POST", body }).catch(
    (err) => {
      if (!isBackendUnreachable(err)) throw err;
      mockApplicationSeq += 1;
      const now = new Date().toISOString();
      return {
        id: mockApplicationSeq,
        job_id: body.job_id,
        title: body.title,
        company: body.company,
        status: "draft",
        created_at: now,
        updated_at: now,
      } as Application;
    },
  );
}

export function submitApplication(id: string | number) {
  return api<Application>(`/api/v1/applications/${id}/submit`, { method: "PUT" });
}

export function updateApplicationStatus(id: string | number, status: ApplicationStatus) {
  return api<Application>(`/api/v1/applications/${id}/status`, {
    method: "PUT",
    body: { status },
  }).catch((err) => {
    if (!isBackendUnreachable(err)) throw err;
    return { id, status } as Application;
  });
}

/** Start of the current week (Monday 00:00 local time). */
export function startOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(now);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

/** Whether an application was created since the start of the current week. */
export function isCreatedThisWeek(app: Application): boolean {
  if (!app.created_at) return false;
  return new Date(app.created_at) >= startOfCurrentWeek();
}

/** Count applications created since the start of the current week (Monday 00:00). */
export function countThisWeekApplications(apps: Application[]): number {
  return apps.filter(isCreatedThisWeek).length;
}

export function deleteApplication(id: string | number) {
  return api<void>(`/api/v1/applications/${id}`, { method: "DELETE" });
}
