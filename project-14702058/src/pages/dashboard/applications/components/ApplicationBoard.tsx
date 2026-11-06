import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import {
  createApplication,
  deleteApplication,
  submitApplication,
  updateApplicationStatus,
  type Application,
  type ApplicationStatus,
} from "@/lib/applications";
import { APPLICATION_STAGES } from "@/lib/applications";
import { getJob, type Job } from "@/lib/jobs";
import { recordRecentlyViewed } from "@/lib/recentlyViewed";
import { getTailoredResumeByJob, type TailoredResumeInfo } from "@/lib/versionCoverage";
import { toneDot, type Tone } from "@/pages/dashboard/components/tone";
import { useToast } from "@/components/base/ToastProvider";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import CompanyAvatar from "@/components/feature/CompanyAvatar";
import CrossPostingBadge from "@/components/feature/CrossPostingBadge";
import SourceChip from "@/components/feature/SourceChip";
import EmptyState from "@/components/feature/EmptyState";
import PanelHeader from "@/pages/dashboard/components/PanelHeader";
import ResumeActionsMenu from "@/components/feature/ResumeActionsMenu";
import ResumeReadyChip from "@/components/feature/ResumeReadyChip";
import { Button, Card } from "@/components/base";

interface BoardProps {
  applications: Application[];
  onMutate: (updated: Application) => void;
  onDelete: (id: string | number) => void;
  onCreated: (app: Application) => void;
  onAdd?: () => void;
  /** An application id to auto-expand + scroll to (rail "jump back in"). */
  focusAppId?: string | number | null;
  /** Reports which card is currently expanded, so the host can persist it. */
  onExpandedChange?: (id: string | number | null) => void;
}

function sameId(a: string | number | null | undefined, b: string | number | null | undefined) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function timeAgo(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatWhen(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function stageTone(status: string): Tone {
  return APPLICATION_STAGES.find((s) => s.id === status)?.tone ?? "background";
}

function stageLabel(status: string) {
  return APPLICATION_STAGES.find((s) => s.id === status)?.label ?? status;
}

interface TimelineEvent {
  label: string;
  at?: string;
  tone: Tone;
}

/**
 * Build the pipeline timeline. Prefers a backend `status_history` / `history`
 * array when present; otherwise reconstructs it from created/updated + current
 * status so there's always something meaningful to show.
 */
function applicationTimeline(app: Application): TimelineEvent[] {
  const raw = app.status_history ?? app.history;
  if (Array.isArray(raw)) {
    const events = raw
      .map((e): TimelineEvent | null => {
        const obj = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
        const status = String(obj.status ?? obj.to ?? obj.value ?? "").trim();
        if (!status) return null;
        const at =
          typeof obj.at === "string"
            ? obj.at
            : typeof obj.changed_at === "string"
              ? obj.changed_at
              : typeof obj.created_at === "string"
                ? obj.created_at
                : undefined;
        return { label: stageLabel(status), at, tone: stageTone(status) };
      })
      .filter((v): v is TimelineEvent => v !== null);
    if (events.length) return events;
  }

  const events: TimelineEvent[] = [];
  const currentLabel = stageLabel(app.status);
  if (app.created_at) {
    events.push({ label: "Application created", at: app.created_at, tone: stageTone("draft") });
  }
  if (app.updated_at && app.updated_at !== app.created_at) {
    events.push({ label: `Moved to ${currentLabel}`, at: app.updated_at, tone: stageTone(app.status) });
  }
  if (events.length === 0) {
    events.push({ label: currentLabel, tone: stageTone(app.status) });
  }
  return events;
}

function ApplicationCard({
  app,
  expanded,
  onToggle,
  onMutate,
  onDelete,
  onCreated,
  cardRef,
  tailored,
}: {
  app: Application;
  expanded: boolean;
  onToggle: () => void;
  onMutate: (updated: Application) => void;
  onDelete: (id: string | number) => void;
  onCreated: (app: Application) => void;
  cardRef?: Ref<HTMLDivElement>;
  tailored?: TailoredResumeInfo | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fullJob, setFullJob] = useState<Job | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const { showToast } = useToast();

  // Lazily pull the full posting the first time the card is expanded — the
  // embedded job projection is intentionally small, so this is where the real
  // description / type / remote flags come from.
  useEffect(() => {
    if (!expanded || app.job_id == null || fullJob) return;
    let alive = true;
    setJobLoading(true);
    getJob(app.job_id)
      .then((j) => {
        if (alive) setFullJob(j);
      })
      .catch(() => {
        if (alive) setFullJob(null);
      })
      .finally(() => {
        if (alive) setJobLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [expanded, app.job_id, fullJob]);

  async function handleSubmit() {
    setBusy("submit");
    setFeedback("");
    try {
      const updated = await submitApplication(app.id);
      onMutate(updated);
      showToast("Application submitted.");
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : "Could not submit.");
    } finally {
      setBusy(null);
    }
  }

  async function handleMove(status: ApplicationStatus) {
    if (status === app.status) return;
    const previous = app.status;
    setBusy("move");
    setFeedback("");
    try {
      const updated = await updateApplicationStatus(app.id, status);
      onMutate(updated);
      const stage = APPLICATION_STAGES.find((s) => s.id === status);
      showToast(`Moved to ${stage?.label ?? status}.`, "success", {
        label: "Undo",
        onUndo: async () => {
          try {
            const restored = await updateApplicationStatus(app.id, previous);
            onMutate(restored);
          } catch {
            // Undo is best-effort; the change stands if the backend rejects it.
          }
        },
      });
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : "Could not move application.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy("delete");
    setFeedback("");
    try {
      await deleteApplication(app.id);
      onDelete(app.id);
      showToast("Application deleted.", "info", {
        label: "Undo",
        onUndo: async () => {
          try {
            const created = await createApplication({
              title: app.title,
              company: app.company,
              job_id: app.job_id,
            });
            if (app.status !== "draft") {
              const restored = await updateApplicationStatus(created.id, app.status);
              onCreated(restored);
            } else {
              onCreated(created);
            }
          } catch {
            // Restore failed; leave it removed.
          }
        },
      });
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : "Could not delete.");
    } finally {
      setBusy(null);
    }
  }

  const job = app.job ?? null;
  const companyName = job?.company ?? app.company;
  const roleTitle = job?.title ?? app.title;

  /** The role link is a real drill-in — record that as an "open". */
  function handleOpenApplication() {
    if (app.job_id == null) return;
    const stageLabelText =
      APPLICATION_STAGES.find((s) => s.id === app.status)?.label ?? app.status;
    void recordRecentlyViewed({
      kind: "application",
      ref_id: app.id,
      title: roleTitle,
      subtitle: [companyName, stageLabelText].filter(Boolean).join(" · "),
      view: "matches",
      ref_job_id: app.job_id,
    });
  }

  const logo = job?.company_logo;
  const postingUrl = job?.url;
  const salaryDisplay = app.salary_display ?? job?.salary_display ?? "";
  const sourceDisplay = job?.source_display ?? app.source_display ?? "";
  const jobType = fullJob?.type;
  const jobRemote = fullJob?.remote === true;
  const timeline = applicationTimeline(app);

  return (
    <div ref={cardRef} className="scroll-mt-24">
      <Card surface="tinted" clip={false} className="p-3 transition-colors hover:border-background-300">
      <div className="flex items-center gap-2 mb-2">
        <CompanyAvatar company={companyName} logo={logo} size={28} />
        <span className="text-xs font-medium text-foreground-700 truncate">{companyName}</span>
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={busy === "delete"}
          className="ml-auto w-6 h-6 flex items-center justify-center rounded-md text-foreground-400 hover:text-accent-900 hover:bg-accent-100 disabled:opacity-50 cursor-pointer"
          aria-label="Delete application"
        >
          <i className={busy === "delete" ? "ri-loader-4-line animate-spin" : "ri-delete-bin-line"}></i>
        </button>
      </div>

      {app.job_id != null ? (
        <Link
          to={`/dashboard/jobs/${app.job_id}`}
          onClick={handleOpenApplication}
          className="hover:text-primary-700 transition-colors cursor-pointer"
        >
          <span className="text-sm font-semibold text-foreground-950 leading-snug block">
            {roleTitle}
          </span>
        </Link>
      ) : (
        <span className="text-sm font-semibold text-foreground-950 leading-snug block">
          {roleTitle}
        </span>
      )}

      {postingUrl && (
        <a
          href={postingUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-100 text-primary-700 px-3 py-1.5 rounded-full hover:bg-primary-200 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-external-link-line"></i>
          View posting
        </a>
      )}

      {(job?.likely_duplicate || (job?.consolidated_count ?? 0) > 0) && (
        <div className="mt-1.5">
          <CrossPostingBadge
            likely_duplicate={job?.likely_duplicate}
            cross_postings={job?.cross_postings}
            cross_posting_ids={job?.cross_posting_ids}
            consolidated_count={job?.consolidated_count}
            consolidated_sources={job?.consolidated_sources}
          />
        </div>
      )}

      <p className="text-xs text-foreground-500 mt-1">
        {[app.location, salaryDisplay].filter(Boolean).join(" · ") || "No details"}
      </p>
      {sourceDisplay && (
        <div className="mt-1.5">
          <SourceChip platform={job?.source_platform ?? app.source_platform} display={sourceDisplay} />
        </div>
      )}
      <p className="text-[11px] text-foreground-400 mt-1.5 flex items-center gap-1">
        <i className="ri-time-line"></i> {timeAgo(app.updated_at ?? app.created_at) || "—"}
      </p>

      {app.job_id != null && tailored && (
        <div className="mt-2.5">
          <ResumeReadyChip
            docId={tailored.docId}
            version={tailored.version}
            atsScore={tailored.atsScore}
            compact
          />
        </div>
      )}

      {app.job_id != null && (
        <div className="mt-2.5">
          <ResumeActionsMenu
            jobId={app.job_id}
            jobTitle={roleTitle}
            jobCompany={companyName}
            align="left"
          />
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-background-200">
        {app.status === "draft" && (
          <Button size="sm" icon="ri-send-plane-line" loading={busy === "submit"} onClick={handleSubmit}>
            Submit
          </Button>
        )}
        <select
          value={app.status}
          onChange={(e) => handleMove(e.target.value as ApplicationStatus)}
          disabled={busy === "move"}
          className="ml-auto text-xs font-medium bg-background-50 border border-background-200 rounded-md px-2 py-1.5 text-foreground-700 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
        >
          {APPLICATION_STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-600 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
        >
          {expanded ? "Hide" : "Details"}
          <i className={expanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
        </button>
      </div>

      {expanded && (
        <div className="mt-2 rounded-md bg-background-50 border border-background-200 px-3 py-3 space-y-3">
          {(jobType || jobRemote) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {jobType && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-background-200/70 text-foreground-600 whitespace-nowrap">
                  {jobType}
                </span>
              )}
              {jobRemote && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
                  Remote
                </span>
              )}
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-500 mb-1">
              Description
            </p>
            {jobLoading ? (
              <p className="text-xs text-foreground-500 flex items-center gap-1.5">
                <i className="ri-loader-4-line animate-spin"></i>
                Loading posting…
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-foreground-700 whitespace-pre-wrap">
                {fullJob?.description ||
                  "No description on this posting — open the full job for details."}
              </p>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-500 mb-1.5">
              Pipeline
            </p>
            <ol className="space-y-2">
              {timeline.map((e, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className={`mt-1 w-2 h-2 flex-shrink-0 rounded-full ${toneDot[e.tone]}`}
                  ></span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground-800">{e.label}</p>
                    {e.at && (
                      <p className="text-[11px] text-foreground-400">{formatWhen(e.at)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {app.job_id != null && (
            <Link
              to={`/dashboard/jobs/${app.job_id}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-arrow-right-up-line"></i>
              View full posting
            </Link>
          )}
        </div>
      )}

      {feedback && (
        <p className="mt-2 text-[11px] text-accent-900 bg-accent-100 rounded-md px-2 py-1.5">
          {feedback}
        </p>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete application?"
          message={`Remove "${app.title}" from your pipeline? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={async () => {
            await handleDelete();
            setConfirmDelete(false);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      </Card>
    </div>
  );
}

export default function ApplicationBoard({
  applications,
  onMutate,
  onDelete,
  onCreated,
  onAdd,
  focusAppId,
  onExpandedChange,
}: BoardProps) {
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [tailoredByJob, setTailoredByJob] = useState<Record<string, TailoredResumeInfo>>({});
  const focusCardRef = useRef<HTMLDivElement | null>(null);
  const appliedRef = useRef<string | number | null>(null);

  // Resolve which roles already have a tailored résumé version, so prepped roles
  // get the same "Résumé ready · ATS" chip the pipeline rows show.
  useEffect(() => {
    setTailoredByJob(getTailoredResumeByJob());
  }, [applications]);

  // When the rail hands us an application to reopen, expand + scroll to it once
  // the list actually contains it.
  useEffect(() => {
    if (focusAppId == null) {
      appliedRef.current = null;
      return;
    }
    if (appliedRef.current === focusAppId) return;
    if (!applications.some((a) => sameId(a.id, focusAppId))) return;
    appliedRef.current = focusAppId;
    setExpandedId(focusAppId);
    // Let the list paint (and any scroll restore settle) before scrolling in.
    const t = setTimeout(() => {
      focusCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 180);
    return () => clearTimeout(t);
  }, [focusAppId, applications]);

  function handleToggle(app: Application) {
    const next = sameId(expandedId, app.id) ? null : app.id;
    setExpandedId(next);
    onExpandedChange?.(next);
    // Expanding a card is a lighter drill-in on the underlying posting, so it
    // records a "match"-style open (mirrors the job detail page) — but keyed to
    // the application so the rail can bring it back and re-expand it in place.
    if (next != null && app.job_id != null) {
      const job = app.job ?? null;
      void recordRecentlyViewed({
        kind: "match",
        ref_id: app.job_id,
        title: job?.title ?? app.title,
        subtitle: [job?.company ?? app.company, app.location].filter(Boolean).join(" · "),
        view: "applications",
        ref_application_id: app.id,
      });
    }
  }

  if (applications.length === 0) {
    return (
      <Card surface="tinted" className="overflow-hidden">
        <PanelHeader
          icon="ri-layout-column-line"
          tone="accent"
          title="Pipeline board"
          subtitle="Draft → Submitted → Interviewing → Offer"
          count={0}
          countLabel="tracked"
        />
        <EmptyState
          icon="ri-send-plane-line"
          title="Nothing in your pipeline yet"
          description="Add a role you're going after and we'll track it from draft all the way to signed offer."
          tone="accent"
          action={
            onAdd ? (
              <Button icon="ri-add-line" onClick={onAdd}>
                Add a role
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <Card surface="tinted" className="overflow-hidden">
      <PanelHeader
        icon="ri-layout-column-line"
        tone="accent"
        title="Pipeline board"
        subtitle="Draft → Submitted → Interviewing → Offer"
        count={applications.length}
        countLabel="tracked"
      />
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {APPLICATION_STAGES.map((stage) => {
          const cards = applications.filter((a) => a.status === stage.id);
          return (
            <div key={stage.id} className="rounded-xl bg-background-50 border border-background-200">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-background-200">
                <span
                  className={`w-2.5 h-2.5 flex items-center justify-center rounded-full ${toneDot[stage.tone]}`}
                ></span>
                <span className="text-sm font-semibold text-foreground-900">{stage.label}</span>
                <span className="ml-auto text-xs text-foreground-500 font-medium bg-background-100 px-1.5 py-0.5 rounded">
                  {cards.length}
                </span>
              </div>
              <div className="p-2 space-y-2">
                {cards.map((app) => (
                  <ApplicationCard
                    key={app.id}
                    app={app}
                    expanded={sameId(expandedId, app.id)}
                    onToggle={() => handleToggle(app)}
                    cardRef={sameId(focusAppId, app.id) ? focusCardRef : undefined}
                    onMutate={onMutate}
                    onDelete={onDelete}
                    onCreated={onCreated}
                    tailored={
                      app.job_id != null
                        ? tailoredByJob[String(app.job_id)] ?? null
                        : null
                    }
                  />
                ))}
                {cards.length === 0 && (
                  <div className="px-3 py-8 text-center">
                    <div className="w-9 h-9 mx-auto flex items-center justify-center rounded-lg bg-background-100 text-foreground-400 mb-2">
                      <i className="ri-inbox-line"></i>
                    </div>
                    <p className="text-xs text-foreground-500">No roles here</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}