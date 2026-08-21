import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/lib/toast";
import { listConnections, sendMessage, type ConnectionBrief } from "@/lib/social";

/** Share a job posting with one of your connections. */
export default function ShareJob({ jobId, title }: { jobId: string; title: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [conns, setConns] = useState<ConnectionBrief[] | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && conns === null) listConnections().then(setConns).catch(() => setConns([]));
  }

  async function share(c: ConnectionBrief) {
    setOpen(false); setBusy(true);
    try {
      await sendMessage(c.user_id, `Thought you might like this role: ${title}`, jobId);
      toast.push(`Shared with ${c.name}.`, "success");
    } catch {
      toast.push("Couldn't share.", "error");
    } finally { setBusy(false); }
  }

  return (
    <div className="relative">
      <button onClick={toggle} disabled={busy} className="w-9 h-9 flex items-center justify-center rounded-lg border border-background-300 text-foreground-400 hover:text-foreground-700 hover:border-foreground-300 cursor-pointer transition-colors disabled:opacity-50" aria-label="Share" title="Share with a connection">
        <i className="ri-share-forward-line"></i>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 w-52 rounded-lg bg-background-50 border border-background-200 shadow-lg overflow-hidden">
            {conns === null ? (
              <div className="px-3 py-2 text-xs text-foreground-500">Loading…</div>
            ) : conns.length === 0 ? (
              <Link to="/dashboard/messages" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-primary-700 hover:bg-background-100 cursor-pointer">Connect with people first →</Link>
            ) : (
              <>
                <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-foreground-400 border-b border-background-200">Share with</div>
                {conns.map((c) => (
                  <button key={c.user_id} onClick={() => share(c)} className="w-full text-left px-3 py-2 text-sm text-foreground-800 hover:bg-background-100 cursor-pointer flex items-center gap-2">
                    <i className="ri-user-line text-foreground-400"></i>{c.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
