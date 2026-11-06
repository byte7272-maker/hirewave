import type { IncorporateEntry } from "./incorporateHistory";

/**
 * Turn a past submission into the passages to highlight on the rendered paper.
 *
 * The exact new wording the AI wrote (stored as `passages` when the submission
 * landed) is the most useful signal — it pens over the real sentences. When a
 * submission only recorded section names (older entries, or no wording captured)
 * we fall back to the on-paper section headings so the impacted areas are still
 * marked.
 */

/** Section name (from the structured diff) → the heading shown on the paper. */
const SECTION_HEADINGS: Record<string, string> = {
  Basics: "Profile",
  Header: "Profile",
  Experience: "Experience",
  Education: "Education",
  Skills: "Skills",
  Projects: "Projects",
  Certifications: "Certifications",
  Languages: "Languages",
  Body: "Body",
  Signature: "Signature",
  Summary: "Summary",
};

/** The passages to highlight for a past submission. */
export function impactTermsForEntry(entry: IncorporateEntry): string[] {
  if (entry.passages && entry.passages.length > 0) return entry.passages;
  return entry.impacted
    .map((section) => SECTION_HEADINGS[section] ?? section)
    .filter(Boolean);
}

/** A short human label for the submission (its note, else its points). */
export function impactLabelForEntry(entry: IncorporateEntry): string {
  const note = entry.text.trim();
  if (note) return note;
  if (entry.ideas.length > 0) return entry.ideas.join(" · ");
  return "Your past input";
}