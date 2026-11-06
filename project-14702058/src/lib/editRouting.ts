import { detectLiteralReplacement } from "@/lib/findReplace";
import type { SkillsLayout } from "@/lib/skillsLayoutMemory";
import { detectSectionStyleInstruction } from "@/lib/sectionStyles";

/**
 * Decide the CHEAPEST correct path for a free-text change instruction, so every
 * edit doesn't have to go through the AI:
 *
 *  - a literal replacement ("replace X with Y") → the deterministic Find & replace
 *    endpoint (instant + exact, with a match count);
 *  - a Skills layout ask ("make skills bullets" / "comma-separate my skills") →
 *    a local display toggle, re-rendered in place, never an AI call;
 *  - everything else (tone, concision, tense, tailoring…) → the AI rewrite.
 */
export type EditRoute =
  | { kind: "literal-replace"; find: string; replace: string }
  | { kind: "skills-layout"; layout: SkillsLayout }
  | { kind: "section-style"; section: string; bold?: boolean; italic?: boolean }
  | { kind: "ai" };

/**
 * Recognise an instruction that is only about the Skills LAYOUT (comma-separated
 * vs bullets) — formatting, not content. Returns the target layout, or null when
 * the instruction isn't a pure formatting ask (so real rewrites still reach the AI).
 */
export function detectSkillsLayout(instruction: string): SkillsLayout | null {
  const raw = (instruction ?? "").trim().toLowerCase();
  if (raw.length < 6 || !/\bskills?\b/.test(raw)) return null;
  // Only an explicit layout word counts — a bare "skills list" must NOT be
  // hijacked (that usually means "improve my skills", which the AI should handle).
  const mentionsLayout =
    /\b(comma|bullets?|bullet[\s-]?points?|inline|one[\s-]?line|single[\s-]?line)\b/.test(
      raw
    );
  if (!mentionsLayout) return null;
  // "comma" (and only comma) reads as the comma line; bullet/bullet-points is bullets.
  const wantsComma = /\bcomma\b/.test(raw) && !/\bbullets?\b/.test(raw);
  if (wantsComma) return "comma";
  if (/\bbullets?\b|\bbullet[\s-]?points?\b/.test(raw)) return "bullets";
  // inline / one line / single line → the comma line.
  return "comma";
}

/**
 * Classify a change instruction into one of the three edit paths. Layout is
 * checked before the literal-replacement detector because "change skills to
 * bullets" also matches the literal "change X to Y" shape but is really a
 * formatting toggle.
 */
export function classifyEditInstruction(instruction: string): EditRoute {
  const layout = detectSkillsLayout(instruction);
  if (layout) return { kind: "skills-layout", layout };
  // A per-section bold / italic ask is a local display change — it never reaches
  // the AI (which returns text, not styling) — so it's routed here.
  const sectionStyle = detectSectionStyleInstruction(instruction);
  if (sectionStyle) return { kind: "section-style", ...sectionStyle };
  const literal = detectLiteralReplacement(instruction);
  if (literal) {
    return { kind: "literal-replace", find: literal.find, replace: literal.replace };
  }
  return { kind: "ai" };
}