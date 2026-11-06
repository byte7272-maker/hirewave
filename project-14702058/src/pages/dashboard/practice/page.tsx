import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  acceptPractice,
  createPractice,
  listPractice,
  type PracticeSession,
} from "@/lib/practice";
import PracticeRoom from "./components/PracticeRoom";
import PageHeader from "@/components/feature/PageHeader";

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function statusLabel(s?: string): string {
  const v = (s ?? "").toLowerCase();
  if (v === "pending") return "Pending";
  if (v === "accepted") return "Accepted";
  if (v === "active" || v === "in_progress") return "In progress";
  if (v === "ended" || v === "completed") return "Ended";
  return s ?? "Pending";
}

function statusStyle(s?: string): string {
  const v = (s ?? "").toLowerCase();
  if (v === "active" || v === "in_progress") return "bg-primary-100 text-primary-900";
  if (v === "accepted") return "bg-secondary-100 text-secondary-900";
  if (v === "ended" || v === "completed") return "bg-foreground-200 text-foreground-700";
  return "bg-accent-100 text-accent-900";
}

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const TOPICS = [
  "Behavioral interview",
  "System design",
  "Coding (algorithms)",
  "Product sense",
  "Salary negotiation",
];

const ROLES = ["Interviewer", "Candidate", "Either"];

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [role, setRole] = useState(ROLES[2]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await createPractice({ topic, role });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create session.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-background-50 border border-background-200 rounded-2xl overflow-hidden animate-fade-in-up">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
            <h3 className="font-heading text-lg font-medium text-foreground-950">
              New practice session
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
              aria-label="Close"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <span className="block text-xs font-medium text-foreground-600 mb-2">Topic</span>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTopic(t)}
                    className={`px-3 py-1.5 text-sm rounded-full border cursor-pointer whitespace-nowrap ${
                      topic === t
                        ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                        : "bg-background-100 text-foreground-700 border-background-300 hover:bg-background-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="block text-xs font-medium text-foreground-600 mb-2">Your role</span>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={`px-3 py-1.5 text-sm rounded-full border cursor-pointer whitespace-nowrap ${
                      role === r
                        ? "bg-secondary-500 text-background-50 dark:text-foreground-950 border-secondary-500"
                        : "bg-background-100 text-foreground-700 border-background-300 hover:bg-background-200"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 text-sm text-accent-900 bg-accent-100 rounded-lg px-3 py-2.5">
                <i className="ri-error-warning-line mt-0.5"></i>
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-background-200 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="inline-flex items-center text-sm font-semibold text-foreground-600 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {saving ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Creating…
                </>
              ) : (
                "Create session"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Practice() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [room, setRoom] = useState<PracticeSession | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setSessions((await listPractice()) ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load practice sessions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAccept(s: PracticeSession) {
    setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "accepted" } : x)));
    try {
      await acceptPractice(s.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept session.");
    }
  }

  const active = sessions.filter((s) => {
    const v = (s.status ?? "").toLowerCase();
    return v === "active" || v === "in_progress" || v === "accepted";
  });
  const pending = sessions.filter((s) => (s.status ?? "").toLowerCase() === "pending");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Peer video practice"
        subtitle="Practice interviews over video with a peer, question by question."
        icon="ri-video-chat-line"
        tone="secondary"
        image="https://readdy.ai/api/search-image?query=Warm%20editorial%20photograph%20of%20two%20people%20doing%20a%20friendly%20mock%20interview%20over%20a%20video%20call%20on%20a%20laptop%20at%20a%20tidy%20sunlit%20desk%20with%20a%20notebook%20and%20coffee%2C%20collaborative%20encouraging%20mood%2C%20warm%20neutral%20cream%20tones%20with%20muted%20emerald%20and%20coral%20colour%20accents%2C%20soft%20natural%20window%20light%2C%20shallow%20depth%20of%20field%2C%20premium%20editorial%20magazine%20aesthetic%2C%20darker%20left%20side%20for%20overlay%20text%2C%20high%20detail&width=1600&height=460&seq=header-practice-01&orientation=landscape"
        imageAlt="Two people practising an interview together over a video call"
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-video-add-line"></i>
            New session
          </button>
        }
      />

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm animate-fade-in-up">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{error}</div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading sessions…
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 border-dashed py-16 text-center animate-fade-in-up">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
            <i className="ri-video-line text-xl"></i>
          </div>
          <p className="text-sm font-medium text-foreground-900 mt-3">No practice sessions yet</p>
          <p className="text-sm text-foreground-500 mt-1">
            Create a session and find a peer to practice with.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <section className="animate-fade-in-up">
              <h2 className="font-heading text-base font-medium text-foreground-950 mb-3">
                Incoming requests
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {pending.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-2xl bg-background-100/60 border border-background-200 p-5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-secondary-500 text-background-50 text-sm font-semibold">
                        {initials(s.peer_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground-950 truncate">
                          {s.peer_name ?? "Peer"}
                        </div>
                        <div className="text-xs text-foreground-500 truncate">{s.topic}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleAccept(s)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-2 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-check-line"></i>
                        Accept
                      </button>
                      <button className="inline-flex items-center justify-center text-sm font-semibold text-foreground-600 bg-background-100 border border-background-300 px-3 py-2 rounded-md hover:bg-background-200 cursor-pointer whitespace-nowrap">
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="animate-fade-in-up" style={{ animationDelay: "0.08s" }}>
            <h2 className="font-heading text-base font-medium text-foreground-950 mb-3">
              Your sessions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {active.length === 0 && (
                <div className="col-span-full text-sm text-foreground-500">
                  No active sessions right now.
                </div>
              )}
              {active.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl bg-background-100/60 border border-background-200 p-5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-secondary-500 text-background-50 text-sm font-semibold">
                        {initials(s.peer_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground-950 truncate">
                          {s.peer_name ?? "Peer"}
                        </div>
                        <div className="text-xs text-foreground-500 truncate">{s.topic}</div>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${statusStyle(s.status)}`}
                    >
                      {statusLabel(s.status)}
                    </span>
                  </div>
                  <button
                    onClick={() => setRoom(s)}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-video-line"></i>
                    Join room
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {room && <PracticeRoom session={room} onClose={() => setRoom(null)} />}
    </div>
  );
}