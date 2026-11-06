import { api } from "./api";
import { previewDashboardSummary } from "@/mocks/dashboardSummary";

/**
 * The home summary should return quickly. When the request stalls (e.g. a
 * blocked CORS preflight) it's abandoned after this long so the dashboard
 * surfaces its normal empty state instead of spinning forever.
 */
const DASHBOARD_TIMEOUT_MS = 15000;

export interface DashboardTopMatch {
  job_id?: string | number;
  title?: string;
  company?: string;
  company_logo?: string;
  url?: string;
  score?: number;
  salary_display?: string;
  source_display?: string;
  source_platform?: string;
}

export interface DashboardWeeklyGoal {
  target: number;
  done: number;
  applications_this_week?: number;
  interviews_this_week?: number;
}

export interface DashboardSummary {
  matches: {
    total: number;
    strong: number;
    top: DashboardTopMatch | null;
  };
  applications: {
    total: number;
    submitted: number;
    interviewing: number;
    offered: number;
    by_status?: Record<string, number>;
  };
  interviews: number;
  weekly_goal: DashboardWeeklyGoal | null;
  resumes: number;
  cover_letters: number;
  highlights: number;
  saved_jobs: number;
  saved_searches: number;
  connected_apps: {
    count: number;
    providers?: string[];
  };
  unread_notifications: number;
  profile_complete: boolean;
  recent_activity: Array<{
    type?: string;
    message?: string;
    at?: string;
    read?: boolean;
  }>;
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  if (__IS_PREVIEW__) return Promise.resolve(previewDashboardSummary as DashboardSummary);
  return api<DashboardSummary>("/api/v1/dashboard/summary", {
    timeoutMs: DASHBOARD_TIMEOUT_MS,
  });
}