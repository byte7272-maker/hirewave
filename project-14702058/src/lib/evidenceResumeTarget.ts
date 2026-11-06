/**
 * Finds the résumés that still hold a kept, unfinished "My Work
 * Highlights" wizard — the targets a resume shortcut, or the sidebar badge,
 * should jump into.
 *
 * "Default" follows the same rule the launcher uses: the résumé the user last
 * picked in the launcher, falling back to the most recently edited one. "Oldest"
 * is the one stalled longest — least recently touched (smallest `savedAt`) — so a
 * neglected wizard can be surfaced first. Only résumés that actually still hold a
 * draft are considered, so a shortcut never leads to an empty wizard.
 */

import { listResumes, type Resume } from "@/lib/documents";
import { readEvidenceDraft, type EvidenceDraft } from "@/lib/evidenceDraft";
import { readLastEvidenceResume } from "@/lib/evidenceLauncherMemory";

export interface PausedEvidenceTarget {
  resume: Resume;
  draft: EvidenceDraft;
  /** The résumé's friendly name for display. */
  name: string;
  /** Where to open it so the wizard resumes in place. */
  href: string;
}

/** The friendly name shown for a résumé (mirrors the documents list). */
export function evidenceResumeName(res: Resume): string {
  return res.original_filename || res.target_role || res.filename || `Résumé ${res.id}`;
}

/** The workspace URL that resumes this résumé's wizard (it lives on the one page now). */
export function evidenceResumeHref(id: string | number): string {
  return `/dashboard/experience?resume=${encodeURIComponent(String(id))}&zone=review`;
}

function editedAt(res: Resume): number {
  return new Date(res.updated_at ?? res.created_at ?? 0).getTime();
}

/** When the draft was last touched (0 for drafts saved before timestamps existed). */
function draftSavedAt(draft: EvidenceDraft): number {
  return typeof draft.savedAt === "number" ? draft.savedAt : 0;
}

function buildTarget(res: Resume, draft: EvidenceDraft): PausedEvidenceTarget {
  return {
    resume: res,
    draft,
    name: evidenceResumeName(res),
    href: evidenceResumeHref(res.id),
  };
}

/**
 * Every active résumé that still holds a paused wizard. Best-effort: a failed
 * load yields an empty list so callers can simply hide their affordance.
 */
export async function listPausedEvidenceTargets(): Promise<PausedEvidenceTarget[]> {
  let list: Resume[] = [];
  try {
    list = (await listResumes({ archived: false })) ?? [];
  } catch {
    return [];
  }
  const targets: PausedEvidenceTarget[] = [];
  for (const res of list) {
    const draft = readEvidenceDraft(res.id);
    if (draft) targets.push(buildTarget(res, draft));
  }
  return targets;
}

/** The stalled-longest target (least recently touched), or null when none. */
export function oldestEvidenceTarget(
  targets: PausedEvidenceTarget[]
): PausedEvidenceTarget | null {
  if (targets.length === 0) return null;
  return [...targets].sort((a, b) => draftSavedAt(a.draft) - draftSavedAt(b.draft))[0];
}

/**
 * The highest-priority résumé with a paused wizard, or null when none exists.
 * Best-effort: a failed load simply yields null so callers can hide the shortcut.
 */
export async function findPausedEvidenceTarget(): Promise<PausedEvidenceTarget | null> {
  const targets = await listPausedEvidenceTargets();
  if (targets.length === 0) return null;

  const remembered = readLastEvidenceResume();
  const [first] = [...targets].sort((a, b) => {
    const aRemembered = remembered !== null && String(a.resume.id) === remembered ? 1 : 0;
    const bRemembered = remembered !== null && String(b.resume.id) === remembered ? 1 : 0;
    if (aRemembered !== bRemembered) return bRemembered - aRemembered;
    return editedAt(b.resume) - editedAt(a.resume);
  });
  return first ?? null;
}

export interface PausedEvidenceOverview {
  /** How many résumés still hold a paused wizard. */
  count: number;
  /** The stalled-longest target, or null when none. */
  oldest: PausedEvidenceTarget | null;
}

/**
 * One listing that yields both the in-progress count and the stalled-longest
 * target, so live surfaces (the sidebar badge) need only a single résumé fetch.
 * Best-effort: a failed load yields an empty overview.
 */
export async function loadPausedEvidenceOverview(): Promise<PausedEvidenceOverview> {
  const targets = await listPausedEvidenceTargets();
  return { count: targets.length, oldest: oldestEvidenceTarget(targets) };
}