import type { AiEditTrace } from "@/lib/aiEditTrace";

interface DocumentModeHeaderProps {
  mode: "edit" | "preview";
  onModeChange: (mode: "edit" | "preview") => void;
  /** Document name, shown on the edit header strip. */
  title: string;
  /** The active version, shown as v{N}. */
  version: string | number | null | undefined;
  /** Whether the current version came out of an Improve run. */
  aiImproved: boolean;
  /**
   * A tiny trace of the LAST immediate AI edit ("Ask AI to change it"), shown
   * inline next to the version badge — e.g. "1 edit → v14" — so the applied
   * change is visible without opening the version history. Only rendered when its
   * version matches the active one.
   */
  aiEditTrace?: AiEditTrace | null;
  /** One-time, dismissible hand-off helper shown right after an Improve is accepted. */
  showImprovedHelper?: boolean;
  onDismissImprovedHelper?: () => void;
  /**
   * When provided, the v{N} badge becomes a clickable button that opens the
   * version marquee — browse this document's versions or switch to another.
   */
  onOpenMarquee?: () => void;
}

/**
 * The explicit Edit / Preview switch plus — in Edit mode — a header strip that
 * makes the working document unmistakable: the name, the active version, an
 * "Editable" helper line, and an "AI-improved" chip when the version came from
 * Improve. It's the first thing that tells a user this is not a static preview.
 */
export default function DocumentModeHeader({
  mode,
  onModeChange,
  title,
  version,
  aiImproved,
  aiEditTrace,
  showImprovedHelper = false,
  onDismissImprovedHelper,
  onOpenMarquee,
}: DocumentModeHeaderProps) {
  const versionLabel =
    version === "" || version === null || version === undefined ? null : `v${version}`;
  // Show the trace only while it belongs to the version on screen (a switch to
  // another version hides it automatically).
  const trace =
    aiEditTrace && versionLabel && String(aiEditTrace.version) === String(version)
      ? aiEditTrace
      : null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-full bg-background-100 border border-background-200"
          role="tablist"
          aria-label="Editing mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "edit"}
            onClick={() => onModeChange("edit")}
            className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              mode === "edit"
                ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                : "text-foreground-600 hover:text-foreground-950"
            }`}
          >
            <i className="ri-edit-2-line"></i>
            Edit
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            onClick={() => onModeChange("preview")}
            className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              mode === "preview"
                ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                : "text-foreground-600 hover:text-foreground-950"
            }`}
          >
            <i className="ri-eye-line"></i>
            Preview
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {versionLabel &&
            (onOpenMarquee ? (
              <button
                type="button"
                onClick={onOpenMarquee}
                title="Browse this document's versions and switch to another"
                aria-label={`Current version ${versionLabel} — open the version marquee`}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary-900 bg-primary-100 ring-1 ring-primary-200 hover:ring-primary-400 hover:bg-primary-200 px-2.5 py-1 rounded-full whitespace-nowrap cursor-pointer transition-colors"
              >
                <i className="ri-git-branch-line"></i>
                {versionLabel}
                <i className="ri-arrow-down-s-line text-sm" aria-hidden="true"></i>
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-xs font-bold text-primary-900 bg-primary-100 ring-1 ring-primary-200 px-2.5 py-1 rounded-full whitespace-nowrap"
                title="The current version you're viewing"
                aria-label={`Current version ${versionLabel}`}
              >
                <i className="ri-git-branch-line"></i>
                {versionLabel}
              </span>
            ))}
          {trace && (
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent-900 bg-accent-100 px-2.5 py-1 rounded-full whitespace-nowrap"
              title={`Your last AI edit applied ${trace.count} edit${
                trace.count === 1 ? "" : "s"
              } and produced v${trace.version}`}
            >
              <i className="ri-edit-line"></i>
              {trace.count} edit{trace.count === 1 ? "" : "s"} → v{trace.version}
            </span>
          )}
          {mode === "edit" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary-900 bg-secondary-100 px-3 py-1.5 rounded-full whitespace-nowrap">
              <i className="ri-cursor-line"></i>
              Editable — click any text to change it
            </span>
          )}
        </div>
      </div>

      {mode === "edit" && (
        <div className="flex items-center gap-2.5 flex-wrap rounded-xl border border-background-200 bg-background-50 px-3.5 py-2.5">
          <span className="w-7 h-7 flex items-center justify-center rounded-md bg-primary-100 text-primary-700 flex-shrink-0">
            <i className="ri-file-text-line"></i>
          </span>
          <span className="text-sm font-medium text-foreground-950 truncate max-w-[280px]">
            {title}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap">
            <i className="ri-edit-box-line"></i>
            Editing
          </span>
          {aiImproved && (
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-900 bg-primary-100 px-2 py-0.5 rounded-full whitespace-nowrap"
              title="This version was produced by Improve with AI"
            >
              <i className="ri-sparkling-line"></i>
              AI-improved
            </span>
          )}
        </div>
      )}

      {showImprovedHelper && (
        <div className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50 border-l-4 border-l-primary-500 px-4 py-3 animate-fade-in-up">
          <span className="w-7 h-7 flex items-center justify-center rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
            <i className="ri-sparkling-line"></i>
          </span>
          <p className="min-w-0 flex-1 text-sm text-foreground-800 leading-relaxed">
            <span className="font-semibold text-foreground-950">
              AI-improved — you can edit anything or add sections.
            </span>{" "}
            Click any text to change it, or use{" "}
            <span className="font-medium text-foreground-900">+ Add section</span> to extend the
            document.
          </p>
          {onDismissImprovedHelper && (
            <button
              type="button"
              onClick={onDismissImprovedHelper}
              aria-label="Dismiss"
              className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 cursor-pointer flex-shrink-0"
            >
              <i className="ri-close-line"></i>
            </button>
          )}
        </div>
      )}
    </div>
  );
}