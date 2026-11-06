import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { listResumes, type Resume } from "@/lib/documents";
import {
  listMockSessions,
  listPersonas,
  listVoices,
  startMock,
  type InterviewPersona,
  type MockSession,
} from "@/lib/interview";
import { clearPracticeHistory, readPracticeHistory, type PracticeRecapRecord } from "@/lib/practiceRecap";
import { useToast } from "@/components/base/ToastProvider";
import PageHeader from "@/components/feature/PageHeader";
import StatCard from "@/pages/dashboard/components/StatCard";
import PanelHeader from "@/pages/dashboard/components/PanelHeader";
import InterviewRoom from "@/pages/dashboard/interview/components/InterviewRoom";
import PersonaCard from "@/pages/dashboard/interview/components/PersonaCard";
import PracticeHistory from "@/pages/dashboard/interview/components/PracticeHistory";

function extractSavedVoiceIds(voices: unknown): Set<string> {
  const ids = new Set<string>();
  if (Array.isArray(voices)) {
    for (const item of voices) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      // `id` is an internal composite ("{user_id}:{persona_id}") — never match on it.
      const id = rec.persona_id;
      if (id !== undefined && id !== null && id !== "") ids.add(String(id));
    }
  } else if (voices && typeof voices === "object") {
    // Defensive: tolerate an object map keyed by persona id.
    for (const [key, value] of Object.entries(voices as Record<string, unknown>)) {
      if (value) ids.add(key);
    }
  }
  return ids;
}

// Auto-retry backoff for the transient voice overlay fetch.
const VOICE_RETRY_BASE_MS = 2000;
const VOICE_RETRY_MAX_MS = 15000;
const VOICE_RETRY_MAX_ATTEMPTS = 4;

export default function Interview() {
  const { showToast } = useToast();
  const [personas, setPersonas] = useState<InterviewPersona[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [savedVoiceIds, setSavedVoiceIds] = useState<Set<string>>(new Set());
  const [voicesError, setVoicesError] = useState(false);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const voicesErrorRef = useRef(false);
  const voicesLoadingRef = useRef(false);
  const voicesRetryTimerRef = useRef<number | null>(null);
  const [resumeLoading, setResumeLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [startingId, setStartingId] = useState<string | number | null>(null);
  const [session, setSession] = useState<MockSession | null>(null);
  const [activePersona, setActivePersona] = useState<InterviewPersona | null>(null);

  // Past sessions (backend) + locally-remembered practice recaps.
  const [sessions, setSessions] = useState<MockSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(false);
  const [recapRecords, setRecapRecords] = useState<PracticeRecapRecord[]>([]);

  function loadVoices(attempt = 0) {
    if (voicesLoadingRef.current) return;
    voicesLoadingRef.current = true;
    setVoicesError(false);
    voicesErrorRef.current = false;
    setVoicesLoading(true);
    listVoices()
      .then((v) => {
        if (voicesRetryTimerRef.current !== null) {
          window.clearTimeout(voicesRetryTimerRef.current);
          voicesRetryTimerRef.current = null;
        }
        setSavedVoiceIds(extractSavedVoiceIds(v));
      })
      .catch(() => {
        setVoicesError(true);
        voicesErrorRef.current = true;
        const next = attempt + 1;
        if (next <= VOICE_RETRY_MAX_ATTEMPTS) {
          const delay = Math.min(VOICE_RETRY_BASE_MS * 2 ** (next - 1), VOICE_RETRY_MAX_MS);
          if (voicesRetryTimerRef.current !== null) {
            window.clearTimeout(voicesRetryTimerRef.current);
          }
          voicesRetryTimerRef.current = window.setTimeout(() => {
            voicesRetryTimerRef.current = null;
            loadVoices(next);
          }, delay);
        }
      })
      .finally(() => {
        voicesLoadingRef.current = false;
        setVoicesLoading(false);
      });
  }

  function loadSessions() {
    setSessionsLoading(true);
    setSessionsError(false);
    setRecapRecords(readPracticeHistory());
    listMockSessions()
      .then((s) => setSessions(s ?? []))
      .catch(() => setSessionsError(true))
      .finally(() => setSessionsLoading(false));
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [p, r] = await Promise.all([listPersonas(), listResumes()]);
      setPersonas(p ?? []);
      setResumes(r ?? []);
      // Saved per-persona voices are an overlay — fetch them without blocking.
      loadVoices();
      loadSessions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load interviews.");
    } finally {
      setLoading(false);
      setResumeLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Recover transient voice-load failures without a manual click: retry on focus.
  useEffect(() => {
    const onFocus = () => {
      if (voicesErrorRef.current) loadVoices();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (voicesRetryTimerRef.current !== null) {
        window.clearTimeout(voicesRetryTimerRef.current);
        voicesRetryTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart(persona: InterviewPersona) {
    setStartingId(persona.id);
    setError("");
    try {
      const s = await startMock({
        persona_id: persona.id,
        resume_id: resumes[0]?.id,
        max_questions: 5,
      });
      setActivePersona(persona);
      setSession(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the interview.");
    } finally {
      setStartingId(null);
    }
  }

  // Toggle the badge optimistically, then reconcile with the /voices fetch.
  function handleVoiceChanged(personaId: string | number, hasCustomVoice: boolean) {
    const key = String(personaId);
    setSavedVoiceIds((prev) => {
      const next = new Set(prev);
      if (hasCustomVoice) next.add(key);
      else next.delete(key);
      return next;
    });
    loadVoices();
  }

  function handleReopen(s: MockSession, persona: InterviewPersona) {
    setActivePersona(persona);
    setSession(s);
  }

  function handleClearHistory() {
    clearPracticeHistory();
    setRecapRecords([]);
    showToast("Practice history cleared", "info");
  }

  if (session && activePersona) {
    return (
      <InterviewRoom
        key={String(session.id)}
        session={session}
        persona={activePersona}
        onExit={() => {
          setSession(null);
          setActivePersona(null);
          loadSessions();
        }}
      />
    );
  }

  const hasResume = resumes.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI interviews"
        subtitle="Practice with an AI interviewer persona tailored to your experience."
        icon="ri-user-voice-line"
        tone="primary"
        image="https://readdy.ai/api/search-image?query=Warm%20editorial%20photograph%20of%20a%20confident%20person%20practising%20a%20video%20interview%20call%20at%20a%20tidy%20sunlit%20desk%20with%20headphones%20and%20a%20laptop%2C%20calm%20focused%20optimistic%20mood%2C%20warm%20neutral%20cream%20tones%20with%20muted%20emerald%20and%20coral%20colour%20accents%2C%20soft%20natural%20window%20light%2C%20shallow%20depth%20of%20field%2C%20premium%20editorial%20magazine%20aesthetic%2C%20darker%20left%20side%20for%20overlay%20text%2C%20high%20detail&width=1600&height=460&seq=header-interview-01&orientation=landscape"
        imageAlt="Someone practising a video interview call at a sunlit desk"
      />

      <section className="animate-fade-in-up grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Interviewers"
          value={personas.length}
          caption="ready to practise"
          icon="ri-user-voice-line"
          tone="primary"
        />
        <StatCard
          label="Past sessions"
          value={sessions.length}
          caption="on record"
          icon="ri-history-line"
          tone="accent"
          delay={0.06}
        />
        <StatCard
          label="Practices logged"
          value={recapRecords.length}
          caption="with a recap"
          icon="ri-mic-line"
          tone="secondary"
          delay={0.12}
        />
      </section>

      {!resumeLoading && (
        <div className="animate-fade-in-up" style={{ animationDelay: "0.04s" }}>
          {hasResume ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-green-50 border border-green-200 text-green-800 px-4 py-3 text-sm">
              <i className="ri-checkbox-circle-fill text-base"></i>
              <span>Tailored to your résumé</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-sm">
              <div className="flex items-center gap-2.5 flex-1">
                <i className="ri-file-upload-line text-base"></i>
                <span>Upload your résumé first — so your interviews are tailored to you.</span>
              </div>
              <Link
                to="/dashboard/documents"
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors cursor-pointer whitespace-nowrap"
              >
                Go to Résumés
                <i className="ri-arrow-right-line"></i>
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="animate-fade-in-up" style={{ animationDelay: "0.08s" }}>
        {loading ? (
          <div className="py-16 text-sm text-foreground-500 flex items-center justify-center gap-2">
            <i className="ri-loader-4-line animate-spin"></i>
            Loading interviewers…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
            <i className="ri-error-warning-line text-base mt-0.5"></i>
            <div className="flex-1">{error}</div>
            <button
              onClick={load}
              className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        ) : personas.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-2xl bg-secondary-100 text-secondary-700">
              <i className="ri-user-voice-line text-2xl"></i>
            </div>
            <p className="mt-4 text-sm font-medium text-foreground-900">No interviewers available</p>
            <p className="mt-1 text-xs text-foreground-500">Check back once personas are configured.</p>
          </div>
        ) : (
          <section className="rounded-2xl bg-background-50 border border-background-200 overflow-hidden">
            <PanelHeader
              icon="ri-user-voice-line"
              tone="primary"
              title="Choose your interviewer"
              subtitle="Each persona brings a different style and difficulty"
              count={personas.length}
              countLabel="personas"
            />
            <div className="p-5 space-y-5">
            {voicesError && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-sm">
                <div className="flex items-center gap-2.5 flex-1">
                  <i className="ri-user-voice-line text-base"></i>
                  <span>Couldn&rsquo;t load saved voices — custom voice badges are hidden.</span>
                </div>
                <button
                  onClick={loadVoices}
                  disabled={voicesLoading}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  <i className={voicesLoading ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
                  {voicesLoading ? "Retrying…" : "Retry"}
                </button>
              </div>
            )}
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {personas.map((p) => (
                <PersonaCard
                  key={p.id}
                  persona={p}
                  starting={startingId === p.id}
                  hasCustomVoice={savedVoiceIds.has(String(p.id))}
                  onStart={handleStart}
                  onVoiceChanged={(hasCustomVoice) => handleVoiceChanged(p.id, hasCustomVoice)}
                />
              ))}
            </div>
            </div>
          </section>
        )}
      </div>

      <div className="animate-fade-in-up" style={{ animationDelay: "0.12s" }}>
        <PracticeHistory
          sessions={sessions}
          personas={personas}
          recapRecords={recapRecords}
          loading={sessionsLoading}
          error={sessionsError}
          startingId={startingId}
          onRetry={loadSessions}
          onReopen={handleReopen}
          onRerun={handleStart}
          onClearHistory={handleClearHistory}
        />
      </div>
    </div>
  );
}