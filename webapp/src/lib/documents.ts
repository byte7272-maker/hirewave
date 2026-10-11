// Résumé document API — the editor's view of the backend's /resumes endpoints.
import { api, apiText } from "./api";

export interface DocumentVersion {
  version: number;
  label: string;
  content: string;
  change_summary?: string;
  source: string;
  created_at?: string;
}

export interface ResumeDoc {
  id: string;
  target_role: string;
  rendered_text: string;
  active_version: number;
  versions: DocumentVersion[];
  original_filename?: string;
}

export interface EvidenceGroup {
  theme: string;
  summary: string;
  points: string[];
}

export interface EditSuggestion {
  action: "add" | "remove" | "reword";
  section: string;
  before: string;
  after: string;
  rationale: string;
}

export const listResumes = () => api<ResumeDoc[]>("/api/v1/resumes?archived=false");

export const getResume = (id: string) => api<ResumeDoc>(`/api/v1/resumes/${id}`);

/** Ask AI for a targeted change and apply it immediately (returns the updated résumé,
 *  with a bumped active_version when something changed). No preview/approval. */
export const aiEdit = (id: string, instruction: string) =>
  api<ResumeDoc>(`/api/v1/resumes/${id}/ai-edit`, { method: "POST", body: { instruction } });

export const activateVersion = (id: string, version: number) =>
  api<ResumeDoc>(`/api/v1/resumes/${id}/versions/${version}/activate`, { method: "POST", body: {} });

/** The server-rendered HTML of the active version (authed; shown via iframe srcdoc). */
export const previewHtml = (id: string) => apiText(`/api/v1/resumes/${id}/preview.html`);

// --- My Work Highlights -----------------------------------------------------
export const synthesize = (id: string, text: string) =>
  api<{ groups: EvidenceGroup[] }>(`/api/v1/resumes/${id}/evidence/synthesize`, {
    method: "POST",
    body: { text },
  });

export const suggestEdits = (id: string, context: string) =>
  api<{ suggestions: EditSuggestion[] }>(`/api/v1/resumes/${id}/suggest-edits`, {
    method: "POST",
    body: { context },
  });

export const applyEdits = (id: string, suggestions: EditSuggestion[]) =>
  api<{ rendered_text: string; applied: number; skipped: number }>(
    `/api/v1/resumes/${id}/apply-edits`,
    { method: "POST", body: { suggestions } },
  );

/** Save some text as a new active version (the accept+save step). */
export const saveVersion = (id: string, content: string, label = "") =>
  api<ResumeDoc>(`/api/v1/resumes/${id}/versions`, { method: "POST", body: { content, label } });
