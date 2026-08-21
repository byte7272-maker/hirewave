import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import {
  createInvite, inviteByEmail, acceptInvite, listThreads, getConversation, sendMessage,
  type Thread, type Message,
} from "@/lib/social";

export default function Messages() {
  const toast = useToast();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [conv, setConv] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [invite, setInvite] = useState<string | null>(null);
  const [acceptCode, setAcceptCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reloadThreads = useCallback(() => { listThreads().then(setThreads).catch(() => {}); }, []);
  useEffect(() => { reloadThreads(); }, [reloadThreads]);

  const openThread = useCallback(async (t: Thread) => {
    setActive(t);
    try { setConv(await getConversation(t.user_id)); reloadThreads(); } catch { /* */ }
  }, [reloadThreads]);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [conv]);

  async function newInvite() {
    try {
      const inv = await createInvite();
      setInvite(inv.code);
      const link = `${location.origin}/dashboard/messages?invite=${inv.code}`;
      navigator.clipboard?.writeText(link).then(() => toast.push("Invite link copied — share it to connect.", "success")).catch(() => {});
    } catch { toast.push("Couldn't create an invite.", "error"); }
  }

  async function emailInvite() {
    if (!inviteEmail.includes("@")) { toast.push("Enter a valid email.", "error"); return; }
    try {
      const r = await inviteByEmail(inviteEmail.trim());
      setInvite(r.code);
      setInviteEmail("");
      toast.push(r.emailed ? `Invite emailed to them.` : `Invite created — email isn't configured, so share the code below.`, "success");
    } catch { toast.push("Couldn't create the invite.", "error"); }
  }

  const accept = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const c = await acceptInvite(code.trim());
      toast.push(`Connected with ${c.name}.`, "success");
      setAcceptCode("");
      reloadThreads();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Couldn't accept that invite.", "error");
    } finally { setBusy(false); }
  }, [toast, reloadThreads]);

  // Accept an invite link (?invite=CODE).
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("invite");
    if (code) { accept(code); window.history.replaceState({}, "", "/dashboard/messages"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    if (!active || !body.trim()) return;
    setBusy(true);
    try {
      const m = await sendMessage(active.user_id, body.trim());
      setConv((c) => [...c, m]);
      setBody("");
      reloadThreads();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Couldn't send.", "error");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <section className="animate-fade-in-up flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Messages</h1>
          <p className="text-sm text-foreground-600 mt-1">Connect with other job seekers and share roles you find.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={acceptCode} onChange={(e) => setAcceptCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && accept(acceptCode)} placeholder="Enter an invite code" className="h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          <button onClick={() => accept(acceptCode)} disabled={busy || !acceptCode.trim()} className="text-sm font-medium bg-background-50 border border-background-200 text-foreground-700 px-3 py-2 rounded-md hover:bg-background-100 cursor-pointer disabled:opacity-60">Join</button>
          <button onClick={newInvite} className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer"><i className="ri-link"></i>Invite link</button>
        </div>
      </section>

      <section className="rounded-xl bg-background-100/60 border border-background-200 px-4 py-3 flex items-center gap-2 flex-wrap animate-fade-in-up">
        <span className="text-xs text-foreground-500">Invite by email:</span>
        <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && emailInvite()} type="email" placeholder="friend@example.com" className="h-9 px-3 rounded-lg bg-background-50 border border-background-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-primary-400" />
        <button onClick={emailInvite} disabled={!inviteEmail.includes("@")} className="inline-flex items-center gap-2 text-sm font-medium bg-background-50 border border-background-200 text-foreground-700 px-3 py-1.5 rounded-md hover:bg-background-100 cursor-pointer disabled:opacity-60"><i className="ri-mail-send-line"></i>Send invite</button>
      </section>

      {invite && (
        <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-2 text-sm text-primary-900 flex items-center gap-2 flex-wrap animate-fade-in-up">
          <i className="ri-links-line"></i> Share this code: <code className="font-mono font-semibold">{invite}</code>
          <span className="text-xs text-primary-700">(link copied to your clipboard)</span>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 animate-fade-in-up">
        {/* threads */}
        <div className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-background-200 text-xs font-semibold text-foreground-700">Connections</div>
          {threads.length === 0 ? (
            <p className="px-4 py-6 text-sm text-foreground-500">No connections yet. Invite someone, or enter their code.</p>
          ) : (
            <ul className="divide-y divide-background-200 max-h-[60vh] overflow-y-auto">
              {threads.map((t) => (
                <li key={t.user_id}>
                  <button onClick={() => openThread(t)} className={`w-full text-left px-4 py-3 hover:bg-background-100 cursor-pointer ${active?.user_id === t.user_id ? "bg-background-100" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground-950 truncate">{t.name}</span>
                      {t.unread > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-500 text-background-50">{t.unread}</span>}
                    </div>
                    {t.last_message && <p className="text-xs text-foreground-500 truncate mt-0.5">{t.last_message}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* conversation */}
        <div className="md:col-span-2 rounded-2xl bg-background-100/60 border border-background-200 flex flex-col min-h-[60vh]">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-foreground-500">Select a connection to start chatting.</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-background-200 text-sm font-semibold text-foreground-950">{active.name}</div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                {conv.map((m) => (
                  <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-primary-500 text-background-50 dark:text-foreground-950" : "bg-background-200 text-foreground-900"}`}>
                      {m.body && <p>{m.body}</p>}
                      {m.shared_job && (
                        <div className={`mt-1 rounded-lg px-2 py-1.5 text-xs ${m.mine ? "bg-primary-600/60" : "bg-background-50 border border-background-300 text-foreground-800"}`}>
                          <i className="ri-briefcase-line"></i> {m.shared_job.title} · {m.shared_job.company}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {conv.length === 0 && <p className="text-sm text-foreground-400 text-center mt-6">No messages yet — say hello.</p>}
              </div>
              <div className="p-3 border-t border-background-200 flex items-center gap-2">
                <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message…" className="flex-1 h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                <button onClick={send} disabled={busy || !body.trim()} className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 cursor-pointer disabled:opacity-60"><i className="ri-send-plane-fill"></i></button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
