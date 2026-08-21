import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { endPractice, postSignal, getSignals, getPracticeQuestions, getIceServers, type PracticeSession, type IceServer } from "@/lib/practice";

// Fallback if the ICE endpoint is unreachable (public STUN only).
const FALLBACK_ICE: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

/** A live 1:1 WebRTC practice interview. Signalling rides over REST polling. */
export default function PeerCall({ session, onEnd }: { session: PracticeSession; onEnd: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const myId = user?.id ?? "";

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const [connState, setConnState] = useState("connecting");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [questions, setQuestions] = useState<string[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [interviewerId, setInterviewerId] = useState(session.host_id);

  const iAmInterviewer = interviewerId === myId;

  const sendControl = useCallback((patch: { qIndex?: number; interviewerId?: string }) => {
    const next = { qIndex: patch.qIndex ?? qIndex, interviewerId: patch.interviewerId ?? interviewerId };
    if (patch.qIndex !== undefined) setQIndex(patch.qIndex);
    if (patch.interviewerId !== undefined) setInterviewerId(patch.interviewerId);
    postSignal(session.id, "control", JSON.stringify(next)).catch(() => {});
  }, [qIndex, interviewerId, session.id]);

  const hangUp = useCallback(async () => {
    try { await endPractice(session.id); } catch { /* */ }
    onEnd();
  }, [session.id, onEnd]);

  useEffect(() => {
    let alive = true;
    getPracticeQuestions(session.id).then((r) => alive && setQuestions(r.questions)).catch(() => {});

    (async () => {
      // Fetch ICE servers (public STUN + a TURN relay when configured).
      let iceServers = FALLBACK_ICE;
      try { iceServers = (await getIceServers()).ice_servers; } catch { /* use fallback */ }
      if (!alive) return;

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      pc.onicecandidate = (e) => { if (e.candidate) postSignal(session.id, "ice", JSON.stringify(e.candidate)).catch(() => {}); };
      pc.ontrack = (e) => { if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0]; };
      pc.onconnectionstatechange = () => setConnState(pc.connectionState);

      // local media (degrade gracefully if camera/mic denied)
      try {
        localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        try { localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true }); setCamOn(false); }
        catch { toast.push("No camera/mic — you'll still see and hear your partner.", "info"); }
      }
      if (!alive) return;
      const stream = localStream.current;
      if (stream) {
        if (localVideo.current) localVideo.current.srcObject = stream;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      }
      // The host is the offerer.
      if (session.i_am_host) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        postSignal(session.id, "offer", JSON.stringify(offer)).catch(() => {});
      }
      // Poll the signalling mailbox.
      poll.current = setInterval(async () => {
        let sigs;
        try { sigs = await getSignals(session.id); } catch { return; }
        for (const s of sigs) {
          try {
            if (s.kind === "offer") {
              await pc.setRemoteDescription(JSON.parse(s.payload));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              postSignal(session.id, "answer", JSON.stringify(answer)).catch(() => {});
            } else if (s.kind === "answer") {
              await pc.setRemoteDescription(JSON.parse(s.payload));
            } else if (s.kind === "ice") {
              await pc.addIceCandidate(JSON.parse(s.payload));
            } else if (s.kind === "control") {
              const c = JSON.parse(s.payload);
              if (typeof c.qIndex === "number") setQIndex(c.qIndex);
              if (typeof c.interviewerId === "string") setInterviewerId(c.interviewerId);
            } else if (s.kind === "bye") {
              onEnd();
            }
          } catch { /* ignore malformed / duplicate ICE */ }
        }
      }, 1200);
    })();

    return () => {
      alive = false;
      if (poll.current) clearInterval(poll.current);
      localStream.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  function toggleMic() {
    const t = localStream.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
  }
  function toggleCam() {
    const t = localStream.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
  }

  const connLabel = connState === "connected" ? "Connected" : connState === "failed" ? "Connection failed" : "Connecting…";

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* video stage */}
      <div className="lg:col-span-2 space-y-3">
        <div className="relative rounded-2xl overflow-hidden border border-background-200 aspect-video bg-secondary-950">
          <video ref={remoteVideo} autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute left-3 bottom-3 bg-black/45 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm font-semibold text-white">{session.other_name}</div>
          <div className="absolute top-3 left-3 flex items-center gap-2 text-[11px] font-mono text-white/90">
            <span className={`w-2 h-2 rounded-full ${connState === "connected" ? "bg-primary-400" : "bg-yellow-400 animate-pulse"}`}></span>{connLabel}
          </div>
          {/* self PIP */}
          <div className="absolute right-3 bottom-3 w-28 md:w-40 aspect-video rounded-lg overflow-hidden border border-white/20 bg-secondary-900">
            <video ref={localVideo} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            {!camOn && <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/60">camera off</div>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-background-100/60 border border-background-200 p-2">
          <button onClick={toggleMic} className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md cursor-pointer ${micOn ? "bg-background-50 border border-background-200 text-foreground-700" : "bg-accent-100 text-accent-900"}`}><i className={micOn ? "ri-mic-line" : "ri-mic-off-line"}></i><span className="hidden sm:inline">{micOn ? "Mute" : "Unmute"}</span></button>
          <button onClick={toggleCam} className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md cursor-pointer ${camOn ? "bg-background-50 border border-background-200 text-foreground-700" : "bg-accent-100 text-accent-900"}`}><i className={camOn ? "ri-camera-line" : "ri-camera-off-line"}></i><span className="hidden sm:inline">Camera</span></button>
          <button onClick={hangUp} className="ml-auto inline-flex items-center gap-2 text-sm font-semibold bg-accent-600 text-white px-4 py-2 rounded-md hover:bg-accent-700 cursor-pointer"><i className="ri-phone-fill rotate-[135deg]"></i>Leave</button>
        </div>
      </div>

      {/* shared question panel */}
      <div className="space-y-3">
        <div className="rounded-2xl bg-background-100/60 border border-background-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${iAmInterviewer ? "bg-primary-100 text-primary-800" : "bg-accent-100 text-accent-900"}`}>{iAmInterviewer ? "You're interviewing" : "You're answering"}</span>
            <button onClick={() => sendControl({ interviewerId: iAmInterviewer ? (session.i_am_host ? session.guest_id : session.host_id) : myId })} className="text-xs text-primary-700 hover:text-primary-900 cursor-pointer">Swap roles</button>
          </div>
          <p className="text-[11px] uppercase tracking-wide text-foreground-400">Question {questions.length ? qIndex + 1 : 0} of {questions.length}</p>
          <p className="text-sm text-foreground-900 mt-1 min-h-[3rem]">{questions[qIndex] ?? "Loading shared questions…"}</p>
          <div className="flex items-center justify-between mt-3">
            <button onClick={() => sendControl({ qIndex: Math.max(0, qIndex - 1) })} disabled={qIndex === 0} className="text-sm text-foreground-600 hover:text-foreground-900 cursor-pointer disabled:opacity-40">← Prev</button>
            <button onClick={() => sendControl({ qIndex: Math.min(questions.length - 1, qIndex + 1) })} disabled={qIndex >= questions.length - 1} className="text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer disabled:opacity-40">Next →</button>
          </div>
        </div>
        <p className="text-xs text-foreground-500 px-1">The interviewer asks the question; the other answers. Both of you see the same prompt and can advance it — swap roles halfway to practise both sides.</p>
      </div>
    </div>
  );
}
