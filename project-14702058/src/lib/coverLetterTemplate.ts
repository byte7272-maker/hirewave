import type { JsonResume } from "./jsonResume";

/**
 * The shape a cover-letter template renders. We derive it from the letter's
 * plain-text content plus, when available, the linked résumé's basics (for the
 * name/contact header) and the job it targets (for the recipient block).
 */
export interface CoverLetterStructured {
  name?: string;
  label?: string;
  contact: string[];
  date?: string;
  company?: string;
  role?: string;
  salutation?: string;
  paragraphs: string[];
  closing?: string;
  signature?: string;
}

const CLOSING_RE =
  /^(sincerely|best regards|kind regards|warm regards|regards|yours (sincerely|truly|faithfully)|respectfully|thank you|thanks|many thanks|cheers)\b/i;
const SALUTATION_RE = /^(dear\b|hello\b|hi\b|to whom it may concern)/i;

/** Render an ISO date as e.g. "September 22, 2026". */
export function formatLetterDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Turn a cover letter's text into a structured object. Paragraphs are split on
 * blank lines (falling back to single newlines); a leading salutation and a
 * trailing closing/signature are pulled out so templates can style them.
 */
export function buildCoverLetterStructured(
  content: string,
  opts?: {
    date?: string;
    basics?: JsonResume["basics"];
    company?: string;
    role?: string;
  }
): CoverLetterStructured {
  const raw = (content ?? "").replace(/\r\n/g, "\n").trim();
  let blocks = raw
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length <= 1) {
    blocks = raw
      .split(/\n/)
      .map((b) => b.trim())
      .filter(Boolean);
  }

  let salutation = "";
  let closing = "";
  let signature = "";

  if (blocks.length > 0 && SALUTATION_RE.test(blocks[0])) {
    salutation = blocks.shift() as string;
  }

  if (blocks.length > 0 && CLOSING_RE.test(blocks[blocks.length - 1])) {
    const last = blocks.pop() as string;
    const lines = last
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    closing = lines[0] ?? "";
    signature = lines.slice(1).join(" ");
  }

  const basics = opts?.basics;
  const loc = basics?.location ?? {};
  const location = [loc.city, loc.region].filter(Boolean).join(", ");
  const contact = [basics?.email, basics?.phone, location, basics?.url].filter(
    (v): v is string => Boolean(v && v.trim())
  );

  const name = basics?.name?.trim() || signature || "";

  return {
    name: name || undefined,
    label: basics?.label?.trim() || undefined,
    contact,
    date: opts?.date ? formatLetterDate(opts.date) : undefined,
    company: opts?.company || undefined,
    role: opts?.role || undefined,
    salutation: salutation || undefined,
    paragraphs: blocks,
    closing: closing || undefined,
    signature: signature || undefined,
  };
}

/** A letter is "too thin to preview" when it has neither body text nor a name. */
export function isEmptyCoverLetter(s: CoverLetterStructured | null): boolean {
  if (!s) return true;
  return s.paragraphs.length === 0 && !s.name;
}