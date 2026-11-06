import { useState } from "react";
import type { VocabularyPace } from "@/lib/interview";
import { formatCountdown } from "@/lib/interviewPractice";
import { paceOf, type PaceBand, type RecapTurn } from "@/lib/practiceRecap";
import {
  fillerChipClass,
  paceMeta,
  scoreRole,
  wordsPerMinuteLabel,
} from "@/pages/dashboard/interview/components/vocabTone";
import RecapToResumeModal from "@/pages/dashboard/interview/components/RecapToResumeModal";

const PACE_LABEL: Record<PaceBand, string> = {
  short: "A bit brief",
  on: "On pace",
  long: "Ran long",
};

const PACE_CLASS: Record<PaceBand, string> = {
  short: "bg-secondary-100 text-secondary-900 border-secondary-200",
  on: "bg-primary-100 text-primary-800 border-primary-200",
  long: "bg-accent-100 text-accent-900 border-accent-200",
};

interface TurnDetailPopoverProps {
  turn: RecapTurn;
  /** 1-based question number within the session. */
  q: number;
  onClose: () => void;
}

function suggestionLine(s: { kind: string; original: string; count?: number; suggestions?: string[] }) {
  if (s.kind === "filler") {
    return (
      <>
        Cut <span className="font-semibold text-foreground-900">&ldquo;{s.original}&rdquo;</span>
        {typeof s.count === "number" && s.count > 1 ? ` (×${s.count})` : ""}
      </>
    );
  }
  if (s.kind === "overused") {
    return (
      <>
        <span className="font-semibold text-foreground-900">&ldquo;{s.original}&rdquo;</span>
        {typeof s.count === "number" ? ` ×${s.count}` : ""} repeated — vary it
      </>
    );
  }
  return (
    <>
      <span className="font-semibold text-foreground-900">&ldquo;{s.original}&rdquo;</span>
      {s.suggestions && s.suggestions.length ? ` → ${s.suggestions.join(", ")}` : ""}
    </>
  );
}

/**
 * A single turn's full detail — the complete spoken answer next to its final
 * vocabulary read — opened by tapping a bar in the recap's trend strip.
 */
export default function TurnDetailPopover({ turn, q, onClose }: TurnDetailPopoverProps) {
  const [resumeOpen, setResumeOpen] = useState(false);
  const band = paceOf(turn);
  const score = typeof turn.vocabScore === "number" ? turn.vocabScore : null;
  const fillers = typeof turn.fillerCount === "number" ? turn.fillerCount : null;
  const role = score !== null ? scoreRole(score) : "secondary";
  const pace = turn.vocabPace as VocabularyPace | undefined;
  const meta = paceMeta(pace);
  const suggestions = turn.vocabSuggestions ?? [];
  const hasVocab =
    score !== null || fillers !== null || Boolean(turn.vocabSummary) || suggestions.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground-950/40 dark:bg-black/55" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-background-50 rounded-2xl border border-background-200 animate-fade-in-up max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-background-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 text-sm font-semibold">
              Q{q}
            </span>
            <div className="min-w-0">
              <h3 className="font-heading text-base font-medium text-foreground-950 leading-snug">
                {turn.question}
              </h3>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${PACE_CLASS[band]}`}
                >
                  {PACE_LABEL[band]}
                </span>
                {turn.category && (
                  <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent-100 text-accent-900 whitespace-nowrap">
                    {turn.category}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
            aria-label="Close"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Pacing */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-background-100 border border-background-200 p-3">
              <div className="text-[11px] text-foreground-500">You</div>
              <div className="mt-0.5 font-heading text-lg font-semibold text-foreground-950">
                {formatCountdown(turn.responseSeconds)}
              </div>
            </div>
            <div className="rounded-xl bg-background-100 border border-background-200 p-3">
              <div className="text-[11px] text-foreground-500">Target</div>
              <div className="mt-0.5 font-heading text-lg font-semibold text-foreground-950">
                {formatCountdown(turn.targetSeconds)}
              </div>
            </div>
            <div className="rounded-xl bg-background-100 border border-background-200 p-3">
              <div className="text-[11px] text-foreground-500">Words</div>
              <div className="mt-0.5 font-heading text-lg font-semibold text-foreground-950">
                {turn.wordCount}
              </div>
            </div>
          </div>

          {/* Full answer */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-600 mb-1.5">
              <i className="ri-chat-3-line text-primary-600"></i>
              Your full answer
            </div>
            {turn.answer && turn.answer.trim() ? (
              <p className="rounded-xl bg-background-100/60 border border-background-200 p-3.5 text-sm text-foreground-900 leading-relaxed whitespace-pre-wrap">
                {turn.answer}
              </p>
            ) : (
              <p className="rounded-xl bg-background-100/60 border border-background-200 p-3.5 text-xs text-foreground-500 italic">
                The full answer wasn&rsquo;t recorded for this session.
              </p>
            )}
          </div>

          {/* Final vocabulary read */}
          {hasVocab && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-600 mb-1.5">
                <i className="ri-sparkling-2-line text-accent-600"></i>
                Final vocabulary read
              </div>
              <div className="rounded-xl bg-background-100/60 border border-background-200 p-3.5 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {score !== null && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{
                        background: `oklch(var(--${role}-100))`,
                        color: `oklch(var(--${role}-800))`,
                      }}
                    >
                      {Math.round(score)}/100
                    </span>
                  )}
                  {pace ? (
                    <span
                      title={wordsPerMinuteLabel(turn.wordsPerMinute)}
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${meta.className}`}
                    >
                      <i className={meta.icon}></i>
                      {meta.label}
                    </span>
                  ) : null}
                  {fillers !== null && (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${fillerChipClass(fillers)}`}
                    >
                      <i className="ri-chat-delete-line"></i>
                      {fillers} filler{fillers === 1 ? "" : "s"}
                    </span>
                  )}
                  {typeof turn.wordsPerMinute === "number" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-foreground-600 whitespace-nowrap">
                      <i className="ri-speed-line"></i>
                      {Math.round(turn.wordsPerMinute)} wpm
                    </span>
                  )}
                </div>

                {suggestions.length > 0 && (
                  <ul className="space-y-1">
                    {suggestions.map((s, i) => (
                      <li
                        key={`${s.kind}-${s.original}-${i}`}
                        className="text-[11px] text-foreground-600 leading-snug flex items-start gap-1.5"
                      >
                        <i className="ri-arrow-right-s-line mt-0.5 flex-shrink-0"></i>
                        <span>{suggestionLine(s)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {turn.vocabSummary && (
                  <p className="text-[11px] text-foreground-500 leading-relaxed">
                    {turn.vocabSummary}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tips */}
          {turn.missedTips.length > 0 && (
            <div className="rounded-lg bg-accent-100/70 border border-accent-200 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-900 mb-1">
                <i className="ri-lightbulb-line"></i>
                Tips you didn&rsquo;t touch on
              </div>
              <ul className="space-y-1">
                {turn.missedTips.map((tip, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-xs text-accent-900 leading-relaxed"
                  >
                    <i className="ri-arrow-right-s-line mt-0.5 flex-shrink-0"></i>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* One-tap: turn just this answer into a résumé bullet */}
          <button
            type="button"
            onClick={() => setResumeOpen(true)}
            disabled={!turn.answer || !turn.answer.trim()}
            title={
              turn.answer && turn.answer.trim()
                ? "Draft a résumé bullet from this answer"
                : "This answer wasn\u2019t recorded, so there\u2019s nothing to draft"
            }
            className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            <i className="ri-file-text-line"></i>
            Recap to r&eacute;sum&eacute; &mdash; this answer
          </button>
        </div>
      </div>

      {resumeOpen && (
        <RecapToResumeModal
          turns={[turn]}
          includeAll
          onClose={() => setResumeOpen(false)}
        />
      )}
    </div>
  );
}