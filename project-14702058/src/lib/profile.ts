import { api } from "./api";

export interface Me {
  id: string | number;
  email: string;
  full_name: string;
  location: string;
  phone?: string;
}

export interface UpdateMe {
  full_name?: string;
  location?: string;
  phone?: string;
}

export interface WorkExperience {
  id?: string | number;
  company: string;
  title: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}

export interface Education {
  id?: string | number;
  school: string;
  degree: string;
  field?: string;
  start_date?: string;
  end_date?: string;
}

export interface UserProfile {
  headline: string;
  summary: string;
  skills: string[];
  work_experience: WorkExperience[];
  education: Education[];
}

export interface JobPreferences {
  job_type: string;
  salary_range: string;
  remote_ok: boolean;
  target_roles: string[];
  target_locations: string[];
  seniority: string;
  weekly_goal_target?: number;
  job_categories?: string[];
}

export function getMe() {
  return api<Me>("/api/v1/users/me");
}

export function updateMe(body: UpdateMe) {
  return api<Me>("/api/v1/users/me", { method: "PUT", body });
}

export function getProfile() {
  return api<UserProfile>("/api/v1/users/me/profile");
}

export function updateProfile(body: Partial<UserProfile>) {
  return api<UserProfile>("/api/v1/users/me/profile", { method: "PUT", body });
}

export function getPreferences() {
  return api<JobPreferences>("/api/v1/users/me/preferences");
}

export function updatePreferences(body: Partial<JobPreferences>) {
  return api<JobPreferences>("/api/v1/users/me/preferences", { method: "PUT", body });
}