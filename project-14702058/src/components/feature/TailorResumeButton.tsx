import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { openTailorResume } from "@/lib/tailorResume";
import { useToast } from "@/components/base/ToastProvider";

interface TailorResumeButtonProps {
  /** The job posting to tailor against (captured as the preselected job). */
  jobId: string | number;
  /** Optional display info so the résumé page can label the job even if it isn't in the matches pool. */
  jobTitle?: string;
  jobCompany?: string;
  /** "icon" = compact square button for dense rows; "button" = full labeled action; "compact" = small labeled pill. */
  variant?: "icon" | "button" | "compact";
  className?: string;
}

/**
 * Shortcut that opens the user's résumé with a specific job already selected for tailoring.
 * Resolves the primary résumé, carries the job (and its display info) through the URL, and
 * lets the résumé page pick the job up via the `tailorJob` query param.
 */
export default function TailorResumeButton({
  jobId,
  jobTitle,
  jobCompany,
  variant = "icon",
  className = "",
}: TailorResumeButtonProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const label = "Tailor résumé to this job";

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await openTailorResume(
        { jobId, jobTitle, jobCompany },
        navigate,
        () => {
          showToast("Upload a résumé first, then tailor it to this job.", "info");
          navigate("/dashboard/documents");
        },
      );
    } finally {
      setBusy(false);
    }
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={label}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-100 hover:bg-primary-200 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap ${className}`}
      >
        <i className={busy ? "ri-loader-4-line animate-spin" : "ri-sparkling-line"}></i>
        {busy ? "Opening…" : "Improve résumé"}
      </button>
    );
  }

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={label}
        className={`inline-flex items-center gap-2 text-sm font-semibold bg-background-50 text-foreground-900 border border-background-200 px-4 py-2.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap ${className}`}
      >
        <i className={busy ? "ri-loader-4-line animate-spin" : "ri-sparkling-line"}></i>
        {busy ? "Opening résumé…" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className={`w-9 h-9 flex items-center justify-center rounded-lg border border-background-300 text-foreground-500 hover:text-primary-700 hover:border-primary-300 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      <i className={busy ? "ri-loader-4-line animate-spin" : "ri-sparkling-line"}></i>
    </button>
  );
}