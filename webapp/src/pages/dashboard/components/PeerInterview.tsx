import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { listConnections, type ConnectionBrief } from "@/lib/social";
import { listPracticeSessions, invitePractice, acceptPractice, type PracticeSession } from "@/lib/practice";
import PeerCall from "@/pages/dashboard/components/PeerCall";

export default function PeerInterview() {
  const toast = useToast();
  const [connections, setConnections] = useState<ConnectionBrief[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [active, setActive] = useState<PracticeSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reloadSessions = useCallback(() => { listPracticeSessions().then(setSessions).catch(() => {}); }, []);
  useEffect(() => {
    listConnections().then(setConnections).catch(() => {});
    reloadSessions();
  }, [reloadSessions]);

  // While in the lobby, poll so the host sees when the guest accepts.
  useEffect(() => {
    if (active) return;
    const t = setInterval(reloadSessions, 3000);
    return () => clearInterval(t);
  }, [active, reloadSessions]);

  async function invite(c: ConnectionBrief) {
    setBusy(c.user_id);
    try {
      const s = await invitePractice(c.user_id);
      toast.push(`Invited ${c.name} — they'll get a notification.`, "success");
      reloadSessions();
      setActive(s); // host enters the room and waits
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Couldn't invite.", "error");
    } finally { setBusy(null); }
  }

  async function accept(s: PracticeSession) {
    setBusy(s.id);
    try {
      const active = await acceptPractice(s.id);
      setActive(active);
    } catch {
      toast.push("Couldn't join.", "error");
    } finally { setBusy(null); }
  }

  if (active) {
    return <PeerCall session={active} onEnd={() => { setActive(null); reloadSessions(); }} />;
  }

  const invitable = connections.filter((c) => !sessions.some((s) => (s.host_id === c.user_id || s.guest_id === c.user_id)));

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* pending sessions */}
      <div className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up">
        <h2 className="font-heading text-lg font-medium text-foreground-950 mb-1">Practice rooms</h2>
        <p className="text-xs text-foreground-500 mb-3">Live video practice with a peer — real people, taking turns as interviewer.</p>
        {sessions.length === 0 ? (
          <p className="text-sm text-foreground-500">No rooms yet. Invite a connection →</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-background-200 bg-background-50 px-3 py-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground-900">{s.other_name}</span>
                  <span className="block text-[11px] text-foreground-500">{s.status === "active" ? "In progress" : s.i_am_host ? "Waiting for them to join" : "Invited you to practise"}</span>
                </div>
                {s.i_am_host || s.status === "active" ? (
                  <button onClick={() => setActive(s)} className="text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 cursor-pointer">Join</button>
                ) : (
                  <button onClick={() => accept(s)} disabled={busy === s.id} className="text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">{busy === s.id ? "Joining…" : "Accept & join"}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* invite a connection */}
      <div className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up">
        <h2 className="font-heading text-lg font-medium text-foreground-950 mb-1">Invite a connection</h2>
        <p className="text-xs text-foreground-500 mb-3">You can practise with people you're connected to.</p>
        {connections.length === 0 ? (
          <p className="text-sm text-foreground-500">No connections yet. <Link to="/dashboard/messages" className="text-primary-700 hover:text-primary-900">Connect with people →</Link></p>
        ) : (
          <div className="space-y-2">
            {invitable.map((c) => (
              <div key={c.user_id} className="flex items-center justify-between gap-3 rounded-lg border border-background-200 bg-background-50 px-3 py-2">
                <span className="text-sm text-foreground-900 flex items-center gap-2"><i className="ri-user-line text-foreground-400"></i>{c.name}</span>
                <button onClick={() => invite(c)} disabled={busy === c.user_id} className="text-sm font-medium text-primary-700 hover:text-primary-900 cursor-pointer disabled:opacity-60">{busy === c.user_id ? "Inviting…" : "Invite to practise"}</button>
              </div>
            ))}
            {invitable.length === 0 && <p className="text-sm text-foreground-500">All your connections already have a room above.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
