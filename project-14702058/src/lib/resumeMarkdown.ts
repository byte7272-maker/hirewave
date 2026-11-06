import type {
  JsonResume,
  JsonResumeBasics,
  JsonResumeCertificate,
  JsonResumeEducation,
  JsonResumeLanguage,
  JsonResumeProject,
  JsonResumeSkill,
  JsonResumeWork,
} from "./jsonResume";

/**
 * Parse the canonical résumé markdown (the exact text `resumeToMarkdown`
 * produces, and what the API stores per version) back into a JSON Resume, so a
 * saved revision can be rendered through the SAME template renderers as the live
 * document — the basis for the Versions marquee's real mini-previews.
 *
 * It is deliberately forgiving: a document that isn't in our markdown shape
 * (e.g. raw text extracted from an uploaded PDF) still yields a plausible page
 * (name / label / summary) rather than a blank thumbnail.
 */

type Section =
  | "header"
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "languages";

/** " — " — the em-dash, space-wrapped joiner the serializer uses. */
const DASH = " \u2014 ";
const BULLET_RE = /^\s*[-*+]\s+/;
/** "·" or "•" — the contact-line separator. */
const MIDDOT_RE = /\s*[\u00b7\u2022]\s*/;

function sectionFor(heading: string): Section {
  const h = heading.toLowerCase();
  if (h.startsWith("summary") || h.startsWith("profile") || h.startsWith("about")) return "summary";
  if (h.startsWith("experience") || h.startsWith("work")) return "experience";
  if (h.startsWith("education")) return "education";
  if (h.startsWith("skill")) return "skills";
  if (h.startsWith("project")) return "projects";
  if (h.startsWith("certificat") || h.startsWith("award")) return "certifications";
  if (h.startsWith("language")) return "languages";
  return "summary";
}

/** Split a "Mar 2021 – Present" range into a start/end date pair. */
function splitRange(range: string): { startDate?: string; endDate?: string } {
  const trimmed = range.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+[\u2013\u2014-]\s+/);
  if (parts.length === 1) return { startDate: trimmed };
  return { startDate: parts[0].trim(), endDate: parts.slice(1).join(" - ").trim() };
}

/** Read a trailing "(…)" range off a heading and return the leading text + range. */
function splitHeadingRange(heading: string): { main: string; range: string } {
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(heading);
  if (!match) return { main: heading.trim(), range: "" };
  return { main: match[1].trim(), range: match[2].trim() };
}

export function parseResumeMarkdown(markdown: string): JsonResume {
  const text = (markdown ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  const names: string[] = [];
  let label = "";
  const headerLines: string[] = [];
  const summaryLines: string[] = [];
  const skillItems: string[] = [];
  const work: JsonResumeWork[] = [];
  const education: JsonResumeEducation[] = [];
  const projects: JsonResumeProject[] = [];
  const certificates: JsonResumeCertificate[] = [];
  const languages: JsonResumeLanguage[] = [];

  let section: Section = "header";
  let structured = false;
  let workIdx = -1;
  let eduIdx = -1;
  let projectIdx = -1;
  let projectDesc: string[] = [];

  const flushProject = () => {
    if (projectIdx >= 0 && projectDesc.length) {
      projects[projectIdx].description = projectDesc.join(" ");
    }
    projectDesc = [];
  };

  for (const raw of lines) {
    const trimmed = raw.replace(/\s+$/, "").trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("### ")) {
      const heading = trimmed.slice(4).trim();
      if (section === "experience") {
        const { main, range } = splitHeadingRange(heading);
        const idx = main.indexOf(DASH);
        const position = idx >= 0 ? main.slice(0, idx).trim() : main;
        const company = idx >= 0 ? main.slice(idx + DASH.length).trim() : "";
        work.push({ position, name: company, ...splitRange(range), highlights: [] });
        workIdx = work.length - 1;
      } else if (section === "education") {
        const { main, range } = splitHeadingRange(heading);
        const idx = main.indexOf(DASH);
        const left = idx >= 0 ? main.slice(0, idx).trim() : main;
        const institution = idx >= 0 ? main.slice(idx + DASH.length).trim() : "";
        const comma = left.indexOf(",");
        const studyType = comma >= 0 ? left.slice(0, comma).trim() : left;
        const area = comma >= 0 ? left.slice(comma + 1).trim() : "";
        education.push({ studyType, area, institution, ...splitRange(range) });
        eduIdx = education.length - 1;
      } else if (section === "projects") {
        flushProject();
        projects.push({ name: heading, highlights: [] });
        projectIdx = projects.length - 1;
      }
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushProject();
      section = sectionFor(trimmed.slice(3).trim());
      structured = true;
      workIdx = -1;
      eduIdx = -1;
      projectIdx = -1;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      names.push(trimmed.slice(2).trim());
      continue;
    }

    if (section === "header") {
      const bold = /^\*\*(.+?)\*\*$/.exec(trimmed);
      if (bold) {
        label = bold[1].trim();
        continue;
      }
      headerLines.push(trimmed);
      continue;
    }

    switch (section) {
      case "summary":
        summaryLines.push(trimmed);
        break;
      case "experience": {
        if (workIdx < 0) break;
        const w = work[workIdx];
        if (BULLET_RE.test(trimmed)) {
          (w.highlights ??= []).push(trimmed.replace(BULLET_RE, "").trim());
        } else {
          w.summary = w.summary ? `${w.summary} ${trimmed}` : trimmed;
        }
        break;
      }
      case "education": {
        if (eduIdx < 0) break;
        const e = education[eduIdx];
        e.score = e.score ? `${e.score} ${trimmed}` : trimmed;
        break;
      }
      case "skills": {
        for (const piece of trimmed.replace(BULLET_RE, "").split(",")) {
          const value = piece.trim();
          if (value) skillItems.push(value);
        }
        break;
      }
      case "projects": {
        if (projectIdx < 0) break;
        const p = projects[projectIdx];
        if (BULLET_RE.test(trimmed)) {
          (p.highlights ??= []).push(trimmed.replace(BULLET_RE, "").trim());
        } else {
          projectDesc.push(trimmed);
        }
        break;
      }
      case "certifications":
        certificates.push({ name: trimmed.replace(BULLET_RE, "").trim() });
        break;
      case "languages": {
        const value = trimmed.replace(BULLET_RE, "").trim();
        const parts = value.split(/\s+[\u2013\u2014-]\s+/);
        languages.push({
          language: (parts[0] ?? value).trim(),
          fluency: parts.length > 1 ? parts.slice(1).join(" - ").trim() : undefined,
        });
        break;
      }
      default:
        break;
    }
  }
  flushProject();

  const basics: JsonResumeBasics = {};
  if (names.length) basics.name = names.join(" ").trim();
  if (label) basics.label = label;

  // Contact line(s) → email / phone / url / location.
  if (headerLines.length) {
    const segments = headerLines
      .join(" ")
      .split(MIDDOT_RE)
      .map((s) => s.trim())
      .filter(Boolean);
    const placeParts: string[] = [];
    for (const seg of segments) {
      if (!basics.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(seg)) basics.email = seg;
      else if (!basics.url && /^(https?:\/\/|www\.)/i.test(seg)) basics.url = seg;
      else if (!basics.phone && /^[+()\d][\d\s().-]{6,}$/.test(seg)) basics.phone = seg;
      else placeParts.push(seg);
    }
    if (placeParts.length) {
      const [city, ...rest] = placeParts
        .join(", ")
        .split(",")
        .map((s) => s.trim());
      basics.location = { city: city || undefined, region: rest.join(", ") || undefined };
    }
  }

  const summary = summaryLines.join(" ").trim();

  if (!structured) {
    // Not markdown we produced (e.g. raw extracted text). Render a plausible mini
    // page — first line as the name, a short second line as a label, the rest as
    // the summary — never a blank thumbnail.
    const plain = text
      .split("\n")
      .map((l) => l.replace(/^[#*\->\s]+/, "").replace(/\*\*/g, "").trim())
      .filter(Boolean);
    if (plain.length) {
      if (!basics.name) basics.name = plain[0];
      const rest = plain.slice(1);
      const labelLine = rest[0] && rest[0].length <= 64 ? rest[0] : "";
      if (!basics.label && labelLine) basics.label = labelLine;
      const body = (labelLine ? rest.slice(1) : rest).join(" ");
      basics.summary = (summary || body).slice(0, 1600);
    }
    return { basics };
  }

  if (summary) basics.summary = summary;

  const skills: JsonResumeSkill[] = [];
  if (skillItems.length) {
    const seen = new Set<string>();
    const keywords: string[] = [];
    for (const item of skillItems) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      keywords.push(item);
    }
    skills.push({ keywords });
  }

  return { basics, work, education, skills, projects, certificates, languages };
}