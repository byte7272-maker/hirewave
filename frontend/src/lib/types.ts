// Mirrors the FastAPI response DTOs (jobsearch.api.schemas + domain models).

export interface User {
  id: string;
  email: string;
  full_name: string;
  location: string;
}

export interface SalaryRange {
  currency: string;
  minimum: number | null;
  maximum: number | null;
}

export interface WorkExperience {
  company: string;
  title: string;
  start?: string | null;
  end?: string | null;
  summary: string;
  highlights: string[];
}

export interface Education {
  institution: string;
  degree: string;
  field_of_study: string;
  graduation_year?: number | null;
}

export interface JobPreferences {
  job_type: string | null;
  salary_range: SalaryRange;
  remote_ok: boolean;
  target_roles: string[];
  target_locations: string[];
  seniority: string | null;
}

export interface UserProfile {
  user_id: string;
  headline: string;
  summary: string;
  skills: string[];
  work_experience: WorkExperience[];
  education: Education[];
  preferences: JobPreferences;
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
  is_verified: boolean | null;
  match_score: number | null;
}

export interface MatchOut {
  job_id: string;
  title: string;
  company: string;
  score: number;
  matching_skills: string[];
  gap_skills: string[];
  authenticity_score: number | null;
}

export interface VerificationResult {
  id: string;
  job_posting_id: string;
  authenticity_score: number;
  flags: string[];
  details: Record<string, unknown>;
}

export interface ResumeContent {
  summary: string;
  skills: string[];
  experience: string[];
  education: string[];
  keywords_injected: string[];
}

export interface Resume {
  id: string;
  user_id: string;
  target_role: string;
  job_posting_id: string | null;
  version: number;
  format: string;
  source: "generated" | "uploaded";
  tone: string;
  generated_content: ResumeContent;
  rendered_text: string;
  file_url: string;
  original_filename: string;
  content_type: string;
  ats_score: number | null;
  approved: boolean;
}

export interface CoverLetter {
  id: string;
  user_id: string;
  job_posting_id: string;
  resume_id: string | null;
  tone: string;
  content: string;
  approved: boolean;
}

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "interviewing"
  | "rejected"
  | "offered";

export interface Application {
  id: string;
  user_id: string;
  job_posting_id: string;
  resume_id: string | null;
  cover_letter_id: string | null;
  status: ApplicationStatus;
  submitted_at: string | null;
  platform_response: Record<string, unknown>;
  audit_trail: Array<Record<string, unknown>>;
}

export interface SubmitResponse {
  success: boolean;
  platform: string;
  confirmation_id: string;
  message: string;
  requires_manual: boolean;
  fallback_url: string;
  manual_steps: string[];
}

export interface InterviewQuestion {
  id: string;
  category: string;
  question: string;
  suggested_answer: string;
  tips: string;
}

export interface InterviewPrep {
  id: string;
  user_id: string;
  resume_id: string | null;
  job_posting_id: string | null;
  based_on_document: boolean;
  questions: InterviewQuestion[];
  generated_at: string;
}

export interface InterviewerPersona {
  id: string;
  name: string;
  role: string;
  company: string;
  style: string;
  bio: string;
  initials: string;
}

export interface AnswerFeedback {
  overall: number;
  structure: number;
  specificity: number;
  conciseness: number;
  confidence: number;
  strengths: string[];
  improvements: string[];
}

export interface InterviewTurn {
  id: string;
  speaker: "interviewer" | "candidate";
  text: string;
  question: string;
  feedback: AnswerFeedback | null;
  response_seconds: number | null;
}

export interface MockInterviewSummary {
  overall: number;
  structure: number;
  specificity: number;
  conciseness: number;
  confidence: number;
  answers_rated: number;
  avg_response_seconds: number | null;
  top_strengths: string[];
  top_improvements: string[];
}

export interface MockInterviewSession {
  id: string;
  user_id: string;
  persona: InterviewerPersona;
  status: "active" | "completed";
  asked: number;
  max_questions: number;
  turns: InterviewTurn[];
  summary: MockInterviewSummary | null;
}

export interface MonitoredIdentifier {
  id: string;
  type: string;
  label: string;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
}

export interface ExposureFinding {
  id: string;
  user_id: string;
  identifier_id: string;
  source: string;
  title: string;
  exposed_data_types: string[];
  breach_date: string;
  severity: "low" | "medium" | "high";
  acknowledged: boolean;
  discovered_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Integration {
  provider: string;
  scopes: string[];
  connected_at: string;
  expires_at: string | null;
  expired: boolean;
}
