import { useEffect, useRef, useState } from "react";
import {
  approvalCompany,
  approvalTitle,
  getPreparedMaterials,
  hasPreparedDocuments,
  preparedLabel,
  providerLabel,
  wordCount,
  type ApprovalItem,
  type PreparedMaterial,
  type PreparedMaterials,
} from "@/lib/approvals";
import { Badge, Button, Card } from "@/components/base";
import { fitSpine } from "@/pages/dashboard/components/tone";
import RankBadge from "@/pages/dashboard/components/RankBadge";
import FitDotChip from "@/pages/dashboard/components/FitDotChip";

export type ApprovalNote = { tone: "warning" | "info"; text: string };

interface ApprovalCardProps {
  item: ApprovalItem;
  note?: ApprovalNote;
  busy: boolean;
  busyAction: "approve" | "reject" | null;
  /** 1-based position in the visible queue — carries the ranked-list language. */
  rank?: number;
  /** Fit score cross-referenced from the matches pool (job_posting_id → score). */
  score?: number | null;
  /** True when this card was deep-linked from the dashboard — rings + scrolls in. */
  highlight?: boolean;
  /** True while a batch approve is running — locks every per-card action. */
  disabled?: boolean;
  onRequestApprove: (item: ApprovalItem) => void;
  onReject: (item: ApprovalItem) => void;
}

const NOTE_STYLES: Record<ApprovalNote["tone"], { cls: string; icon: string }> = {
  warning: { cls: "bg-accent-100 text-accent-900", icon: "ri-error-warning-line" },
  info: { cls: "bg-secondary-100 text-secondary-900", icon: "ri-information-line" },
};

/** One prepared document (résumé or cover letter) shown inside the review panel. */
function PreparedDoc({
  icon,
  label,
  doc,
  missingText,
}: {
  icon: string;
  label: string;
  doc?: PreparedMaterial | null;
  missingText: string;
}) {
  const content = doc?.content?.trim();
  const words = wordCount(doc?.content);

  return (
    <div className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-background-200 bg-background-100/70">
        <span className="w-6 h-6 flex items-center justify-center rounded-md bg-primary-100 text-primary-700 flex-shrink-0">
          <i className={`${icon} text-sm`}></i>
        </span>
        <span className="text-xs font-semibold text-foreground-900 truncate">
          {doc?.title?.trim() || label}
        </span>
        {content && words > 0 && (
          <span className="ml-auto text-[11px] text-foreground-500 whitespace-nowrap">
            {words} words
          </span>
        )}
      </div>
      {content ? (
        <p className="px-3.5 py-3 text-xs leading-relaxed text-foreground-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
          {content}
        </p>
      ) : (
        <p className="px-3.5 py-3.5 text-xs text-foreground-500 flex items-center gap-2">
          <i className="ri-information-line text-base flex-shrink-0"></i>
          {missingText}
        </p>
      )}
    </div>
  );
}

/**
 * One parked application. Shows the job, the provider, and a relative prepared
 * time. The user can expand "Review what was prepared" to see the exact résumé +
 * cover letter the assistant used, then approve (confirmed in a dialog up at the
 * page level) or reject (confirmed inline, since nothing was ever sent).
 */
export default function ApprovalCard({
  item,
  note,
  busy,
  busyAction,
  rank,
  score,
  highlight = false,
  disabled = false,
  onRequestApprove,
  onReject,
}: ApprovalCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const spine = fitSpine(score);
  const [confirmReject, setConfirmReject] = useState(false);
  const [showPrepared, setShowPrepared] = useState(false);
  const [materials, setMaterials] = useState<PreparedMaterials | null>(null);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState("");

  const approving = busy && busyAction === "approve";
  const rejecting = busy && busyAction === "reject";
  const applicationId = item.application_id;

  // Bring a deep-linked card into view so the user lands right on it.
  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  // Pull the prepared documents the first time the panel is opened, then cache
  // them for the life of this card.
  useEffect(() => {
    if (!showPrepared || materials || materialsLoading) return;
    let alive = true;
    setMaterialsLoading(true);
    setMaterialsError("");
    getPreparedMaterials(applicationId)
      .then((data) => {
        if (alive) setMaterials(data ?? { resume: null, cover_letter: null });
      })
      .catch((err) => {
        if (alive) {
          setMaterialsError(
            err instanceof Error ? err.message : "Could not load what was prepared.",
          );
        }
      })
      .finally(() => {
        if (alive) setMaterialsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [showPrepared, materials, materialsLoading, applicationId]);

  function retryPrepared() {
    setMaterials(null);
    setMaterialsError("");
  }

  return (
    <div ref={cardRef}>
      <Card
        surface="tinted"
        padded
        spine={spine.color}
        className={`animate-fade-in-up transition-all ${
          highlight ? "border-2 border-primary-400 ring-4 ring-primary-200/60" : ""
        }`}
      >
      <div className="flex items-start gap-3 flex-wrap">
        {typeof rank === "number" && (
          <RankBadge rank={rank} className="mt-1.5" />
        )}
        <span className="w-11 h-11 flex items-center justify-center rounded-xl bg-primary-100 text-primary-700 flex-shrink-0">
          <i className="ri-shield-check-line text-xl"></i>
        </span>

        <div className="flex-1 min-w-[220px]">
          <h3 className="text-sm md:text-base font-semibold text-foreground-950">
            {approvalTitle(item)}
          </h3>
          <p className="text-xs md:text-sm text-foreground-600 mt-0.5">
            {approvalCompany(item)}
          </p>

          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <Badge tone="secondary" icon="ri-briefcase-4-line">
              {providerLabel(item.provider)}
            </Badge>
            <FitDotChip score={score} />
            <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-500 whitespace-nowrap">
              <i className="ri-time-line"></i>
              {preparedLabel(item.created_at)}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowPrepared((v) => !v)}
        aria-expanded={showPrepared}
        className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap transition-colors"
      >
        <i className="ri-file-search-line"></i>
        Review what was prepared
        <i className={showPrepared ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
      </button>

      {showPrepared && (
        <div className="mt-3 rounded-xl bg-background-100/50 border border-background-200 p-3.5 space-y-3">
          <p className="text-[11px] text-foreground-500 flex items-center gap-1.5">
            <i className="ri-information-line"></i>
            This is exactly what the assistant prepared — approving sends it as-is.
          </p>

          {materialsLoading ? (
            <div className="py-6 text-xs text-foreground-500 flex items-center justify-center gap-2">
              <i className="ri-loader-4-line animate-spin"></i>
              Loading what was prepared…
            </div>
          ) : materialsError ? (
            <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-3.5 py-2.5 text-xs">
              <i className="ri-error-warning-line text-base mt-0.5 flex-shrink-0"></i>
              <div className="flex-1">{materialsError}</div>
              <button
                type="button"
                onClick={retryPrepared}
                className="inline-flex items-center gap-1 font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-refresh-line"></i>
                Retry
              </button>
            </div>
          ) : hasPreparedDocuments(materials) ? (
            <div className="space-y-3">
              <PreparedDoc
                icon="ri-file-text-line"
                label="Résumé"
                doc={materials?.resume}
                missingText="No résumé was attached to this application."
              />
              <PreparedDoc
                icon="ri-mail-line"
                label="Cover letter"
                doc={materials?.cover_letter}
                missingText="No cover letter was prepared for this application."
              />
            </div>
          ) : (
            <p className="py-3 text-xs text-foreground-500 flex items-center justify-center gap-2">
              <i className="ri-file-unknow-line text-base"></i>
              No prepared documents are attached to this application yet.
            </p>
          )}
        </div>
      )}

      {note && (
        <div
          className={`mt-3.5 flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-xs md:text-sm ${NOTE_STYLES[note.tone].cls}`}
        >
          <i className={`${NOTE_STYLES[note.tone].icon} text-base mt-0.5 flex-shrink-0`}></i>
          <span className="flex-1">{note.text}</span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2 flex-wrap">
        {confirmReject ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs md:text-sm text-foreground-600 whitespace-nowrap">
              Are you sure? Nothing was sent.
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || disabled}
              onClick={() => setConfirmReject(false)}
            >
              Keep it
            </Button>
            <Button
              variant="accent"
              size="sm"
              icon="ri-close-line"
              loading={rejecting}
              disabled={busy || disabled}
              onClick={() => onReject(item)}
            >
              {rejecting ? "Declining…" : "Confirm decline"}
            </Button>
          </div>
        ) : (
          <>
            <Button
              variant="outline"
              icon="ri-close-line"
              loading={rejecting}
              disabled={busy || disabled}
              onClick={() => setConfirmReject(true)}
            >
              Reject
            </Button>
            <Button
              icon="ri-send-plane-line"
              loading={approving}
              disabled={busy || disabled}
              onClick={() => onRequestApprove(item)}
            >
              {approving ? "Submitting…" : "Approve & submit"}
            </Button>
          </>
        )}
      </div>
      </Card>
    </div>
  );
}