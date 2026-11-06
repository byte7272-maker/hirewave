/**
 * JSON Resume schema (https://jsonresume.org/schema) — the shape returned by
 * `GET /api/v1/resumes/{id}/structured`. The template renderers in
 * `src/pages/dashboard/documents/templates/themes` all consume this object
 * directly, so any theme can render the same data.
 */

export interface JsonResumeLocation {
  address?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  region?: string;
}

export interface JsonResumeProfile {
  network?: string;
  username?: string;
  url?: string;
}

export interface JsonResumeBasics {
  name?: string;
  label?: string;
  image?: string;
  email?: string;
  phone?: string;
  url?: string;
  summary?: string;
  location?: JsonResumeLocation;
  profiles?: JsonResumeProfile[];
}

export interface JsonResumeWork {
  name?: string;
  position?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  summary?: string;
  highlights?: string[];
}

export interface JsonResumeEducation {
  institution?: string;
  url?: string;
  area?: string;
  studyType?: string;
  startDate?: string;
  endDate?: string;
  score?: string;
  courses?: string[];
}

export interface JsonResumeSkill {
  name?: string;
  level?: string;
  keywords?: string[];
}

export interface JsonResumeLanguage {
  language?: string;
  fluency?: string;
}

export interface JsonResumeProject {
  name?: string;
  description?: string;
  highlights?: string[];
  keywords?: string[];
  startDate?: string;
  endDate?: string;
  url?: string;
}

export interface JsonResumeCertificate {
  name?: string;
  issuer?: string;
  date?: string;
}

export interface JsonResumeAward {
  title?: string;
  awarder?: string;
  date?: string;
  summary?: string;
}

export interface JsonResumeInterest {
  name?: string;
  keywords?: string[];
}

export interface JsonResume {
  basics?: JsonResumeBasics;
  work?: JsonResumeWork[];
  education?: JsonResumeEducation[];
  skills?: JsonResumeSkill[];
  languages?: JsonResumeLanguage[];
  projects?: JsonResumeProject[];
  certificates?: JsonResumeCertificate[];
  awards?: JsonResumeAward[];
  interests?: JsonResumeInterest[];
}

/** A real array with null/undefined entries stripped (never throws on bad data). */
function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => item !== null && item !== undefined)
    : [];
}

/**
 * Coerce a résumé payload into a shape the template renderers can always draw,
 * tolerating a valid 200 that carries null/empty optional fields: every list is
 * a real array, null list entries are dropped, and nested keyword/highlight/
 * course arrays are present. A résumé with content therefore ALWAYS renders,
 * even when metadata (basics, work, skills, etc.) is missing or null.
 */
export function normalizeResume(raw: JsonResume | null | undefined): JsonResume {
  const r = raw ?? {};
  return {
    basics: r.basics ?? {},
    work: asArray(r.work),
    education: asArray(r.education).map((e) => ({
      ...e,
      courses: asArray(e.courses),
    })),
    skills: asArray(r.skills).map((s) => ({
      ...s,
      keywords: asArray(s.keywords),
    })),
    languages: asArray(r.languages),
    projects: asArray(r.projects).map((p) => ({
      ...p,
      highlights: asArray(p.highlights),
      keywords: asArray(p.keywords),
    })),
    certificates: asArray(r.certificates),
    awards: asArray(r.awards),
    interests: asArray(r.interests).map((i) => ({
      ...i,
      keywords: asArray(i.keywords),
    })),
  };
}

/** Render a JSON Resume date (YYYY-MM, YYYY-MM-DD, or a free-form string) as e.g. "Mar 2021". */
export function formatDateLabel(value?: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{1,2})/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** Render a start/end range, defaulting the open end to "Present". */
export function formatRange(start?: string, end?: string): string {
  const s = formatDateLabel(start);
  const e = formatDateLabel(end);
  if (!s && !e) return "";
  if (!s) return e;
  return `${s} – ${e || "Present"}`;
}

/** Best-effort display name for the résumé owner. */
export function resumeName(resume: JsonResume): string {
  return resume.basics?.name?.trim() || "Your Name";
}

/** A compact, ordered list of the candidate's contact details. */
export function contactDetails(resume: JsonResume): string[] {
  const b = resume.basics ?? {};
  const loc = b.location ?? {};
  const location = [loc.city, loc.region, loc.countryCode].filter(Boolean).join(", ");
  return [b.email, b.phone, location, b.url].filter(
    (v): v is string => Boolean(v && v.trim())
  );
}