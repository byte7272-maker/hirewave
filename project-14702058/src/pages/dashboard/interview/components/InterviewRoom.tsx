import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  analyzeVocabulary,
  getMediaCapabilities,
  getPersonaVoice,
  replyMock,
  textToSpeech,
  type InterviewPersona,
  type MockSession,
  type MockSummary,
  type PersonaVoice,
  type VocabularyResult,
} from "@/lib/interview";
import { difficultyLabel, difficultyStyle } from "@/pages/dashboard/interview/components/difficulty";
import VocabularyCoach from "@/pages/dashboard/interview/components/VocabularyCoach";
import AnswerVocabulary from "@/pages/dashboard/interview/components/AnswerVocabulary";
import PracticeMode from "@/pages/dashboard/interview/components/PracticeMode";
import PracticeRecap from "@/pages/dashboard/interview/components/PracticeRecap";
import MicPermissionNotice from "@/pages/dashboard/interview/components/MicPermissionNotice";
import AutoRecordControls from "@/pages/dashboard/interview/components/AutoRecordControls";
import { useMicPermission } from "@/hooks/useMicPermission";
import { useAutoRecord } from "@/hooks/useAutoRecord";
import {
  readPracticePrefs,
  writePracticePrefs,
  type PracticePrefs,
} from "@/lib/interviewPractice";
import {
  getPracticeRecord,
  savePracticeRecord,
  type RecapTurn,
} from "@/lib/practiceRecap";

interface Exchange {
  question: string;
  answer: string;
  feedback?: string;
  response_seconds?: number | null;
  /** Final vocabulary read for this answer (practice mode only). */
  vocabulary?: VocabularyResult | null;
}

// Minimal typings for the Web Speech API (not present in all TS lib configs).
interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionLike;
}

const windowRecord =
  typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : undefined;

const SpeechRecognitionCtor = (
  windowRecord?.SpeechRecognition ?? windowRecord?.webkitSpeechRecognition
) as SpeechRecognitionConstructorLike | undefined;

const speechSupported = Boolean(SpeechRecognitionCtor);

const ANSWER_MAX_LENGTH = 2000;

function initials(name?: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function firstQuestion(session: MockSession): string {
  // Preferred: the last interviewer turn from the response.
  const turns = session.turns ?? [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.speaker === "interviewer") {
      const q = (t.question ?? t.follow_up ?? "") as string;
      if (q.trim()) return q;
    }
  }
  // Fallback: the first planned question.
  const plan = session.plan;
  if (Array.isArray(plan) && plan.length) {
    const first = plan[0];
    if (typeof first === "string" && first.trim()) return first;
    if (first && typeof first === "object") {
      const q = ((first as { question?: unknown }).question ??
        (first as { text?: unknown }).text ??
        (first as { follow_up?: unknown }).follow_up) as string;
      if (typeof q === "string" && q.trim()) return q;
    }
  }
  // Last resort: a top-level question field.
  if (typeof session.question === "string" && session.question.trim()) {
    return session.question;
  }
  return "";
}

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return `${minutes}m ${rem}s`;
}

function paceStyle(seconds: number): string {
  if (seconds < 15 || seconds > 150) return "text-amber-600";
  if (seconds >= 30 && seconds <= 90) return "text-green-600";
  return "text-foreground-500";
}

function extractSummaryText(summary: MockSummary | string | null | undefined): string {
  if (!summary) return "";
  if (typeof summary === "string") return summary;
  if (typeof summary.text === "string") return summary.text;
  if (typeof summary.summary === "string") return summary.summary;
  return "";
}

export default function InterviewRoom({
  session,
  persona,
  onExit,
}: {
  session: MockSession;
  persona: InterviewPersona;
  onExit: () => void;
}) {
  const [status, setStatus] = useState<string>((session.status ?? "") as string);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string>(() => firstQuestion(session));
  const [feedback, setFeedback] = useState("");
  const [summary, setSummary] = useState<string>(() => extractSummaryText(session.summary));
  const [summaryObj, setSummaryObj] = useState<MockSummary | null>(() => {
    const s = session.summary;
    return s && typeof s === "object" ? (s as MockSummary) : null;
  });
  const [answer, setAnswer] = useState("");
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState("");

  // Speech-to-text state.
  const [recording, setRecording] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState("");
  const [privacyShown, setPrivacyShown] = useState(false);
  const [fillerCount, setFillerCount] = useState<number | null>(null);
  const [limitToast, setLimitToast] = useState(false);

  // Refs so recognition callbacks always see fresh values (avoid stale closures).
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordingRef = useRef(false);
  const listeningRef = useRef(false);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const questionShownAtRef = useRef(Date.now());
  const limitToastTimerRef = useRef<number | null>(null);
  /** Question we've already auto-started the mic for (guards per-turn). */
  const autoStartedForRef = useRef("");
  /** Whether the interviewer's read-aloud actually played for this question. */
  const spokeForQuestionRef = useRef(false);
  /** Up-front mic permission has been requested once. */
  const micAskedRef = useRef(false);

  // Text-to-speech state & refs.
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voiceReady, setVoiceReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const ttsEnabledRef = useRef(true);
  const ttsAvailableRef = useRef(false);
  const personaVoiceRef = useRef<PersonaVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [personaVoice, setPersonaVoice] = useState<PersonaVoice | null>(null);

  // Practice mode preferences (persisted).
  const [prefs, setPrefs] = useState<PracticePrefs>(() => readPracticePrefs());
  const practiceOn = prefs.on;

  // Live microphone permission — drives the "permission required" notice so we
  // warn before the user tries to record, not only after it fails.
  const micPerm = useMicPermission();

  // Hands-free answering: opens the mic once the question is read, ends the
  // answer on a natural pause, and submits — no Start/Stop clicks required.
  const auto = useAutoRecord({
    onTranscript: handleTextChange,
    onSubmit: (text, seconds) => handleReply(text, seconds),
  });
  const autoRecordOn = auto.prefs.enabled;
  // Hands-free only when the browser can actually do live capture; otherwise we
  // fall back to the manual Record button.
  const handsFree = autoRecordOn && auto.supported;

  // Per-turn practice recap — seeded from a previously saved run (so a reopened
  // completed session still shows its recap), then extended as turns finish.
  const [recapTurns, setRecapTurns] = useState<RecapTurn[]>(() =>
    getPracticeRecord(String(session.id))?.turns ?? []
  );
  const recapStartedAtRef = useRef(new Date().toISOString());

  const completed = status === "completed";

  // Persist practice preferences.
  useEffect(() => {
    writePracticePrefs(prefs);
  }, [prefs]);

  // Persist the recap as turns complete, so history carries pacing + missed tips.
  useEffect(() => {
    if (recapTurns.length === 0) return;
    savePracticeRecord({
      sessionId: String(session.id),
      personaId: String(persona.id),
      personaName: persona.name,
      personaRole: persona.role,
      startedAt: recapStartedAtRef.current,
      updatedAt: new Date().toISOString(),
      completed,
      turns: recapTurns,
    });
  }, [recapTurns, completed, session.id, persona.id, persona.name, persona.role]);

  function handleTurnComplete(turn: RecapTurn) {
    setRecapTurns((prev) => [...prev, turn]);
  }

  function updatePrefs(patch: Partial<PracticePrefs>) {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }

  function togglePractice() {
    setPrefs((prev) => ({ ...prev, on: !prev.on }));
    if (!practiceOn) stopSpeech();
  }

  // Reset the response timer whenever a new question is shown.
  useEffect(() => {
    questionShownAtRef.current = Date.now();
    spokeForQuestionRef.current = false;
  }, [currentQuestion]);

  // Remember whether the interviewer actually spoke for this question, so we
  // only auto-open the mic once the read-aloud finishes (or straight away when
  // the voice is off).
  useEffect(() => {
    if (speaking) spokeForQuestionRef.current = true;
  }, [speaking]);

  // Ask for microphone access once, up front — before the first question.
  useEffect(() => {
    if (!autoRecordOn || micAskedRef.current || !speechSupported || practiceOn) return;
    micAskedRef.current = true;
    void micPerm.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRecordOn, practiceOn]);

  // Auto-start listening once the question has been read (or immediately if the
  // interviewer voice is off) — one attempt per question, then the loop repeats.
  useEffect(() => {
    if (practiceOn || completed || replying) return;
    if (!autoRecordOn || !auto.supported) return;
    if (!voiceReady || !currentQuestion) return;
    if (speaking) return;
    if (ttsEnabled && !spokeForQuestionRef.current) return;
    if (autoStartedForRef.current === currentQuestion) return;
    autoStartedForRef.current = currentQuestion;
    auto.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    practiceOn,
    completed,
    replying,
    autoRecordOn,
    auto.supported,
    auto.start,
    voiceReady,
    currentQuestion,
    speaking,
    ttsEnabled,
  ]);

  // Reveal the privacy note the moment hands-free capture begins.
  useEffect(() => {
    if (auto.active) setPrivacyShown(true);
  }, [auto.active]);

  // Never leave a hot mic behind: release it when hands-free is turned off or
  // the interview finishes.
  useEffect(() => {
    if (!auto.active) return;
    if (!autoRecordOn || completed) auto.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRecordOn, completed, auto.active]);

  // Stop recognition cleanly if the room unmounts mid-recording.
  useEffect(() => {
    return () => {
      stopSpeech();
      recordingRef.current = false;
      listeningRef.current = false;
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
      if (limitToastTimerRef.current !== null) {
        window.clearTimeout(limitToastTimerRef.current);
        limitToastTimerRef.current = null;
      }
    };
  }, []);

  function stopSpeech() {
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute("src");
        audio.load();
      } catch {
        // ignore
      }
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setSpeaking(false);
  }

  function speakWithSynthesis(text: string) {
    if (!("speechSynthesis" in window)) {
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const v = personaVoiceRef.current;
    if (v?.voice_uri) {
      const voices = window.speechSynthesis.getVoices();
      const match =
        voices.find((vv) => vv.voiceURI === v.voice_uri) ??
        voices.find((vv) => vv.name === v.voice_uri);
      if (match) utterance.voice = match;
    }
    if (v?.lang) utterance.lang = v.lang;
    if (typeof v?.rate === "number") utterance.rate = v.rate;
    if (typeof v?.pitch === "number") utterance.pitch = v.pitch;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  async function speak(text: string) {
    if (!text || !ttsEnabledRef.current) return;
    stopSpeech();
    setSpeaking(true);
    try {
      if (ttsAvailableRef.current) {
        const voice = personaVoiceRef.current?.voice_id;
        const blob = await textToSpeech({ text, voice: voice || undefined });
        if (!ttsEnabledRef.current) {
          setSpeaking(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        const audio = audioRef.current;
        if (!audio) {
          setSpeaking(false);
          return;
        }
        audio.onended = () => setSpeaking(false);
        audio.src = url;
        await audio.play().catch(() => setSpeaking(false));
      } else {
        speakWithSynthesis(text);
      }
    } catch {
      // Server TTS unavailable — fall back to the browser's synthesis.
      speakWithSynthesis(text);
    }
  }

  function toggleTts() {
    const next = !ttsEnabled;
    ttsEnabledRef.current = next;
    setTtsEnabled(next);
    if (!next) {
      stopSpeech();
    } else if (currentQuestion && !completed && !practiceOn) {
      speak(currentQuestion);
    }
  }

  // Load TTS capabilities and the persona's effective voice once, then unlock speaking.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getMediaCapabilities().catch(() => null),
      getPersonaVoice(persona.id).catch(() => null),
    ]).then(([cap, voice]) => {
      if (cancelled) return;
      ttsAvailableRef.current = Boolean(cap?.tts);
      setTtsAvailable(Boolean(cap?.tts));
      personaVoiceRef.current = (voice as PersonaVoice | null) ?? null;
      setPersonaVoice((voice as PersonaVoice | null) ?? null);
      setVoiceReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [persona.id]);

  // Speak the latest interviewer turn (greeting, question, or follow-up).
  useEffect(() => {
    if (!practiceOn && voiceReady && currentQuestion && !completed) {
      speak(currentQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceReady, currentQuestion, practiceOn]);

  function showLimitToast() {
    setLimitToast(true);
    if (limitToastTimerRef.current !== null) {
      window.clearTimeout(limitToastTimerRef.current);
    }
    limitToastTimerRef.current = window.setTimeout(() => {
      setLimitToast(false);
      limitToastTimerRef.current = null;
    }, 2200);
  }

  function stopRecognition() {
    recordingRef.current = false;
    setRecording(false);
    listeningRef.current = false;
    setListening(false);
    // Fold any pending interim text into the final base so it isn't lost.
    finalRef.current = finalRef.current + interimRef.current;
    interimRef.current = "";
    setInterim("");
    setAnswer(finalRef.current);
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
  }

  function startRecognition() {
    if (!SpeechRecognitionCtor) return;
    setMicError("");
    // Stop any interviewer speech so it doesn't overlap the recording.
    stopSpeech();
    // Keep any text already typed/edited as the base.
    finalRef.current = answer;
    interimRef.current = "";
    setInterim("");

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onaudiostart = () => {
      listeningRef.current = true;
      setListening(true);
    };
    recognition.onspeechstart = () => {
      listeningRef.current = true;
      setListening(true);
    };
    recognition.onspeechend = () => {
      listeningRef.current = false;
      setListening(false);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalRef.current += res[0].transcript;
        } else {
          interimText += res[0].transcript;
        }
      }

      const combined = finalRef.current + interimText;
      // Auto-stop once the answer reaches the textarea limit so speech isn't
      // silently truncated mid-thought.
      if (combined.length >= ANSWER_MAX_LENGTH) {
        finalRef.current = combined.slice(0, ANSWER_MAX_LENGTH);
        interimRef.current = "";
        setInterim("");
        setAnswer(finalRef.current);
        stopRecognition();
        showLimitToast();
        return;
      }

      interimRef.current = interimText;
      setInterim(interimText);
      setAnswer(finalRef.current + interimText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicError("Allow microphone access to record");
        recordingRef.current = false;
        setRecording(false);
        listeningRef.current = false;
        setListening(false);
        finalRef.current = finalRef.current + interimRef.current;
        interimRef.current = "";
        setInterim("");
        setAnswer(finalRef.current);
      }
      // "no-speech" (and anything else): keep listening.
    };

    recognition.onend = () => {
      listeningRef.current = false;
      setListening(false);
      if (recordingRef.current) {
        // Chrome stops recognition periodically even with continuous=true.
        window.setTimeout(() => {
          if (recordingRef.current) {
            try {
              recognition.start();
            } catch {
              // ignore
            }
          }
        }, 300);
      } else {
        setRecording(false);
      }
    };

    recognitionRef.current = recognition;
    recordingRef.current = true;
    setRecording(true);
    try {
      recognition.start();
    } catch {
      // ignore
    }
  }

  function toggleRecording() {
    if (recording) {
      stopRecognition();
    } else {
      setPrivacyShown(true);
      startRecognition();
    }
  }

  function handleTextChange(value: string) {
    finalRef.current = value;
    interimRef.current = "";
    setInterim("");
    setAnswer(value);
    if (value.length >= ANSWER_MAX_LENGTH) {
      showLimitToast();
    }
  }

  /** Textarea edits: keep the visible answer and the live capture in sync. */
  function handleAnswerChange(value: string) {
    handleTextChange(value);
    auto.setTranscript(value);
  }

  function applyReplacement(original: string, replacement: string) {
    const prev = answer;
    const idx = prev.toLowerCase().indexOf(original.toLowerCase());
    if (idx === -1) return;
    const next = prev.slice(0, idx) + replacement + prev.slice(idx + original.length);
    finalRef.current = next;
    interimRef.current = "";
    setInterim("");
    setAnswer(next);
  }

  function usePolished(text: string) {
    // Stop recording first so live transcription can't overwrite the polish.
    stopRecognition();
    finalRef.current = text;
    interimRef.current = "";
    setInterim("");
    setAnswer(text);
  }

  function handleCoachResult(result: VocabularyResult | null) {
    setFillerCount(
      result && typeof result.filler_count === "number" ? result.filler_count : null,
    );
  }

  async function handleReply(overrideText?: string, overrideSeconds?: number) {
    const text = (overrideText ?? answer).trim();
    if (!text || completed) return;
    setReplying(true);
    setError("");
    stopRecognition();
    // Release the mic on submit — never leave hands-free capture running.
    auto.stop();
    const responseSeconds =
      typeof overrideSeconds === "number"
        ? Math.max(0, Math.round(overrideSeconds))
        : Math.max(0, Math.round((Date.now() - questionShownAtRef.current) / 1000));
    // Practice mode keeps a final vocabulary read of the whole answer, taken in
    // parallel with the reply so it never slows the turn down.
    const vocabPromise: Promise<VocabularyResult | null> = practiceOn
      ? analyzeVocabulary({ text, elapsed_seconds: responseSeconds }).catch(() => null)
      : Promise.resolve(null);
    try {
      const result = await replyMock(session.id, {
        answer: text,
        response_seconds: responseSeconds,
      });
      const finalVocab = await vocabPromise;

      // Attach the answer's final vocabulary read to its recap turn, so the
      // post-session trend reflects the whole answer (not just a live sample).
      if (finalVocab) {
        setRecapTurns((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastTurn = next[next.length - 1];
          next[next.length - 1] = {
            ...lastTurn,
            answer: lastTurn.answer ?? text,
            vocabScore:
              typeof finalVocab.score === "number" ? finalVocab.score : lastTurn.vocabScore,
            fillerCount:
              typeof finalVocab.filler_count === "number"
                ? finalVocab.filler_count
                : lastTurn.fillerCount,
            vocabPace: finalVocab.pace || lastTurn.vocabPace,
            wordsPerMinute:
              typeof finalVocab.words_per_minute === "number"
                ? finalVocab.words_per_minute
                : lastTurn.wordsPerMinute,
            vocabSummary: finalVocab.summary || lastTurn.vocabSummary,
            vocabSuggestions: (finalVocab.suggestions ?? []).slice(0, 4).map((s) => ({
              original: s.original,
              kind: s.kind,
              count: s.count,
              suggestions: (s.suggestions ?? []).slice(0, 4),
            })),
          };
          return next;
        });
      }

      const newTurns = result.turns ?? [];

      // Per-answer pacing: read the candidate turn's response_seconds.
      let returnedSeconds: number | null = null;
      for (let i = newTurns.length - 1; i >= 0; i--) {
        const t = newTurns[i];
        if (t.speaker === "candidate") {
          returnedSeconds = typeof t.response_seconds === "number" ? t.response_seconds : null;
          break;
        }
      }

      // Feedback: prefer an explicit feedback string on a returned turn.
      let fb = (result.feedback ?? "") as string;
      for (const t of newTurns) {
        const f = (t.feedback ?? "") as string;
        if (f.trim()) {
          fb = f;
          break;
        }
      }

      // Next question: the last interviewer turn in the returned turns.
      let nextQ = "";
      for (let i = newTurns.length - 1; i >= 0; i--) {
        const t = newTurns[i];
        if (t.speaker === "interviewer") {
          nextQ = (t.question ?? t.follow_up ?? "") as string;
          if (nextQ.trim()) break;
        }
      }
      if (!nextQ.trim()) {
        nextQ = (result.follow_up ?? result.question ?? "") as string;
      }

      const newStatus = (result.status ?? status) as string;
      const newSummary = result.summary;

      // The summary object is only populated once the interview completes.
      if (newSummary && typeof newSummary === "object") {
        setSummaryObj(newSummary as MockSummary);
        const text = extractSummaryText(newSummary);
        if (text) setSummary(text);
      } else if (typeof newSummary === "string") {
        setSummary(newSummary);
      }

      setExchanges((prev) => [
        ...prev,
        {
          question: currentQuestion,
          answer: text,
          feedback: fb,
          response_seconds: returnedSeconds,
          vocabulary: finalVocab,
        },
      ]);
      setFeedback(fb);
      setCurrentQuestion(nextQ);
      setStatus(newStatus);
      setAnswer("");
      finalRef.current = "";
      interimRef.current = "";
      setInterim("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your answer.");
    } finally {
      setReplying(false);
    }
  }

  const wordCount = answer.trim() ? answer.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <audio ref={audioRef} className="hidden" />
      <div className="relative overflow-hidden rounded-2xl border border-foreground-950/10 animate-fade-in-up">
        <img
          src="https://readdy.ai/api/search-image?query=Warm%20editorial%20photograph%20of%20a%20calm%20modern%20one-to-one%20interview%20setting%20at%20a%20sunlit%20desk%20with%20a%20laptop%20and%20notebook%2C%20focused%20professional%20mood%2C%20warm%20neutral%20cream%20tones%20with%20muted%20emerald%20and%20coral%20colour%20accents%2C%20soft%20natural%20window%20light%2C%20shallow%20depth%20of%20field%2C%20premium%20editorial%20magazine%20aesthetic%2C%20darker%20left%20side%20for%20overlay%20text%2C%20high%20detail&width=1600&height=420&seq=room-interview-01&orientation=landscape"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground-950/92 via-foreground-950/72 to-foreground-950/40"></div>
        <div className="relative flex items-center justify-between gap-3 flex-wrap p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-background-50/25 bg-background-50/15 backdrop-blur-sm text-background-50 flex items-center justify-center font-heading font-semibold text-lg flex-shrink-0">
              {persona.avatar_url ? (
                <img
                  src={persona.avatar_url}
                  alt={persona.name}
                  title={`${persona.name} — ${persona.role}`}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                initials(persona.name)
              )}
            </div>
            <div>
              <h1 className="font-heading text-xl md:text-2xl font-medium text-background-50">
                {persona.name}
              </h1>
              <p className="text-sm text-background-100/85 mt-0.5">
                {persona.role}
                {persona.company ? ` · ${persona.company}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${difficultyStyle(persona.difficulty)}`}
            >
              {difficultyLabel(persona.difficulty)}
            </span>
            <button
              onClick={togglePractice}
              aria-pressed={practiceOn}
              title={practiceOn ? "Turn practice mode off" : "Turn practice mode on"}
              className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                practiceOn
                  ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500 hover:bg-primary-600"
                  : "bg-background-50/10 text-background-50 border-background-50/25 hover:bg-background-50/20 backdrop-blur-sm"
              }`}
            >
              <i className={practiceOn ? "ri-sparkling-2-fill" : "ri-sparkling-2-line"}></i>
              Practice
            </button>
            <button
              onClick={toggleTts}
              title={ttsEnabled ? "Turn interviewer voice off" : "Turn interviewer voice on"}
              aria-label={ttsEnabled ? "Mute interviewer voice" : "Unmute interviewer voice"}
              className="inline-flex items-center justify-center w-9 h-9 text-sm font-semibold bg-background-50/10 text-background-50 border border-background-50/25 rounded-md hover:bg-background-50/20 backdrop-blur-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className={ttsEnabled ? "ri-volume-up-line text-base" : "ri-volume-mute-line text-base"}></i>
            </button>
            <button
              onClick={onExit}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-background-50/10 text-background-50 border border-background-50/25 px-4 py-2 rounded-md hover:bg-background-50/20 backdrop-blur-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-stop-fill"></i>
              End interview
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <span>{error}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {completed ? (
            <>
            <section className="rounded-2xl bg-background-100/60 border border-background-200 p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-green-100 text-green-700">
                  <i className="ri-checkbox-circle-fill text-lg"></i>
                </span>
                <h2 className="font-heading text-lg font-medium text-foreground-950">
                  Interview complete
                </h2>
              </div>
              <p className="text-sm text-foreground-700 leading-relaxed whitespace-pre-wrap">
                {summary || "This interview has ended. Thank you for practicing!"}
              </p>
              {summaryObj && typeof summaryObj.avg_response_seconds === "number" && (
                <p className="mt-3 text-sm font-medium text-foreground-900">
                  Average answer time: {formatDuration(summaryObj.avg_response_seconds)}
                </p>
              )}
              <button
                onClick={onExit}
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-arrow-left-line"></i>
                Back to interviewers
              </button>
            </section>
            {recapTurns.length > 0 && <PracticeRecap turns={recapTurns} />}
            </>
          ) : practiceOn ? (
            <PracticeMode
              enabled={practiceOn}
              ready={voiceReady}
              sessionId={session.id}
              question={currentQuestion}
              completed={completed}
              voice={personaVoice}
              serverTts={ttsAvailable}
              study={prefs.study}
              onStudyChange={(v) => updatePrefs({ study: v })}
              autoRead={prefs.autoRead}
              onAutoReadChange={(v) => updatePrefs({ autoRead: v })}
              micAutoStart={prefs.micAutoStart}
              onMicAutoStartChange={(v) => updatePrefs({ micAutoStart: v })}
              liveVocab={prefs.liveVocab}
              onLiveVocabChange={(v) => updatePrefs({ liveVocab: v })}
              submitting={replying}
              onSubmit={(text, seconds) => handleReply(text, seconds)}
              onTurnComplete={handleTurnComplete}
            />
          ) : (
            <section className="rounded-2xl bg-background-100/60 border border-background-200 p-6 space-y-4">
              <div className="rounded-xl bg-background-50 border border-background-200 p-4 min-h-[80px]">
                {currentQuestion ? (
                  <p className="text-base text-foreground-900 leading-relaxed font-medium">
                    &ldquo;{currentQuestion}&rdquo;
                  </p>
                ) : replying ? (
                  <div className="flex items-center gap-2 text-sm text-foreground-500 italic">
                    <i className="ri-loader-4-line animate-spin"></i>
                    Waiting for the interviewer…
                  </div>
                ) : (
                  <p className="text-sm text-foreground-500 italic">Preparing your next question…</p>
                )}
              </div>

              {speaking && (
                <div className="flex items-center gap-1.5 text-xs text-foreground-500">
                  <i className="ri-volume-up-line"></i>
                  <span>Speaking…</span>
                </div>
              )}

              {feedback && (
                <div className="rounded-xl bg-secondary-100 border border-secondary-200 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-secondary-900 mb-1">
                    <i className="ri-feedback-line"></i>
                    Feedback
                  </div>
                  <p className="text-sm text-secondary-900 leading-relaxed">{feedback}</p>
                </div>
              )}

              <div className="space-y-3">
                {privacyShown && (
                  <div className="flex items-start gap-2.5 rounded-lg bg-background-50 border border-background-200 px-3.5 py-2.5 text-xs text-foreground-600">
                    <i className="ri-information-line text-base mt-0.5 text-foreground-400"></i>
                    <span className="flex-1 leading-relaxed">
                      Speech recognition runs in your browser; in some browsers (Chrome) audio is
                      processed by the browser&rsquo;s speech service to transcribe it. Nothing is
                      stored — only the text you choose to submit.
                    </span>
                    <button
                      onClick={() => setPrivacyShown(false)}
                      className="text-foreground-400 hover:text-foreground-600 cursor-pointer whitespace-nowrap"
                      aria-label="Dismiss privacy note"
                    >
                      <i className="ri-close-line"></i>
                    </button>
                  </div>
                )}

                {!handsFree && speechSupported && (
                  <button
                    type="button"
                    onClick={() => auto.setPrefs({ enabled: true })}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-secondary-100 text-secondary-900 border border-secondary-200 hover:bg-secondary-200 px-3 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-mic-line text-sm"></i>
                    Enable hands-free answering
                  </button>
                )}

                {handsFree ? (
                  <>
                    {limitToast && (
                      <div className="flex items-center gap-2 rounded-lg bg-amber-100 text-amber-800 px-3.5 py-2 text-xs font-medium toast-fade">
                        <i className="ri-information-line"></i>
                        <span>Character limit reached</span>
                      </div>
                    )}

                    <textarea
                      value={answer}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      maxLength={ANSWER_MAX_LENGTH}
                      rows={5}
                      disabled={!currentQuestion}
                      placeholder={
                        currentQuestion
                          ? "Your answer appears here as you speak — you can also type or edit it."
                          : "Waiting for the interviewer…"
                      }
                      className="w-full px-3 py-2.5 rounded-lg bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
                    ></textarea>

                    <AutoRecordControls
                      status={auto.status}
                      listening={auto.listening}
                      paused={auto.paused}
                      active={auto.active}
                      bars={auto.bars}
                      elapsed={auto.elapsed}
                      countdown={auto.countdown}
                      warning={auto.warning}
                      error={auto.error}
                      words={wordCount}
                      prefs={auto.prefs}
                      onPrefsChange={auto.setPrefs}
                      onResetPrefs={auto.resetPrefs}
                      onDone={auto.finish}
                      onPause={auto.pause}
                      onResume={auto.resume}
                      onRerecord={auto.rerecord}
                      onStop={auto.stop}
                      onDisable={() => auto.setPrefs({ enabled: false })}
                      micState={micPerm.state}
                      micSupported={micPerm.supported}
                      micRequesting={micPerm.requesting}
                      onRequestMic={() => {
                        void micPerm.request();
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => handleReply()}
                      disabled={replying || !currentQuestion || !answer.trim()}
                      className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                    >
                      <i className={replying ? "ri-loader-4-line animate-spin" : "ri-send-plane-line"}></i>
                      {replying ? "Sending…" : "Send"}
                    </button>
                  </>
                ) : (
                  <>
                {recording && (
                  <div className="flex items-center gap-3 flex-wrap rounded-lg bg-background-50 border border-background-200 px-3.5 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                      ● Recording
                    </span>
                    <span className="text-xs text-foreground-600 whitespace-nowrap">
                      {wordCount} {wordCount === 1 ? "word" : "words"}
                    </span>
                    <span className="text-xs text-foreground-600 whitespace-nowrap">
                      {answer.length}/{ANSWER_MAX_LENGTH} characters
                    </span>
                    {typeof fillerCount === "number" && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          fillerCount > 0
                            ? "bg-amber-100 text-amber-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        <i className="ri-chat-delete-line"></i>
                        {fillerCount} filler{fillerCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                )}

                {micError && (
                  <div className="flex items-center gap-2 rounded-lg bg-accent-100 text-accent-900 px-3.5 py-2.5 text-xs">
                    <i className="ri-mic-off-line"></i>
                    <span>{micError}</span>
                  </div>
                )}

                {speechSupported && (
                  <MicPermissionNotice
                    state={micPerm.state}
                    supported={micPerm.supported}
                    requesting={micPerm.requesting}
                    onEnable={() => {
                      void micPerm.request();
                    }}
                  />
                )}

                {limitToast && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-100 text-amber-800 px-3.5 py-2 text-xs font-medium toast-fade">
                    <i className="ri-information-line"></i>
                    <span>Character limit reached</span>
                  </div>
                )}

                <textarea
                  value={answer}
                  onChange={(e) => handleTextChange(e.target.value)}
                  maxLength={ANSWER_MAX_LENGTH}
                  rows={4}
                  disabled={!currentQuestion}
                  placeholder={
                    currentQuestion
                      ? "Type your answer, or tap Record to speak…"
                      : "Waiting for the interviewer…"
                  }
                  className="w-full px-3 py-2.5 rounded-lg bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
                ></textarea>

                <div className="flex items-center gap-2 flex-wrap">
                  {speechSupported &&
                    (recording ? (
                      <>
                        <span
                          className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-md bg-red-100 text-red-700 border border-red-200 whitespace-nowrap"
                        >
                          <i className={`ri-mic-line ${listening ? "animate-mic-pulse" : ""}`}></i>
                          <span>Listening</span>
                          <span className="inline-flex items-end gap-0.5" aria-hidden="true">
                            <span
                              className="listening-dot w-1 h-1 rounded-full bg-current"
                              style={{ animationDelay: "0ms" }}
                            ></span>
                            <span
                              className="listening-dot w-1 h-1 rounded-full bg-current"
                              style={{ animationDelay: "160ms" }}
                            ></span>
                            <span
                              className="listening-dot w-1 h-1 rounded-full bg-current"
                              style={{ animationDelay: "320ms" }}
                            ></span>
                          </span>
                        </span>
                        <button
                          onClick={stopRecognition}
                          title="Stop recording"
                          aria-label="Stop recording"
                          className="inline-flex items-center gap-2 text-sm font-semibold bg-red-500 text-white px-4 py-2.5 rounded-md hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-stop-fill"></i>
                          Stop
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={toggleRecording}
                        disabled={!currentQuestion || replying}
                        title="Record your answer aloud"
                        aria-label="Record answer"
                        className="inline-flex items-center gap-2 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200 px-4 py-2.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-mic-line"></i>
                        🎤 Record
                      </button>
                    ))}
                  <button
                    onClick={() => handleReply()}
                    disabled={replying || !currentQuestion || !answer.trim()}
                    className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                  >
                    <i className={replying ? "ri-loader-4-line animate-spin" : "ri-send-plane-line"}></i>
                    {replying ? "Sending…" : "Send"}
                  </button>
                </div>
                  </>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl bg-background-100/60 border border-background-200 flex flex-col">
            <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground-950">Transcript</h3>
              <span className="text-xs text-foreground-500">{exchanges.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[520px]">
              {exchanges.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <div className="w-10 h-10 mx-auto flex items-center justify-center rounded-lg bg-background-100 text-foreground-400 mb-2">
                    <i className="ri-chat-3-line"></i>
                  </div>
                  <p className="text-sm text-foreground-600">No answers yet.</p>
                  <p className="text-xs text-foreground-400 mt-1">Your Q&amp;A will appear here.</p>
                </div>
              ) : (
                <ul className="divide-y divide-background-200">
                  {exchanges.map((ex, i) => (
                    <li key={i} className="px-4 py-3">
                      <p className="text-xs text-foreground-500 font-medium">
                        Q{i + 1}: {ex.question}
                      </p>
                      <p className="text-sm text-foreground-900 mt-1.5 leading-snug">{ex.answer}</p>
                      {typeof ex.response_seconds === "number" && (
                        <p
                          className={`mt-1.5 text-xs ${paceStyle(ex.response_seconds)}`}
                          title="Aim for ~1–2 minutes."
                        >
                          ⏱ {formatDuration(ex.response_seconds)}
                        </p>
                      )}
                      {ex.feedback && (
                        <p className="text-xs text-secondary-900 mt-1.5 leading-snug">
                          <span className="font-semibold">Feedback:</span> {ex.feedback}
                        </p>
                      )}
                      {ex.vocabulary && (
                        <div className="mt-2">
                          <AnswerVocabulary answer={ex.answer} vocabulary={ex.vocabulary} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {!practiceOn && (
            <VocabularyCoach
              transcript={answer}
              elapsedSeconds={auto.elapsed}
              onApply={applyReplacement}
              onUsePolished={usePolished}
              onResult={handleCoachResult}
            />
          )}
        </div>
      </div>
    </div>
  );
}