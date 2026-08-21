// Crowdsourced interview questions — search by job title, submit, upvote.
import { api } from "./api";

export interface CommunityQuestion {
  id: string;
  job_title: string;
  category: string;
  question: string;
  tips: string;
  votes: number;
  created_at: string;
  mine: boolean;
  voted: boolean;
}

export interface TitleCount {
  job_title: string;
  count: number;
}

export const QUESTION_CATEGORIES = [
  "behavioral",
  "technical",
  "experience",
  "motivation",
  "intro",
  "gap",
  "closing",
];

export function searchQuestions(jobTitle: string, opts: { category?: string; limit?: number } = {}) {
  const params = new URLSearchParams({ job_title: jobTitle });
  if (opts.category) params.set("category", opts.category);
  if (opts.limit) params.set("limit", String(opts.limit));
  return api<CommunityQuestion[]>(`/api/v1/questions/search?${params.toString()}`);
}

export function popularTitles() {
  return api<TitleCount[]>("/api/v1/questions/titles");
}

export function myQuestions() {
  return api<CommunityQuestion[]>("/api/v1/questions/mine");
}

export function submitQuestion(body: { job_title: string; question: string; category: string; tips?: string }) {
  return api<CommunityQuestion>("/api/v1/questions", { method: "POST", body });
}

export function voteQuestion(id: string) {
  return api<CommunityQuestion>(`/api/v1/questions/${id}/vote`, { method: "POST", body: {} });
}

export function flagQuestion(id: string) {
  return api<CommunityQuestion>(`/api/v1/questions/${id}/flag`, { method: "POST", body: {} });
}
