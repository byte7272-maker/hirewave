import { useCallback, useEffect, useRef, useState } from "react";
import InterviewerAvatar from "@/pages/dashboard/components/InterviewerAvatar";
import { speak, stopSpeaking, ttsSupported, sttSupported, createRecognizer, loadVoices, speakViaServer, fetchMediaCapabilities, type Recognizer, type SpeakHandle } from "@/lib/speech";
import { currentInterviewerTurn, scoreColor, type Session } from "@/lib/interview";
import { useToast } from "@/lib/toast";

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 text-xs mb-1.5">
      <span className="w-20 text-foreground-600">{label}</span>
      <div className="flex-1 h-2 bg-background-200 rounded-full overflow-hidden">
        <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${value}%` }}></div>
      </div>
      <span className={`w-8 text-right font-semibold ${scoreColor(value)}`}>{value}</span>
    </div>
  );
}

export default function InterviewStage({
  session,
  busy,
  onSend,
  onEnd,
  voiceURI,
}: {
  session: Session;
  busy: boolean;
  onSend: (answer: string, responseSeconds: number | null) => void;
  onEnd: () => void;
  voiceURI?: string;
}) {
  const toast = useToast();
  const persona = session.persona;
  const cur = currentInterviewerTurn(session);
  const completed = session.status === "completed" && !!session.summary;

  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem("hw_voice_on") !== "0");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [boundaryTick, setBoundaryTick] = useState(0);
  const [serverVoice, setServerVoice] = useState(false); // neural voice source configured
  const amplitudeRef = useRef(0);
  const stopSpeechRef = useRef<SpeakHandle | null>(null);

  const [answer, setAnswer] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [camOn, setCamOn] = useState(false);

  const questionStart = useRef<number>(performance.now());
  const spokenId = useRef<string | undefined>(undefined);
  const recRef = useRef<Recognizer | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const camVideo = useRef<HTMLVideoElement>(null);

  useEffect(() => { loadVoices(); }, []);
  useEffect(() => { fetchMediaCapabilities().then((c) => setServerVoice(c.tts)); }, []);

  const doSpeak = useCallback(async (text: string) => {
    stopSpeechRef.current?.stop();
    setBoundaryTick(0);
    amplitudeRef.current = 0;
    recRef.current?.stop(); // don't capture our own TTS
    // Prefer the user-directed neural-voice source (real audio → true lip-sync).
    if (serverVoice) {
      try {
        setSpeaking(true);
        stopSpeechRef.current = await speakViaServer(text, persona.voice_id ?? "", {
          onStart: () => setSpeaking(true),
          onEnd: () => setSpeaking(false),
          amplitudeRef,
        });
        return;
      } catch {
        setServerVoice(false); // fall back to the browser voice for the rest of the session
      }
    }
    stopSpeechRef.current = speak(text, {
      gender: persona.gender,
      tone: persona.voice,
      voiceURI,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onBoundary: () => setBoundaryTick((x) => x + 1),
    });
  }, [persona.gender, persona.voice, persona.voice_id, voiceURI, serverVoice]);

  // Speak each new interviewer line once, and (re)start the answer timer.
  useEffect(() => {
    if (!cur) return;
    if (spokenId.current === cur.id) return;
    spokenId.current = cur.id;
    questionStart.current = performance.now();
    if (voiceOn) doSpeak(cur.text);
  }, [cur, voiceOn, doSpeak]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopSpeaking();
      stopSpeechRef.current?.stop();
      recRef.current?.stop();
      camStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    localStorage.setItem("hw_voice_on", next ? "1" : "0");
    if (!next) { stopSpeaking(); stopSpeechRef.current?.stop(); setSpeaking(false); }
    else if (cur) doSpeak(cur.text);
  }

  function replay() {
    if (cur) doSpeak(cur.text);
  }

  function toggleMic() {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = createRecognizer({
      onInterim: setInterim,
      onFinal: (t) => { setAnswer((a) => (a ? a + " " : "") + t.trim()); setInterim(""); },
      onEnd: () => { setListening(false); setInterim(""); },
      onError: (msg) => { setListening(false); if (msg !== "no-speech" && msg !== "aborted") toast.push("Mic error — you can type instead.", "error"); },
    });
    if (!rec) { toast.push("Voice input isn't supported in this browser — type your answer.", "error"); return; }
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function toggleCam() {
    if (camOn) {
      camStream.current?.getTracks().forEach((t) => t.stop());
      camStream.current = null;
      setCamOn(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      camStream.current = s;
      if (camVideo.current) camVideo.current.srcObject = s;
      setCamOn(true);
    } catch {
      toast.push("Camera unavailable or permission denied.", "error");
    }
  }

  function submit() {
    const text = (answer + (interim ? " " + interim : "")).trim();
    if (!text) return;
    recRef.current?.stop();
    setListening(false);
    const secs = questionStart.current ? (performance.now() - questionStart.current) / 1000 : null;
    onSend(text, secs);
    setAnswer("");
    setInterim("");
  }

  const lastAnswerFeedback = [...session.turns].reverse().find((t) => t.speaker === "candidate" && t.feedback)?.feedback;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* ---- Stage ---- */}
      <div className="lg:col-span-2 space-y-3">
        <div
          className="relative rounded-2xl overflow-hidden border border-background-200 aspect-video"
          style={{ background: "radial-gradient(120% 100% at 50% 0%, #2a3348 0%, #141a29 60%, #0b0f18 100%)" }}
        >
          {/* soft studio key light */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(60% 55% at 50% 42%, rgba(120,140,190,0.28), transparent 70%)" }} />

          {/* interviewer */}
          <div className="absolute inset-0 flex items-end justify-center">
            <div className={`relative w-[62%] max-w-[340px] aspect-square rounded-full overflow-hidden mb-[-6%] transition-shadow duration-200 ${speaking ? "ring-4 ring-primary-400/70" : "ring-1 ring-white/10"}`}
              style={{ background: "linear-gradient(180deg,#e9edf5,#c9d2e2)" }}>
              <InterviewerAvatar persona={persona} speaking={speaking} boundaryTick={boundaryTick} amplitudeRef={amplitudeRef} />
            </div>
          </div>

          {/* REC + live */}
          <div className="absolute top-3 left-3 flex items-center gap-2 text-[11px] font-mono text-white/90">
            <span className={`w-2 h-2 rounded-full ${speaking ? "bg-red-500 animate-pulse" : "bg-white/40"}`}></span>
            REC
          </div>
          {/* speaking equalizer */}
          {speaking && (
            <div className="absolute top-3 right-3 flex items-end gap-0.5 h-4" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="w-1 h-full bg-primary-300 rounded-full eq-bar" style={{ animationDelay: `${i * 0.12}s`, transformOrigin: "bottom" }} />
              ))}
            </div>
          )}

          {/* lower third */}
          <div className="absolute left-3 bottom-3 bg-black/45 backdrop-blur-sm rounded-lg px-3 py-1.5">
            <div className="text-sm font-semibold text-white leading-tight flex items-center gap-1.5">
              {persona.name}
              {serverVoice && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-primary-500/80 text-white" title="Neural voice source">◉ neural</span>}
            </div>
            <div className="text-[11px] text-white/70 leading-tight">{persona.role}{persona.company ? ` · ${persona.company}` : ""}</div>
          </div>

          {/* candidate PIP */}
          <div className="absolute right-3 bottom-3 w-28 md:w-36 aspect-video rounded-lg overflow-hidden border border-white/20 bg-secondary-950 flex items-center justify-center">
            <video ref={camVideo} autoPlay playsInline muted className={`w-full h-full object-cover ${camOn ? "" : "hidden"}`} style={{ transform: "scaleX(-1)" }} />
            {!camOn && (
              <div className="flex flex-col items-center gap-1 text-white/80">
                <span className="w-9 h-9 flex items-center justify-center rounded-full bg-accent-500 text-sm font-semibold">You</span>
                <span className="text-[10px] text-white/50">camera off</span>
              </div>
            )}
            {listening && <span className="absolute top-1 left-1 text-[9px] font-mono text-red-300 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />live</span>}
          </div>

          {/* captions */}
          {captionsOn && cur && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-3 max-w-[70%] text-center">
              <span className="inline-block bg-black/60 text-white text-xs md:text-sm px-3 py-1.5 rounded-lg leading-snug">{cur.text}</span>
            </div>
          )}
        </div>

        {/* control bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-background-100/60 border border-background-200 p-2">
          <CtrlButton active={listening} onClick={toggleMic} icon={listening ? "ri-mic-fill" : "ri-mic-line"} label={listening ? "Listening…" : "Speak"} disabled={!sttSupported()} title={sttSupported() ? "" : "Not supported in this browser"} />
          <CtrlButton active={camOn} onClick={toggleCam} icon={camOn ? "ri-camera-fill" : "ri-camera-off-line"} label={camOn ? "Camera on" : "Camera"} />
          <CtrlButton active={voiceOn} onClick={toggleVoice} icon={voiceOn ? "ri-volume-up-line" : "ri-volume-mute-line"} label={voiceOn ? "Voice on" : "Muted"} disabled={!ttsSupported()} />
          <CtrlButton active={false} onClick={replay} icon="ri-repeat-line" label="Replay" disabled={!voiceOn || !cur} />
          <CtrlButton active={captionsOn} onClick={() => setCaptionsOn((v) => !v)} icon="ri-closed-captioning-line" label="Captions" />
          <button onClick={onEnd} className="ml-auto inline-flex items-center gap-2 text-sm font-semibold bg-accent-600 text-white px-4 py-2 rounded-md hover:bg-accent-700 transition-colors cursor-pointer">
            <i className="ri-phone-fill rotate-[135deg]"></i>{completed ? "New interview" : "End"}
          </button>
        </div>

        {/* answer / summary */}
        {completed ? (
          <div className="rounded-2xl bg-background-100/60 border border-background-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-lg font-medium">Interview summary</h3>
              <span className={`font-bold ${scoreColor(session.summary!.overall)}`}>{session.summary!.overall}/100</span>
            </div>
            <Bar label="Structure" value={session.summary!.structure} />
            <Bar label="Specificity" value={session.summary!.specificity} />
            <Bar label="Conciseness" value={session.summary!.conciseness} />
            <Bar label="Confidence" value={session.summary!.confidence} />
            {session.summary!.avg_response_seconds != null && (
              <p className="text-xs text-foreground-500 mt-2">Avg response time ⏱ {Math.round(session.summary!.avg_response_seconds)}s over {session.summary!.answers_rated} answers</p>
            )}
            {session.summary!.top_improvements.map((im, i) => <p key={i} className="text-xs text-foreground-500 mt-1">💡 {im}</p>)}
          </div>
        ) : (
          <div className="rounded-2xl bg-background-100/60 border border-background-200 p-4">
            <textarea
              value={answer + (interim ? (answer ? " " : "") + interim : "")}
              onChange={(e) => { setAnswer(e.target.value); setInterim(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
              rows={3}
              placeholder={listening ? "Listening — speak your answer…" : "Type your answer, or tap Speak…"}
              className="w-full px-3 py-2 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-foreground-500">Question {session.asked} of {session.max_questions}{speaking && <span className="ml-2 text-primary-600">· interviewer speaking…</span>}</span>
              <button onClick={submit} disabled={busy || !(answer + interim).trim()} className="text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">
                {busy ? "Sending…" : "Send answer"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Side rail ---- */}
      <div className="space-y-3">
        <div className="rounded-2xl bg-background-100/60 border border-background-200 p-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full overflow-hidden bg-background-200 flex-shrink-0">
              <InterviewerAvatar persona={persona} speaking={false} />
            </span>
            <div>
              <div className="text-sm font-semibold text-foreground-950">{persona.name}</div>
              <div className="text-xs text-foreground-500 capitalize">{persona.style} · {persona.voice} voice</div>
            </div>
          </div>
          {persona.bio && <p className="text-xs text-foreground-600 mt-3 leading-relaxed">{persona.bio}</p>}
        </div>

        {lastAnswerFeedback && !completed && (
          <div className="rounded-2xl bg-background-50 border border-background-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground-700">Last answer</span>
              <span className={`font-bold text-sm ${scoreColor(lastAnswerFeedback.overall)}`}>{lastAnswerFeedback.overall}/100</span>
            </div>
            <Bar label="Structure" value={lastAnswerFeedback.structure} />
            <Bar label="Specificity" value={lastAnswerFeedback.specificity} />
            <Bar label="Conciseness" value={lastAnswerFeedback.conciseness} />
            <Bar label="Confidence" value={lastAnswerFeedback.confidence} />
            {lastAnswerFeedback.improvements.slice(0, 2).map((im, i) => <p key={i} className="text-xs text-foreground-500 mt-1">💡 {im}</p>)}
          </div>
        )}

        <details className="rounded-2xl bg-background-100/60 border border-background-200 p-4">
          <summary className="text-xs font-semibold text-foreground-700 cursor-pointer">Transcript</summary>
          <div className="mt-3 space-y-2">
            {session.turns.map((t) => (
              <div key={t.id} className="text-xs">
                <span className={`font-semibold ${t.speaker === "candidate" ? "text-accent-700" : "text-primary-700"}`}>{t.speaker === "candidate" ? "You" : persona.name.split(" ")[0]}:</span>{" "}
                <span className="text-foreground-700">{t.text}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function CtrlButton({ active, onClick, icon, label, disabled, title }: { active: boolean; onClick: () => void; icon: string; label: string; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${active ? "bg-primary-500 text-background-50 dark:text-foreground-950" : "bg-background-50 border border-background-200 text-foreground-700 hover:bg-background-100"}`}
    >
      <i className={icon}></i>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
