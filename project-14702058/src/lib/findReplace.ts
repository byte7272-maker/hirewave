/**
 * Literal find & replace helpers shared by the editor's Find & Replace tool.
 *
 * These power the deterministic "replace X with Y" path: a straight, exact
 * string swap — never an AI rewrite. The detector below recognises when a
 * free-text instruction is really a literal replacement, so the editor can point
 * the user at Find & Replace instead of the AI guidance box.
 */

export interface LiteralReplacementSuggestion {
  find: string;
  replace: string;
}

/** Escape a user string so it can be matched literally inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Count the words in a block of text. Used to show the before/after word count
 * of a find & replace before it is saved, so the user can eyeball the change.
 */
export function countWords(text: string): number {
  const matches = (text ?? "").trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

/** One run of document text, flagged when it is a match for the live Find query. */
export interface FindMatchSegment {
  text: string;
  match: boolean;
}

/**
 * Split a block of text into segments around every literal match of `find`.
 * Powers the live "highlight every occurrence as you type" layer behind the
 * editor: each `match: true` segment is drawn as a highlight, the rest is
 * invisible spacer text so the highlight lines up with the real characters.
 * An empty `find` returns a single non-matching segment (no highlighting).
 */
export function findMatchSegments(
  text: string,
  find: string,
  caseSensitive: boolean
): FindMatchSegment[] {
  if (!find) return [{ text, match: false }];
  const re = new RegExp(escapeRegExp(find), caseSensitive ? "g" : "gi");
  const segments: FindMatchSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      m = re.exec(text);
      continue;
    }
    if (m.index > last) segments.push({ text: text.slice(last, m.index), match: false });
    segments.push({ text: m[0], match: true });
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false });
  return segments;
}

/** Count how many times `find` appears in `text` (0 when the query is blank). */
export function countMatches(
  text: string,
  find: string,
  caseSensitive: boolean
): number {
  return findMatchSegments(text, find, caseSensitive).filter((s) => s.match).length;
}

/** A single match's character offset range within the document text. */
export interface MatchRange {
  start: number;
  end: number;
}

/**
 * Every literal match of `find` in `text`, in document order — so the tool can
 * point at one specific occurrence (e.g. the sentence around the active match).
 */
export function findMatchRanges(
  text: string,
  find: string,
  caseSensitive: boolean
): MatchRange[] {
  if (!find) return [];
  const re = new RegExp(escapeRegExp(find), caseSensitive ? "g" : "gi");
  const ranges: MatchRange[] = [];
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      m = re.exec(text);
      continue;
    }
    ranges.push({ start: m.index, end: m.index + m[0].length });
    m = re.exec(text);
  }
  return ranges;
}

/**
 * The sentence (or line) surrounding the active match, split so the matched
 * words can be highlighted inline. Lets the user confirm the context — what the
 * word sits next to — without leaving the Find panel.
 */
export interface MatchContext {
  before: string;
  match: string;
  after: string;
  /** 1-based position of this match among all matches. */
  index: number;
  /** Total number of matches in the document. */
  total: number;
}

const SENTENCE_BREAK = /[.!?\u3002\uFF01\uFF1F\n\r]/;
const MAX_CONTEXT_BEFORE = 96;
const MAX_CONTEXT_AFTER = 128;

/**
 * Extract the sentence around the active match for the panel's context preview.
 * The match is wrapped between `before`/`after` so it can be highlighted inline;
 * whitespace is collapsed and long sentences are trimmed around the match.
 */
export function matchSentenceContext(
  text: string,
  find: string,
  caseSensitive: boolean,
  activeIndex: number
): MatchContext | null {
  const ranges = findMatchRanges(text, find, caseSensitive);
  if (ranges.length === 0) return null;
  const idx = ((Math.floor(activeIndex) % ranges.length) + ranges.length) % ranges.length;
  const { start, end } = ranges[idx];
  // Walk out to the nearest sentence (or line) boundary on each side.
  let s = start;
  while (s > 0 && !SENTENCE_BREAK.test(text[s - 1])) s -= 1;
  let e = end;
  while (e < text.length && !SENTENCE_BREAK.test(text[e])) e += 1;
  if (e < text.length && text[e] !== "\n" && text[e] !== "\r") e += 1;
  const normalize = (v: string) => v.replace(/\s+/g, " ");
  let before = normalize(text.slice(s, start)).replace(/^\s+/, "");
  let after = normalize(text.slice(end, e)).replace(/\s+$/, "");
  if (before.length > MAX_CONTEXT_BEFORE) {
    before = `\u2026${before.slice(before.length - MAX_CONTEXT_BEFORE)}`;
  }
  if (after.length > MAX_CONTEXT_AFTER) {
    after = `${after.slice(0, MAX_CONTEXT_AFTER)}\u2026`;
  }
  return {
    before,
    match: text.slice(start, end),
    after,
    index: idx + 1,
    total: ranges.length,
  };
}

/**
 * Apply a literal find & replace. Operates on plain text (the "find" is matched
 * exactly, never interpreted as a pattern), so any characters work. Returns the
 * new text plus how many occurrences were replaced.
 */
export function applyReplacement(
  haystack: string,
  find: string,
  replace: string,
  all: boolean,
  caseSensitive: boolean
): { rendered_text: string; count: number } {
  if (!find) return { rendered_text: haystack, count: 0 };
  const re = new RegExp(escapeRegExp(find), caseSensitive ? "g" : "gi");
  const matches = haystack.match(re);
  const total = matches ? matches.length : 0;
  if (total === 0) return { rendered_text: haystack, count: 0 };
  const limit = all ? total : 1;
  let seen = 0;
  const rendered_text = haystack.replace(re, (m) => {
    seen += 1;
    return seen <= limit ? replace : m;
  });
  return { rendered_text, count: limit };
}

/** One changed line of a find & replace: the line before, and the line after. */
export interface ReplacementLineChange {
  before: string;
  after: string;
}

/**
 * A compact, line-aligned preview of what a literal swap will change — the lines
 * that differ between the current text and the replaced text. A find & replace
 * usually keeps the line count, so pairing lines by index shows exactly the
 * occurrences that change. Powers the "what will change" diff the tool shows
 * before the user confirms.
 */
export function replacementLineChanges(
  before: string,
  after: string,
  limit = 4
): ReplacementLineChange[] {
  const b = (before ?? "").split("\n");
  const a = (after ?? "").split("\n");
  const changes: ReplacementLineChange[] = [];
  const max = Math.max(b.length, a.length);
  for (let i = 0; i < max && changes.length < limit; i += 1) {
    const bl = b[i] ?? "";
    const al = a[i] ?? "";
    if (bl !== al) changes.push({ before: bl, after: al });
  }
  return changes;
}

const QUOTES = /["“”'‘’]/;

/** Unwrap quotes and drop a leading article + noun ("the word", "the phrase"). */
function stripQuotes(value: string): string {
  let v = value.trim();
  v = v.replace(/^(?:the\s+)?(?:word|text|phrase|term|line|title)\s+/i, "");
  const first = v[0];
  const last = v[v.length - 1];
  if (
    first &&
    last &&
    v.length > 2 &&
    QUOTES.test(first) &&
    QUOTES.test(last)
  ) {
    v = v.slice(1, -1);
  }
  return v.trim();
}

/**
 * Recognise a free-text instruction that is really a literal replacement, e.g.
 * "replace 'synergy' with 'collaboration'" or "change the title to Staff
 * Engineer". Returns the find/replace pair, or null when the instruction reads
 * like a stylistic ask the AI should handle instead (so we don't hijack it).
 */
export function detectLiteralReplacement(
  instruction: string
): LiteralReplacementSuggestion | null {
  const raw = (instruction ?? "").trim();
  if (raw.length < 8) return null;
  const cleaned = raw.replace(
    /^(?:please\s+|can you\s+|could you\s+|i want you to\s+|could you please\s+)/i,
    ""
  );
  const patterns: RegExp[] = [
    /^(?:replace|swap|substitute)\s+(.+?)\s+(?:with|by|for)\s+(.+)$/i,
    /^change\s+(.+?)\s+(?:to|into)\s+(.+)$/i,
  ];
  for (const re of patterns) {
    const match = cleaned.match(re);
    if (!match) continue;
    const rawFind = match[1].trim();
    const find = stripQuotes(rawFind);
    const replace = stripQuotes(match[2]);
    if (!find || !replace) continue;
    // A quoted target is unambiguously literal.
    if (QUOTES.test(rawFind)) return { find, replace };
    // An unquoted ask is only "clearly literal" when the target is a short, exact
    // phrase — not a whole-section concept the AI would normally rewrite.
    const words = find.split(/\s+/).filter(Boolean);
    const looksLikeConcept =
      /^(?:the\s+)?(?:tone|summary|title|objective|voice|style|wording|format|layout|length|verb|greeting|opening|closing|bullet)\b/i.test(
        find
      );
    if (!looksLikeConcept && words.length <= 4) return { find, replace };
  }
  return null;
}