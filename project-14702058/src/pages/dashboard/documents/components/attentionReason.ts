import { readVersionMetricMap } from "@/pages/dashboard/documents/templates/metricMemory";

/**
 * A one-line explanation of *why* a flagged document needs attention.
 *
 * `flagged` itself is a user-controlled toggle, so we can't know the user's
 * exact reason — instead we surface the strongest available AI-metric signal
 * (unverified invented figures, then a low quality score, then a missing
 * target role) and fall back to a neutral "flagged for review" note. This is
 * shown as the "last activity" reason on flagged document rows.
 */

/** Documents below this quality score are worth a second look. */
const LOW_SCORE = 60;

/** Minimal shape the reason only needs — works for both résumés and letters. */
interface AttentionDoc {
  id: string | number;
  target_role?: string;
  quality_score?: number;
  quality_grade?: string;
}

/** Count AI-introduced figures across a document's saved versions that were never verified. */
function countUnverifiedFigures(docType: string, id: string | number): number {
  const map = readVersionMetricMap(docType, id);
  let pending = 0;
  for (const entry of Object.values(map)) {
    if (!entry) continue;
    const total = typeof entry.total === "number" ? entry.total : 0;
    const verified = typeof entry.verified === "number" ? entry.verified : 0;
    pending += Math.max(0, total - verified);
  }
  return pending;
}

/**
 * Build the one-line "last activity" reason for a flagged document. Prefers an
 * AI-metric warning (unverified figures / low score), then a missing role.
 */
export function documentAttentionReason(
  docType: "resume" | "cover-letter",
  doc: AttentionDoc
): string {
  const unverified = countUnverifiedFigures(docType, doc.id);
  if (unverified > 0) {
    return `${unverified} unverified AI figure${unverified === 1 ? "" : "s"} to review`;
  }
  if (
    typeof doc.quality_score === "number" &&
    doc.quality_score > 0 &&
    doc.quality_score < LOW_SCORE
  ) {
    const grade = doc.quality_grade ? ` \u00b7 ${doc.quality_grade}` : "";
    return `Low quality score ${Math.round(doc.quality_score)}${grade}`;
  }
  if (docType === "resume" && !doc.target_role?.trim()) {
    return "No target role set yet";
  }
  return "Flagged for review";
}