import { useEffect, useMemo, useRef } from "react";
import { MAX_RATE, MIN_RATE, formatRate, toPlainSpeech } from "@/lib/narration";
import { useNarration } from "./NarrationProvider";

/** Normal playback speed — the value the reset tap returns the lever to. */
const NORMAL_RATE = 1;

/** Quick one-tap speed presets shown under the lever. */
const SPEED_PRESETS: Array<{ value: number; label: string }> = [
  { value: 0.75, label: "0.75\u00d7" },
  { value: 1, label: "1\u00d7" },
  { value: 1.25, label: "1.25\u00d7" },
];

interface ReadAloudControlProps {
  /** Unique id for this summary instance — tracks which one is speaking. */
  id: string;
  /** The summary text (markdown/HTML ok — it's cleaned before speaking). */
  text?: string | null;
  /** Short noun for the tooltip, e.g. "summary". */
  label?: string;
  /** Hide the "Read" word, leaving just the speaker icon. */
  compact?: boolean;
  /**
   * Auto-speak this summary once it (or its text) changes — hands-free.
   * When set, an auto-read on/off icon appears next to the speaker button.
   */
  autoRead?: boolean;
  className?: string;
}

/** Animated equalizer shown while a summary is being read. */
function SpeakingBars() {
  const delays = ["0s", "0.15s", "0.3s", "0.45s"];
  return (
    <span
      className="inline-flex items-end gap-[2px] h-3.5"
      role="status"
      aria-label="Speaking"
    >
      {delays.map((delay, i) => (
        <span
          key={i}
          className="eq-bar w-[2px] h-full rounded-full bg-primary-500"
          style={{ animationDelay: delay }}
        />
      ))}
    </span>
  );
}

/**
 * A small speaker button + voice picker + speed lever shown next to a summary.
 * Reads the summary aloud (neural voice when available, else the device voice),
 * shows an animated indicator while playing, and can auto-read new summaries.
 *
 * The Stop button stays clickable for the whole read — including while the
 * neural audio is still being synthesized — so playback can always be halted.
 */
export default function ReadAloudControl({
  id,
  text,
  label = "summary",
  compact = false,
  autoRead = false,
  className = "",
}: ReadAloudControlProps) {
  const {
    voices,
    voiceId,
    setVoiceId,
    enabled,
    setEnabled,
    autoRead: autoReadOn,
    setAutoRead,
    activeId,
    busyId,
    error,
    rate,
    setRate,
    speak,
    toggle,
    stopIfActive,
    ensureLoaded,
  } = useNarration();

  const plain = useMemo(() => toPlainSpeech(text ?? ""), [text]);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const lastAutoRef = useRef("");

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  // Stop this summary's audio when the control unmounts or leaves the page.
  useEffect(() => () => stopIfActive(id), [id, stopIfActive]);

  // Hands-free: read this summary as soon as its text is available, once per text.
  useEffect(() => {
    if (!autoRead || !autoReadOn || !plain) return;
    if (lastAutoRef.current === plain) return;
    lastAutoRef.current = plain;
    speak(id, plain);
  }, [autoRead, autoReadOn, plain, id, speak]);

  if (!plain) return null;

  const isActive = activeId === id;
  const isBusy = busyId === id;
  const errorMessage = error && error.id === id ? error.message : "";

  function handleToggle() {
    const wasActive = activeRef.current === id;
    toggle(id, plain);
    if (wasActive) setEnabled(false);
    else setEnabled(true);
  }

  return (
    <div className={`inline-flex items-center gap-2 flex-wrap ${className}`}>
      {/*
        The button is only disabled while audio is being prepared and nothing is
        playing yet. Once this summary is the active read it stays enabled, so
        Stop always works — even mid-synthesis.
      */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={isBusy && !isActive}
        aria-pressed={isActive}
        title={
          isActive
            ? "Stop reading"
            : isBusy
              ? "Preparing audio…"
              : `Read ${label} aloud`
        }
        className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-md border px-2.5 py-1 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed ${
          isActive
            ? "bg-accent-500 text-background-50 border-accent-500 hover:bg-accent-600"
            : "bg-background-50 text-foreground-700 border-background-200 hover:bg-background-100"
        }`}
      >
        <i
          className={
            isActive
              ? "ri-stop-circle-line"
              : isBusy
                ? "ri-loader-4-line animate-spin"
                : enabled
                  ? "ri-volume-up-line"
                  : "ri-volume-mute-line"
          }
        ></i>
        {!compact && <span>{isActive ? "Stop" : "Read"}</span>}
      </button>

      {isActive && (
        <span className="inline-flex items-center gap-1.5">
          <SpeakingBars />
          {!compact && (
            <span className="text-[11px] font-medium text-accent-700 whitespace-nowrap">
              Speaking…
            </span>
          )}
        </span>
      )}

      {autoRead && (
        <button
          type="button"
          onClick={() => setAutoRead(!autoReadOn)}
          aria-pressed={autoReadOn}
          aria-label={
            autoReadOn ? "Auto-read new summaries: on" : "Auto-read new summaries: off"
          }
          title={
            autoReadOn
              ? "Auto-read new summaries is on — click to turn off"
              : "Auto-read new summaries when they finish generating"
          }
          className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors cursor-pointer ${
            autoReadOn
              ? "bg-primary-100 text-primary-700 border-primary-200 hover:bg-primary-200"
              : "bg-background-50 text-foreground-400 border-background-200 hover:bg-background-100"
          }`}
        >
          <i className="ri-magic-line text-sm"></i>
        </button>
      )}

      {voices.length > 0 && (
        <div className="inline-flex flex-col gap-1">
          {/* Voice indicator — the icon + picker for the reading voice. */}
          <div className="inline-flex items-center gap-1">
            <span
              className="w-5 h-5 flex items-center justify-center text-foreground-400"
              aria-hidden="true"
            >
              <i className="ri-user-voice-line text-sm"></i>
            </span>
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              aria-label="Voice"
              title="Voice"
              className="h-7 max-w-[150px] rounded-md border border-background-200 bg-background-50 text-xs text-foreground-700 px-2 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.kind ? ` · ${v.kind}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Speaking speed lever — sits directly under the voice indicator. */}
          <div className="inline-flex flex-col gap-1 pl-1">
            <div className="inline-flex items-center gap-1.5">
              <span
                className="w-4 h-4 flex items-center justify-center text-foreground-400"
                aria-hidden="true"
              >
                <i className="ri-speed-line text-xs"></i>
              </span>
              <input
                id={`speaking-speed-${id}`}
                type="range"
                min={MIN_RATE}
                max={MAX_RATE}
                step={0.05}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                aria-label="Speaking speed"
                title={`Speaking speed ${formatRate(rate)}`}
                className="w-24 h-1 accent-primary-500 cursor-pointer"
              />
              {/* Tapping the readout snaps the speed back to normal (1×). */}
              <button
                type="button"
                onClick={() => setRate(NORMAL_RATE)}
                disabled={rate === NORMAL_RATE}
                aria-label="Reset speaking speed to normal"
                title={
                  rate === NORMAL_RATE
                    ? "Normal speed"
                    : "Reset to normal speed (1\u00d7)"
                }
                className={`inline-flex items-center justify-center gap-0.5 min-w-[30px] text-[11px] font-semibold tabular-nums rounded-md px-1.5 py-0.5 border transition-colors whitespace-nowrap ${
                  rate === NORMAL_RATE
                    ? "text-foreground-600 border-transparent cursor-default"
                    : "text-primary-700 bg-primary-100 border-primary-200 hover:bg-primary-200 cursor-pointer"
                }`}
              >
                {formatRate(rate)}
                {rate !== NORMAL_RATE && (
                  <i className="ri-restart-line text-[10px]" aria-hidden="true"></i>
                )}
              </button>
            </div>

            {/* Quick presets — one tap to a common speed. */}
            <div className="inline-flex items-center gap-1 pl-5">
              {SPEED_PRESETS.map((preset) => {
                const active = Math.abs(rate - preset.value) < 0.001;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setRate(preset.value)}
                    aria-pressed={active}
                    title={`Set speed to ${preset.label}${preset.value === NORMAL_RATE ? " (normal)" : ""}`}
                    className={`text-[10px] font-semibold rounded-full border px-1.5 py-0.5 transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? "bg-primary-500 text-background-50 border-primary-500"
                        : "bg-background-50 text-foreground-600 border-background-200 hover:bg-background-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <span className="text-[11px] text-accent-700 whitespace-nowrap">{errorMessage}</span>
      )}
    </div>
  );
}