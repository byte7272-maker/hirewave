import { useState } from "react";
import { formatCountdown } from "@/lib/interviewPractice";
import {
  focusSuggestion,
  isStrongAnswer,
  paceOf,
  recapSummary,
  worstTurnIndex,
  type PaceBand,
  type RecapTurn,
} from "@/lib/practiceRecap";
import PacingSparkline from "@/pages/dashboard/interview/components/PacingSparkline";
import VocabTrend from "@/pages/dashboard/interview/components/VocabTrend";
import TurnDetailPopover from "@/pages/dashboard/interview/components/TurnDetailPopover";
import RecapToResumeModal from "@/pages/dashboard/interview/components/RecapToResumeModal";

const PACE_META: Record<PaceBand, { label: string; icon: string; className: string }> = {
  short: {
    label: "A bit brief",
    icon: "ri-timer-flash-line",
    className: "bg-secondary-100 text-secondary-900 border-secondary-200",
  },
  on: {
    label: "On pace",
    icon: "ri-checkbox-circle-line",
    className: "bg-primary-100 text-primary-800 border-primary-200",
  },
  long: {
    label: "Ran long",
    icon: "ri-timer-line",
    className: "bg-accent-100 text-accent-900 border-accent-200",
  },
};

function StatCard({
  icon,
  value,
  label,
  tone = "neutral",
}: {
  icon: string;
  value: string;
  label: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "bg-primary-100 text-primary-700"
      : tone === "warn"
        ? "bg-accent-100 text-accent-700"
        : "bg-secondary-100 text-secondary-700";
  return (
    <div className="rounded-xl bg-background-50 border border-background-200 p-3.5">
      <span className={`w-8 h-8 flex items-center justify-center rounded-lg ${toneClass}`}>
        <i className={`${icon} text-base`}></i>
      </span>
      <div className="mt-2 font-heading text-xl font-semibold text-foreground-950 leading-none">
        {value}
      </div>
      <div className="mt-1 text-xs text-foreground-500">{label}</div>
    </div>
  );
}

/**
 * Post-session practice recap: compares each answer's time against the coach's
 * suggested `answer_seconds`, flags how the pacing trended, and lists the
 * coaching tips the answer didn't seem to touch on.
 */
export default function PracticeRecap({ turns }: { turns: RecapTurn[] }) {
  const [resumeOpen, setResumeOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [worstOpen, setWorstOpen] = useState<number | null>(null);
  const stats = recapSummary(turns);
  if (!stats.total) return null;

  const focus = focusSuggestion(turns);
  const paceTone = stats.on >= Math.ceil(stats.total / 2) ? "good" : "warn";
  const worstIndex = worstTurnIndex(turns);
  const worstTurn = worstIndex >= 0 ? turns[worstIndex] : null;
  const worstScore =
    worstTurn && typeof worstTurn.vocabScore === "number"
      ? Math.round(worstTurn.vocabScore)
      : null;

  /** Scroll to a specific turn below and flash it, so the weak answers are one tap away. */
  function jumpToTurn(q: number) {
    const el = document.getElementById(`recap-turn-${q}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(q);
    window.setTimeout(() => setHighlight((cur) => (cur === q ? null : cur)), 1800);
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700">
            <i className="ri-medal-line text-lg"></i>
          </span>
          <div>
            <h2 className="font-heading text-lg font-medium text-foreground-950">Practice recap</h2>
            <p className="text-xs text-foreground-500">
              How your pacing compared to the coach&rsquo;s suggested time, turn by turn.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {worstTurn && (
            <button
              type="button"
              onClick={() => setWorstOpen(worstIndex)}
              title="Open the lowest-scoring answer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-secondary-100 text-secondary-900 border border-secondary-200 px-3.5 py-2 rounded-md hover:bg-secondary-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-arrow-down-circle-line"></i>
              Worst answer
              <span className="text-[11px] font-medium text-secondary-700">
                Q{worstIndex + 1}
                {worstScore !== null ? ` · ${worstScore}/100` : ""}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setResumeOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-file-text-line"></i>
            Recap to r&eacute;sum&eacute;
          </button>
        </div>
      </div>

      {focus && (
        <div className="rounded-xl bg-primary-100/70 border border-primary-200 p-4 flex items-start gap-3">
          <span className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg bg-primary-500 text-background-50 dark:text-foreground-950">
            <i className={`${focus.icon} text-lg`}></i>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-primary-900">
                Focus next session on&hellip; {focus.title}
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-primary-900/80 leading-relaxed">{focus.reason}</p>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground-700 leading-relaxed">
              <i className="ri-arrow-right-line mt-0.5 flex-shrink-0 text-primary-700"></i>
              <span>
                <span className="font-semibold text-foreground-900">Drill: </span>
                {focus.drill}
              </span>
            </p>
            {focus.turns.length > 0 && (
              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-primary-900 whitespace-nowrap">
                  Jump to:
                </span>
                {focus.turns.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => jumpToTurn(q)}
                    title={`Jump to question ${q}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-background-50 text-primary-800 border border-primary-300 hover:bg-primary-200/70 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-arrow-down-line text-xs"></i>
                    Q{q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <PacingSparkline turns={turns} />

      <VocabTrend turns={turns} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon="ri-speed-up-line"
          value={`${stats.avgResponse}s`}
          label={`Avg answer · target ${stats.avgTarget}s`}
          tone={paceTone}
        />
        <StatCard
          icon="ri-checkbox-circle-line"
          value={`${stats.on}/${stats.total}`}
          label="On pace"
          tone={stats.on >= Math.ceil(stats.total / 2) ? "good" : "neutral"}
        />
        <StatCard
          icon="ri-timer-line"
          value={`${stats.long}`}
          label="Ran long"
          tone={stats.long > 0 ? "warn" : "neutral"}
        />
        <StatCard
          icon="ri-lightbulb-flash-line"
          value={`${stats.missedTips}`}
          label={`Tips not covered · of ${stats.totalTips}`}
          tone={stats.missedTips > 0 ? "warn" : "good"}
        />
      </div>

      <ol className="space-y-3">
        {turns.map((turn, index) => {
          const band = paceOf(turn);
          const meta = PACE_META[band];
          const max = Math.max(turn.responseSeconds, turn.targetSeconds, 1);
          const fillPct = Math.round((turn.responseSeconds / max) * 100);
          const targetPct = Math.round((turn.targetSeconds / max) * 100);
          const fillClass = band === "on" ? "bg-primary-500" : band === "long" ? "bg-accent-500" : "bg-secondary-400";
          return (
            <li
              key={index}
              id={`recap-turn-${index + 1}`}
              className={`rounded-xl bg-background-50 border p-4 space-y-3 transition-colors duration-500 ${
                highlight === index + 1
                  ? "border-primary-400 ring-2 ring-primary-300"
                  : "border-background-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-sm font-medium text-foreground-900 leading-snug flex-1 min-w-[180px]">
                  <span className="text-foreground-400 mr-1.5">Q{index + 1}</span>
                  {turn.question}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {isStrongAnswer(turn) && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-primary-200 bg-primary-100 text-primary-800 whitespace-nowrap">
                      <i className="ri-sparkling-2-line"></i>
                      Strong
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${meta.className}`}
                  >
                    <i className={meta.icon}></i>
                    {meta.label}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[160px] h-2.5 rounded-full bg-background-200 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${fillClass}`} style={{ width: `${fillPct}%` }}></div>
                  <span
                    className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-foreground-700/70"
                    style={{ left: `${targetPct}%` }}
                    aria-hidden="true"
                    title="Suggested time"
                  ></span>
                </div>
                <span className="text-xs text-foreground-600 whitespace-nowrap">
                  You <strong className="text-foreground-900">{formatCountdown(turn.responseSeconds)}</strong>
                  {" · "}target {formatCountdown(turn.targetSeconds)}
                </span>
                <span className="text-xs text-foreground-400 whitespace-nowrap">
                  {turn.wordCount} words
                </span>
              </div>

              {turn.missedTips.length > 0 ? (
                <div className="rounded-lg bg-accent-100/70 border border-accent-200 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-900 mb-1">
                    <i className="ri-lightbulb-line"></i>
                    Tips you didn&rsquo;t touch on
                  </div>
                  <ul className="space-y-1">
                    {turn.missedTips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-accent-900 leading-relaxed">
                        <i className="ri-arrow-right-s-line mt-0.5 flex-shrink-0"></i>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : turn.tips.length > 0 ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-primary-800">
                  <i className="ri-checkbox-circle-line"></i>
                  You covered every coaching tip for this answer.
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      {resumeOpen && (
        <RecapToResumeModal turns={turns} onClose={() => setResumeOpen(false)} />
      )}

      {worstOpen !== null && turns[worstOpen] && (
        <TurnDetailPopover
          turn={turns[worstOpen]}
          q={worstOpen + 1}
          onClose={() => setWorstOpen(null)}
        />
      )}
    </section>
  );
}