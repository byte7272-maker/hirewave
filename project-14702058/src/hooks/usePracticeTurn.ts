import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  fetchCoach,
  textToSpeech,
  type CoachResult,
  type PersonaVoice,
} from "@/lib/interview";
import { splitSentences, toPlainSpeech } from "@/lib/narration";
import {
  SpeechRecognitionCtor,
  speechSupported,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from "@/lib/speechRecognition";
import { DEFAULT_ANSWER_SECONDS, normalizeTips } from "@/lib/interviewPractice";
import { condenseToBullet, findMissedTips, type RecapTurn } from "@/lib/practiceRecap";

export type PracticePhase = "idle" | "reading" | "study" | "answering" | "submitting";

/** Auto-submit after this long without new speech, once enough was captured. */
const SILENCE_AUTO_SUBMIT_MS = 6000;
const SILENCE_MIN_WORDS = 8;

interface UsePracticeTurnArgs {
  /** Practice loop is live (practice mode on AND the voice engine is ready). */
  active: boolean;
  sessionId: string | number;
  question: string;
  completed: boolean;
  voice: PersonaVoice | null;
  /** True when the backend TTS endpoint is available. */
  serverTts: boolean;
  study: boolean;
  autoRead: boolean;
  micAutoStart: boolean;
  onSubmit: (text: string, seconds: number) => Promise<void>;
  onTranscriptChange?: (text: string) => void;
  /** Fired once a turn is submitted, with its pacing + missed tips. */
  onTurnComplete?: (turn: RecapTurn) => void;
}

/**
 * Drives one practice turn: read the question aloud in the persona's voice,
 * fetch coaching, (optionally) read the model answer, then hand the mic to the
 * candidate with a countdown + live transcript, and finally submit.
 */
export function usePracticeTurn({
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
}: UsePracticeTurnArgs) {
  const [phase, setPhase] = useState<PracticePhase>("idle");
  const [coach, setCoach] = useState<CoachResult | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscriptState] = useState("");
  const [remaining, setRemaining] = useState(DEFAULT_ANSWER_SECONDS);
  const [counting, setCounting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [notice, setNotice] = useState("");
  const [modelSentences, setModelSentences] = useState<string[]>([]);
  const [spokenSentenceIndex, setSpokenSentenceIndex] = useState(-1);

  // Live values mirrored into refs so async callbacks never read stale state.
  const runIdRef = useRef(0);
  const transcriptRef = useRef("");
  const remainingRef = useRef(DEFAULT_ANSWER_SECONDS);
  const startedAtRef = useRef(Date.now());
  const submittedRef = useRef(false);
  const skipRef = useRef(false);
  const lastQuestionRef = useRef("");
  const micOnRef = useRef(false);

  const serverTtsRef = useRef(serverTts);
  const voiceRef = useRef(voice);
  const autoReadRef = useRef(autoRead);
  const studyRef = useRef(study);
  const micAutoStartRef = useRef(micAutoStart);
  const phaseRef = useRef<PracticePhase>(phase);
  const onTranscriptRef = useRef(onTranscriptChange);
  const onSubmitRef = useRef(onSubmit);
  const onTurnCompleteRef = useRef(onTurnComplete);
  const coachRef = useRef<CoachResult | null>(null);
  const questionRef = useRef(question);
  const targetSecondsRef = useRef(DEFAULT_ANSWER_SECONDS);
  /** Resolvers for in-flight speech, so stopping resolves instead of hanging. */
  const speakResolversRef = useRef<Array<(ok: boolean) => void>>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const submitRef = useRef<() => void>(() => {});

  useEffect(() => { serverTtsRef.current = serverTts; }, [serverTts]);
  useEffect(() => { voiceRef.current = voice; }, [voice]);
  useEffect(() => { autoReadRef.current = autoRead; }, [autoRead]);
  useEffect(() => { studyRef.current = study; }, [study]);
  useEffect(() => { micAutoStartRef.current = micAutoStart; }, [micAutoStart]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { onTranscriptRef.current = onTranscriptChange; }, [onTranscriptChange]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { onTurnCompleteRef.current = onTurnComplete; }, [onTurnComplete]);
  useEffect(() => { questionRef.current = question; }, [question]);

  const updateTranscript = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscriptState(value);
    onTranscriptRef.current?.(value);
  }, []);

  const stopSpeech = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Ignore — speech synthesis may be unavailable.
    }
    // Resolve any awaited speech so the read loop doesn't hang on stop.
    const pending = speakResolversRef.current;
    speakResolversRef.current = [];
    pending.forEach((fn) => fn(false));
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {
        // Ignore — the element may already be detached.
      }
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const stopMic = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    micOnRef.current = false;
    setMicOn(false);
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // Ignore.
      }
    }
  }, []);

  /** Speak one part via the browser's Web Speech API. Resolves true if completed. */
  const speakBrowserPart = useCallback((text: string, runId: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth || typeof window.SpeechSynthesisUtterance !== "function") {
        resolve(false);
        return;
      }
      let settled = false;
      const box = (ok: boolean) => {
        if (settled) return;
        settled = true;
        const i = speakResolversRef.current.indexOf(box);
        if (i >= 0) speakResolversRef.current.splice(i, 1);
        resolve(ok && runId === runIdRef.current);
      };
      speakResolversRef.current.push(box);
      const utter = new SpeechSynthesisUtterance(text);
      const v = voiceRef.current;
      if (v?.voice_uri) {
        const list = synth.getVoices() ?? [];
        const match =
          list.find((x) => x.voiceURI === v.voice_uri) ?? list.find((x) => x.name === v.voice_uri);
        if (match) utter.voice = match;
      }
      if (v?.lang) utter.lang = v.lang;
      if (typeof v?.rate === "number") utter.rate = v.rate;
      if (typeof v?.pitch === "number") utter.pitch = v.pitch;
      utter.onend = () => box(true);
      utter.onerror = () => box(false);
      try {
        synth.speak(utter);
      } catch {
        box(false);
      }
    });
  }, []);

  /** Speak one part via the server voice, falling back to the device voice. */
  const speakPart = useCallback(
    (text: string, runId: number): Promise<boolean> => {
      return new Promise((resolve) => {
        if (!text.trim()) {
          resolve(true);
          return;
        }
        if (!serverTtsRef.current) {
          resolve(speakBrowserPart(text, runId));
          return;
        }
        const voiceId = voiceRef.current?.voice_id;
        textToSpeech({ text, voice: voiceId || undefined })
          .then((blob) => {
            if (runId !== runIdRef.current) {
              resolve(false);
              return;
            }
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            const audio = new Audio();
            audioRef.current = audio;
            let settled = false;
            const box = (ok: boolean) => {
              if (settled) return;
              settled = true;
              const i = speakResolversRef.current.indexOf(box);
              if (i >= 0) speakResolversRef.current.splice(i, 1);
              audio.onended = null;
              audio.onerror = null;
              if (audioRef.current === audio) audioRef.current = null;
              if (blobUrlRef.current === url) {
                URL.revokeObjectURL(url);
                blobUrlRef.current = null;
              }
              resolve(ok && runId === runIdRef.current);
            };
            speakResolversRef.current.push(box);
            audio.onended = () => box(true);
            audio.onerror = () => box(false);
            audio.src = url;
            audio.play().catch(() => {
              // Autoplay blocked or decode failed — use the device voice.
              const i = speakResolversRef.current.indexOf(box);
              if (i >= 0) speakResolversRef.current.splice(i, 1);
              settled = true;
              resolve(speakBrowserPart(text, runId));
            });
          })
          .catch(() => {
            if (runId !== runIdRef.current) {
              resolve(false);
              return;
            }
            // 501 / any failure — device voice.
            resolve(speakBrowserPart(text, runId));
          });
      });
    },
    [speakBrowserPart]
  );

  const startMic = useCallback(() => {
    if (!SpeechRecognitionCtor || recognitionRef.current) return;
    setNotice("");
    // Never listen to ourselves — cut any interviewer audio first.
    stopSpeech();
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalText = transcriptRef.current;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      updateTranscript(`${finalText}${interimText}`.replace(/\s+/g, " ").trimStart());

      if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = window.setTimeout(() => {
        silenceTimerRef.current = null;
        const words = transcriptRef.current.trim().split(/\s+/).filter(Boolean).length;
        if (words >= SILENCE_MIN_WORDS && phaseRef.current === "answering") {
          submitRef.current();
        }
      }, SILENCE_AUTO_SUBMIT_MS);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setNotice("Allow microphone access to answer aloud — or type instead.");
        micOnRef.current = false;
        setMicOn(false);
        const rec = recognitionRef.current;
        recognitionRef.current = null;
        if (rec) {
          try {
            rec.stop();
          } catch {
            // Ignore.
          }
        }
      }
    };

    recognition.onend = () => {
      // Chrome stops recognition periodically even with continuous=true.
      if (micOnRef.current && recognitionRef.current === recognition) {
        window.setTimeout(() => {
          if (micOnRef.current && recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch {
              // Ignore.
            }
          }
        }, 300);
      } else {
        setMicOn(false);
      }
    };

    recognitionRef.current = recognition;
    micOnRef.current = true;
    setMicOn(true);
    try {
      recognition.start();
    } catch {
      // Ignore.
    }
  }, [stopSpeech, updateTranscript]);

  const setRemainingBoth = useCallback((value: number) => {
    remainingRef.current = value;
    setRemaining(value);
  }, []);

  const beginAnswering = useCallback(
    (c: CoachResult | null) => {
      const secs =
        typeof c?.answer_seconds === "number" && c.answer_seconds > 0
          ? Math.round(c.answer_seconds)
          : DEFAULT_ANSWER_SECONDS;
      setRemainingBoth(secs);
      targetSecondsRef.current = secs;
      startedAtRef.current = Date.now();
      setCounting(true);
      setPhase("answering");
      if (micAutoStartRef.current && speechSupported) startMic();
    },
    [setRemainingBoth, startMic]
  );

  const submit = useCallback(() => {
    if (submittedRef.current) return;
    const text = transcriptRef.current.trim();
    if (!text) {
      setNotice("Nothing captured yet — try again, or type your answer.");
      return;
    }
    submittedRef.current = true;
    stopMic();
    stopSpeech();
    setCounting(false);
    setPhase("submitting");
    const seconds = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
    const tips = normalizeTips(coachRef.current?.tips);
    const coachData = coachRef.current;
    onTurnCompleteRef.current?.({
      question: questionRef.current,
      category: coachData?.category ? String(coachData.category) : undefined,
      targetSeconds: targetSecondsRef.current,
      responseSeconds: seconds,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      tips,
      missedTips: findMissedTips(tips, text),
      bulletDraft: condenseToBullet(text),
      answer: text,
    });
    Promise.resolve(onSubmitRef.current(text, seconds)).catch(() => {
      submittedRef.current = false;
      setPhase("answering");
      setNotice("Couldn't submit — try again.");
    });
  }, [stopMic, stopSpeech]);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // Countdown. `answer_seconds` is a guide — empty answers are never submitted.
  useEffect(() => {
    if (!counting) return undefined;
    const id = window.setInterval(() => {
      remainingRef.current -= 1;
      const next = Math.max(0, remainingRef.current);
      setRemaining(next);
      if (next <= 0) {
        window.clearInterval(id);
        setCounting(false);
        if (transcriptRef.current.trim()) {
          submitRef.current();
        } else {
          setNotice("Time's up — nothing captured. Retry or type your answer.");
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [counting]);

  const runTurn = useCallback(
    async (rawQuestion: string) => {
      const runId = ++runIdRef.current;
      stopMic();
      stopSpeech();
      submittedRef.current = false;
      skipRef.current = false;
      setRemainingBoth(DEFAULT_ANSWER_SECONDS);
      updateTranscript("");
      setRevealed(false);
      setNotice("");
      setCoach(null);
      coachRef.current = null;
      setCoachError("");
      setCoachLoading(true);
      setModelSentences([]);
      setSpokenSentenceIndex(-1);
      setPhase("reading");

      const coachPromise = fetchCoach(sessionId)
        .then((c) => {
          if (runId === runIdRef.current) {
            setCoach(c);
            coachRef.current = c;
            setCoachLoading(false);
          }
          return c;
        })
        .catch((err) => {
          if (runId === runIdRef.current) {
            setCoachError(err instanceof ApiError ? err.message : "Couldn't load coaching.");
            setCoachLoading(false);
          }
          return null;
        });

      const plain = toPlainSpeech(rawQuestion);
      let coachData: CoachResult | null = null;

      if (autoReadRef.current && plain) {
        setSpeaking(true);
        const ok = await speakPart(plain, runId);
        if (runId !== runIdRef.current) return;
        setSpeaking(false);
        if (!ok) {
          if (!skipRef.current) return;
          skipRef.current = false;
        } else {
          coachData = await coachPromise;
          if (runId !== runIdRef.current) return;
          const model = coachData?.model_answer
            ? toPlainSpeech(String(coachData.model_answer))
            : "";
          if (studyRef.current && model) {
            const sentences = splitSentences(model);
            setModelSentences(sentences);
            setPhase("study");
            setSpeaking(true);
            let ok2 = true;
            for (let i = 0; i < sentences.length; i += 1) {
              if (runId !== runIdRef.current) return;
              if (skipRef.current) break;
              setSpokenSentenceIndex(i);
              const done = await speakPart(sentences[i], runId);
              if (runId !== runIdRef.current) return;
              if (!done) {
                ok2 = false;
                break;
              }
            }
            setSpokenSentenceIndex(-1);
            setSpeaking(false);
            if (!ok2 && !skipRef.current) return;
            skipRef.current = false;
          }
        }
      }

      if (runId !== runIdRef.current) return;
      if (!coachData) coachData = await coachPromise;
      if (runId !== runIdRef.current) return;
      beginAnswering(coachData);
    },
    [beginAnswering, sessionId, setRemainingBoth, speakPart, stopMic, stopSpeech, updateTranscript]
  );

  // Start the loop whenever a new question arrives while practice is active.
  useEffect(() => {
    if (!active || completed) return;
    const q = toPlainSpeech(question);
    if (!q) return;
    if (lastQuestionRef.current === question) return;
    lastQuestionRef.current = question;
    void runTurn(question);
  }, [active, completed, question, runTurn]);

  // Tear down whenever practice turns off or the interview completes.
  useEffect(() => {
    if (active && !completed) return;
    runIdRef.current += 1;
    lastQuestionRef.current = "";
    submitRef.current = () => {};
    stopMic();
    stopSpeech();
    setPhase("idle");
    setCounting(false);
    setModelSentences([]);
    setSpokenSentenceIndex(-1);
  }, [active, completed, stopMic, stopSpeech]);

  // Full cleanup on unmount / navigation.
  useEffect(
    () => () => {
      runIdRef.current += 1;
      stopMic();
      stopSpeech();
    },
    [stopMic, stopSpeech]
  );

  const replay = useCallback(async () => {
    const wasMic = micOnRef.current;
    if (wasMic) stopMic();
    const runId = runIdRef.current;
    setSpeaking(true);
    const ok = await speakPart(toPlainSpeech(question), runId);
    if (runId !== runIdRef.current) return;
    setSpeaking(false);
    if (ok && wasMic && micAutoStartRef.current) startMic();
  }, [question, speakPart, startMic, stopMic]);

  const skipModelAnswer = useCallback(() => {
    skipRef.current = true;
    stopSpeech();
  }, [stopSpeech]);

  const reveal = useCallback(() => setRevealed(true), []);

  const moreTime = useCallback(
    (extra = 30) => {
      setRemainingBoth(remainingRef.current + extra);
      setCounting(true);
      setNotice("");
    },
    [setRemainingBoth]
  );

  const done = useCallback(() => submit(), [submit]);

  const toggleMic = useCallback(() => {
    if (micOnRef.current) stopMic();
    else startMic();
  }, [startMic, stopMic]);

  return {
    phase,
    coach,
    coachLoading,
    coachError,
    speaking,
    transcript,
    remaining,
    counting,
    revealed,
    micOn,
    micSupported: speechSupported,
    notice,
    updateTranscript,
    replay,
    skipModelAnswer,
    reveal,
    moreTime,
    done,
    toggleMic,
    setNotice,
    modelSentences,
    spokenSentenceIndex,
  };
}