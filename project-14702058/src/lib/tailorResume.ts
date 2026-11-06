import type { NavigateFunction } from "react-router-dom";
import { listResumes } from "@/lib/documents";

export interface TailorTarget {
  jobId: string | number;
  jobTitle?: string;
  jobCompany?: string;
}

/**
 * Shared "open my résumé, tailored to this job" navigation. Resolves the primary
 * résumé, carries the job (and its display info) through the URL via the
 * `tailorJob` param, and hands off gracefully when there's no résumé yet.
 *
 * Extracted so both the `TailorResumeButton` and the match-row overflow menu run
 * the exact same flow instead of duplicating the résumé resolution.
 */
export async function openTailorResume(
  target: TailorTarget,
  navigate: NavigateFunction,
  onMissingResume?: () => void,
): Promise<void> {
  const resumes = await listResumes().catch(() => []);
  if (!resumes.length) {
    onMissingResume?.();
    return;
  }
  const resume = resumes[0];
  const params = new URLSearchParams();
  params.set("tailorJob", String(target.jobId));
  if (target.jobTitle) params.set("tailorTitle", target.jobTitle);
  if (target.jobCompany) params.set("tailorCompany", target.jobCompany);
  navigate(`/dashboard/documents/resumes/${resume.id}?${params.toString()}`);
}