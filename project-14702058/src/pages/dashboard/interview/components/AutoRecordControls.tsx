import { useState } from "react";
import type { AutoRecordPrefs } from "@/lib/autoRecord";
import { formatTrailingSilence } from "@/lib/autoRecord";
import { formatCountdown } from "@/lib/interviewPractice";
import type { AutoRecordStatus } from "@/hooks/useAutoRecord";
import LevelMeter from "@/pages/dashboard/interview/components/LevelMeter";
import TrailingSilenceRing from "@/pages/dashboard/interview/components/TrailingSilenceRing";
import MicPermissionNotice from "@/pages/dashboard/interview/components/MicPermissionNotice";
import type { MicPermissionState } from "@/hooks/useMicPermission";

interface AutoRecordControlsProps {
  status: AutoRecordStatus;
  listening: boolean;
  paused: boolean;
  active: boolean;
  bars: number[];
  elapsed: number;
  countdown: number | null;
  warning: string;
  error: string;
  words: number;
  prefs: AutoRecordPrefs;
  onPrefsChange: (patch: Partial<AutoRecordPrefs>) => void;
  onResetPrefs: () => void;
  onDone: () => void;
  onPause: () => void;
  onResume: () => void;
  onRerecord: () => void;
  onStop: () => void;
  /** Turn hands-free off entirely (fall back to the manual Record button). */
  onDisable: () => void;
  /** Mic-permission state, so we can warn up front if access is needed. */
  micState: MicPermissionState;
  micSupported: boolean;
  micRequesting: boolean;
  onRequestMic: () => void;
}

/**
 * Controls + live state for hands-free answering. The mic opens on its own; this
 * panel gives the manual overrides (Done / Pause / Re-record / Stop) and the
 * persisted sensitivity tuning that coexist with the automatic flow.
 */
export default function AutoRecordControls({
  status,
  listening,
  paused,
  active,
  bars,
  elapsed,
  countdown,
  warning,
  error,
  words,
  prefs,
  onPrefsChange,
  onResetPrefs,
  onDone,
  onPause,
  onResume,
  onRerecord,
  onStop,
  onDisable,
  micState,
  micSupported,
  micRequesting,
  onRequestMic,
}: AutoRecordControlsProps) {
  const [showTuning, setShowTuning] = useState(false);

  const trailingSeconds = Math.max(1, Math.ceil(prefs.trailingSilenceMs / 1000));

  const statusText = (() => {
    switch (status) {
      case "requesting":
        return "Opening the microphone…";
      case "listening":
        return "Listening — answer in your own words";
      case "paused":
        return "Paused";
      case "submitting":
        return "Sending your answer…";
      case "blocked":
        return "Microphone blocked";
      case "error":
        return "Microphone unavailable";
      default:
        return "Waiting…";
    }
  })();

  return (
    <section className="rounded-2xl bg-background-50 border border-background-200 p-4 space-y-4">
      {/* Header + hands-free toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-9 h-9 flex items-center justify-center rounded-lg ${
              listening ? "bg-accent-100 text-accent-700" : "bg-background-100 text-foreground-500"
            }`}
          >
            <i className={`${listening ? "ri-mic-fill animate-mic-pulse" : "ri-mic-line"} text-lg`}></i>
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground-950 inline-flex items-center gap-2">
              Hands-free answer
              {listening && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse"></span>
                  Live
                </span>
              )}
            </h3>
            <p className="text-xs text-foreground-500">{statusText}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDisable}
          title="Turn hands-free off and record manually"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-600 bg-background-100 border border-background-200 hover:bg-background-200 px-3 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-hand-coin-line text-sm"></i>
          Turn off hands-free
        </button>
      </div>

      {/* Notices */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-accent-100 text-accent-900 px-3.5 py-2.5 text-xs">
          <i className="ri-mic-off-line text-base mt-0.5"></i>
          <span>{error}</span>
        </div>
      )}
      <MicPermissionNotice
        state={micState}
        supported={micSupported}
        requesting={micRequesting}
        onEnable={onRequestMic}
      />
      {warning && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-100 text-amber-800 px-3.5 py-2.5 text-xs font-medium">
          <i className="ri-information-line text-base mt-0.5"></i>
          <span>{warning}</span>
        </div>
      )}

      {/* Live meter */}
      {active && (
        <div className="flex items-center gap-4 flex-wrap rounded-xl bg-background-100 border border-background-200 px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-accent-500 animate-pulse"></span>
              Listening…
            </span>
            <LevelMeter bars={bars} active={listening} />
          </div>
          <div className="flex items-center gap-3 text-xs text-foreground-600 ml-auto flex-wrap">
            <span className="whitespace-nowrap tabular-nums">{formatCountdown(elapsed)}</span>
            <span className="whitespace-nowrap">
              {words} {words === 1 ? "word" : "words"}
            </span>
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap"
              title="Aim for ~1–2 minutes."
            >
              <i className="ri-timer-line"></i>
              {formatTrailingSilence(prefs.trailingSilenceMs)} ends it
            </span>
          </div>
          {countdown !== null && (
            <TrailingSilenceRing seconds={countdown} total={trailingSeconds} />
          )}
        </div>
      )}

      {/* Manual overrides — coexist with the automatic flow */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onDone}
          disabled={status === "submitting" || !active}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          <i
            className={status === "submitting" ? "ri-loader-4-line animate-spin" : "ri-check-line"}
          ></i>
          {status === "submitting" ? "Sending…" : "Done"}
        </button>
        {paused ? (
          <button
            type="button"
            onClick={onResume}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200 px-4 py-2.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-play-line"></i>
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={onPause}
            disabled={!listening}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200 px-4 py-2.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            <i className="ri-pause-line"></i>
            Pause
          </button>
        )}
        <button
          type="button"
          onClick={onRerecord}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200 px-4 py-2.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-restart-line"></i>
          Re-record
        </button>
        {(active || status === "submitting") && (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200 px-4 py-2.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-stop-fill"></i>
            Stop
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowTuning((v) => !v)}
          aria-expanded={showTuning}
          className={`ml-auto inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
            showTuning
              ? "bg-secondary-100 text-secondary-900 border-secondary-200"
              : "bg-background-100 text-foreground-600 border-background-200 hover:bg-background-200"
          }`}
        >
          <i className="ri-equalizer-2-line text-sm"></i>
          Sensitivity
          <i
            className={`ri-arrow-down-s-line text-sm transition-transform ${showTuning ? "rotate-180" : ""}`}
          ></i>
        </button>
      </div>

      {/* Persisted tuning */}
      {showTuning && (
        <div className="rounded-xl bg-background-100 border border-background-200 p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label className="font-semibold text-foreground-700" htmlFor="ar-sensitivity">
                Mic sensitivity
              </label>
              <span className="text-foreground-500 tabular-nums">{prefs.sensitivity}</span>
            </div>
            <input
              id="ar-sensitivity"
              type="range"
              min={0}
              max={100}
              step={1}
              value={prefs.sensitivity}
              onChange={(e) => onPrefsChange({ sensitivity: Number(e.target.value) })}
              className="w-full accent-primary-500 cursor-pointer"
            />
            <p className="text-[11px] text-foreground-400 mt-1 leading-relaxed">
              How quiet your voice can be before it still counts as speaking. Raise it in a noisy
              room, lower it if soft speech is being missed.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label className="font-semibold text-foreground-700" htmlFor="ar-trailing">
                End-of-answer pause
              </label>
              <span className="text-foreground-500 tabular-nums">
                {formatTrailingSilence(prefs.trailingSilenceMs)}
              </span>
            </div>
            <input
              id="ar-trailing"
              type="range"
              min={1000}
              max={5000}
              step={250}
              value={prefs.trailingSilenceMs}
              onChange={(e) => onPrefsChange({ trailingSilenceMs: Number(e.target.value) })}
              className="w-full accent-primary-500 cursor-pointer"
            />
            <p className="text-[11px] text-foreground-400 mt-1 leading-relaxed">
              How long you can pause before the answer is sent. A breath mid-answer never cuts you
              off — you only stop when you’ve been quiet this long.
            </p>
          </div>

          <button
            type="button"
            onClick={onResetPrefs}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 hover:text-foreground-800 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-restart-line"></i>
            Reset tuning to defaults
          </button>
        </div>
      )}
    </section>
  );
}