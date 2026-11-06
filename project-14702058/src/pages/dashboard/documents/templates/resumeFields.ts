import type { JsonResume } from "@/lib/jsonResume";
import { contactDetails, formatRange, resumeName } from "@/lib/jsonResume";
import type { FlatField } from "./structuredDiff";
import { skillsInlineText } from "./skillsList";

/**
 * Flatten a JSON Resume into leaf fields, then serialize it back to markdown.
 *
 * The flattening powers the structured preview's "revert individual edits"
 * review list; the markdown serializer rebuilds the canonical text from whatever
 * mix of edits the user kept, so the saved version matches exactly what's shown.
 */

function add(
  out: FlatField[],
  section: string,
  label: string,
  path: string,
  value?: string
): void {
  out.push({ path, section, label, value: (value ?? "").toString() });
}

/** Flatten a résumé into an ordered list of leaf fields. */
export function flattenResume(resume: JsonResume | null): FlatField[] {
  if (!resume) return [];
  const out: FlatField[] = [];
  const b = resume.basics ?? {};

  add(out, "Basics", "Name", "basics.name", b.name);
  add(out, "Basics", "Headline", "basics.label", b.label);
  add(out, "Basics", "Email", "basics.email", b.email);
  add(out, "Basics", "Phone", "basics.phone", b.phone);
  add(out, "Basics", "Website", "basics.url", b.url);
  add(out, "Basics", "City", "basics.location.city", b.location?.city);
  add(out, "Basics", "Region", "basics.location.region", b.location?.region);
  add(out, "Basics", "Summary", "basics.summary", b.summary);
  (b.profiles ?? []).forEach((p, i) => {
    add(
      out,
      "Basics",
      `Profile ${i + 1}`,
      `basics.profiles[${i}].username`,
      p.username || p.url
    );
  });

  (resume.work ?? []).forEach((w, i) => {
    const who = w.position || w.name || `Role ${i + 1}`;
    add(out, "Experience", `${who} — company`, `work[${i}].name`, w.name);
    add(out, "Experience", `${who} — title`, `work[${i}].position`, w.position);
    add(out, "Experience", `${who} — start`, `work[${i}].startDate`, w.startDate);
    add(out, "Experience", `${who} — end`, `work[${i}].endDate`, w.endDate);
    add(out, "Experience", `${who} — summary`, `work[${i}].summary`, w.summary);
    (w.highlights ?? []).forEach((h, j) => {
      add(out, "Experience", `${who} — highlight ${j + 1}`, `work[${i}].highlights[${j}]`, h);
    });
  });

  (resume.education ?? []).forEach((e, i) => {
    const who = [e.studyType, e.area].filter(Boolean).join(", ") || `Education ${i + 1}`;
    add(out, "Education", `${who} — institution`, `education[${i}].institution`, e.institution);
    add(out, "Education", `${who} — field`, `education[${i}].area`, e.area);
    add(out, "Education", `${who} — degree`, `education[${i}].studyType`, e.studyType);
    add(out, "Education", `${who} — start`, `education[${i}].startDate`, e.startDate);
    add(out, "Education", `${who} — end`, `education[${i}].endDate`, e.endDate);
    add(out, "Education", `${who} — score`, `education[${i}].score`, e.score);
  });

  (resume.skills ?? []).forEach((s, i) => {
    const who = s.name || `Skill ${i + 1}`;
    add(out, "Skills", `${who} — group`, `skills[${i}].name`, s.name);
    (s.keywords ?? []).forEach((k, j) => {
      add(out, "Skills", `${who} — ${k || `keyword ${j + 1}`}`, `skills[${i}].keywords[${j}]`, k);
    });
  });

  (resume.projects ?? []).forEach((p, i) => {
    const who = p.name || `Project ${i + 1}`;
    add(out, "Projects", `${who} — name`, `projects[${i}].name`, p.name);
    add(out, "Projects", `${who} — description`, `projects[${i}].description`, p.description);
    (p.highlights ?? []).forEach((h, j) => {
      add(out, "Projects", `${who} — highlight ${j + 1}`, `projects[${i}].highlights[${j}]`, h);
    });
  });

  (resume.certificates ?? []).forEach((c, i) => {
    add(out, "Certifications", `${c.name || `Certificate ${i + 1}`} — issuer`, `certificates[${i}].issuer`, c.issuer);
  });

  (resume.languages ?? []).forEach((l, i) => {
    add(out, "Languages", `${l.language || `Language ${i + 1}`} — fluency`, `languages[${i}].fluency`, l.fluency);
  });

  return out;
}

/**
 * Serialize a JSON Resume to canonical markdown. Used as the "content" posted to
 * `…/versions` so the saved text reflects exactly the edits the user kept.
 */
export function resumeToMarkdown(resume: JsonResume): string {
  const b = resume.basics ?? {};
  const lines: string[] = [];

  lines.push(`# ${resumeName(resume)}`);
  if (b.label) lines.push(`**${b.label}**`);
  const contact = contactDetails(resume);
  if (contact.length) lines.push(contact.join(" · "));
  lines.push("");

  if (b.summary) {
    lines.push("## Summary", "", b.summary, "");
  }

  if ((resume.work ?? []).length) {
    lines.push("## Experience", "");
    for (const w of resume.work ?? []) {
      const range = formatRange(w.startDate, w.endDate);
      const title = [w.position, w.name].filter(Boolean).join(" — ");
      lines.push(`### ${title}${range ? ` (${range})` : ""}`);
      if (w.summary) lines.push(w.summary);
      for (const h of w.highlights ?? []) lines.push(`- ${h}`);
      lines.push("");
    }
  }

  if ((resume.education ?? []).length) {
    lines.push("## Education", "");
    for (const e of resume.education ?? []) {
      const range = formatRange(e.startDate, e.endDate);
      const title = [e.studyType, e.area].filter(Boolean).join(", ");
      lines.push(`### ${title}${e.institution ? ` — ${e.institution}` : ""}${range ? ` (${range})` : ""}`);
      if (e.score) lines.push(e.score);
      lines.push("");
    }
  }

  if ((resume.skills ?? []).length) {
    // One comma-separated inline list (de-duplicated, order-preserving) — never
    // a bullet per group, so a saved revision keeps the skills layout the user
    // (or their instruction) asked for instead of reverting to bullets.
    const inline = skillsInlineText(resume.skills);
    if (inline) lines.push("## Skills", "", inline, "");
  }

  if ((resume.projects ?? []).length) {
    lines.push("## Projects", "");
    for (const p of resume.projects ?? []) {
      lines.push(`### ${p.name ?? ""}`);
      if (p.description) lines.push(p.description);
      for (const h of p.highlights ?? []) lines.push(`- ${h}`);
      lines.push("");
    }
  }

  if ((resume.certificates ?? []).length) {
    lines.push("## Certifications", "");
    for (const c of resume.certificates ?? []) {
      lines.push(`- ${[c.name, c.issuer, c.date].filter(Boolean).join(", ")}`);
    }
    lines.push("");
  }

  if ((resume.languages ?? []).length) {
    lines.push("## Languages", "");
    for (const l of resume.languages ?? []) {
      lines.push(`- ${[l.language, l.fluency].filter(Boolean).join(" — ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}