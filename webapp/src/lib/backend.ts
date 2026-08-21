// Backend response types + mappers into Hirewave view-models.
import { api } from "./api";

// --- raw API types ----------------------------------------------------------
export interface MatchOut {
  job_id: string;
  title: string;
  company: string;
  score: number;
  matching_skills: string[];
  gap_skills: string[];
  authenticity_score: number | null;
}

export interface SalaryRange {
  currency: string;
  minimum: number | null;
  maximum: number | null;
}

export interface JobPosting {
  id: string;
  source_platform: string;
  title: string;
  company: string;
  company_domain: string;
  location: string;
  remote: boolean;
  description: string;
  requirements: string[];
  salary_range: SalaryRange | null;
  url: string;
}

export type ApplicationStatus = "draft" | "submitted" | "interviewing" | "rejected" | "offered";
export interface Application {
  id: string;
  user_id: string;
  job_posting_id: string;
  resume_id: string | null;
  cover_letter_id: string | null;
  status: ApplicationStatus;
  submitted_at: string | null;
}

export interface Resume {
  id: string;
  target_role: string;
  source: "generated" | "uploaded";
  approved: boolean;
  ats_score: number | null;
  version: number;
  original_filename: string;
}

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

// --- view-models the UI renders ---------------------------------------------
export interface JobMatchVM {
  id: string;
  title: string;
  company: string;
  companyInitial: string;
  location: string;
  salary: string;
  type: string;
  fitScore: number;
  tags: string[];
  gaps: string[];
  source: string;
  posted: string;
}

// --- formatting -------------------------------------------------------------
export function formatSalary(r: SalaryRange | null): string {
  if (!r || (r.minimum == null && r.maximum == null)) return "Salary N/A";
  const k = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  if (r.minimum != null && r.maximum != null) return `${k(r.minimum)}–${k(r.maximum)}`;
  return k((r.minimum ?? r.maximum)!);
}

export function jobLocation(j?: JobPosting): string {
  if (!j) return "";
  if (j.remote) return j.location ? `Remote · ${j.location}` : "Remote";
  return j.location || "—";
}

export function matchToVM(m: MatchOut, job?: JobPosting): JobMatchVM {
  return {
    id: m.job_id,
    title: m.title,
    company: m.company,
    companyInitial: (m.company || "?")[0].toUpperCase(),
    location: jobLocation(job),
    salary: formatSalary(job?.salary_range ?? null),
    type: job?.remote ? "Remote" : "Full-time",
    fitScore: Math.round(m.score),
    tags: m.matching_skills.slice(0, 4),
    gaps: m.gap_skills.slice(0, 4),
    source: job?.source_platform || "—",
    posted: "recently",
  };
}

// --- data helpers -----------------------------------------------------------
export async function jobsById(): Promise<Record<string, JobPosting>> {
  const jobs = await api<JobPosting[]>("/api/v1/jobs?include_hidden=true");
  return Object.fromEntries(jobs.map((j) => [j.id, j]));
}

export async function getMatchVMs(limit = 25): Promise<JobMatchVM[]> {
  const [matches, byId] = await Promise.all([
    api<MatchOut[]>(`/api/v1/jobs/matches?limit=${limit}`),
    jobsById().catch(() => ({} as Record<string, JobPosting>)),
  ]);
  return matches.map((m) => matchToVM(m, byId[m.job_id]));
}

/** Fired after any mutation that changes shared server-derived data (jobs,
 *  applications, notifications) so summary widgets can re-fetch. */
export const DATA_CHANGED = "hw-data-changed";
export function emitDataChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DATA_CHANGED));
}

/** Ingest a demo set of postings (admin/demo) so there's data to match. */
export async function ingestSampleJobs(): Promise<void> {
  await api("/api/v1/jobs/ingest", { method: "POST", body: { jobs: SAMPLE_JOBS } });
  emitDataChanged();
}

/** Generate résumé + cover letter and create a draft application for a job. */
export async function prepareApplication(jobId: string): Promise<Application> {
  const resume = await api<{ id: string }>("/api/v1/resumes/generate", {
    method: "POST",
    body: { job_posting_id: jobId },
  });
  const cover = await api<{ id: string }>("/api/v1/cover-letters/generate", {
    method: "POST",
    body: { job_posting_id: jobId, resume_id: resume.id },
  });
  const app = await api<Application>("/api/v1/applications", {
    method: "POST",
    body: { job_posting_id: jobId, resume_id: resume.id, cover_letter_id: cover.id },
  });
  emitDataChanged();
  return app;
}

/** Approve the linked documents then submit an application. */
export async function approveAndSubmit(app: Application): Promise<{ success: boolean; message: string }> {
  if (app.resume_id) await api(`/api/v1/resumes/${app.resume_id}`, { method: "PUT", body: { approved: true } });
  if (app.cover_letter_id)
    await api(`/api/v1/cover-letters/${app.cover_letter_id}`, { method: "PUT", body: { approved: true } });
  const res = await api<{ success: boolean; message: string }>(`/api/v1/applications/${app.id}/submit`, { method: "PUT", body: {} });
  emitDataChanged();
  return res;
}

export const SAMPLE_JOBS = [
  {
    source_platform: "linkedin",
    title: "Senior Product Designer",
    company: "Figma",
    company_domain: "figma.com",
    remote: true,
    location: "San Francisco",
    description:
      "Design systems, prototyping and end-to-end product design for a collaborative design tool. 5+ years, strong Figma and interaction design.",
    requirements: ["Design systems", "Prototyping", "Figma", "Interaction design"],
    salary_range: { currency: "USD", minimum: 160000, maximum: 195000 },
    url: "https://linkedin.com/jobs/figma-spd",
  },
  {
    source_platform: "greenhouse",
    title: "Senior Backend Engineer",
    company: "Globex",
    company_domain: "globex.com",
    remote: true,
    location: "Remote · US",
    description:
      "Build Python microservices with FastAPI and PostgreSQL on AWS. Own services in Docker and Kubernetes, optimize Redis caching. 6+ years.",
    requirements: ["Python", "FastAPI", "PostgreSQL", "AWS", "Kubernetes"],
    salary_range: { currency: "USD", minimum: 170000, maximum: 210000 },
    url: "https://boards.greenhouse.io/globex/sbe",
  },
  {
    source_platform: "indeed",
    title: "Full-Stack Developer",
    company: "Umbrella Software",
    company_domain: "umbrella.dev",
    remote: true,
    location: "Remote",
    description: "React front end and a Python/FastAPI backend with PostgreSQL. Own features end to end.",
    requirements: ["Python", "React", "FastAPI", "PostgreSQL"],
    salary_range: { currency: "USD", minimum: 130000, maximum: 165000 },
    url: "https://indeed.com/jobs/umbrella-fsd",
  },
  {
    source_platform: "greenhouse",
    title: "Design Lead, Payments",
    company: "Ramp",
    company_domain: "ramp.com",
    remote: false,
    location: "New York · Hybrid",
    description:
      "Lead design for payments. Fintech experience, leadership, data visualization, and design systems.",
    requirements: ["Fintech", "Leadership", "Data visualization", "Design systems"],
    salary_range: { currency: "USD", minimum: 190000, maximum: 230000 },
    url: "https://boards.greenhouse.io/ramp/design-lead",
  },
  {
    source_platform: "unknown_board",
    title: "Work From Home Data Entry",
    company: "QuickCash LLC",
    company_domain: "",
    remote: true,
    location: "Remote",
    description:
      "URGENT! Apply now! Immediate start! No experience needed. Guaranteed income — earn $5000 a week! Be your own boss! Contact us on WhatsApp to start tomorrow. Limited spots!",
    requirements: [],
    url: "http://sketchy.example/data-entry",
  },
];
