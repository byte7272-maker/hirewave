import type { JsonResume } from "@/lib/jsonResume";
import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import { flattenResume } from "./resumeFields";
import { flattenCoverLetter } from "./coverLetterFields";
import type { FlatField } from "./structuredDiff";

/**
 * Guard against the AI echoing the user's GUIDANCE back as document content.
 *
 * The improve/tailor endpoints receive the user's typed instruction (and preset
 * chips) as a directive, separate from the document body. Occasionally the AI
 * returns the instruction VERBATIM as if it were real content — e.g. a résumé
 * bullet that reads "lead every bullet with measurable impact". Because a
 * directive must never become content, we drop any leaf/line whose text is an
 * exact echo of the guidance, as long as that exact text wasn't already in the
 * user's document (so genuine, pre-existing content is never touched).
 *
 * Matching is normalized (case, whitespace, a leading bullet/dash, trailing
 * punctuation) so "- Keep it to one page." still matches "keep it to one page".
 */

type Flatten<T> = (doc: T | null) => FlatField[];

/** Normalize a string for echo comparison. */
function normalizeUnit(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^\s*[-*•]+[\s.]+/, "")
    .replace(/^\s*\d+[.)][\s]+/, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?;:,]+$/, "")
    .trim();
}

/** Every comparable unit of guidance: each full instruction plus each of its lines. */
function guidanceUnits(guidance: string[]): Set<string> {
  const units = new Set<string>();
  for (const raw of guidance) {
    if (!raw) continue;
    const full = normalizeUnit(raw);
    if (full) units.add(full);
    for (const line of raw.split(/\r?\n/)) {
      const normalized = normalizeUnit(line);
      if (normalized) units.add(normalized);
    }
  }
  return units;
}

/**
 * The echo set to strip: every guidance unit that does NOT already exist in the
 * original document, so genuinely pre-existing wording is still allowed.
 */
function echoSet(original: Set<string>, units: Set<string>): Set<string> {
  const echo = new Set<string>();
  for (const unit of units) {
    if (!original.has(unit)) echo.add(unit);
  }
  return echo;
}

/**
 * Recursively remove any string leaf whose normalized text is in `echo`. String
 * array entries (e.g. résumé highlights, cover-letter paragraphs) are spliced
 * out; object properties are deleted. Iterating arrays backwards keeps indices
 * valid as entries are removed. Returns how many leaves were removed.
 */
function removeEchoes(value: unknown, echo: Set<string>): number {
  let removed = 0;
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      const item = value[i];
      if (typeof item === "string") {
        if (echo.has(normalizeUnit(item))) {
          value.splice(i, 1);
          removed += 1;
        }
      } else {
        removed += removeEchoes(item, echo);
      }
    }
    return removed;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const child = record[key];
      if (typeof child === "string") {
        if (echo.has(normalizeUnit(child))) {
          delete record[key];
          removed += 1;
        }
      } else {
        removed += removeEchoes(child, echo);
      }
    }
  }
  return removed;
}

/**
 * Return `improved` with every verbatim echo of `guidance` removed, plus how
 * many leaves were stripped. `original` (the user's current document) protects
 * pre-existing content: an echo is only stripped when its exact text does NOT
 * already exist in the original.
 */
export function stripInstructionEchoDetailed<T>(
  improved: T,
  original: T | null,
  guidance: string[],
  flatten: Flatten<T>
): { doc: T; strippedCount: number } {
  const units = guidanceUnits(guidance);
  if (!units.size) return { doc: improved, strippedCount: 0 };

  const originalValues = new Set(
    flatten(original)
      .map((field) => normalizeUnit(field.value))
      .filter(Boolean)
  );
  const echo = echoSet(originalValues, units);
  if (!echo.size) return { doc: improved, strippedCount: 0 };

  const clone = JSON.parse(JSON.stringify(improved)) as T;
  const strippedCount = removeEchoes(clone, echo);
  return { doc: clone, strippedCount };
}

/** Return `improved` with every verbatim echo of `guidance` removed. */
export function stripInstructionEcho<T>(
  improved: T,
  original: T | null,
  guidance: string[],
  flatten: Flatten<T>
): T {
  return stripInstructionEchoDetailed(improved, original, guidance, flatten).doc;
}

/** Résumé wrapper that also reports how many guidance echoes it stripped. */
export function stripResumeInstructionEchoDetailed(
  resume: JsonResume,
  original: JsonResume | null,
  guidance: string[]
): { doc: JsonResume; strippedCount: number } {
  return stripInstructionEchoDetailed(resume, original, guidance, flattenResume);
}

/** Résumé wrapper — flattens with the JSON-Resume field map. */
export function stripResumeInstructionEcho(
  resume: JsonResume,
  original: JsonResume | null,
  guidance: string[]
): JsonResume {
  return stripResumeInstructionEchoDetailed(resume, original, guidance).doc;
}

/** Cover-letter wrapper that also reports how many guidance echoes it stripped. */
export function stripCoverLetterInstructionEchoDetailed(
  letter: CoverLetterStructured,
  original: CoverLetterStructured | null,
  guidance: string[]
): { doc: CoverLetterStructured; strippedCount: number } {
  return stripInstructionEchoDetailed(letter, original, guidance, flattenCoverLetter);
}

/** Cover-letter wrapper — flattens with the cover-letter field map. */
export function stripCoverLetterInstructionEcho(
  letter: CoverLetterStructured,
  original: CoverLetterStructured | null,
  guidance: string[]
): CoverLetterStructured {
  return stripCoverLetterInstructionEchoDetailed(letter, original, guidance).doc;
}

/**
 * Plain-text twin of the structured guard, for the Tailor flow (whose result is
 * a markdown string rather than a structured document). Any LINE that is a
 * verbatim echo of the guidance — and wasn't already in the original text — is
 * dropped, so a job-tailoring directive can't leak into the document. Returns
 * the cleaned text plus how many lines were removed.
 */
export function stripTextInstructionEcho(
  preview: string,
  original: string | null,
  guidance: string[]
): { text: string; strippedCount: number } {
  const units = guidanceUnits(guidance);
  if (!units.size) return { text: preview, strippedCount: 0 };

  const originalValues = new Set(
    (original ?? "")
      .split(/\r?\n/)
      .map((line) => normalizeUnit(line))
      .filter(Boolean)
  );
  const echo = echoSet(originalValues, units);
  if (!echo.size) return { text: preview, strippedCount: 0 };

  const kept: string[] = [];
  let strippedCount = 0;
  for (const line of preview.split("\n")) {
    const normalized = normalizeUnit(line);
    if (normalized && echo.has(normalized)) {
      strippedCount += 1;
      continue;
    }
    kept.push(line);
  }
  if (!strippedCount) return { text: preview, strippedCount: 0 };

  // Collapse the blank gap a removed line leaves behind so the document reads
  // cleanly, without otherwise disturbing the AI's spacing.
  const text = kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
  return { text, strippedCount };
}