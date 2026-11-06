import { useCallback, useEffect, useRef, useState } from "react";
import {
  SpeechRecognitionCtor,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from "@/lib/speechRecognition";
import {
  FINAL_UTTERANCE_SILENCE_MS,
  MAX_ANSWER_MS,
  MIN_ANSWER_WORDS,
  MIN_SPEAKING_MS,
  NO_SPEECH_TIMEOUT_MS,
  VAD_CALIBRATION_MS,
  VAD_SAMPLE_MS,
  clampTrailingSilence,
  defaultAutoRecordPrefs,
  readAutoRecordPrefs,
  speechThresholdFor,
  writeAutoRecordPrefs,
  type AutoRecordPrefs,
} from "@/lib/autoRecord";

export type AutoRecordStatus =
  | "idle"
  | "requesting"
  | "listening"
  | "paused"
  | "submitting"
  | "blocked"
  | "error";

/** Number of bars kept for the live waveform. */
const BAR_COUNT = 36;
/** Display scaling: RMS ~0.15 fills the meter. */
const LEVEL_SCALE = 7;
/** Recognition restart delay (Chrome stops continuous recognition periodically). */
const RECOGNITION_RESTART_MS = 300;

interface UseAutoRecordArgs {
  /** Called whenever the running transcript changes. */
  onTranscript: (text: string) => void;
  /** Called on auto-stop / manual Done, with the final transcript + duration. */
  onSubmit: (text: string, seconds: number) => Promise<void> | void;
}

export interface UseAutoRecordResult {
  status: AutoRecordStatus;
  /** Mic is open and voice-activity detection is running. */
  listening: boolean;
  /** Listening is temporarily suspended. */
  paused: boolean;
  /** Listening or paused. */
  active: boolean;
  /** Smoothed 0-1 mic level for meters. */
  level: number;
  /** Rolling window of recent levels (oldest → newest). */
  bars: number[];
  /** The running transcript. */
  transcript: string;
  /** Seconds since listening began. */
  elapsed: number;
  /** Trailing-silence countdown (seconds) shown before auto-submit; null otherwise. */
  countdown: number | null;
  /** Non-fatal notice (e.g. "nothing captured — try again"). */
  warning: string;
  /** Fatal-ish error (mic blocked / unavailable). */
  error: string;
  /** Speech recognition is available in this browser. */
  supported: boolean;
  prefs: AutoRecordPrefs;
  setPrefs: (patch: Partial<AutoRecordPrefs>) => void;
  resetPrefs: () => void;
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  /** End now and submit (manual "Done"). */
  finish: () => void;
  /** Discard the current transcript and start over. */
  rerecord: () => void;
  /** Sync an externally-edited transcript (typed edits). */
  setTranscript: (text: string) => void;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

function computeRms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const s = buffer[i];
    sum += s * s;
  }
  return Math.sqrt(sum / buffer.length);
}

const audioContextCtor = (() => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext;
})();

/**
 * Hands-free answer capture.
 *
 * Opens the mic, records audio (MediaRecorder, for optional playback), runs
 * live speech recognition, and a lightweight voice-activity detector off the
 * raw stream (AudioContext → AnalyserNode, RMS every ~100ms). The answer ends
 * on a natural pause once the candidate has actually spoken — with a min-answer
 * guard, a trailing-silence countdown that cancels the moment they speak, and
 * hard caps. Empty / near-empty answers are never submitted.
 */
export function useAutoRecord({
  onTranscript,
  onSubmit,
}: UseAutoRecordArgs): UseAutoRecordResult {
  const [prefs, setPrefsState] = useState<AutoRecordPrefs>(() => readAutoRecordPrefs());
  const [status, setStatusState] = useState<AutoRecordStatus>("idle");
  const [level, setLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const [transcript, setTranscriptState] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  // ---- refs: run lifecycle ----
  const runRef = useRef(0);
  const statusRef = useRef<AutoRecordStatus>("idle");
  const pausedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sampleBufferRef = useRef<Float32Array | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<number | null>(null);

  // ---- refs: transcript ----
  const finalRef = useRef("");
  const interimRef = useRef("");

  // ---- refs: VAD state ----
  const startedAtRef = useRef(0);
  const calibratingRef = useRef(true);
  const calibrateSamplesRef = useRef<number[]>([]);
  const noiseFloorRef = useRef(0.01);
  const silenceMsRef = useRef(0);
  const speakingMsRef = useRef(0);
  const finalUtteranceRef = useRef(false);
  const barsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));

  // ---- refs: callbacks + prefs (kept fresh for async callbacks) ----
  const onTranscriptRef = useRef(onTranscript);
  const onSubmitRef = useRef(onSubmit);
  const prefsRef = useRef(prefs);
  const submitRef = useRef<(auto: boolean) => void>(() => {});
  const abortRef = useRef<(message: string) => void>(() => {});

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);
  useEffect(() => {
    prefsRef.current = prefs;
    writeAutoRecordPrefs(prefs);
  }, [prefs]);

  const setStatus = useCallback((next: AutoRecordStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const emitTranscript = useCallback((text: string) => {
    setTranscriptState(text);
    onTranscriptRef.current(text);
  }, []);

  // ---- resource teardown (never touches `status`) ----

  const stopVadLoop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // Ignore — recognition may already be stopped.
      }
    }
  }, []);

  const teardown = useCallback(() => {
    stopVadLoop();
    stopRecognition();
    const recorder = recorderRef.current;
    if (recorder) {
      recorderRef.current = null;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // Ignore.
      }
    }
    const stream = streamRef.current;
    if (stream) {
      streamRef.current = null;
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore.
        }
      });
    }
    const ctx = audioCtxRef.current;
    if (ctx) {
      audioCtxRef.current = null;
      try {
        void ctx.close();
      } catch {
        // Ignore.
      }
    }
    analyserRef.current = null;
    sampleBufferRef.current = null;
  }, [stopRecognition, stopVadLoop]);

  const resetVadState = useCallback(() => {
    calibratingRef.current = true;
    calibrateSamplesRef.current = [];
    noiseFloorRef.current = 0.01;
    silenceMsRef.current = 0;
    speakingMsRef.current = 0;
    finalUtteranceRef.current = false;
    barsRef.current = new Array(BAR_COUNT).fill(0);
    setBars(barsRef.current.slice());
    setLevel(0);
    setCountdown(null);
    startedAtRef.current = Date.now();
    setElapsed(0);
  }, []);

  const syncTranscript = useCallback(
    (finalText: string, interimText: string) => {
      finalRef.current = finalText;
      interimRef.current = interimText;
      emitTranscript(`${finalText}${interimText}`.replace(/\s+/g, " ").trimStart());
    },
    [emitTranscript]
  );

  const setTranscript = useCallback(
    (text: string) => {
      finalRef.current = text;
      interimRef.current = "";
      setTranscriptState(text);
    },
    []
  );

  // ---- speech recognition ----

  const startRecognition = useCallback(() => {
    if (!SpeechRecognitionCtor) return;
    stopRecognition();
    let recognition: SpeechRecognitionLike;
    try {
      recognition = new SpeechRecognitionCtor();
    } catch {
      return;
    }
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (recognitionRef.current !== recognition) return;
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (res.isFinal) {
          finalRef.current += res[0].transcript;
          // A completed utterance + low level = a stronger end-of-answer signal.
          finalUtteranceRef.current = true;
        } else {
          interimText += res[0].transcript;
        }
      }
      syncTranscript(finalRef.current, interimText);
    };

    recognition.onerror = () => {
      // Recognition errors shouldn't kill the VAD — the answer can still be typed.
    };

    recognition.onend = () => {
      // Chrome ends recognition periodically even with continuous = true.
      if (
        recognitionRef.current === recognition &&
        !pausedRef.current &&
        statusRef.current === "listening"
      ) {
        window.setTimeout(() => {
          if (
            recognitionRef.current === recognition &&
            !pausedRef.current &&
            statusRef.current === "listening"
          ) {
            try {
              recognition.start();
            } catch {
              // Ignore.
            }
          }
        }, RECOGNITION_RESTART_MS);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // Ignore.
    }
  }, [stopRecognition, syncTranscript]);

  // ---- the VAD tick (runs every VAD_SAMPLE_MS while listening) ----

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const buffer = sampleBufferRef.current;
    if (!analyser || !buffer) return;

    analyser.getFloatTimeDomainData(buffer);
    const rms = computeRms(buffer);

    // Ambient-noise calibration window at the start of each answer.
    if (calibratingRef.current) {
      calibrateSamplesRef.current.push(rms);
      if (Date.now() - startedAtRef.current >= VAD_CALIBRATION_MS) {
        const samples = calibrateSamplesRef.current;
        const avg = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
        noiseFloorRef.current = Math.max(avg, 0.0005);
        calibratingRef.current = false;
      }
    }

    const threshold = speechThresholdFor(noiseFloorRef.current, prefsRef.current.sensitivity);
    const isSpeaking = rms > threshold;

    // Level + waveform (display only).
    const scaled = Math.max(0, Math.min(1, rms * LEVEL_SCALE));
    setLevel(scaled);
    barsRef.current.push(scaled);
    if (barsRef.current.length > BAR_COUNT) barsRef.current.shift();
    setBars(barsRef.current.slice());

    if (calibratingRef.current) return;

    if (isSpeaking) {
      silenceMsRef.current = 0;
      speakingMsRef.current += VAD_SAMPLE_MS;
      finalUtteranceRef.current = false;
      setCountdown(null);
    } else {
      silenceMsRef.current += VAD_SAMPLE_MS;
    }

    const elapsedMs = Date.now() - startedAtRef.current;
    setElapsed(Math.max(0, Math.round(elapsedMs / 1000)));

    // Hard cap: max answer length.
    if (elapsedMs >= MAX_ANSWER_MS) {
      submitRef.current(true);
      return;
    }

    const words = wordCount(`${finalRef.current}${interimRef.current}`);
    const enoughSpeech =
      speakingMsRef.current >= MIN_SPEAKING_MS && words >= MIN_ANSWER_WORDS;

    // Not enough yet — never end it prematurely (a mid-sentence breath is fine).
    if (!enoughSpeech) {
      if (silenceMsRef.current >= NO_SPEECH_TIMEOUT_MS) {
        abortRef.current("I didn't catch anything — take your time and try again.");
        return;
      }
      setCountdown(null);
      return;
    }

    // Trailing silence required to end the answer. A completed utterance
    // (falling inflection + silence) ends sooner.
    const required = clampTrailingSilence(prefsRef.current.trailingSilenceMs);
    const need = finalUtteranceRef.current
      ? Math.min(required, FINAL_UTTERANCE_SILENCE_MS)
      : required;
    const remaining = need - silenceMsRef.current;
    if (remaining <= 0) {
      submitRef.current(true);
      return;
    }
    setCountdown(Math.max(1, Math.ceil(remaining / 1000)));
  }, []);

  const startVadLoop = useCallback(() => {
    stopVadLoop();
    timerRef.current = window.setInterval(tick, VAD_SAMPLE_MS);
  }, [stopVadLoop, tick]);

  // ---- submit / abort ----

  const submit = useCallback(
    (auto: boolean) => {
      const text = `${finalRef.current}${interimRef.current}`.replace(/\s+/g, " ").trim();
      if (!text || wordCount(text) < Math.max(1, MIN_ANSWER_WORDS - 6)) {
        if (auto) {
          abortRef.current("Nothing was captured — the answer wasn't submitted. Try again.");
          return;
        }
        setWarning("Nothing captured yet — try again, or type your answer.");
        return;
      }
      const seconds = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
      teardown();
      setCountdown(null);
      setStatus("submitting");
      Promise.resolve(onSubmitRef.current(text, seconds)).catch(() => {
        setStatus("listening");
        setWarning("Couldn't submit — check your connection and try again.");
      });
    },
    [setStatus, teardown]
  );

  const abort = useCallback(
    (message: string) => {
      teardown();
      setCountdown(null);
      setLevel(0);
      setStatus("idle");
      if (message) setWarning(message);
    },
    [setStatus, teardown]
  );

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);
  useEffect(() => {
    abortRef.current = abort;
  }, [abort]);

  // ---- public controls ----

  const start = useCallback(() => {
    if (
      statusRef.current === "listening" ||
      statusRef.current === "paused" ||
      statusRef.current === "requesting"
    ) {
      return;
    }
    if (!SpeechRecognitionCtor || !audioContextCtor) return;

    const runId = ++runRef.current;
    teardown();
    pausedRef.current = false;
    finalRef.current = "";
    interimRef.current = "";
    setTranscriptState("");
    emitTranscript("");
    setWarning("");
    setError("");
    setCountdown(null);
    setStatus("requesting");

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (runId !== runRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        // Record audio too (kept for optional playback / future review).
        try {
          const recorder = new MediaRecorder(stream);
          chunksRef.current = [];
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size) chunksRef.current.push(event.data);
          };
          recorder.start();
          recorderRef.current = recorder;
        } catch {
          recorderRef.current = null;
        }

        // AudioContext → AnalyserNode for RMS-based voice activity.
        const ctx = new audioContextCtor();
        audioCtxRef.current = ctx;
        void ctx.resume?.().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analyserRef.current = analyser;
        sampleBufferRef.current = new Float32Array(analyser.fftSize);

        resetVadState();
        startRecognition();
        setStatus("listening");
        startVadLoop();
      })
      .catch((err: unknown) => {
        if (runId !== runRef.current) return;
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("blocked");
          setError(
            "Microphone access was blocked — answer by typing, or allow the mic and try again."
          );
        } else {
          setStatus("error");
          setError("Couldn't open the microphone on this device.");
        }
      });
  }, [
    emitTranscript,
    resetVadState,
    setStatus,
    startRecognition,
    startVadLoop,
    teardown,
  ]);

  const stop = useCallback(() => {
    runRef.current += 1;
    pausedRef.current = false;
    teardown();
    setCountdown(null);
    setLevel(0);
    setStatus("idle");
  }, [setStatus, teardown]);

  const pause = useCallback(() => {
    if (statusRef.current !== "listening") return;
    pausedRef.current = true;
    stopVadLoop();
    stopRecognition();
    setCountdown(null);
    setStatus("paused");
  }, [setStatus, stopRecognition, stopVadLoop]);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    pausedRef.current = false;
    startedAtRef.current = Date.now() - elapsed * 1000;
    startRecognition();
    setStatus("listening");
    startVadLoop();
  }, [elapsed, setStatus, startRecognition, startVadLoop]);

  const finish = useCallback(() => {
    if (statusRef.current !== "listening" && statusRef.current !== "paused") return;
    submit(false);
  }, [submit]);

  const rerecord = useCallback(() => {
    // Discard the current transcript and start the answer over. The mic is
    // already granted at this point, so an inactive state restarts cleanly.
    finalRef.current = "";
    interimRef.current = "";
    setTranscriptState("");
    emitTranscript("");
    setWarning("");
    if (statusRef.current === "paused") {
      pausedRef.current = false;
      resetVadState();
      startRecognition();
      setStatus("listening");
      startVadLoop();
      return;
    }
    if (statusRef.current === "listening") {
      resetVadState();
      startRecognition();
      startVadLoop();
      return;
    }
    start();
  }, [emitTranscript, resetVadState, start, startRecognition, startVadLoop, setStatus]);

  const setPrefs = useCallback((patch: Partial<AutoRecordPrefs>) => {
    setPrefsState((prev) => {
      const next: AutoRecordPrefs = { ...prev, ...patch };
      if (patch.sensitivity !== undefined) {
        next.sensitivity = Math.min(100, Math.max(0, Math.round(patch.sensitivity)));
      }
      if (patch.trailingSilenceMs !== undefined) {
        next.trailingSilenceMs = clampTrailingSilence(patch.trailingSilenceMs);
      }
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefsState({ ...defaultAutoRecordPrefs });
  }, []);

  // Never leave a hot mic behind: full cleanup on unmount / navigation.
  useEffect(
    () => () => {
      runRef.current += 1;
      pausedRef.current = false;
      stopVadLoop();
      stopRecognition();
      const recorder = recorderRef.current;
      if (recorder) {
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          // Ignore.
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const ctx = audioCtxRef.current;
      if (ctx) {
        try {
          void ctx.close();
        } catch {
          // Ignore.
        }
      }
    },
    [stopRecognition, stopVadLoop]
  );

  return {
    status,
    listening: status === "listening",
    paused: status === "paused",
    active: status === "listening" || status === "paused",
    level,
    bars,
    transcript,
    elapsed,
    countdown,
    warning,
    error,
    supported: Boolean(SpeechRecognitionCtor && audioContextCtor),
    prefs,
    setPrefs,
    resetPrefs,
    start,
    stop,
    pause,
    resume,
    finish,
    rerecord,
    setTranscript,
  };
}