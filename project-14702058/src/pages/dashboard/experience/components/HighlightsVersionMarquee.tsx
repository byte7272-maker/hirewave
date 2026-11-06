import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import VersionsStrip from "@/pages/dashboard/documents/components/VersionsStrip";
import WidgetBoundary from "@/components/feature/WidgetBoundary";
import type { DocumentVersion, Resume } from "@/lib/documents";

interface HighlightsVersionMarqueeProps {
  resumeId: string | number;
  versions: DocumentVersion[];
  activeVersion: string | number | null | undefined;
  /** Called with the freshly-returned résumé after any activate / rename / delete. */
  onChanged: (updated: Resume) => void;
  /** Open the given version in the full résumé editor. */
  onOpenEditor: (version: string | number) => void;
  onClose: () => void;
}

/**
 * The "Change version" overlay for the My Work Highlights viewer — it hosts the
 * SAME versions marquee the editor uses (real rendered thumbnails, hover peek,
 * nicknames, activate / rename / compare / restore / delete). It is opened
 * WITHOUT an "open mode", so clicking a version makes it the current one in place
 * and the viewer re-renders from the response — exactly the behaviour the section
 * wants, with no navigation away.
 */
export default function HighlightsVersionMarquee({
  resumeId,
  versions,
  activeVersion,
  onChanged,
  onOpenEditor,
  onClose,
}: HighlightsVersionMarqueeProps) {
  // The version being PREVIEWED here — looked at (its card clicked / its full-size
  // view opened) but NOT yet made current. Flipping it on gives the same unmissable
  // treatment the résumé editor gives a previewed version: the card carries the
  // "not yet applied" ring + a prominent one-tap Select, the hover bubble says so,
  // and the rail header names it. Enter (or the header's Select) commits it.
  const [previewVersion, setPreviewVersion] = useState<string | number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Change version"
    >
      <div
        className="absolute inset-0 bg-foreground-950/50 dark:bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      <div className="relative w-full max-w-3xl max-h-[90dvh] bg-background-50 rounded-2xl border border-background-200 overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-background-200 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent-100 text-accent-700 flex-shrink-0">
              <i className="ri-git-branch-line text-lg"></i>
            </span>
            <div className="min-w-0">
              <h3 className="font-heading text-base font-medium text-foreground-950">
                Change version
              </h3>
              <p className="text-xs text-foreground-500 mt-0.5">
                Pick a version to show here, rename one, or restore an old version as a copy.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-950 cursor-pointer flex-shrink-0"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto doc-scroll p-4">
          <WidgetBoundary label="Versions">
            <VersionsStrip
              kind="resume"
              docId={resumeId}
              versions={versions}
              activeVersion={activeVersion}
              onChanged={(updated) => {
                // An activate / rename / restore / delete landed — clear the
                // "previewing" flag so the hint + card state reset to the truth.
                setPreviewVersion(null);
                onChanged(updated as Resume);
              }}
              title="Versions"
              surface="plain"
              showStyleLabel
              clickOpensFull
              showSelect
              onViewVersion={setPreviewVersion}
              previewVersion={previewVersion}
              onOpenInEditor={(version) => onOpenEditor(version)}
            />
          </WidgetBoundary>
        </div>
      </div>
    </div>,
    document.body
  );
}