// Gather profile data from LinkedIn — connected account or a data-export file.
import { api, apiUpload } from "./api";

export interface ImportedExperience {
  company: string;
  title: string;
  start: string | null;
  end: string | null;
  summary: string;
  highlights: string[];
}
export interface ImportedEducation {
  institution: string;
  degree: string;
  field_of_study: string;
  graduation_year: number | null;
}
export interface ImportedProfile {
  headline: string;
  summary: string;
  skills: string[];
  work_experience: ImportedExperience[];
  education: ImportedEducation[];
}
export interface LinkedInImport {
  source: string; // "linkedin" | "mock" | "export"
  applied: boolean;
  profile: ImportedProfile;
}

/** Import from the connected LinkedIn account. apply=false returns a draft. */
export function importLinkedIn(apply: boolean) {
  return api<LinkedInImport>("/api/v1/integrations/linkedin/import", { method: "POST", body: { apply } });
}

/** Import from a downloaded LinkedIn data export / résumé file. */
export function importLinkedInFile(file: File, apply: boolean) {
  const form = new FormData();
  form.append("file", file);
  form.append("apply", String(apply));
  return apiUpload<LinkedInImport>("/api/v1/integrations/linkedin/import-file", form);
}

/** Apply a reviewed draft — only the fields the user kept. Omitted/empty fields
 *  leave the stored profile untouched; job preferences are always preserved. */
export function applyLinkedIn(profile: Partial<ImportedProfile>) {
  return api<LinkedInImport>("/api/v1/integrations/linkedin/apply", { method: "POST", body: profile });
}
