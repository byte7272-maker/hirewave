import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listCoverLetters, listResumes } from "@/lib/documents";
import { documentAttentionReason } from "@/pages/dashboard/documents/components/attentionReason";
import { countEvidenceDrafts } from "@/lib/evidenceDraft";
import PanelHeader from "@/pages/dashboard/components/PanelHeader";
import { Badge, Button, Card } from "@/components/base";

interface DocumentsSummaryProps {
  /** Total résumés (from the dashboard summary). */
  resumeCount: number;
  /** Total cover letters (from the dashboard summary). */
  coverLetterCount: number;
}

interface FlaggedDoc {
  id: string | number;
  kind: "resume" | "letter";
  name: string;
  at?: string;
  /** One-line reason the doc needs attention (from the AI-metric memory). */
  reason: string;
}

type SummaryTab = "overview" | "attention";

function formatDate(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function docHref(doc: FlaggedDoc): string {
  return doc.kind === "resume"
    ? `/dashboard/documents/resumes/${doc.id}`
    : `/dashboard/documents/cover-letters/${doc.id}`;
}

/**
 * Dashboard home widget for documents. Shows the résumé / cover-letter totals
 * plus the user-controlled flag & archive status. A "Needs attention" quick
 * filter tab lets flagged documents be reviewed inline (with a one-line reason
 * for each), without leaving the overview.
 */
export default function DocumentsSummary({
  resumeCount,
  coverLetterCount,
}: DocumentsSummaryProps) {
  const navigate = useNavigate();
  const [flagged, setFlagged] = useState<FlaggedDoc[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<SummaryTab>("overview");
  /** Résumés with a half-finished "My Work Highlights" wizard. */
  const [draftCount, setDraftCount] = useState(0);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      listResumes({ flagged: true }),
      listCoverLetters({ flagged: true }),
      listResumes({ archived: true }),
      listCoverLetters({ archived: true }),
      // Active résumés, so the in-progress count matches the rows actually shown.
      listResumes({ archived: false }),
    ]);
    if (!mountedRef.current) return;
    const [fr, fl, ar, al, activeResumes] = results;
    const flaggedResumes = fr.status === "fulfilled" ? (fr.value ?? []) : [];
    const flaggedLetters = fl.status === "fulfilled" ? (fl.value ?? []) : [];

    const combined: FlaggedDoc[] = [
      ...flaggedResumes.map((r) => ({
        id: r.id,
        kind: "resume" as const,
        name: r.original_filename || r.target_role || r.filename || `Résumé ${r.id}`,
        at: r.updated_at ?? r.created_at,
        reason: documentAttentionReason("resume", r),
      })),
      ...flaggedLetters.map((l) => ({
        id: l.id,
        kind: "letter" as const,
        name: l.original_filename || `Cover letter ${l.id}`,
        at: l.created_at ?? l.generated_at,
        reason: documentAttentionReason("cover-letter", l),
      })),
    ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());

    setFlagged(combined);
    setArchivedCount(
      (ar.status === "fulfilled" ? (ar.value ?? []).length : 0) +
        (al.status === "fulfilled" ? (al.value ?? []).length : 0)
    );
    setDraftCount(
      countEvidenceDrafts(
        (activeResumes.status === "fulfilled" ? (activeResumes.value ?? []) : []).map(
          (r) => r.id
        )
      )
    );
    // Only treat the widget as failed when both flag lookups failed.
    setFailed(fr.status === "rejected" && fl.status === "rejected");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = flagged.slice(0, 3);
  const attentionShown = flagged.slice(0, 8);

  const tabBtn = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
      active ? "bg-background-50 text-foreground-950" : "text-foreground-600 hover:text-foreground-900"
    }`;

  return (
    <Card surface="tinted">
      <PanelHeader
        icon="ri-folder-3-line"
        tone="primary"
        title="Documents"
        subtitle="Résumés & cover letters"
        action={
          <Link
            to="/dashboard/documents"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
          >
            Manage
            <i className="ri-arrow-right-line"></i>
          </Link>
        }
      />

      <div className="px-5 pt-4">
        <div className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1">
          <button
            type="button"
            onClick={() => setTab("overview")}
            aria-pressed={tab === "overview"}
            className={tabBtn(tab === "overview")}
          >
            <i className="ri-dashboard-line"></i>
            Overview
          </button>
          <button
            type="button"
            onClick={() => setTab("attention")}
            aria-pressed={tab === "attention"}
            className={tabBtn(tab === "attention")}
          >
            <i className="ri-flag-line"></i>
            Needs attention
            {flagged.length > 0 && (
              <Badge tone="accent" variant="solid" size="sm" className="ml-0.5">
                {flagged.length}
              </Badge>
            )}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {tab === "attention" ? (
          loading ? (
            <div className="flex items-center gap-2 text-xs text-foreground-500">
              <i className="ri-loader-4-line animate-spin"></i>
              Checking document status…
            </div>
          ) : failed ? (
            <p className="text-xs text-foreground-500">
              Couldn&apos;t check flag status right now.
            </p>
          ) : flagged.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-foreground-600">
              <i className="ri-checkbox-circle-line text-primary-600"></i>
              Nothing needs attention.
            </div>
          ) : (
            <ul className="space-y-0.5">
              {attentionShown.map((d) => (
                <li key={`${d.kind}-${d.id}`}>
                  <Link
                    to={docHref(d)}
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-background-100 cursor-pointer"
                  >
                    <i
                      className={`mt-0.5 flex-shrink-0 text-foreground-500 ${
                        d.kind === "resume" ? "ri-file-text-line" : "ri-mail-send-line"
                      }`}
                    ></i>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-foreground-900 truncate">
                        {d.name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-accent-800">
                        <i className="ri-alert-line flex-shrink-0"></i>
                        <span className="truncate">{d.reason}</span>
                      </span>
                    </span>
                    {d.at && (
                      <span className="ml-auto text-[11px] text-foreground-500 whitespace-nowrap">
                        {formatDate(d.at)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
              {flagged.length > attentionShown.length && (
                <li>
                  <Link
                    to="/dashboard/documents"
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-accent-900 hover:text-accent-700 cursor-pointer"
                  >
                    +{flagged.length - attentionShown.length} more
                    <i className="ri-arrow-right-line"></i>
                  </Link>
                </li>
              )}
            </ul>
          )
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-background-50 border border-background-200 p-3">
                <div className="flex items-center gap-1.5 text-xs text-foreground-500">
                  <i className="ri-file-text-line"></i>
                  Résumés
                </div>
                <div className="mt-1 font-heading text-2xl text-foreground-950">{resumeCount}</div>
              </div>
              <div className="rounded-xl bg-background-50 border border-background-200 p-3">
                <div className="flex items-center gap-1.5 text-xs text-foreground-500">
                  <i className="ri-mail-send-line"></i>
                  Cover letters
                </div>
                <div className="mt-1 font-heading text-2xl text-foreground-950">
                  {coverLetterCount}
                </div>
              </div>
            </div>

            <Button
              variant="accent"
              fullWidth
              icon="ri-sparkling-2-line"
              onClick={() => navigate("/dashboard/experience")}
            >
              My Work Highlights
              {draftCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold leading-none bg-background-50/25">
                  {draftCount}
                </span>
              )}
            </Button>

            {draftCount > 0 && (
              <Link
                to="/dashboard/documents?tab=resumes"
                title={`${draftCount} résumé${draftCount === 1 ? "" : "s"} with a half-finished “My Work Highlights” wizard`}
                className="flex items-center gap-2 rounded-lg bg-accent-100/70 border border-accent-200 px-3 py-2 text-xs font-semibold text-accent-900 hover:bg-accent-100 transition-colors cursor-pointer"
              >
                <span className="w-4 h-4 flex items-center justify-center animate-pulse flex-shrink-0">
                  <i className="ri-loader-4-line"></i>
                </span>
                <span className="truncate">
                  {draftCount} résumé{draftCount === 1 ? "" : "s"} with a wizard in progress
                </span>
                <i className="ri-arrow-right-line ml-auto flex-shrink-0"></i>
              </Link>
            )}

            {loading ? (
              <div className="flex items-center gap-2 text-xs text-foreground-500">
                <i className="ri-loader-4-line animate-spin"></i>
                Checking document status…
              </div>
            ) : failed ? (
              <p className="text-xs text-foreground-500">
                Couldn&apos;t check flag &amp; archive status right now.
              </p>
            ) : flagged.length > 0 ? (
              <div className="rounded-xl bg-accent-100/70 border border-accent-200 p-3">
                <button
                  type="button"
                  onClick={() => setTab("attention")}
                  className="flex items-center gap-2 text-sm font-semibold text-accent-900 hover:text-accent-700 cursor-pointer"
                >
                  <i className="ri-flag-line"></i>
                  {flagged.length} need{flagged.length === 1 ? "s" : ""} attention
                  <i className="ri-arrow-right-line text-xs"></i>
                </button>
                <ul className="mt-2 space-y-1.5">
                  {shown.map((d) => (
                    <li key={`${d.kind}-${d.id}`}>
                      <Link
                        to={docHref(d)}
                        className="flex items-center gap-2 text-xs text-foreground-800 hover:text-accent-900 cursor-pointer"
                      >
                        <i
                          className={`flex-shrink-0 ${
                            d.kind === "resume" ? "ri-file-text-line" : "ri-mail-send-line"
                          }`}
                        ></i>
                        <span className="truncate">{d.name}</span>
                        {d.at && (
                          <span className="ml-auto text-foreground-500 whitespace-nowrap">
                            {formatDate(d.at)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-foreground-600">
                <i className="ri-checkbox-circle-line text-primary-600"></i>
                Nothing needs attention.
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-foreground-600 border-t border-background-200 pt-3">
              <span className="inline-flex items-center gap-1.5">
                <i className="ri-archive-line"></i>
                Archived
              </span>
              <span className="font-semibold text-foreground-900">{archivedCount}</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}