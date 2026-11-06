import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  endPractice,
  getIceServers,
  listPracticeQuestions,
  listSignals,
  sendSignal,
  type PracticeQuestion,
  type PracticeSession,
} from "@/lib/practice";

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface PracticeRoomProps {
  session: PracticeSession;
  onClose: () => void;
}

export default function PracticeRoom({ session, onClose }: PracticeRoomProps) {
  const [status, setStatus] = useState<"connecting" | "connected" | "ended">("connecting");
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [error, setError] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  async function stopCamera() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  }

  async function startCamera() {
    if (!camOn) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: micOn });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch {
      // camera unavailable — fall back to avatar placeholder
    }
  }

  useEffect(() => {
    let cancelled = false;
    let signalTimer: ReturnType<typeof setInterval> | null = null;

    async function connect() {
      try {
        await getIceServers();
        await startCamera();
        const q = (await listPracticeQuestions(session.id)) ?? [];
        if (!cancelled) {
          setQuestions(q);
          setStatus("connected");
        }
        // join signal (best-effort)
        sendSignal(session.id, { type: "join" }).catch(() => {});
        signalTimer = setInterval(() => {
          listSignals(session.id).catch(() => {});
        }, 5000);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not connect to session.");
          setStatus("ended");
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (signalTimer) clearInterval(signalTimer);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  async function handleEnd() {
    setStatus("ended");
    stopCamera();
    try {
      await endPractice(session.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not end session.");
    }
    onClose();
  }

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
  }

  function toggleCam() {
    const next = !camOn;
    setCamOn(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
  }

  const peerName = session.peer_name ?? "Your peer";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl bg-background-50 border border-background-200 rounded-2xl overflow-hidden animate-fade-in-up">
          <div className="relative overflow-hidden border-b border-foreground-950/10">
            <img
              src="https://readdy.ai/api/search-image?query=Warm%20editorial%20photograph%20of%20a%20friendly%20video%20call%20scene%20on%20a%20laptop%20at%20a%20sunlit%20desk%20with%20a%20headset%20and%20notebook%2C%20collaborative%20encouraging%20mood%2C%20warm%20neutral%20cream%20tones%20with%20muted%20emerald%20and%20coral%20colour%20accents%2C%20soft%20natural%20window%20light%2C%20shallow%20depth%20of%20field%2C%20premium%20editorial%20magazine%20aesthetic%2C%20darker%20left%20side%20for%20overlay%20text%2C%20high%20detail&width=1600&height=360&seq=room-practice-01&orientation=landscape"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-foreground-950/92 via-foreground-950/72 to-foreground-950/45"></div>
            <div className="relative px-5 py-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-heading text-base font-medium text-background-50 truncate">
                  Peer practice — {session.topic ?? "Interview"}
                </h3>
                <p className="text-xs text-background-100/85 mt-0.5">
                  {session.role ?? "Mock interview"}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    status === "connected"
                      ? "bg-primary-100 text-primary-900"
                      : status === "connecting"
                      ? "bg-secondary-100 text-secondary-900"
                      : "bg-foreground-200 text-foreground-700"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      status === "connected"
                        ? "bg-primary-500"
                        : status === "connecting"
                        ? "bg-secondary-500 animate-pulse"
                        : "bg-foreground-500"
                    }`}
                  ></span>
                  {status === "connected"
                    ? "Connected"
                    : status === "connecting"
                    ? "Connecting…"
                    : "Ended"}
                </span>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-background-50/90 hover:bg-background-50/20 cursor-pointer"
                  aria-label="Close"
                >
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3">
            <div className="lg:col-span-2 p-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="relative aspect-video rounded-xl bg-background-100 border border-background-200 overflow-hidden">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${camOn ? "" : "hidden"}`}
                  ></video>
                  {!camOn && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-foreground-500 text-sm">Camera off</span>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-black/50 text-background-50 text-xs">
                    You
                  </div>
                </div>
                <div className="relative aspect-video rounded-xl bg-background-100 border border-background-200 overflow-hidden flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-full bg-secondary-500 text-background-50 text-xl font-semibold">
                      {initials(peerName)}
                    </div>
                    <p className="text-sm font-medium text-foreground-900 mt-2">{peerName}</p>
                    <p className="text-xs text-foreground-500">
                      {status === "connected" ? "In the room" : "Waiting…"}
                    </p>
                  </div>
                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-black/50 text-background-50 text-xs">
                    Peer
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={toggleMic}
                  className={`w-12 h-12 flex items-center justify-center rounded-full cursor-pointer ${
                    micOn
                      ? "bg-background-100 border border-background-300 text-foreground-900 hover:bg-background-200"
                      : "bg-accent-500 text-background-50"
                  }`}
                  aria-label="Toggle microphone"
                >
                  <i className={micOn ? "ri-mic-line text-xl" : "ri-mic-off-line text-xl"}></i>
                </button>
                <button
                  onClick={toggleCam}
                  className={`w-12 h-12 flex items-center justify-center rounded-full cursor-pointer ${
                    camOn
                      ? "bg-background-100 border border-background-300 text-foreground-900 hover:bg-background-200"
                      : "bg-accent-500 text-background-50"
                  }`}
                  aria-label="Toggle camera"
                >
                  <i
                    className={camOn ? "ri-video-line text-xl" : "ri-video-off-line text-xl"}
                  ></i>
                </button>
                <button
                  onClick={handleEnd}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-accent-500 text-background-50 hover:bg-accent-600 cursor-pointer"
                  aria-label="End session"
                >
                  <i className="ri-phone-line text-xl"></i>
                </button>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 text-sm text-accent-900 bg-accent-100 rounded-lg px-3 py-2.5">
                  <i className="ri-error-warning-line mt-0.5"></i>
                  <span>{error}</span>
                </div>
              )}
            </div>

            <aside className="border-t lg:border-t-0 lg:border-l border-background-200 p-5">
              <h4 className="font-heading text-sm font-semibold text-foreground-950">
                Practice questions
              </h4>
              <p className="text-xs text-foreground-500 mt-0.5">
                Work through these with your peer.
              </p>
              <div className="mt-4 space-y-3">
                {questions.length === 0 ? (
                  <p className="text-sm text-foreground-500">
                    {status === "connecting" ? "Loading questions…" : "No questions available."}
                  </p>
                ) : (
                  questions.map((q, i) => (
                    <div
                      key={q.id ?? i}
                      className="rounded-xl bg-background-100/60 border border-background-200 p-3"
                    >
                      <span className="text-[11px] font-semibold text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full">
                        Q{i + 1}
                      </span>
                      <p className="text-sm text-foreground-800 mt-2">
                        {q.question ?? q.body ?? q.text ?? ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}