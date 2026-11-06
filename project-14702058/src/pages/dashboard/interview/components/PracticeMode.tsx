import { useCallback, useMemo } from "react";
import { usePracticeTurn } from "@/hooks/usePracticeTurn";
import { useMicPermission } from "@/hooks/useMicPermission";
import type { PersonaVoice } from "@/lib/interview";
import { normalizeTips, ANSWER_MAX_LENGTH, DEFAULT_ANSWER_SECONDS } from "@/lib/interviewPractice";
import { splitSentences, toPlainSpeech } from "@/lib/narration";
import type { RecapTurn } from "@/lib/practiceRecap";
import { KaraokeSentences } from "@/components/feature/NarrationText";
import { useLiveVocabulary, replacePhraseOnce } from "@/lib/liveVocabulary";
import LiveVocabularyFeedback from "@/pages/dashboard/interview/components/LiveVocabularyFeedback";
import CountdownRing from "@/pages/dashboard/interview/components/CountdownRing";
import MicPermissionNotice from "@/pages/dashboard/interview/components/MicPermissionNotice";

interface PracticeModeProps {
  /** Practice mode is on. */
  enabled: boolean;
  /** The persona's voice engine has finished loading. */
  ready: boolean;
  sessionId: string | number;
  question: string;
  completed: boolean;
  voice: PersonaVoice | null;
  serverTts: boolean;
  study: boolean;
  onStudyChange: (value: boolean) => void;
  autoRead: boolean;
  onAutoReadChange: (value: boolean) => void;
  micAutoStart: boolean;
  onMicAutoStartChange: (value: boolean) => void;
  /** Live vocabulary coaching panel while answering. */
  liveVocab: boolean;
  onLiveVocabChange: (value: boolean) => void;
  submitting: boolean;
  onSubmit: (text: string, seconds: number) => Promise<void>;
  onTranscriptChange: (text: string) => void;
  onTurnComplete?: (turn: RecapTurn) => void;
}

function TogglePill({
  on,
  onClick,
  icon,
  children,
  title,
}: {
  on: boolean;
  onClick: () => void;
  icon: string;
  children: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
        on
          ? "bg-secondary-100 text-secondary-900 border-secondary-200 hover:bg-secondary-200"
          : "bg-background-100 text-foreground-500 border-background-200 hover:bg-background-200"
      }`}
    >
      <i className={`${icon} text-sm`}></i>
      {children}
    </button>
  );
}

/**
 * Practice mode: runs the read → coach → answer → submit loop for each
 * interviewer turn, with Study/Test sub-modes and answer pacing controls.
 */
export default function PracticeMode({
  enabled,
  ready,
  sessionId,
  question,
  completed,
  voice,
  serverTts,
  study,
  onStudyChange,
  autoRead,
  onAutoReadChange,
  micAutoStart,
  onMicAutoStartChange,
  liveVocab,
  onLiveVocabChange,
  submitting,
  onSubmit,
  onTranscriptChange,
  onTurnComplete,
}: PracticeModeProps) {
  const active = enabled && ready;
  const {
    phase,
    coach,
    coachLoading,
    coachError,
    speaking,
    transcript,
    remaining,
    revealed,
    micOn,
    micSupported,
    notice,
    updateTranscript,
    replay,
    skipModelAnswer,
    reveal,
    moreTime,
    done,
    toggleMic,
    modelSentences: spokenSentences,
    spokenSentenceIndex,
  } = usePracticeTurn({
    active,
    sessionId,
    question,
    completed,
    voice,
    serverTts,
    study,
    autoRead,
    micAutoStart,
    onSubmit,
    onTranscriptChange,
    onTurnComplete,
  });

  const tips = normalizeTips(coach?.tips);
  // Live microphone permission — warn up-front when access is required.
  const micPerm = useMicPermission();
  // Live, advisory vocabulary coaching while the candidate is answering.
  const live = useLiveVocabulary({ active: liveVocab && phase === "answering", text: transcript });

  /** Tap-to-swap a weak phrase straight into the live transcript. */
  const swapWeakWord = useCallback(
    (original: string, replacement: string) => {
      const next = replacePhraseOnce(transcript, original, replacement);
      if (next !== transcript) updateTranscript(next);
    },
    [transcript, updateTranscript]
  );
  const total =
    typeof coach?.answer_seconds === "number" && coach.answer_seconds > 0
      ? Math.round(coach.answer_seconds)
      : DEFAULT_ANSWER_SECONDS;
  const modelVisible = study || revealed;
  const modelAnswer = coach?.model_answer ? String(coach.model_answer) : "";
  const modelSentences = useMemo(() => {
    if (!modelAnswer) return [];
    if (spokenSentences.length) return spokenSentences;
    return splitSentences(toPlainSpeech(modelAnswer));
  }, [modelAnswer, spokenSentences]);
  const activeModelIndex = phase === "study" && speaking ? spokenSentenceIndex : -1;
  const busy = phase === "submitting" || submitting;

  const statusText =
    phase === "reading"
      ? "Reading the question…"
      : phase === "study"
        ? "Reading the model answer…"
        : phase === "submitting" || submitting
          ? "Sending your answer…"
          : phase === "answering"
            ? micOn
              ? "Listening — answer in your own words"
              : "Your turn to answer"
            : "Preparing…";

  if (!ready) {
    return (
      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-6">
        <div className="flex items-center gap-2.5 text-sm text-foreground-600">
          <i className="ri-loader-4-line animate-spin"></i>
          Preparing the practice voice…
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Practice settings */}
      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700">
              <i className="ri-sparkling-2-line"></i>
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground-950">Practice mode</h3>
              <p className="text-xs text-foreground-500">{statusText}</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-background-50 border border-background-200">
            <button
              type="button"
              onClick={() => onStudyChange(false)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                !study
                  ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                  : "text-foreground-600 hover:text-foreground-900"
              }`}
            >
              Test
            </button>
            <button
              type="button"
              onClick={() => onStudyChange(true)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                study
                  ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                  : "text-foreground-600 hover:text-foreground-900"
              }`}
            >
              Study
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <TogglePill
            on={autoRead}
            onClick={() => onAutoReadChange(!autoRead)}
            icon="ri-volume-up-line"
            title="Read the question (and model answer) aloud automatically"
          >
            Auto-read
          </TogglePill>
          <TogglePill
            on={micAutoStart}
            onClick={() => onMicAutoStartChange(!micAutoStart)}
            icon="ri-mic-line"
            title="Open the mic automatically once reading finishes"
          >
            Mic auto-start
          </TogglePill>
          <TogglePill
            on={liveVocab}
            onClick={() => onLiveVocabChange(!liveVocab)}
            icon="ri-sparkling-2-line"
            title="Show live vocabulary tips while you answer"
          >
            Live vocab
          </TogglePill>
          <span className="inline-flex items-center gap-1 text-xs text-foreground-500 whitespace-nowrap">
            <i className={serverTts ? "ri-cloud-line" : "ri-computer-line"}></i>
            {serverTts ? "Neural voice" : "Device voice"}
          </span>
        </div>
      </section>

      {/* Question + reading */}
      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-6 space-y-4">
        <div className="rounded-xl bg-background-50 border border-background-200 p-4 min-h-[80px]">
          {question ? (
            <p className="text-base text-foreground-900 leading-relaxed font-medium">
              &ldquo;{question}&rdquo;
            </p>
          ) : busy ? (
            <div className="flex items-center gap-2 text-sm text-foreground-500 italic">
              <i className="ri-loader-4-line animate-spin"></i>
              Waiting for the interviewer…
            </div>
          ) : (
            <p className="text-sm text-foreground-500 italic">Preparing your next question…</p>
          )}
        </div>

        {speaking && (
          <div className="flex items-center gap-2 text-xs font-semibold text-primary-700">
            <span className="inline-flex items-end gap-[2px] h-3.5" aria-hidden="true">
              {["0s", "0.15s", "0.3s", "0.45s"].map((delay, i) => (
                <span
                  key={i}
                  className="eq-bar w-[2px] h-full rounded-full bg-primary-500"
                  style={{ animationDelay: delay }}
                />
              ))}
            </span>
            {phase === "study" ? "Reading the model answer…" : "Speaking…"}
          </div>
        )}

        {notice && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-100 text-amber-800 px-3.5 py-2 text-xs font-medium">
            <i className="ri-information-line"></i>
            <span>{notice}</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void replay()}
            disabled={phase === "reading" || phase === "study" || busy}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200 px-4 py-2.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            <i className="ri-restart-line"></i>
            Replay question
          </button>
          {phase === "study" && (
            <button
              type="button"
              onClick={skipModelAnswer}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200 px-4 py-2.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-skip-forward-line"></i>
              Skip model answer
            </button>
          )}
        </div>
      </section>

      {/* Coach — tips + model answer */}
      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground-950 inline-flex items-center gap-2">
            <i className="ri-lightbulb-flash-line text-primary-600"></i>
            Coaching
          </h3>
          <div className="flex items-center gap-2">
            {coach?.category && (
              <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent-100 text-accent-900 whitespace-nowrap">
                {String(coach.category)}
              </span>
            )}
            {coachLoading && (
              <span className="inline-flex items-center gap-1 text-xs text-foreground-500">
                <i className="ri-loader-4-line animate-spin"></i>
                Loading…
              </span>
            )}
          </div>
        </div>

        {coachError && (
          <div className="flex items-start gap-2 rounded-lg bg-accent-100 text-accent-900 px-3.5 py-2.5 text-xs">
            <i className="ri-error-warning-line text-base mt-0.5"></i>
            <span>{coachError}</span>
          </div>
        )}

        {tips.length > 0 && (
          <ul className="space-y-1.5">
            {tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground-700 leading-relaxed">
                <i className="ri-checkbox-circle-line text-primary-500 mt-0.5 flex-shrink-0"></i>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Model answer: visible in Study, reveal-on-demand in Test */}
        {modelAnswer ? (
          modelVisible ? (
            <div className="rounded-xl bg-primary-100 border border-primary-200 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-900 mb-2">
                <i className="ri-book-open-line"></i>
                Model answer
              </div>
              <p className="text-sm text-primary-900 leading-relaxed">
                <KaraokeSentences sentences={modelSentences} activeIndex={activeModelIndex} />
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={reveal}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-secondary-100 text-secondary-900 border border-secondary-200 hover:bg-secondary-200 px-4 py-2.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-eye-line"></i>
              Reveal model answer
            </button>
          )
        ) : null}
      </section>

      {/* Answer capture */}
      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-6 space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <CountdownRing remaining={Math.max(0, remaining)} total={total} />
          <div className="flex-1 min-w-[160px] space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {micOn ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  ● Recording
                </span>
              ) : (
                <span className="text-xs font-medium text-foreground-500 whitespace-nowrap">
                  Suggested ≈ {total}s
                </span>
              )}
              <span className="text-xs text-foreground-500 whitespace-nowrap">
                {transcript.trim() ? transcript.trim().split(/\s+/).filter(Boolean).length : 0} words
              </span>
            </div>
            <p className="text-xs text-foreground-500 leading-relaxed">
              The timer is a guide, not a cutoff — take the time you need. Nothing is sent until
              you&rsquo;re ready.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <div className="space-y-4">
            {micSupported ? (
              <button
                type="button"
                onClick={toggleMic}
                disabled={busy}
                className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap ${
                  micOn
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200"
                }`}
              >
                <i className={micOn ? "ri-stop-fill" : "ri-mic-line"}></i>
                {micOn ? "Stop listening" : "Start listening"}
              </button>
            ) : (
              <p className="text-xs text-foreground-500">
                Speech recognition isn&rsquo;t available in this browser — type your answer below.
              </p>
            )}

            {micSupported && (
              <MicPermissionNotice
                state={micPerm.state}
                supported={micPerm.supported}
                requesting={micPerm.requesting}
                onEnable={() => {
                  void micPerm.request();
                }}
              />
            )}

            <textarea
              value={transcript}
              onChange={(e) => updateTranscript(e.target.value)}
              maxLength={ANSWER_MAX_LENGTH}
              rows={4}
              disabled={busy}
              placeholder="Your answer appears here as you speak — you can also type or edit it."
              className="w-full px-3 py-2.5 rounded-lg bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none disabled:opacity-70"
            ></textarea>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => done()}
                disabled={busy || !transcript.trim()}
                className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <i className={busy ? "ri-loader-4-line animate-spin" : "ri-send-plane-line"}></i>
                {busy ? "Sending…" : "Done"}
              </button>
              <button
                type="button"
                onClick={() => moreTime(30)}
                disabled={busy}
                className="inline-flex items-center gap-2 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200 px-4 py-2.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line"></i>
                More time (+30s)
              </button>
            </div>
            </div>

          {liveVocab && phase === "answering" && (
            <LiveVocabularyFeedback
              transcript={transcript}
              result={live.result}
              analyzing={live.analyzing}
              onSwap={swapWeakWord}
            />
          )}
        </div>
      </section>
    </div>
  );
}