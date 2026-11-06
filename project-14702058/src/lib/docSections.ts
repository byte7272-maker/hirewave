/**
 * Sections in a document are plain `## Heading` lines in the markdown text —
 * there is no separate data model, so adding / reordering / deleting a section
 * is just a text edit and is saved the exact same way as any other edit.
 */

export interface DocSectionOption {
  id: string;
  label: string;
  icon: string;
  heading: string;
  /** A starter line dropped under the heading so the section is never empty. */
  sample: string;
}

/** Common sections offered by the "+ Add section" menu. */
export const DOC_SECTION_OPTIONS: DocSectionOption[] = [
  {
    id: "summary",
    label: "Summary",
    icon: "ri-file-text-line",
    heading: "Summary",
    sample: "- One or two lines on your focus and strongest, most measurable result.",
  },
  {
    id: "experience",
    label: "Experience",
    icon: "ri-briefcase-2-line",
    heading: "Experience",
    sample: "- Company — Role (dates)\n- Key achievement with a measurable result",
  },
  {
    id: "education",
    label: "Education",
    icon: "ri-graduation-cap-line",
    heading: "Education",
    sample: "- Degree — Institution (year)",
  },
  {
    id: "skills",
    label: "Skills",
    icon: "ri-tools-line",
    heading: "Skills",
    sample: "- Skill, skill, skill",
  },
  {
    id: "projects",
    label: "Projects",
    icon: "ri-code-s-slash-line",
    heading: "Projects",
    sample: "- Project — what you built and the result",
  },
  {
    id: "certifications",
    label: "Certifications",
    icon: "ri-verified-badge-line",
    heading: "Certifications",
    sample: "- Certification — Issuer (year)",
  },
  {
    id: "awards",
    label: "Awards",
    icon: "ri-trophy-line",
    heading: "Awards",
    sample: "- Award — what it was for (year)",
  },
];

export interface DocSection {
  title: string;
  /** Char index of the `##` heading start. */
  start: number;
  /** Char index just past this section (next heading start or end of text). */
  end: number;
  /** The section body with the heading line stripped. */
  body: string;
  /** Whether the section has no body content yet. */
  empty: boolean;
}

/** Parse `## Heading` sections out of the markdown text, with their ranges. */
export function detectSections(text: string): DocSection[] {
  const heads: { title: string; headStart: number }[] = [];
  const re = /(^|\n)(##[ \t]+[^\n]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const lead = match[1].length;
    heads.push({
      title: match[2].replace(/^##[ \t]+/, "").trim(),
      headStart: match.index + lead,
    });
  }
  return heads.map((head, index) => {
    const start = head.headStart;
    const end = index + 1 < heads.length ? heads[index + 1].headStart : text.length;
    const block = text.slice(start, end).replace(/\s+$/, "");
    const body = block.replace(/^##[ \t]+[^\n]*\n?/, "").trim();
    return { title: head.title, start, end, body, empty: body.length === 0 };
  });
}

/**
 * Insert a new `## Heading` block at the caret (or end of text), separated from
 * its neighbours by a blank line. Returns the new text plus where to place the
 * caret so the user can keep typing.
 */
export function insertSectionAt(
  text: string,
  caret: number,
  heading: string,
  sample: string
): { text: string; caret: number } {
  const block = `## ${heading}\n${sample}`;
  const start = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, start);
  const after = text.slice(start);
  const prefix = before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.length === 0 ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const nextText = `${before}${prefix}${block}${suffix}${after}`;
  return { text: nextText, caret: before.length + prefix.length + block.length };
}

/** Rebuild the text so the section at `index` moves one slot up or down. */
export function moveSection(text: string, index: number, direction: -1 | 1): string {
  const sections = detectSections(text);
  const target = index + direction;
  if (index < 0 || index >= sections.length || target < 0 || target >= sections.length) {
    return text;
  }
  const head = text.slice(0, sections[0].start);
  const blocks = sections.map((s) => text.slice(s.start, s.end).replace(/\s+$/, ""));
  const swapped = [...blocks];
  [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
  return head + swapped.join("\n\n") + "\n";
}

/** Remove the section at `index`, tidying the surrounding blank lines. */
export function deleteSectionAt(text: string, index: number): string {
  const sections = detectSections(text);
  const section = sections[index];
  if (!section) return text;
  const head = text.slice(0, section.start).replace(/\n+$/, "");
  const tail = text.slice(section.end).replace(/^\n+/, "");
  const joined = head && tail ? `${head}\n\n${tail}` : `${head}${tail}`;
  return joined.replace(/\s+$/, "") + (joined.trim() ? "\n" : "");
}