"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import {
  countFillers,
  speak,
  stopSpeaking,
  ttsSupported,
  useSpeechRecognition,
} from "@/lib/speech";
import type {
  AnswerFeedback,
  InterviewTurn,
  MatchOut,
  MockInterviewSession,
  Resume,
} from "@/lib/types";

const STYLES = [
  { v: "friendly", label: "Friendly hiring manager" },
  { v: "formal", label: "Formal director" },
  { v: "technical", label: "Technical deep-dive" },
  { v: "skeptical", label: "Skeptical VP" },
  { v: "behavioral", label: "Behavioral / STAR" },
];

const scoreColor = (v: number) =>
  v >= 80 ? "var(--success)" : v >= 60 ? "var(--warn)" : "var(--danger)";

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="scorerow">
      <span className="muted">{label}</span>
      <div className="meter">
        <span style={{ width: `${value}%`, background: scoreColor(value) }} />
      </div>
      <strong style={{ textAlign: "right", color: scoreColor(value) }}>{value}</strong>
    </div>
  );
}

function FeedbackCard({ fb, seconds }: { fb: AnswerFeedback; seconds: number | null }) {
  return (
    <div className="card" style={{ marginTop: 8, background: "var(--bg)" }}>
      <div className="row between">
        <strong>Answer feedback</strong>
        <div className="row" style={{ gap: 8 }}>
          {seconds != null && <span className="chip">⏱ {Math.round(seconds)}s</span>}
          <span className="badge" style={{ color: scoreColor(fb.overall) }}>
            {fb.overall}/100
          </span>
        </div>
      </div>
      <div style={{ margin: "12px 0" }}>
        <ScoreRow label="Structure" value={fb.structure} />
        <ScoreRow label="Specificity" value={fb.specificity} />
        <ScoreRow label="Conciseness" value={fb.conciseness} />
        <ScoreRow label="Confidence" value={fb.confidence} />
      </div>
      {fb.strengths.length > 0 && (
        <p className="faint" style={{ margin: "4px 0" }}>✅ {fb.strengths.join(" ")}</p>
      )}
      {fb.improvements.map((i, idx) => (
        <p key={idx} className="faint" style={{ margin: "4px 0" }}>💡 {i}</p>
      ))}
    </div>
  );
}

function Turn({ turn, persona }: { turn: InterviewTurn; persona: string }) {
  const isInterviewer = turn.speaker === "interviewer";
  return (
    <div className={`turn ${turn.speaker}`}>
      <div
        className="avatar"
        aria-hidden
        style={isInterviewer ? {} : { background: "linear-gradient(135deg, #3ecf8e, #2a9d6f)" }}
      >
        {isInterviewer ? persona : "You"}
      </div>
      <div style={{ maxWidth: "80%" }}>
        <div className="bubble">{turn.text}</div>
        {turn.feedback && <FeedbackCard fb={turn.feedback} seconds={turn.response_seconds} />}
      </div>
    </div>
  );
}

const DIFFICULTIES = ["easy", "normal", "hard"];

export function MockInterview() {
  const resumes = useApi<Resume[]>("/api/v1/resumes");
  const matches = useApi<MatchOut[]>("/api/v1/jobs/matches?limit=25");
  const past = useApi<MockInterviewSession[]>("/api/v1/interview/mock");
  const toast = useToast();

  const [resumeId, setResumeId] = useState("");
  const [jobId, setJobId] = useState("");
  const [style, setStyle] = useState("friendly");
  const [difficulty, setDifficulty] = useState("normal");
  const [session, setSession] = useState<MockInterviewSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);

  const questionStart = useRef<number>(0);
  const lastSpoken = useRef<string>("");

  const appendTranscript = useCallback((t: string) => setAnswer((a) => (a + t).trimStart()), []);
  const stt = useSpeechRecognition(appendTranscript);

  // When a new interviewer turn appears: reset the answer timer and (optionally) speak it.
  useEffect(() => {
    if (!session) return;
    const last = session.turns[session.turns.length - 1];
    if (last?.speaker !== "interviewer") return;
    if (session.status === "active") questionStart.current = Date.now();
    if (voiceOn && last.id !== lastSpoken.current) {
      lastSpoken.current = last.id;
      speak(last.text);
    }
  }, [session, voiceOn]);

  useEffect(() => () => stopSpeaking(), []); // stop TTS on unmount

  async function start() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { style, difficulty, max_questions: 5 };
      if (resumeId) body.resume_id = resumeId;
      if (jobId) body.job_posting_id = jobId;
      lastSpoken.current = "";
      setSession(await api<MockInterviewSession>("/api/v1/interview/mock/start", { method: "POST", body }));
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to start.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!session || !answer.trim()) return;
    if (stt.listening) stt.stop();
    stopSpeaking();
    setBusy(true);
    try {
      const response_seconds = questionStart.current
        ? (Date.now() - questionStart.current) / 1000
        : null;
      const updated = await api<MockInterviewSession>(
        `/api/v1/interview/mock/${session.id}/reply`,
        { method: "POST", body: { answer, response_seconds } }
      );
      setSession(updated);
      setAnswer("");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to send.", "error");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    stopSpeaking();
    if (stt.listening) stt.stop();
    setSession(null);
    setAnswer("");
    past.reload(); // refresh history with the session we just finished
  }

  if (!session) {
    return (
      <div className="card">
        <h2>Start a mock interview</h2>
        <p className="muted">
          You&apos;ll be interviewed by an AI persona. Speak or type your answers — each is
          rated on content and style, with your response time and tips.
        </p>
        <div className="grid cols-3" style={{ marginTop: 8 }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="mi-style">Interviewer</label>
            <select id="mi-style" value={style} onChange={(e) => setStyle(e.target.value)}>
              {STYLES.map((s) => (
                <option key={s.v} value={s.v}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="mi-resume">Base on résumé</label>
            <select id="mi-resume" value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
              <option value="">My profile</option>
              {(resumes.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.source === "uploaded" ? `⬆ ${r.original_filename}` : `✨ ${r.target_role || "Résumé"}`}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="mi-job">Target job</label>
            <select id="mi-job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">General</option>
              {(matches.data ?? []).map((m) => (
                <option key={m.job_id} value={m.job_id}>{m.title} — {m.company}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14, gap: 12 }}>
          <span className="faint">Difficulty</span>
          <div className="seg" role="group" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                className={difficulty === d ? "on" : ""}
                onClick={() => setDifficulty(d)}
                style={{ textTransform: "capitalize" }}
              >
                {d}
              </button>
            ))}
          </div>
          <span className="faint" style={{ fontSize: "0.8rem" }}>
            {difficulty === "easy"
              ? "No follow-ups."
              : difficulty === "hard"
              ? "Presses hard — expect probing follow-ups."
              : "Challenging personas probe weak answers."}
          </span>
        </div>
        <button className="btn primary" style={{ marginTop: 16 }} onClick={start} disabled={busy}>
          {busy ? <span className="spinner" /> : "Start interview"}
        </button>

        {past.data && past.data.length > 0 && (
          <>
            <div className="divider" />
            <h2 style={{ fontSize: "1.05rem" }}>Past interviews</h2>
            <div className="stack">
              {past.data
                .slice()
                .reverse()
                .map((s) => (
                  <div key={s.id} className="row between list-item" style={{ padding: "12px 16px" }}>
                    <div className="row" style={{ gap: 10 }}>
                      <div className="avatar" aria-hidden style={{ width: 32, height: 32, minWidth: 32, fontSize: "0.72rem" }}>
                        {s.persona.initials}
                      </div>
                      <div>
                        <strong>{s.persona.name}</strong>
                        <div className="faint">
                          {s.persona.style}
                          {s.summary ? ` · scored ${s.summary.overall}/100` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className={`badge ${s.status === "completed" ? "green" : "amber"}`}>
                        {s.status === "completed" ? "Completed" : "In progress"}
                      </span>
                      <button className="btn ghost sm" onClick={() => setSession(s)}>
                        {s.status === "completed" ? "Review" : "Resume"}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const done = session.status === "completed";
  const fillers = countFillers(answer);

  return (
    <div>
      <div className="card row between" style={{ marginBottom: 16 }}>
        <div className="row">
          <div className="avatar" aria-hidden>{session.persona.initials}</div>
          <div>
            <strong>{session.persona.name}</strong>
            <div className="faint">
              {session.persona.role}
              {session.persona.company ? ` · ${session.persona.company}` : ""} · {session.persona.style}
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {ttsSupported() && (
            <button
              className={`btn sm ${voiceOn ? "primary" : "ghost"}`}
              onClick={() => {
                stopSpeaking();
                setVoiceOn((v) => !v);
              }}
              aria-pressed={voiceOn}
              title="Interviewer reads questions aloud"
            >
              {voiceOn ? "🔊 Voice on" : "🔇 Voice off"}
            </button>
          )}
          <button className="btn ghost sm" onClick={reset}>End / new</button>
        </div>
      </div>

      <div>
        {session.turns.map((t) => (
          <Turn key={t.id} turn={t} persona={session.persona.initials} />
        ))}
      </div>

      {done ? (
        session.summary && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>Interview summary</h2>
              <div className="row" style={{ gap: 8 }}>
                {session.summary.avg_response_seconds != null && (
                  <span className="chip">⏱ avg {session.summary.avg_response_seconds}s</span>
                )}
                <span className="badge" style={{ color: scoreColor(session.summary.overall) }}>
                  {session.summary.overall}/100
                </span>
              </div>
            </div>
            <div style={{ margin: "12px 0" }}>
              <ScoreRow label="Structure" value={session.summary.structure} />
              <ScoreRow label="Specificity" value={session.summary.specificity} />
              <ScoreRow label="Conciseness" value={session.summary.conciseness} />
              <ScoreRow label="Confidence" value={session.summary.confidence} />
            </div>
            {session.summary.top_improvements.length > 0 && (
              <>
                <strong>Focus on next time</strong>
                {session.summary.top_improvements.map((i, idx) => (
                  <p key={idx} className="faint" style={{ margin: "4px 0" }}>💡 {i}</p>
                ))}
              </>
            )}
            <button className="btn primary" style={{ marginTop: 12 }} onClick={reset}>
              Start another
            </button>
          </div>
        )
      ) : (
        <div className="card">
          <div className="row between">
            <label htmlFor="mi-answer" style={{ margin: 0 }}>Your answer</label>
            {stt.supported && (
              <button
                className={`btn sm ${stt.listening ? "danger" : "ghost"}`}
                onClick={stt.toggle}
                title="Dictate your answer"
              >
                {stt.listening ? "● Listening… tap to stop" : "🎤 Speak"}
              </button>
            )}
          </div>
          <textarea
            id="mi-answer"
            value={answer + (stt.interim ? ` ${stt.interim}` : "")}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={stt.supported ? "Type, or tap 🎤 Speak to dictate…" : "Answer the interviewer…"}
            style={{ marginTop: 8 }}
          />
          <div className="row between" style={{ marginTop: 10 }}>
            <span className="faint">
              Question {session.asked} of {session.max_questions}
              {fillers > 0 && (
                <span style={{ color: "var(--warn)", marginLeft: 10 }}>
                  {fillers} filler word{fillers > 1 ? "s" : ""}
                </span>
              )}
            </span>
            <button className="btn primary" onClick={send} disabled={busy || !answer.trim()}>
              {busy ? <span className="spinner" /> : "Send answer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
