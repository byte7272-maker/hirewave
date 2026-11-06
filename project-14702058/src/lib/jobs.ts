import { api, apiBlob, isBackendUnreachable } from "./api";
import { mockJobs, mockMatches, mockSavedJobs } from "@/mocks/jobs";

// ---- Types ----

export interface CrossPosting {
  id?: string | number;
  job_posting_id?: string | number;
  posting_id?: string | number;
  source_platform?: string;
  source_display?: string;
  source?: string;
  url?: string;
  title?: string;
  company?: string;
  [key: string]: unknown;
}

export interface Job {
  id: string | number;
  title: string;
  company: string;
  company_logo?: string;
  location?: string;
  remote?: boolean;
  type?: string;
  salary?: string;
  salary_display?: string;
  salary_range?: string;
  source?: string;
  source_display?: string;
  source_platform?: string;
  url?: string;
  description?: string;
  category?: string;
  posted_at?: string;
  created_at?: string;
  authenticity_score?: number;
  quality_grade?: string;
  quality_score?: number;
  likely_duplicate?: boolean;
  duplicate_group_id?: string | number;
  cross_posting_ids?: Array<string | number>;
  cross_postings?: CrossPosting[];
  consolidated_count?: number;
  consolidated_sources?: string[];
}

export interface JobMatch {
  job_id: string | number;
  title: string;
  company: string;
  company_logo?: string;
  score: number;
  matching_skills: string[];
  gap_skills: string[];
  authenticity_score?: number;
  category?: string;
  url?: string;
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

export interface JobSearchInput {
  role: string;
  location: string;
  remote: boolean;
  sources: string[];
  categories?: string[];
}

export interface SavedSearch {
  id: string | number;
  role: string;
  location?: string;
  remote?: boolean;
  sources?: string[];
  created_at?: string;
  last_run_at?: string;
  result_count?: number;
}

export interface AuthenticityResult {
  score: number;
  flags: string[];
  verdict?: string;
  employer_verified?: boolean;
  employer_name?: string;
  [key: string]: unknown;
}

export interface FlaggedJob {
  id?: string | number;
  job_id?: string | number;
  title: string;
  company: string;
  reason?: string;
  reports?: number;
  flagged_at?: string;
  score?: number;
}

// ---- Normalizers ----

/** Some endpoints return `Job[]`, others `{ jobs: Job[] }` — normalize both. */
export function normalizeJobs(data: unknown): Job[] {
  if (Array.isArray(data)) return data as Job[];
  if (data && typeof data === "object" && Array.isArray((data as { jobs?: Job[] }).jobs)) {
    return (data as { jobs: Job[] }).jobs;
  }
  return [];
}

/** Extract jobs embedded in a search-run response under any common key. */
function extractRunJobs(data: unknown): Job[] {
  if (Array.isArray(data)) return data as Job[];
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  for (const key of ["jobs", "ingested", "matched_jobs", "results"]) {
    const v = obj[key];
    if (Array.isArray(v)) return v as Job[];
  }
  return [];
}

/** Extract the ids of jobs a search surfaced (matched_job_ids / matched_ids / matched_jobs). */
export function matchedJobIds(data: unknown): Array<string | number> {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  for (const key of ["matched_job_ids", "matched_ids"]) {
    if (Array.isArray(obj[key])) return obj[key] as Array<string | number>;
  }
  if (Array.isArray(obj.matched_jobs)) {
    return (obj.matched_jobs as Job[]).map((j) => j.id);
  }
  return [];
}

/** Extract the "new jobs ingested this run" count (new_count / ingested / job_ids length). */
export function searchNewCount(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const obj = data as Record<string, unknown>;
  for (const key of ["new_count", "ingested_count", "added_count"]) {
    const v = obj[key];
    if (typeof v === "number") return v;
  }
  if (Array.isArray(obj.ingested)) return obj.ingested.length;
  if (Array.isArray(obj.job_ids)) return obj.job_ids.length;
  return 0;
}

/** Map a JobMatch from the matches endpoint into the Job shape the result cards render. */
function matchToJob(m: JobMatch): Job {
  return { ...m, id: m.job_id };
}

/**
 * Resolve the jobs to show after a search run.
 *
 * The jobs embedded directly in the run response are the actual search results
 * (freshly surfaced roles) — show those first. The matches pool is only a
 * fallback for ids the run surfaced without embedding full job objects, e.g. a
 * 0-new run that still lists roles already in the pool.
 */
export async function resolveSearchResults(
  data: unknown,
  filters: MatchFilters = {},
): Promise<Job[]> {
  const direct = extractRunJobs(data);
  const ids = matchedJobIds(data);

  // Fresh jobs embedded in the run response are the real results.
  if (direct.length) return direct;

  // No embedded jobs — resolve surfaced ids from the matches pool.
  if (!ids.length) return [];

  const raw = await listMatches(filters).catch(() => null);
  const matches = (Array.isArray(raw) ? raw : []).map(matchToJob);
  const byId = new Map<string, Job>();
  for (const j of matches) byId.set(String(j.id), j);

  return ids
    .map((id) => byId.get(String(id)))
    .filter((j): j is Job => Boolean(j));
}

// ---- Job search ----

export function runJobSearch(input: JobSearchInput) {
  return api<unknown>("/api/v1/job-search/run", { method: "POST", body: input });
}

export function listJobs() {
  return api<unknown>("/api/v1/jobs");
}

export function getJob(id: string | number) {
  if (__IS_PREVIEW__) {
    const job = mockJobs.find((j) => String(j.id) === String(id));
    return job
      ? Promise.resolve(job as Job)
      : Promise.reject(new Error("Job not found."));
  }
  return api<Job>(`/api/v1/jobs/${id}`);
}

// ---- Matches ----

export interface MatchFilters {
  resumeId?: string | number;
  categories?: string[];
}

export async function listMatches(filters: MatchFilters = {}): Promise<JobMatch[]> {
  if (__IS_PREVIEW__) return mockMatches as JobMatch[];
  const params = new URLSearchParams();
  if (filters.resumeId !== undefined && filters.resumeId !== "") {
    params.set("resume_id", String(filters.resumeId));
  }
  if (filters.categories && filters.categories.length) {
    params.set("categories", filters.categories.join(","));
  }
  const qs = params.toString();
  try {
    return await api<JobMatch[]>(`/api/v1/jobs/matches${qs ? `?${qs}` : ""}`);
  } catch (err) {
    // Keep the matches-driven bits of the pipeline (gaps, top-up strip) populated
    // when the API is offline instead of silently empty.
    if (isBackendUnreachable(err)) return mockMatches as JobMatch[];
    throw err;
  }
}

let matchesLogoCache: Map<string, string> | null = null;

/** Best-effort company_logo lookup from the matches pool, cached across calls. */
export async function getMatchesLogo(jobId: string | number): Promise<string | undefined> {
  if (matchesLogoCache === null) {
    const matches = (await listMatches().catch(() => [] as JobMatch[])) ?? [];
    matchesLogoCache = new Map(
      matches
        .filter((m) => m.company_logo)
        .map((m) => [String(m.job_id), m.company_logo as string]),
    );
  }
  return matchesLogoCache.get(String(jobId));
}

/** Normalize the categories endpoint (accepts string[] or `{ name }[]`). */
export function normalizeCategories(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data.map((c) =>
    typeof c === "string"
      ? c
      : ((c as { name?: string })?.name ?? String(c)),
  );
}

export function listCategories(): Promise<string[]> {
  return api<unknown>("/api/v1/jobs/categories").then(normalizeCategories);
}

/** Download the matches shortlist as a PDF. Optionally restrict to specific posting ids. */
export async function exportMatches(
  ids?: Array<string | number>,
  format: "csv" | "json" = "csv",
): Promise<void> {
  const params = new URLSearchParams();
  params.set("format", format);
  if (ids && ids.length) params.set("ids", ids.join(","));
  // Route through the refresh-aware blob fetcher so an expired access token is
  // refreshed and retried once instead of failing the export outright.
  const blob = await apiBlob(`/api/v1/jobs/matches/export?${params.toString()}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hirewave-shortlist.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- Saved searches ----

export function listSearches() {
  return api<SavedSearch[]>("/api/v1/job-search/searches");
}

export function createSearch(input: JobSearchInput) {
  return api<SavedSearch>("/api/v1/job-search/searches", { method: "POST", body: input });
}

export function updateSearch(id: string | number, input: Partial<JobSearchInput>) {
  return api<SavedSearch>(`/api/v1/job-search/searches/${id}`, { method: "PUT", body: input });
}

export function deleteSearch(id: string | number) {
  return api<void>(`/api/v1/job-search/searches/${id}`, { method: "DELETE" });
}

export function runSavedSearch(id: string | number) {
  return api<unknown>(`/api/v1/job-search/searches/${id}/run`, { method: "POST" });
}

// ---- Authenticity ----

export function getJobVerification(id: string | number) {
  return api<AuthenticityResult>(`/api/v1/jobs/${id}/verification`);
}

export function getAuthenticity(id: string | number) {
  if (__IS_PREVIEW__) {
    return Promise.resolve({
      score: 85,
      flags: [],
      employer_verified: true,
      verdict: "Posting appears consistent across sources.",
    } as AuthenticityResult);
  }
  return api<AuthenticityResult>(`/api/v1/authenticity/job/${id}`);
}

export function reportJob(id: string | number, body: { reason: string }) {
  return api<unknown>(`/api/v1/authenticity/job/${id}/report`, { method: "POST", body });
}

export function verifyEmployer(id: string | number) {
  return api<AuthenticityResult>(`/api/v1/authenticity/job/${id}/verify-employer`, {
    method: "POST",
  });
}

export function listFlagged() {
  return api<FlaggedJob[]>("/api/v1/authenticity/flagged");
}

// ---- Saved jobs ----

export interface SavedJob {
  job_posting_id?: string | number;
  id?: string | number;
  title: string;
  company: string;
  company_logo?: string;
  location?: string;
  remote?: boolean;
  type?: string;
  salary?: string;
  salary_display?: string;
  salary_range?: string;
  source?: string;
  source_display?: string;
  source_platform?: string;
  url?: string;
  description?: string;
  category?: string;
  posted_at?: string;
  created_at?: string;
  authenticity_score?: number;
  quality_grade?: string;
  quality_score?: number;
  likely_duplicate?: boolean;
  duplicate_group_id?: string | number;
  cross_posting_ids?: Array<string | number>;
  cross_postings?: CrossPosting[];
  consolidated_count?: number;
  consolidated_sources?: string[];
  [key: string]: unknown;
}

/** Resolve the stable posting id used to identify a saved job. */
export function savedJobId(job: SavedJob): string | number {
  return job.job_posting_id ?? job.id ?? "";
}

export function listSavedJobs() {
  if (__IS_PREVIEW__) return Promise.resolve(mockSavedJobs as SavedJob[]);
  return api<SavedJob[]>("/api/v1/jobs/saved");
}

/** A job resolved for the tailor-to-job picker (matches + saved, deduped). */
export interface TailorableJob {
  job_posting_id: string | number;
  title: string;
  company: string;
  company_logo?: string;
  salary_display?: string;
  source_display?: string;
  source_platform?: string;
  url?: string;
}

/** Merge the user's matches and saved jobs into one deduped list for the tailor picker. */
export async function listTailorableJobs(): Promise<TailorableJob[]> {
  const [matches, saved] = await Promise.all([
    listMatches().catch(() => [] as JobMatch[]),
    listSavedJobs().catch(() => [] as SavedJob[]),
  ]);
  const map = new Map<string, TailorableJob>();
  for (const m of matches) {
    map.set(String(m.job_id), {
      job_posting_id: m.job_id,
      title: m.title,
      company: m.company,
      company_logo: m.company_logo,
      salary_display: m.salary_display,
      source_display: m.source_display,
      source_platform: m.source_platform,
      url: m.url,
    });
  }
  for (const s of saved) {
    const id = savedJobId(s);
    if (!map.has(String(id))) {
      map.set(String(id), {
        job_posting_id: id,
        title: s.title,
        company: s.company,
        company_logo: s.company_logo,
        salary_display: s.salary_display,
        source_display: s.source_display,
        source_platform: s.source_platform,
        url: s.url,
      });
    }
  }
  return Array.from(map.values());
}

export function reorderSavedJobs(ids: Array<string | number>) {
  return api<unknown>("/api/v1/jobs/saved/reorder", {
    method: "PUT",
    body: { ids },
  });
}


export function saveJob(jobPostingId: string | number) {
  return api<unknown>("/api/v1/jobs/saved", {
    method: "POST",
    body: { job_posting_id: jobPostingId },
  });
}

export function unsaveJob(jobPostingId: string | number) {
  return api<unknown>(`/api/v1/jobs/saved/${jobPostingId}`, { method: "DELETE" });
}

/** Human-friendly "Saved N days ago" label from a saved job's created_at timestamp. */
export function savedAgo(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "Saved today";
  if (days === 1) return "Saved yesterday";
  if (days < 7) return `Saved ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Saved ${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `Saved ${months} month${months === 1 ? "" : "s"} ago`;
}

/**
 * Best-effort annualized minimum salary parsed from a pre-formatted salary
 * string (e.g. "$160k–$195k" → 160000, "$90/hr" → ~187200). Returns null when
 * the string can't be parsed (salary unknown), so callers can sort/filter on it.
 */
export function salaryMinAnnual(salaryDisplay?: string): number | null {
  if (!salaryDisplay) return null;
  const hourly = /\/\s*hr/i.test(salaryDisplay);
  const m = salaryDisplay.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k|m)?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  if (unit === "k") n *= 1000;
  else if (unit === "m") n *= 1_000_000;
  if (hourly) n *= 2080; // rough 40h × 52wk annualization
  return Math.round(n);
}