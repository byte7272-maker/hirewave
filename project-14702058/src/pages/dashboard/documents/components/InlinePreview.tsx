import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/base/ToastProvider";
import {
  activateCoverLetterVersion,
  activateResumeVersion,
  createCoverLetterVersion,
  createResumeVersion,
  getCoverLetter,
  getResume,
  reviewCoverLetter,
  reviewResume,
  type ReviewResult,
} from "@/lib/documents";
import GradeBadge from "./GradeBadge";
import HtmlDocumentViewer from "./HtmlDocumentViewer";
import DocumentBulletInserter from "./DocumentBulletInserter";
import ReadableDocumentModal from "./ReadableDocumentModal";
import AddPointsPanel from "./AddPointsPanel";
import ReadAloudControl from "@/components/feature/ReadAloudControl";
import NarrationText from "@/components/feature/NarrationText";
import StructuredImprovePreview from "@/pages/dashboard/documents/templates/StructuredImprovePreview";
import useStructuredImprove, {
  type ImproveDoc,
} from "@/pages/dashboard/documents/templates/useStructuredImprove";
import { openRevisionReview, revisionReviewKey } from "@/lib/revisionReview";
import type { InlineEditMeta } from "@/hooks/useInlineDocEdit";

interface InlinePreviewProps {
  kind: "resume" | "cover-letter";
  docId: string | number;
  title: string;
  onClose: () => void;
  /** File size in bytes for a freshly uploaded document — drives an adaptive settle delay. */
  fileSize?: number;
}

/** Scale the post-upload settle delay with file size so bigger docs get more extraction headroom. */
function settleDelayForSize(bytes?: number): number {
  if (!bytes || bytes <= 0) return 900;
  const mb = bytes / (1024 * 1024);
  if (mb < 0.25) return 900;
  if (mb < 1) return 1500;
  if (mb < 3) return 2200;
  return 3000;
}

function gradeFor(review: ReviewResult | null): string {
  if (review?.grade && review.grade.trim()) return review.grade.trim().toUpperCase();
  if (typeof review?.score === "number") {
    if (review.score >= 85) return "A";
    if (review.score >= 70) return "B";
    return "C";
  }
  return "";
}

/**
 * The quick preview opened from a document row. It keeps its preview-specific
 * chrome — the rendered document, the read-aloud control and the review score —
 * and mounts the SAME "Improve with AI" section the full editor uses. There is
 * one improve experience: the shared {@link ImprovePanel} drives
 * `POST /resumes|cover-letters/{id}/improve-structured`, and the result renders
 * through the document's chosen template via {@link StructuredImprovePreview}
 * (split view, flagged-metrics guardrail, accept/discard) instead of a local
 * "quick refine" path.
 */
export default function InlinePreview({
  kind,
  docId,
  title,
  onClose,
  fileSize,
}: InlinePreviewProps) {
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewLoading, setReviewLoading] = useState(true);
  /** Whether the full-screen readable view is open. */
  const [readable, setReadable] = useState(false);
  /** Bumped after an improvement is saved so the rendered document re-fetches. */
  const [docRefresh, setDocRefresh] = useState(0);

  const panelRef = useRef<HTMLElement>(null);
  const { showToast } = useToast();

  async function runReview() {
    setReviewLoading(true);
    // Larger uploads may still be extracting text — retry a couple times before giving up.
    const attempts = fileSize ? 3 : 1;
    let result: ReviewResult | null = null;
    for (let i = 0; i < attempts; i += 1) {
      try {
        result =
          kind === "resume" ? await reviewResume(docId) : await reviewCoverLetter(docId);
        break;
      } catch {
        if (i < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 700 * (i + 1)));
        }
      }
    }
    setReview(result);
    setReviewLoading(false);
  }

  // AI Review findings offered as tickable focus points on the improve panel.
  const findings = review ? review.suggestions.map((s) => s.title).filter(Boolean) : [];

  // The one improve experience — same components + same endpoint as the editor.
  // The active version is tracked so a direct self-entry apply can offer an Undo.
  const activeVersionRef = useRef<string | number>("");
  const improve = useStructuredImprove({
    kind,
    docId,
    findings,
    getActiveVersion: () => activeVersionRef.current,
    activateVersion: async (version) => {
      if (kind === "resume") {
        await activateResumeVersion(docId, version);
      } else {
        await activateCoverLetterVersion(docId, version);
      }
      activeVersionRef.current = version;
      setDocRefresh((n) => n + 1);
      void runReview();
    },
    onAccepted: () => {
      setDocRefresh((n) => n + 1);
      void runReview();
    },
  });

  // Track the document's active version so the direct-apply Undo can restore it.
  useEffect(() => {
    let alive = true;
    (kind === "resume" ? getResume(docId) : getCoverLetter(docId))
      .then((doc) => {
        if (alive) activeVersionRef.current = doc.active_version ?? "";
      })
      .catch(() => {
        /* version tracking is best-effort */
      });
    return () => {
      alive = false;
    };
  }, [kind, docId]);

  useEffect(() => {
    const delay = settleDelayForSize(fileSize);
    const timer = setTimeout(() => {
      runReview();
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, kind, fileSize]);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [docId]);

  const detailPath =
    kind === "resume"
      ? `/dashboard/documents/resumes/${docId}`
      : `/dashboard/documents/cover-letters/${docId}`;

  /** Persist an inline edit of the rendered document as a new version. */
  async function handleInlineEdit(editedText: string, meta?: InlineEditMeta) {
    try {
      if (kind === "resume") {
        await createResumeVersion(docId, { text: editedText });
      } else {
        await createCoverLetterVersion(docId, { text: editedText });
      }
      // Keep the edited render in place — no forced reload of the document.
      showToast(
        meta?.rephrase ? "Rephrased the selected text" : "Edited the document",
        "success"
      );
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Could not save the edit.",
        "error"
      );
    }
  }

  const kindLabel = kind === "resume" ? "résumé" : "cover letter";
  const grade = gradeFor(review);

  return (
    <section
      ref={panelRef}
      className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up scroll-mt-20"
    >
      <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-wrap bg-background-50/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent-100 text-accent-700 flex-shrink-0">
            <i className="ri-eye-line"></i>
          </span>
          <div className="min-w-0">
            <h3 className="font-heading text-base font-medium text-foreground-950 truncate">
              {title}
            </h3>
            <span className="block text-xs text-accent-700 font-medium">Quick preview</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground-600 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
          aria-label="Close preview"
        >
          <i className="ri-close-line"></i>
          Close
        </button>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Main area — the rendered document, or the improve result once requested. */}
        <div className="lg:col-span-2 min-w-0 space-y-3">
          {improve.improvement ? (
            <>
              {/* Compact layout switcher — change the improved result's template
                  without leaving the preview. Persists to the same shared memory
                  the full editor's template gallery uses. */}
              <div className="flex items-center justify-between gap-2 flex-wrap rounded-lg border border-background-200 bg-background-50 px-3 py-2 hw-print-hide">
                {improve.styleControl}
                <span className="text-[11px] text-foreground-500 whitespace-nowrap hidden sm:inline">
                  Updates the preview live
                </span>
              </div>
              <StructuredImprovePreview<ImproveDoc>
                renderPaper={improve.renderPaper}
                resolve={improve.resolve}
                toMarkdown={improve.toMarkdown}
                beforeNode={improve.structured}
                changes={improve.changes}
                flags={improve.improvementFlags}
                compare={improve.compare}
                onCompareChange={improve.setCompare}
                applying={improve.applying}
                onAccept={improve.accept}
                onDiscard={improve.discard}
                appliedPrompts={improve.pendingPrompts}
                appliedInstruction={improve.pendingInstruction}
                memoryKey={improve.metricKey}
                currentLabel={kind === "resume" ? "Current version" : "Current letter"}
                reviewKey={revisionReviewKey(kind, docId)}
                ignoredCount={improve.ignoredEchoCount}
              />
            </>
          ) : (
            <>
              <HtmlDocumentViewer
                kind={kind}
                docId={docId}
                title={title}
                resizable={false}
                refreshKey={docRefresh}
                onOpen={() => {
                  // A pending revision opens in the full review view; else the saved doc.
                  if (openRevisionReview(revisionReviewKey(kind, docId))) return;
                  setReadable(true);
                }}
                openHint="Click the page for a full readable view"
                onSaveEditText={handleInlineEdit}
              />
              {kind === "resume" && (
                <DocumentBulletInserter
                  resumeId={docId}
                  refreshKey={docRefresh}
                  disabled={improve.improving}
                  polishing={improve.improving}
                  onChanged={() => setDocRefresh((n) => n + 1)}
                  onPolish={(instruction, content) =>
                    improve.runImprove([], instruction, [], content)
                  }
                />
              )}
            </>
          )}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <h4 className="font-heading text-sm font-medium text-foreground-950">
                AI summary
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                {review?.summary && (
                  <ReadAloudControl
                    id={`inline-${kind}-${docId}`}
                    text={review.summary}
                    label="AI summary"
                    autoRead
                  />
                )}
                {reviewLoading ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500">
                    <i className="ri-loader-4-line animate-spin"></i>
                    Reviewing…
                  </span>
                ) : typeof review?.score === "number" ? (
                  <div className="flex items-center gap-1.5">
                    {grade && <GradeBadge grade={grade} />}
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-900 bg-primary-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                      <i className="ri-dashboard-line"></i>
                      {review.score}/100
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <p className="text-sm text-foreground-700 leading-[1.7] max-w-[68ch]">
              {review?.summary ? (
                <NarrationText id={`inline-${kind}-${docId}`} text={review.summary} />
              ) : reviewLoading ? (
                <span className="text-foreground-500">Generating…</span>
              ) : (
                <span className="text-foreground-500">
                  No summary available for this {kindLabel} yet.
                </span>
              )}
            </p>
          </div>

          {improve.loadError && (
            <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
              <i className="ri-error-warning-line text-base mt-0.5"></i>
              <span>{improve.loadError}</span>
            </div>
          )}

          {/* Where the last accepted AI change landed — shown right after accept. */}
          {improve.landedNotice}

          {/* The single AI-change + add-content panel the editors render — one experience, everywhere. */}
          <AddPointsPanel
            {...improve.incorporateProps}
            addContentHint={
              kind === "cover-letter"
                ? "Write new paragraphs in the letter body itself — open the full editor to edit it directly. The AI only rewrites what's already there."
                : undefined
            }
          />

          <div className="pt-3 border-t border-background-200 flex items-center gap-2 flex-wrap">
            <Link
              to={detailPath}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-edit-line"></i>
              Open full editor
            </Link>
          </div>
        </div>
      </div>

      {/* The wizard + on-paper impact view the shared improve hook renders. */}
      {improve.overlays}

      {readable && (
        <ReadableDocumentModal
          kind={kind}
          docId={docId}
          title={title}
          onClose={() => setReadable(false)}
        />
      )}
    </section>
  );
}