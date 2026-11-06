import { useState } from "react";
import type { InterviewPersona, MockSession } from "@/lib/interview";
import { recapSummary, type PracticeRecapRecord, type RecapStats } from "@/lib/practiceRecap";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import PanelHeader from "@/pages/dashboard/components/PanelHeader";
import RankBadge from "@/pages/dashboard/components/RankBadge";
import { fitSpine, toneBadge, fitTone } from "@/pages/dashboard/components/tone";
import { practiceScore } from "@/lib/practiceScore";
import StrengthSparkline, {
  hasStrengthData,
} from "@/pages/dashboard/interview/components/StrengthSparkline";
import FillerSparkline, {
  hasFillerData,
} from "@/pages/dashboard/interview/components/FillerSparkline";
import HistoryDeltaBadges from "@/pages/dashboard/interview/components/HistoryDeltaBadges";

interface PracticeHistoryProps {
  sessions: MockSession[];
  personas: InterviewPersona[];
  recapRecords: PracticeRecapRecord[];
  loading: boolean;
  error: boolean;
  startingId: string | number | null;
  onRetry: () => void;
  onReopen: (session: MockSession, persona: InterviewPersona) => void;
  onRerun: (persona: InterviewPersona) => void;
  /** Wipe every locally-remembered practice recap. */
  onClearHistory: () => void | Promise<void>;
}

function initials(name?: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Best-effort resolution of a session's persona against the loaded list. */
function resolvePersona(
  session: MockSession,
  personas: InterviewPersona[]
): InterviewPersona | null {
  const embedded = session.persona;
  const rawId =
    (embedded && (embedded.id as string | number | undefined)) ??
    (session.persona_id as string | number | undefined);
  if (rawId !== undefined && rawId !== null && rawId !== "") {
    const match = personas.find((p) => String(p.id) === String(rawId));
    if (match) return match;
  }
  if (embedded && (embedded.name || embedded.role)) return embedded;
  return null;
}

function formatDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Past mock sessions on the interviewers page — each can be reopened (resume or
 * review a completed recap) or re-run as a fresh session with the same persona.
 */
export default function PracticeHistory({
  sessions,
  personas,
  recapRecords,
  loading,
  error,
  startingId,
  onRetry,
  onReopen,
  onRerun,
  onClearHistory,
}: PracticeHistoryProps) {
  const [clearOpen, setClearOpen] = useState(false);

  // Newest-first is the source order: it keeps the "vs last session" trend
  // deltas honest regardless of how the list is finally ranked for display.
  const chronological = [...sessions].sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
  );

  // Aggregate each recap once so rows can diff themselves against an earlier run.
  const statsBySession = new Map<string, RecapStats>();
  for (const s of chronological) {
    const rec = recapRecords.find((r) => r.sessionId === String(s.id));
    if (!rec) continue;
    const st = recapSummary(rec.turns);
    if (st.total > 0) statsBySession.set(String(s.id), st);
  }

  // The trend chip compares a run against the next older run carrying stats.
  const priorBySession = new Map<string, RecapStats | null>();
  chronological.forEach((s, index) => {
    let prior: RecapStats | null = null;
    for (let j = index + 1; j < chronological.length; j += 1) {
      const st = statsBySession.get(String(chronological[j].id));
      if (st) {
        prior = st;
        break;
      }
    }
    priorBySession.set(String(s.id), prior);
  });

  // Ranked view: best composite practice score first. Unscored runs (no recap
  // yet, or in progress) sink to the bottom, newest-first among themselves.
  const ordered = [...chronological].sort((a, b) => {
    const sa = practiceScore(statsBySession.get(String(a.id)) ?? null)?.score ?? null;
    const sb = practiceScore(statsBySession.get(String(b.id)) ?? null)?.score ?? null;
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sb - sa;
  });

  async function handleClear() {
    await onClearHistory();
    setClearOpen(false);
  }

  return (
    <section className="rounded-2xl bg-background-50 border border-background-200 overflow-hidden">
      <PanelHeader
        icon="ri-history-line"
        tone="secondary"
        title="Practice history"
        subtitle="Ranked best-first by practice score — reopen or re-run any session"
        count={sessions.length}
        countLabel="sessions"
        action={
          <>
            {recapRecords.length > 0 && (
              <button
                type="button"
                onClick={() => setClearOpen(true)}
                title="Wipe locally-remembered practice recaps"
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-md bg-background-100 text-foreground-700 border border-background-200 hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-delete-bin-6-line"></i>
                Clear history
              </button>
            )}
            {error && (
              <button
                onClick={onRetry}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <i className={loading ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
                {loading ? "Retrying…" : "Retry history"}
              </button>
            )}
          </>
        }
      />

      <div className="p-5">
      {loading && sessions.length === 0 ? (
        <div className="py-10 text-sm text-foreground-500 flex items-center justify-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading past sessions…
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 px-4 py-10 text-center">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-2xl bg-secondary-100 text-secondary-700">
            <i className="ri-history-line text-xl"></i>
          </div>
          <p className="mt-3 text-sm font-medium text-foreground-900">No past sessions yet</p>
          <p className="mt-1 text-xs text-foreground-500">
            Start an interview above — completed runs show up here with a pacing recap.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {ordered.map((session, rank) => {
            const sid = String(session.id);
            const persona = resolvePersona(session, personas);
            const name = persona?.name ?? "Interviewer";
            const role = persona?.role ?? "";
            const record = recapRecords.find((r) => r.sessionId === sid);
            const candidateTurns =
              session.turns?.filter((t) => t.speaker === "candidate").length ?? 0;
            const isCompleted = String(session.status ?? "") === "completed" || record?.completed;
            const starting = startingId !== null && String(startingId) === String(persona?.id);
            const stats = statsBySession.get(sid) ?? null;
            const priorStats = priorBySession.get(sid) ?? null;
            const practice = practiceScore(stats);
            const scoreNum = practice?.score ?? null;

            return (
              <li
                key={sid}
                className="relative overflow-hidden rounded-2xl bg-background-100/60 border border-background-200 p-4 flex flex-col lg:flex-row lg:items-center gap-4"
              >
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 h-full w-1"
                  style={{ background: fitSpine(scoreNum).color }}
                ></span>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <RankBadge rank={rank + 1} />
                  <div className="w-11 h-11 flex-shrink-0 rounded-xl overflow-hidden bg-primary-100 text-primary-700 flex items-center justify-center font-heading font-semibold">
                    {persona?.avatar_url ? (
                      <img
                        src={persona.avatar_url}
                        alt={name}
                        title={name}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      initials(name)
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground-950 whitespace-nowrap">
                        {name}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          isCompleted
                            ? "bg-primary-100 text-primary-800"
                            : "bg-secondary-100 text-secondary-900"
                        }`}
                      >
                        <i className={isCompleted ? "ri-checkbox-circle-line" : "ri-time-line"}></i>
                        {isCompleted ? "Completed" : "In progress"}
                      </span>
                      {scoreNum != null && practice && (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${toneBadge[fitTone(scoreNum)]}`}
                          title={`${scoreNum}/100 practice score`}
                        >
                          <i className="ri-focus-3-line"></i>
                          {practice.label} · {scoreNum}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-foreground-500 mt-0.5 truncate">
                      {role}
                      {formatDate(session.created_at) ? ` · ${formatDate(session.created_at)}` : ""}
                      {candidateTurns > 0 ? ` · ${candidateTurns} answer${candidateTurns === 1 ? "" : "s"}` : ""}
                    </p>
                    {stats && stats.total > 0 && (
                      <p className="text-[11px] text-foreground-600 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <i className="ri-speed-up-line text-foreground-400"></i>
                          avg {stats.avgResponse}s vs {stats.avgTarget}s target
                        </span>
                        {stats.avgVocab !== null && (
                          <span className="inline-flex items-center gap-1">
                            <i className="ri-sparkling-2-line text-accent-600"></i>
                            avg vocab {stats.avgVocab}/100
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <i className="ri-checkbox-circle-line text-primary-500"></i>
                          {stats.on}/{stats.total} on pace
                        </span>
                        {stats.missedTips > 0 && (
                          <span className="inline-flex items-center gap-1 text-accent-700">
                            <i className="ri-lightbulb-line"></i>
                            {stats.missedTips} tips missed
                          </span>
                        )}
                      </p>
                    )}
                    {stats && stats.total > 0 && (
                      <div className="mt-1.5">
                        <HistoryDeltaBadges current={stats} prior={priorStats} />
                      </div>
                    )}
                    {record && (hasStrengthData(record.turns) || hasFillerData(record.turns)) && (
                      <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                        {hasStrengthData(record.turns) && (
                          <span className="inline-flex items-center gap-1.5">
                            <StrengthSparkline
                              turns={record.turns}
                              onSelect={persona ? () => onReopen(session, persona) : undefined}
                            />
                            <span className="text-[10px] font-medium text-foreground-400 whitespace-nowrap">
                              strength
                            </span>
                          </span>
                        )}
                        {hasFillerData(record.turns) && (
                          <span className="inline-flex items-center gap-1.5">
                            <FillerSparkline
                              turns={record.turns}
                              onSelect={persona ? () => onReopen(session, persona) : undefined}
                            />
                            <span className="text-[10px] font-medium text-foreground-400 whitespace-nowrap">
                              fillers
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => persona && onReopen(session, persona)}
                    disabled={!persona}
                    title={persona ? "Reopen this session" : "Interviewer unavailable"}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200 px-3.5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-folder-open-line"></i>
                    Reopen
                  </button>
                  <button
                    type="button"
                    onClick={() => persona && onRerun(persona)}
                    disabled={!persona || starting}
                    title={persona ? "Start a fresh session with this interviewer" : "Interviewer unavailable"}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                  >
                    <i className={starting ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
                    {starting ? "Starting…" : "Re-run"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>

      {clearOpen && (
        <ConfirmDialog
          title="Clear practice history?"
          message="This wipes every locally-remembered practice recap — pacing stats and missed tips — from this browser. The past sessions themselves aren't deleted."
          confirmLabel="Clear history"
          onConfirm={handleClear}
          onCancel={() => setClearOpen(false)}
        />
      )}
    </section>
  );
}