import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import type { FlatField } from "./structuredDiff";

/**
 * Flatten a structured cover letter into leaf fields (for the revert-individual
 * -edits review list) and serialize it back to text (so the saved version matches
 * exactly the mix of edits the user kept). Mirrors `resumeFields.ts`.
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

/** Flatten a cover letter into an ordered list of leaf fields. */
export function flattenCoverLetter(data: CoverLetterStructured | null): FlatField[] {
  if (!data) return [];
  const out: FlatField[] = [];

  add(out, "Header", "Name", "name", data.name);
  add(out, "Header", "Headline", "label", data.label);
  (data.contact ?? []).forEach((c, i) => {
    add(out, "Header", `Contact ${i + 1}`, `contact[${i}]`, c);
  });
  add(out, "Header", "Date", "date", data.date);
  add(out, "Header", "Company", "company", data.company);
  add(out, "Header", "Role", "role", data.role);

  add(out, "Body", "Salutation", "salutation", data.salutation);
  (data.paragraphs ?? []).forEach((p, i) => {
    add(out, "Body", `Paragraph ${i + 1}`, `paragraphs[${i}]`, p);
  });

  add(out, "Signature", "Closing", "closing", data.closing);
  add(out, "Signature", "Signature", "signature", data.signature);

  return out;
}

/** Serialize a structured cover letter back to text for the version save. */
export function coverLetterToMarkdown(data: CoverLetterStructured): string {
  const lines: string[] = [];
  if (data.name) {
    lines.push(`# ${data.name}`);
    if (data.label) lines.push(data.label);
  }
  if ((data.contact ?? []).length) lines.push(data.contact.join(" · "));
  if (data.date) lines.push(data.date);
  if (data.company || data.role) {
    lines.push("");
    if (data.role) lines.push(data.role);
    if (data.company) lines.push(data.company);
  }
  lines.push("");
  if (data.salutation) lines.push(data.salutation, "");
  (data.paragraphs ?? []).forEach((p) => {
    lines.push(p, "");
  });
  if (data.closing) lines.push(data.closing);
  if (data.signature) lines.push("", data.signature);
  return lines.join("\n").trim();
}