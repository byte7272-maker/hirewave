import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { exportResumePdf, listCoverLetters, listResumes, type Resume } from "@/lib/documents";
import { useToast } from "@/components/base/ToastProvider";

interface ResumeActionsMenuProps {
  /** The job posting this role maps to (carried into every résumé action). */
  jobId: string | number;
  /** Optional display info so the résumé page can label the job. */
  jobTitle?: string;
  jobCompany?: string;
  /** Menu alignment relative to the trigger. */
  align?: "left" | "right";
  className?: string;
}

type MenuKey = "improve" | "tailor" | "review" | "cover" | "templates" | "download";

/** Human label for a résumé in the picker. */
function resumeLabel(resume: Resume, index: number): string {
  return (
    resume.title?.trim() ||
    resume.original_filename?.trim() ||
    resume.filename?.trim() ||
    `Résumé ${index + 1}`
  );
}

/**
 * A per-row "Résumé" actions menu for a pipeline role. One small labeled
 * dropdown that reaches every résumé function for that specific job — improve,
 * tailor, ATS check, cover letter, templates, and download — instead of a single
 * mystery icon. The chosen action carries the job through so the résumé page
 * opens already scoped to the role.
 */
export default function ResumeActionsMenu({
  jobId,
  jobTitle,
  jobCompany,
  align = "right",
  className = "",
}: ResumeActionsMenuProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<MenuKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | number | null>(null);
  const [loadingResumes, setLoadingResumes] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Load the résumé list when the menu opens, so a picker can appear whenever
  // there's more than one résumé to choose from.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadingResumes(true);
    listResumes()
      .then((list) => {
        if (!alive) return;
        const items = list ?? [];
        setResumes(items);
        setSelectedResumeId(items[0]?.id ?? null);
      })
      .catch(() => {
        if (alive) setResumes([]);
      })
      .finally(() => {
        if (alive) setLoadingResumes(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  /** Query params that carry the job context into the résumé page. */
  function jobParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set("tailorJob", String(jobId));
    if (jobTitle) params.set("tailorTitle", jobTitle);
    if (jobCompany) params.set("tailorCompany", jobCompany);
    return params;
  }

  /** The résumé the chosen action targets — the picked one, or the primary. */
  async function resolveResume() {
    if (resumes.length) {
      return (
        resumes.find((r) => String(r.id) === String(selectedResumeId)) ?? resumes[0]
      );
    }
    const list = await listResumes().catch(() => []);
    return list[0] ?? null;
  }

  function noResume() {
    setOpen(false);
    showToast("Upload a résumé first — then you can tailor it to any role.", "info");
    navigate("/dashboard/documents");
  }

  async function openResumePanel(panel: "improve" | "tailor" | "review", key: MenuKey) {
    if (busy) return;
    setBusy(key);
    try {
      const resume = await resolveResume();
      if (!resume) {
        noResume();
        return;
      }
      const params = jobParams();
      params.set("panel", panel);
      setOpen(false);
      navigate(`/dashboard/documents/resumes/${resume.id}?${params.toString()}`);
    } finally {
      setBusy(null);
    }
  }

  async function openTemplates(key: MenuKey) {
    if (busy) return;
    setBusy(key);
    try {
      const resume = await resolveResume();
      if (!resume) {
        noResume();
        return;
      }
      const params = jobParams();
      setOpen(false);
      navigate(`/dashboard/documents/resumes/${resume.id}/templates?${params.toString()}`);
    } finally {
      setBusy(null);
    }
  }

  async function openCoverLetter(key: MenuKey) {
    if (busy) return;
    setBusy(key);
    try {
      const letters = await listCoverLetters().catch(() => []);
      setOpen(false);
      if (letters.length) {
        const params = jobParams();
        navigate(`/dashboard/documents/cover-letters/${letters[0].id}?${params.toString()}`);
      } else {
        showToast("No cover letter yet — create one from your documents.", "info");
        navigate("/dashboard/documents?tab=letters");
      }
    } finally {
      setBusy(null);
    }
  }

  async function downloadResumeFile(key: MenuKey) {
    if (busy) return;
    setBusy(key);
    try {
      const resume = await resolveResume();
      if (!resume) {
        noResume();
        return;
      }
      await exportResumePdf(resume.id);
      setOpen(false);
      showToast("Downloading your résumé PDF…", "success");
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Could not download the résumé.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  }

  const items: {
    key: MenuKey;
    icon: string;
    label: string;
    hint: string;
    onClick: () => void;
  }[] = [
    {
      key: "improve",
      icon: "ri-sparkling-line",
      label: "Improve with AI",
      hint: "Rewrite it for this role",
      onClick: () => openResumePanel("improve", "improve"),
    },
    {
      key: "tailor",
      icon: "ri-focus-3-line",
      label: "Tailor to this job",
      hint: "Match its keywords",
      onClick: () => openResumePanel("tailor", "tailor"),
    },
    {
      key: "review",
      icon: "ri-shield-check-line",
      label: "ATS check",
      hint: "Score & review it",
      onClick: () => openResumePanel("review", "review"),
    },
    {
      key: "cover",
      icon: "ri-mail-send-line",
      label: "Cover letter",
      hint: "Open or create one",
      onClick: () => openCoverLetter("cover"),
    },
    {
      key: "templates",
      icon: "ri-layout-line",
      label: "Templates",
      hint: "Change the layout",
      onClick: () => openTemplates("templates"),
    },
    {
      key: "download",
      icon: "ri-download-2-line",
      label: "Download PDF",
      hint: "Export this résumé",
      onClick: () => downloadResumeFile("download"),
    },
  ];

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Résumé tools for this role"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-100 hover:bg-primary-200 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
      >
        <i className="ri-sparkling-line"></i>
        Résumé
        <i
          className={`ri-arrow-down-s-line transition-transform ${open ? "rotate-180" : ""}`}
        ></i>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-30 mt-2 w-60 rounded-xl bg-background-50 border border-background-200 p-1.5 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="px-2.5 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
              Résumé tools
            </p>
            {jobTitle && (
              <p className="text-xs text-foreground-700 truncate mt-0.5">
                {[jobTitle, jobCompany].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          {(resumes.length > 1 || (loadingResumes && resumes.length === 0)) && (
            <div className="px-1.5 pt-0.5 pb-1.5">
              {resumes.length > 1 ? (
                <>
                  <label
                    htmlFor={`resume-picker-${jobId}`}
                    className="block text-[11px] font-semibold uppercase tracking-wide text-foreground-500 px-1.5 mb-1"
                  >
                    Tailor which résumé?
                  </label>
                  <select
                    id={`resume-picker-${jobId}`}
                    value={selectedResumeId != null ? String(selectedResumeId) : ""}
                    onChange={(e) => {
                      const match = resumes.find((r) => String(r.id) === e.target.value);
                      setSelectedResumeId(match ? match.id : null);
                    }}
                    className="w-full text-sm bg-background-50 border border-background-200 rounded-lg px-2.5 py-2 text-foreground-800 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
                  >
                    {resumes.map((r, i) => (
                      <option key={String(r.id)} value={String(r.id)}>
                        {resumeLabel(r, i)}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p className="px-1.5 py-1 text-[11px] text-foreground-500 flex items-center gap-1.5">
                  <i className="ri-loader-4-line animate-spin"></i>
                  Loading your résumés…
                </p>
              )}
            </div>
          )}
          <div className="h-px bg-background-200 my-1"></div>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={item.onClick}
              disabled={busy !== null}
              className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg hover:bg-background-100 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="w-7 h-7 flex items-center justify-center rounded-md bg-background-100 text-foreground-700 flex-shrink-0">
                <i
                  className={busy === item.key ? "ri-loader-4-line animate-spin" : item.icon}
                ></i>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground-950 truncate">
                  {item.label}
                </span>
                <span className="block text-[11px] text-foreground-500 truncate">
                  {item.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}