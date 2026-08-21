import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/lib/toast";
import type { MatchOut, Resume } from "@/lib/backend";
import type { Session } from "@/lib/interview";
import { loadVoices, rankedVoices, ttsSupported, fetchMediaCapabilities, fetchPersonas, type VoiceInfo, type LibraryPersona } from "@/lib/speech";
import InterviewStage from "@/pages/dashboard/components/InterviewStage";
import CommunityQuestions from "@/pages/dashboard/components/CommunityQuestions";
import PeerInterview from "@/pages/dashboard/components/PeerInterview";

interface PrepQ { id: string; category: string; question: string; suggested_answer: string; tips: string }
interface Prep { based_on_document: boolean; questions: PrepQ[] }

const STYLES = [
  { v: "friendly", label: "Friendly manager" },
  { v: "formal", label: "Formal director" },
  { v: "technical", label: "Technical" },
  { v: "skeptical", label: "Skeptical VP" },
  { v: "behavioral", label: "Behavioral" },
];
const DIFFS = ["easy", "normal", "hard"];

export default function MockInterview() {
  const resumes = useApi<Resume[]>("/api/v1/resumes");
  const matches = useApi<MatchOut[]>("/api/v1/jobs/matches?limit=25");
  const toast = useToast();

  const [mode, setMode] = useState<"mock" | "peer" | "community" | "bank">("mock");
  const [resumeId, setResumeId] = useState("");
  const [jobId, setJobId] = useState("");
  const [style, setStyle] = useState("friendly");
  const [difficulty, setDifficulty] = useState("normal");
  const [busy, setBusy] = useState(false);

  const [session, setSession] = useState<Session | null>(null);

  const [prep, setPrep] = useState<Prep | null>(null);
  const [openQ, setOpenQ] = useState<string | null>(null);

  // Natural-voice selection (persisted).
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voiceURI, setVoiceURI] = useState(() => localStorage.getItem("hw_voice") ?? "");
  useEffect(() => { loadVoices().then(() => setVoices(rankedVoices())); }, []);

  // User-directed persona library (empty ⇒ interviewers are generated).
  const [personas, setPersonas] = useState<LibraryPersona[]>([]);
  const [personaId, setPersonaId] = useState("");
  useEffect(() => {
    fetchMediaCapabilities().then((c) => { if (c.personas > 0) fetchPersonas().then(setPersonas); });
  }, []);
  function pickVoiceURI(v: string) {
    setVoiceURI(v);
    if (v) localStorage.setItem("hw_voice", v); else localStorage.removeItem("hw_voice");
  }

  function body() {
    const b: Record<string, unknown> = {};
    if (resumeId) b.resume_id = resumeId;
    if (jobId) b.job_posting_id = jobId;
    return b;
  }

  async function startMock(questions?: string[]) {
    setBusy(true);
    try {
      const startBody: Record<string, unknown> = {
        ...body(), style, difficulty,
        max_questions: questions && questions.length ? Math.min(questions.length, 10) : 5,
      };
      if (personaId) startBody.persona_id = personaId;
      if (questions && questions.length) startBody.questions = questions;
      const s = await api<Session>("/api/v1/interview/mock/start", { method: "POST", body: startBody });
      setSession(s);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to start.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function sendAnswer(answer: string, responseSeconds: number | null) {
    if (!session || !answer.trim()) return;
    setBusy(true);
    try {
      const s = await api<Session>(`/api/v1/interview/mock/${session.id}/reply`, { method: "POST", body: { answer, response_seconds: responseSeconds } });
      setSession(s);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to send.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function genPrep() {
    setBusy(true);
    try {
      const p = await api<Prep>("/api/v1/interview/prep", { method: "POST", body: { ...body(), count: 6 } });
      setPrep(p);
      setOpenQ(p.questions[0]?.id ?? null);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to generate.", "error");
    } finally {
      setBusy(false);
    }
  }

  const naturalCount = voices.filter((v) => v.natural).length;

  const setup = (
    <div className="rounded-2xl bg-background-100/60 border border-background-200 p-5">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {mode === "mock" && (
          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Interviewer</span>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              {STYLES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="block text-xs font-medium text-foreground-600 mb-1.5">Base on résumé</span>
          <select value={resumeId} onChange={(e) => setResumeId(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">My profile</option>
            {(resumes.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.source === "uploaded" ? r.original_filename : (r.target_role || "Résumé")}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-foreground-600 mb-1.5">Target job</span>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">General</option>
            {(matches.data ?? []).map((m) => <option key={m.job_id} value={m.job_id}>{m.title} — {m.company}</option>)}
          </select>
        </label>
        {mode === "mock" && (
          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Difficulty</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-primary-400">
              {DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        )}
      </div>

      {mode === "mock" && personas.length > 0 && (
        <label className="block mt-3">
          <span className="block text-xs font-medium text-foreground-600 mb-1.5">
            Interviewer <span className="text-primary-600">· {personas.length} from your library</span>
          </span>
          <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">Generated (use the style + difficulty above)</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.role}{p.company ? ` · ${p.company}` : ""} ({p.style})</option>
            ))}
          </select>
        </label>
      )}

      {mode === "mock" && ttsSupported() && (
        <label className="block mt-3">
          <span className="block text-xs font-medium text-foreground-600 mb-1.5">
            Interviewer voice {naturalCount > 0 && <span className="text-primary-600">· {naturalCount} natural available</span>}
          </span>
          <select value={voiceURI} onChange={(e) => pickVoiceURI(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">Auto (best match for interviewer)</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.natural ? "★ " : ""}{v.name} ({v.lang}){v.gender !== "neutral" ? ` · ${v.gender}` : ""}</option>
            ))}
          </select>
        </label>
      )}

      <button onClick={mode === "mock" ? () => startMock() : genPrep} disabled={busy} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer disabled:opacity-60">
        <i className="ri-vidicon-line"></i>
        {busy ? "Working…" : mode === "mock" ? "Start video interview" : "Generate questions"}
      </button>
      {mode === "mock" && !ttsSupported() && <p className="text-xs text-foreground-500 mt-2">Your browser can't synthesize speech — the interview runs with on-screen captions.</p>}
    </div>
  );

  const MODES = [
    { v: "mock", label: "Mock interview" },
    { v: "peer", label: "With a peer" },
    { v: "community", label: "Community Q&A" },
    { v: "bank", label: "Question bank" },
  ] as const;

  async function practice(questions: string[]) {
    await startMock(questions);
  }

  return (
    <div className="space-y-4">
      {!session && (
        <div className="inline-flex rounded-lg border border-background-200 overflow-hidden">
          {MODES.map((m) => (
            <button key={m.v} onClick={() => setMode(m.v)} className={`px-4 py-2 text-sm font-semibold cursor-pointer ${mode === m.v ? "bg-primary-500 text-background-50 dark:text-foreground-950" : "text-foreground-600 hover:bg-background-100"}`}>
              {m.label}
            </button>
          ))}
        </div>
      )}

      {session ? (
        <InterviewStage
          session={session}
          busy={busy}
          voiceURI={voiceURI || undefined}
          onSend={sendAnswer}
          onEnd={() => setSession(null)}
        />
      ) : mode === "mock" ? (
        setup
      ) : mode === "peer" ? (
        <PeerInterview />
      ) : mode === "community" ? (
        <CommunityQuestions onPractice={practice} />
      ) : (
        <div className="space-y-4">
          {setup}
          {prep && (
            <div className="space-y-2">
              {prep.based_on_document && <p className="text-xs text-primary-700">Grounded in your résumé.</p>}
              {prep.questions.map((q) => (
                <div key={q.id} className="rounded-xl bg-background-100/60 border border-background-200 p-4">
                  <button onClick={() => setOpenQ(openQ === q.id ? null : q.id)} className="w-full flex items-center justify-between gap-3 text-left cursor-pointer">
                    <span className="flex items-center gap-2"><span className="text-[11px] px-2 py-0.5 rounded-full bg-background-200 text-foreground-600 capitalize">{q.category}</span><strong className="text-sm text-foreground-950">{q.question}</strong></span>
                    <i className={`ri-arrow-${openQ === q.id ? "up" : "down"}-s-line text-foreground-500`}></i>
                  </button>
                  {openQ === q.id && (
                    <div className="mt-3 text-sm text-foreground-700">
                      <p className="text-xs text-foreground-500 mb-1">Suggested answer</p>
                      <p>{q.suggested_answer}</p>
                      {q.tips && <p className="text-xs text-foreground-500 mt-2">💡 {q.tips}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
