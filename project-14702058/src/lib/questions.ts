import { api } from "./api";

// ---- Types ----

export interface CommunityQuestion {
  id: string | number;
  job_title: string;
  question: string;
  category?: string;
  tips?: string;
  votes?: number;
  upvoted?: boolean;
  flagged?: boolean;
  author?: string;
  is_mine?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

export interface QuestionTitle {
  title: string;
  count?: number;
}

export interface ContributeInput {
  job_title: string;
  question: string;
  category?: string;
  tips?: string;
}

// ---- API calls ----

export function searchQuestions(jobTitle: string) {
  const params = jobTitle ? `?job_title=${encodeURIComponent(jobTitle)}` : "";
  return api<CommunityQuestion[]>(`/api/v1/questions/search${params}`);
}

export function listQuestionTitles() {
  return api<QuestionTitle[]>("/api/v1/questions/titles");
}

export function listMyQuestions() {
  return api<CommunityQuestion[]>("/api/v1/questions/mine");
}

export function contributeQuestion(body: ContributeInput) {
  return api<CommunityQuestion>("/api/v1/questions", { method: "POST", body });
}

export function voteQuestion(id: string | number) {
  return api<unknown>(`/api/v1/questions/${id}/vote`, { method: "POST" });
}

export function flagQuestion(id: string | number) {
  return api<unknown>(`/api/v1/questions/${id}/flag`, { method: "POST" });
}