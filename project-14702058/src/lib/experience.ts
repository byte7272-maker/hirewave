import { api, apiUpload } from "./api";

// ---- Types ----

export type ExperienceKind =
  | "highlight"
  | "story"
  | "project"
  | "analysis"
  | "interaction"
  | "achievement";

export type ExperienceSource = "self_written" | "ai_generated" | "imported";

export interface Experience {
  id: string | number;
  title?: string;
  kind?: ExperienceKind;
  content: string;
  source?: ExperienceSource;
  source_tool?: string;
  skills?: string[];
  company?: string;
  period?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CreateExperienceInput {
  content: string;
  title?: string;
  kind?: ExperienceKind;
  source?: ExperienceSource;
  source_tool?: string;
  skills?: string[];
  company?: string;
  period?: string;
}

export type UpdateExperienceInput = Partial<CreateExperienceInput>;

export const EXPERIENCE_KINDS: { id: ExperienceKind; label: string }[] = [
  { id: "achievement", label: "Achievement" },
  { id: "story", label: "Story" },
  { id: "project", label: "Project" },
  { id: "analysis", label: "Analysis" },
  { id: "interaction", label: "Interaction" },
  { id: "highlight", label: "Highlight" },
];

export function capitalizeKind(kind?: ExperienceKind): string {
  if (!kind) return "Highlight";
  const found = EXPERIENCE_KINDS.find((k) => k.id === kind);
  return found ? found.label : kind.charAt(0).toUpperCase() + kind.slice(1);
}

// ---- API calls ----

export function listExperience() {
  return api<Experience[]>("/api/v1/experience");
}

export function createExperience(body: CreateExperienceInput) {
  return api<Experience>("/api/v1/experience", { method: "POST", body });
}

export function uploadExperience(file: File, fields: Partial<CreateExperienceInput>) {
  const form = new FormData();
  form.append("file", file);
  if (fields.title) form.append("title", fields.title);
  if (fields.kind) form.append("kind", fields.kind);
  if (fields.source) form.append("source", fields.source);
  if (fields.source_tool) form.append("source_tool", fields.source_tool);
  if (fields.company) form.append("company", fields.company);
  if (fields.period) form.append("period", fields.period);
  return apiUpload<Experience>("/api/v1/experience/upload", form);
}

export function updateExperience(id: string | number, body: UpdateExperienceInput) {
  return api<Experience>(`/api/v1/experience/${id}`, { method: "PUT", body });
}

export function deleteExperience(id: string | number) {
  return api<void>(`/api/v1/experience/${id}`, { method: "DELETE" });
}