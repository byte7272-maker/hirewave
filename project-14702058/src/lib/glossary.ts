/**
 * Plain-language glossary for the résumé/cover-letter jargon that shows up in
 * AI advice (summaries, review suggestions, improve prompts, tailoring notes).
 *
 * Each entry is matched inside free text by `findGlossaryMatches`, which the
 * `GlossaryText` component turns into hoverable term links. Every entry also
 * carries a few concrete `examples` for the "Learn more" side drawer.
 */

export interface GlossaryEntry {
  /** Stable identifier. */
  key: string;
  /** Canonical display name shown as the bubble heading. */
  term: string;
  /** One/two-sentence plain-language definition. */
  short: string;
  /** Concrete, realistic examples that make the term click. */
  examples: string[];
  /** Every spelling/variant that should be linked, canonical first. */
  aliases: string[];
}

export interface GlossaryMatch {
  start: number;
  end: number;
  entry: GlossaryEntry;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    key: "ats",
    term: "ATS",
    short:
      "Applicant Tracking System — the software that scans and ranks your résumé before a recruiter ever sees it. If it can't read your file, you may never surface.",
    examples: [
      "A plain single-column .docx with standard headings parses cleanly in Workday.",
      "A two-column PDF with a graphic header can scramble into unreadable text in older systems.",
      "Mirroring the posting's exact job title helps you rank higher when the ATS sorts candidates.",
    ],
    aliases: ["ATS", "applicant tracking system", "applicant tracking systems"],
  },
  {
    key: "ats-formatting",
    term: "ATS formatting",
    short:
      "A plain, single-column layout with standard headings and no tricky tables or graphics, so scanning software can parse every word.",
    examples: [
      "Use headings like “Experience” and “Skills” instead of a text box or table.",
      "Skip the icon column and header images — scanning software reads text, not pictures.",
      "Save as .docx when you can; it is the most reliably parsed format.",
    ],
    aliases: ["ATS formatting", "ATS-friendly", "ATS friendly", "ATS parsable"],
  },
  {
    key: "keyword-coverage",
    term: "Keyword coverage",
    short:
      "How many of the job posting's key terms actually turn up in your document. Higher coverage usually means a stronger match.",
    examples: [
      "The posting asks for Kubernetes and CI/CD; both appear in your résumé, so coverage is strong.",
      "Only 4 of the 12 key terms show up, so screeners may rank you below closer matches.",
      "Lifting coverage from 40% to 70% usually moves you up the shortlist.",
    ],
    aliases: ["keyword coverage", "coverage"],
  },
  {
    key: "gaps",
    term: "Gaps",
    short:
      "Important words from the job posting that are missing from your document. Add the ones you genuinely have — never invent them.",
    examples: [
      "The posting says “Terraform” and you never mention it — add it only if you've really used it.",
      "“Cloud migration” appears in the job ad but not in any of your bullets.",
      "Pull missing terms straight from the responsibilities section of the posting.",
    ],
    aliases: ["gaps", "missing keywords", "missing points", "missing skills"],
  },
  {
    key: "missing-sections",
    term: "Missing sections",
    short:
      "Standard sections your document is missing — like Skills, Education, or a Summary — that recruiters expect to find.",
    examples: [
      "No Skills section at all, so a recruiter has to hunt for your tools.",
      "There's experience but no Education block, which many screeners filter on.",
      "Adding a short Summary at the top helps someone skimming in the first ten seconds.",
    ],
    aliases: ["missing sections"],
  },
  {
    key: "action-verbs",
    term: "Action verbs",
    short:
      "Strong, specific verbs like led, built, or shipped that open each bullet, instead of flat phrases like “responsible for”.",
    examples: [
      "“Responsible for the billing service” becomes “Rebuilt the billing service.”",
      "“Helped with onboarding” becomes “Designed and shipped the onboarding flow.”",
      "Start each bullet with a verb: led, built, cut, launched, negotiated.",
    ],
    aliases: ["action verbs", "action verb"],
  },
  {
    key: "quantified-impact",
    term: "Quantified impact",
    short:
      "Concrete numbers that prove a result — percentages, dollars, time saved, or scale, e.g. “cut load times by 40%”.",
    examples: [
      "“Improved performance” becomes “Cut page load time by 40%.”",
      "“Managed a team” becomes “Led a team of 6 engineers.”",
      "Add scale, dollars, or time saved: “supported 2M monthly users.”",
    ],
    aliases: ["quantified impact", "quantify", "quantified", "metrics"],
  },
  {
    key: "tailoring",
    term: "Tailoring",
    short:
      "Rewriting your wording and emphasis to match one specific job posting, so it reads like a natural fit for that role.",
    examples: [
      "The posting emphasizes payments; move your Stripe work to the first bullet.",
      "Swap a generic “software projects” line for the exact platform they name.",
      "Reorder skills so the ones in the job ad come first, not alphabetically.",
    ],
    aliases: ["tailoring", "tailored", "tailor"],
  },
  {
    key: "keyword-stuffing",
    term: "Keyword stuffing",
    short:
      "Cramming in keywords you can't back up. It reads as filler, and both recruiters and screening software spot it instantly.",
    examples: [
      "“Sales sales sales expert in sales” reads as spam to both people and software.",
      "Listing every tool you've ever touched dilutes the ones that actually matter.",
      "Only claim a keyword you can defend in an interview.",
    ],
    aliases: ["keyword stuffing", "stuffing"],
  },
  {
    key: "first-person",
    term: "First-person pronouns",
    short:
      "I, me, and my. Résumés usually drop them so each bullet starts with a verb and reads tighter.",
    examples: [
      "“I led the migration” becomes “Led the migration.”",
      "Drop “my” and “me” so each bullet opens with a verb.",
      "“We shipped the app” — say what you personally did instead.",
    ],
    aliases: ["first-person pronouns", "first person pronouns", "first-person"],
  },
  {
    key: "cliches",
    term: "Clichés",
    short:
      "Tired phrases like “team player” or “think outside the box” that take up space without saying anything specific.",
    examples: [
      "“Team player” says nothing — show it with a cross-team project instead.",
      "“Think outside the box” is filler; describe the unconventional thing you actually did.",
      "“Results-driven professional” wastes the opening line.",
    ],
    aliases: ["clichés", "cliches", "cliché", "cliche"],
  },
  {
    key: "tone",
    term: "Tone",
    short:
      "The overall voice of the document — formal, warm, confident, or plain. It should stay consistent throughout.",
    examples: [
      "Match a startup's casual confidence or a bank's formal restraint.",
      "Don't mix chatty phrasing with stiff corporate lines in the same document.",
      "Keep past roles in the same voice as your current one.",
    ],
    aliases: ["tone"],
  },
  {
    key: "concise",
    term: "Concise",
    short:
      "Saying the same thing in fewer words so a busy recruiter can scan the whole document in seconds.",
    examples: [
      "“Utilized” becomes “used”; “in order to” becomes “to”.",
      "Cut bullets that repeat a point you already made.",
      "One strong line beats three that circle the same idea.",
    ],
    aliases: ["concise", "concision"],
  },
  {
    key: "fit-score",
    term: "Fit score",
    short:
      "A 0–100 read on how closely your document overlaps with what the job posting actually asks for.",
    examples: [
      "A 78 means you overlap most of what the posting asks for.",
      "A 35 means the role is a stretch — tailor harder or target a closer match.",
      "Raise it by closing the biggest gaps first.",
    ],
    aliases: ["fit score", "match score", "match"],
  },
  {
    key: "summary",
    term: "Professional summary",
    short:
      "The short opening paragraph at the top of a résumé that pitches who you are and what you're aiming for.",
    examples: [
      "“Backend engineer with 6 years shipping payment systems at scale.”",
      "Name your target role and two standout strengths.",
      "Skip the objective statement from 2005 — tell them what you do now.",
    ],
    aliases: ["professional summary", "summary"],
  },
];

/** Lowercase + collapse spaces/hyphens so “first-person” and “first person” match. */
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turn an alias into a regex fragment that tolerates spaces or hyphens. */
function patternFor(alias: string): string {
  return alias
    .replace(/[\s-]+/g, " ")
    .trim()
    .split(" ")
    .map(escapeRegExp)
    .join("[\\s-]+");
}

const ALIAS_MAP = new Map<string, GlossaryEntry>();
const PATTERNS: string[] = [];
const SEEN_PATTERNS = new Set<string>();

for (const entry of GLOSSARY) {
  for (const alias of entry.aliases) {
    const key = normalizeKey(alias);
    if (!ALIAS_MAP.has(key)) ALIAS_MAP.set(key, entry);
    const pattern = patternFor(alias);
    if (pattern && !SEEN_PATTERNS.has(pattern)) {
      SEEN_PATTERNS.add(pattern);
      PATTERNS.push(pattern);
    }
  }
}

// Longest patterns first so “ATS formatting” wins over a bare “ATS”.
PATTERNS.sort((a, b) => b.length - a.length);

const GLOSSARY_SOURCE = `\\b(?:${PATTERNS.join("|")})\\b`;

export function lookupTerm(value: string): GlossaryEntry | undefined {
  return ALIAS_MAP.get(normalizeKey(value));
}

/** Locate every glossary term inside a block of text (non-overlapping, in order). */
export function findGlossaryMatches(text: string): GlossaryMatch[] {
  if (!text) return [];
  const matches: GlossaryMatch[] = [];
  const regex = new RegExp(GLOSSARY_SOURCE, "gi");
  let match = regex.exec(text);
  while (match !== null) {
    const entry = ALIAS_MAP.get(normalizeKey(match[0]));
    if (entry) {
      matches.push({ start: match.index, end: match.index + match[0].length, entry });
    }
    if (regex.lastIndex === match.index) regex.lastIndex += 1;
    match = regex.exec(text);
  }
  return matches;
}

/**
 * The unique glossary terms that actually appear across a set of advice strings,
 * in the order they are first encountered. Powers the review panel's "Key terms".
 */
export function collectGlossaryEntries(texts: Array<string | undefined | null>): GlossaryEntry[] {
  const seen = new Set<string>();
  const ordered: GlossaryEntry[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const match of findGlossaryMatches(text)) {
      if (!seen.has(match.entry.key)) {
        seen.add(match.entry.key);
        ordered.push(match.entry);
      }
    }
  }
  return ordered;
}