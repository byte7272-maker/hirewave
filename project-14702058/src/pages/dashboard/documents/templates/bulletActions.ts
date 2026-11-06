import { updateResume, type Resume } from "@/lib/documents";
import type { JsonResume } from "@/lib/jsonResume";
import { resumeToMarkdown } from "./resumeFields";

/**
 * Shared helpers for the verbatim bullet affordances — the per-role "+ Add
 * bullet" on the rendered paper, the inline edit/remove on existing bullets, and
 * the Document view's inserter. Keeping the insert / edit / remove / persist
 * logic here means every surface stays in lockstep.
 *
 * A "target" points at one editable collection:
 *  - work[i].highlights      → a work role's bullet list
 *  - projects[i].highlights  → a project's bullet list
 *  - certificates            → the certification list (each bullet is a new cert)
 */

export type BulletTarget =
  | { kind: "work"; index: number }
  | { kind: "project"; index: number }
  | { kind: "certificate" };

/** A stable key for a target, used to lock one row's controls while it saves. */
export function bulletTargetKey(target: BulletTarget): string {
  return target.kind === "certificate" ? "certificates" : `${target.kind}:${target.index}`;
}

/** Append a bullet to a target VERBATIM (no AI). Returns a new résumé. */
export function appendBullet(
  resume: JsonResume,
  target: BulletTarget,
  text: string
): JsonResume {
  if (target.kind === "certificate") {
    return { ...resume, certificates: [...(resume.certificates ?? []), { name: text }] };
  }
  if (target.kind === "work") {
    const work = resume.work ?? [];
    if (!work[target.index]) return resume;
    return {
      ...resume,
      work: work.map((w, i) =>
        i === target.index ? { ...w, highlights: [...(w.highlights ?? []), text] } : w
      ),
    };
  }
  const projects = resume.projects ?? [];
  if (!projects[target.index]) return resume;
  return {
    ...resume,
    projects: projects.map((p, i) =>
      i === target.index ? { ...p, highlights: [...(p.highlights ?? []), text] } : p
    ),
  };
}

/** Replace the bullet at `bulletIndex` with new text VERBATIM. Returns a new résumé. */
export function setBullet(
  resume: JsonResume,
  target: BulletTarget,
  bulletIndex: number,
  text: string
): JsonResume {
  if (target.kind === "certificate") {
    const certs = resume.certificates ?? [];
    if (!certs[bulletIndex]) return resume;
    return {
      ...resume,
      certificates: certs.map((c, i) => (i === bulletIndex ? { ...c, name: text } : c)),
    };
  }
  if (target.kind === "work") {
    const work = resume.work ?? [];
    const highlights = work[target.index]?.highlights ?? [];
    if (highlights[bulletIndex] === undefined) return resume;
    return {
      ...resume,
      work: work.map((w, i) =>
        i === target.index
          ? { ...w, highlights: highlights.map((h, j) => (j === bulletIndex ? text : h)) }
          : w
      ),
    };
  }
  const projects = resume.projects ?? [];
  const highlights = projects[target.index]?.highlights ?? [];
  if (highlights[bulletIndex] === undefined) return resume;
  return {
    ...resume,
    projects: projects.map((p, i) =>
      i === target.index
        ? { ...p, highlights: highlights.map((h, j) => (j === bulletIndex ? text : h)) }
        : p
    ),
  };
}

/**
 * Remove the bullet at `bulletIndex` from a target. Returns `null` when there's
 * nothing to remove, so the caller can no-op.
 */
export function removeBulletAt(
  resume: JsonResume,
  target: BulletTarget,
  bulletIndex: number
): JsonResume | null {
  if (target.kind === "certificate") {
    const certs = resume.certificates ?? [];
    if (!certs[bulletIndex]) return null;
    return { ...resume, certificates: certs.filter((_, i) => i !== bulletIndex) };
  }
  if (target.kind === "work") {
    const work = resume.work ?? [];
    const highlights = work[target.index]?.highlights ?? [];
    if (highlights[bulletIndex] === undefined) return null;
    return {
      ...resume,
      work: work.map((w, i) =>
        i === target.index
          ? { ...w, highlights: highlights.filter((_, j) => j !== bulletIndex) }
          : w
      ),
    };
  }
  const projects = resume.projects ?? [];
  const highlights = projects[target.index]?.highlights ?? [];
  if (highlights[bulletIndex] === undefined) return null;
  return {
    ...resume,
    projects: projects.map((p, i) =>
      i === target.index
        ? { ...p, highlights: highlights.filter((_, j) => j !== bulletIndex) }
        : p
    ),
  };
}

/**
 * Move the bullet at `bulletIndex` one slot up (-1) or down (+1) within its
 * list. Returns a new résumé, or `null` when the move is out of range (already
 * first / last, or an unknown index) so the caller can no-op.
 */
export function moveBullet(
  resume: JsonResume,
  target: BulletTarget,
  bulletIndex: number,
  direction: -1 | 1
): JsonResume | null {
  const next = bulletIndex + direction;
  if (target.kind === "certificate") {
    const certs = [...(resume.certificates ?? [])];
    if (!swapAt(certs, bulletIndex, next)) return null;
    return { ...resume, certificates: certs };
  }
  if (target.kind === "work") {
    const work = resume.work ?? [];
    const highlights = [...(work[target.index]?.highlights ?? [])];
    if (!swapAt(highlights, bulletIndex, next)) return null;
    return {
      ...resume,
      work: work.map((w, i) => (i === target.index ? { ...w, highlights } : w)),
    };
  }
  const projects = resume.projects ?? [];
  const highlights = [...(projects[target.index]?.highlights ?? [])];
  if (!swapAt(highlights, bulletIndex, next)) return null;
  return {
    ...resume,
    projects: projects.map((p, i) =>
      i === target.index ? { ...p, highlights } : p
    ),
  };
}

/** Swap two list entries in place; returns false when either index is out of range. */
function swapAt<T>(list: T[], a: number, b: number): boolean {
  if (a < 0 || b < 0 || a >= list.length || b >= list.length) return false;
  [list[a], list[b]] = [list[b], list[a]];
  return true;
}

/**
 * Remove the LAST entry matching `text` from a target — i.e. the one just
 * appended. Returns `null` when no match exists, so the caller can no-op.
 */
export function removeLastBullet(
  resume: JsonResume,
  target: BulletTarget,
  text: string
): JsonResume | null {
  if (target.kind === "certificate") {
    const certs = resume.certificates ?? [];
    let at = -1;
    for (let i = certs.length - 1; i >= 0; i -= 1) {
      if (certs[i].name === text) {
        at = i;
        break;
      }
    }
    if (at < 0) return null;
    return { ...resume, certificates: certs.filter((_, i) => i !== at) };
  }
  if (target.kind === "work") {
    const work = resume.work ?? [];
    const highlights = work[target.index]?.highlights ?? [];
    const at = lastIndexOf(highlights, text);
    if (at < 0) return null;
    return {
      ...resume,
      work: work.map((w, i) =>
        i === target.index
          ? { ...w, highlights: highlights.filter((_, j) => j !== at) }
          : w
      ),
    };
  }
  const projects = resume.projects ?? [];
  const highlights = projects[target.index]?.highlights ?? [];
  const at = lastIndexOf(highlights, text);
  if (at < 0) return null;
  return {
    ...resume,
    projects: projects.map((p, i) =>
      i === target.index
        ? { ...p, highlights: highlights.filter((_, j) => j !== at) }
        : p
    ),
  };
}

function lastIndexOf(list: string[], value: string): number {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i] === value) return i;
  }
  return -1;
}

/** Serialize a structured résumé to the canonical markdown the server stores. */
export function resumeStructureToMarkdown(resume: JsonResume): string {
  return resumeToMarkdown(resume);
}

/** Persist a structured résumé as rendered_text. Returns the updated résumé. */
export function persistResumeStructure(
  resumeId: string | number,
  resume: JsonResume
): Promise<Resume> {
  return updateResume(resumeId, { rendered_text: resumeToMarkdown(resume) });
}

/** The instruction sent to improve-structured to polish one bullet. */
export function polishBulletInstruction(text: string): string {
  return `Polish this single bullet point so it reads with more clarity and impact, keeping every fact exactly as stated: "${text}"`;
}

/**
 * The instruction sent to improve-structured to STRENGTHEN one bullet. Distinct
 * from the general polish: it pushes for a punchier, outcome-first rewrite — a
 * strong specific verb, impact up front, filler cut — while still inventing
 * nothing (same guardrails as polish, a different goal).
 */
export function strengthenBulletInstruction(text: string): string {
  return `Strengthen this single bullet point so it lands harder: open with a strong, specific action verb, foreground the outcome or impact, and cut filler words. Keep every fact, name, number, and date exactly as stated — never invent anything new: "${text}"`;
}

/**
 * The instruction sent to improve-structured to STRENGTHEN every bullet in a
 * role at once. The bullet list is spelled out so the AI strengthens ONLY those
 * lines and leaves every other section of the document untouched — the same
 * guardrails as the single-bullet strengthen, just applied across the list.
 */
export function strengthenRoleInstruction(roleLabel: string, bullets: string[]): string {
  const list = bullets.map((b, i) => `${i + 1}. ${b}`).join("\n");
  return `Strengthen every bullet in the "${roleLabel}" entry so each one lands harder: open with a strong, specific action verb, foreground the outcome or impact, and cut filler words. Keep every fact, name, number, and date exactly as stated — never invent anything new, and leave every other section of the document unchanged. Here are the bullets to strengthen:\n${list}`;
}

/**
 * The bullet texts for a target, in order. Used by the Document view's reorder
 * list, which mirrors the per-bullet move controls on the rendered paper.
 */
export function getTargetBullets(resume: JsonResume, target: BulletTarget): string[] {
  if (target.kind === "certificate") {
    return (resume.certificates ?? []).map((c) => c.name);
  }
  if (target.kind === "work") {
    return resume.work?.[target.index]?.highlights ?? [];
  }
  return resume.projects?.[target.index]?.highlights ?? [];
}

/** A labelled bullet list on the résumé — one experience role or one project. */
export interface ResumeBulletGroup {
  label: string;
  bullets: string[];
}

/**
 * Every strengthenable bullet list on the résumé — each experience role and each
 * project that carries at least one bullet. Powers the "Strengthen whole résumé"
 * bulk pass and the count shown on its button.
 */
export function collectResumeBulletGroups(resume: JsonResume): ResumeBulletGroup[] {
  const groups: ResumeBulletGroup[] = [];
  (resume.work ?? []).forEach((w, i) => {
    const bullets = (w.highlights ?? []).filter((h) => h && h.trim());
    if (bullets.length) {
      groups.push({
        label: [w.position, w.name].filter(Boolean).join(" · ") || `Role ${i + 1}`,
        bullets,
      });
    }
  });
  (resume.projects ?? []).forEach((p, i) => {
    const bullets = (p.highlights ?? []).filter((h) => h && h.trim());
    if (bullets.length) {
      groups.push({ label: p.name || `Project ${i + 1}`, bullets });
    }
  });
  return groups;
}

/** How many bullets a whole-résumé strengthen pass would touch. */
export function countResumeBullets(groups: ResumeBulletGroup[]): number {
  return groups.reduce((n, g) => n + g.bullets.length, 0);
}

/** Marks an instruction as the whole-résumé strengthen pass (used to trace it). */
export const BULK_STRENGTHEN_PREFIX =
  "Strengthen every bullet across the entire résumé";

/**
 * The instruction sent to improve-structured to STRENGTHEN every experience and
 * project bullet across the WHOLE résumé in ONE preview. Every list is spelled
 * out so the AI strengthens only these bullets and leaves the rest untouched —
 * the same guardrails as the per-role strengthen, applied résumé-wide.
 */
export function strengthenWholeResumeInstruction(groups: ResumeBulletGroup[]): string {
  const body = groups
    .map((g) => `${g.label}:\n${g.bullets.map((b, i) => `  ${i + 1}. ${b}`).join("\n")}`)
    .join("\n\n");
  return `${BULK_STRENGTHEN_PREFIX} so each one lands harder: open with a strong, specific action verb, foreground the outcome or impact, and cut filler words. Keep every fact, name, number, and date exactly as stated — never invent anything new, and change only these bullets, leaving every other section of the document untouched. Here are all the bullets, grouped by entry:\n\n${body}`;
}

/** Whether an improvement instruction came from the whole-résumé strengthen pass. */
export function isWholeResumeStrengthen(instruction: string): boolean {
  return instruction.trim().startsWith(BULK_STRENGTHEN_PREFIX);
}

/**
 * How many distinct bullets a set of field changes represents — a change targets
 * a bullet when its path ends in `highlights[<n>]`. Used to stamp the accepted
 * version with "N bullets strengthened".
 */
export function countStrengthenedBullets(paths: string[]): number {
  const seen = new Set<string>();
  for (const path of paths) {
    const normalized = path.replace(/\[(\d+)\]/g, ".$1");
    if (/\.highlights\.\d+$/.test(normalized)) seen.add(normalized);
  }
  return seen.size;
}