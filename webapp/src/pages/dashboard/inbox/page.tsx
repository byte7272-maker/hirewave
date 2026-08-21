import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/lib/toast";
import { emitDataChanged } from "@/lib/backend";
import { getInboxAddress, listInbox, markInboxRead, deleteInboxMessage, syncGmail, type InboxMessage } from "@/lib/inbox";

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Inbox() {
  const toast = useToast();
  const [address, setAddress] = useState("");
  const [items, setItems] = useState<InboxMessage[] | null>(null);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(() => { listInbox().then(setItems).catch(() => setItems([])); }, []);
  useEffect(() => {
    getInboxAddress().then((r) => setAddress(r.address)).catch(() => {});
    reload();
  }, [reload]);

  function copy() {
    navigator.clipboard?.writeText(address).then(() => toast.push("Forwarding address copied.", "success")).catch(() => {});
  }
  async function open(m: InboxMessage) {
    if (!m.is_read) { try { await markInboxRead(m.id); setItems((xs) => xs?.map((x) => x.id === m.id ? { ...x, is_read: true } : x) ?? xs); } catch { /* */ } }
  }
  async function remove(id: string) {
    try { await deleteInboxMessage(id); setItems((xs) => xs?.filter((x) => x.id !== id) ?? xs); emitDataChanged(); } catch { /* */ }
  }
  async function gmail() {
    setSyncing(true);
    try {
      const r = await syncGmail();
      reload(); emitDataChanged();
      toast.push(`Pulled ${r.fetched} alert(s) from Gmail — ${r.ingested} new role(s).`, "success");
    } catch {
      toast.push("Couldn't sync Gmail — connect it under Integrations first.", "error");
    } finally { setSyncing(false); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="animate-fade-in-up flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Inbox</h1>
          <p className="text-sm text-foreground-600 mt-1">Forward your LinkedIn / Indeed / Glassdoor job alerts here — new roles land in your matches automatically.</p>
        </div>
        <button onClick={gmail} disabled={syncing} className="inline-flex items-center gap-2 text-sm font-semibold bg-background-50 border border-background-300 text-foreground-800 px-4 py-2.5 rounded-md hover:bg-background-100 cursor-pointer disabled:opacity-60 whitespace-nowrap">
          <i className="ri-google-fill text-[#ea4335]"></i>{syncing ? "Syncing…" : "Sync Gmail"}
        </button>
      </section>

      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up">
        <span className="block text-xs font-medium text-foreground-600 mb-1.5">Your personal forwarding address</span>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-sm font-mono px-3 py-2 rounded-lg bg-background-50 border border-background-200 text-foreground-900 break-all flex-1 min-w-[240px]">{address || "…"}</code>
          <button onClick={copy} disabled={!address} className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">
            <i className="ri-file-copy-line"></i>Copy
          </button>
        </div>
        <p className="text-xs text-foreground-400 mt-2">Set a forwarding rule in your email (or forward alerts manually). We only read job-alert emails you send here.</p>
      </section>

      <section className="animate-fade-in-up">
        {items === null ? (
          <div className="py-12 text-center text-foreground-500"><i className="ri-loader-4-line text-2xl animate-spin"></i></div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-14 text-center">
            <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl bg-background-200 text-foreground-500 mb-3"><i className="ri-mail-line text-xl"></i></div>
            <p className="text-sm text-foreground-600">No forwarded emails yet.</p>
            <p className="text-xs text-foreground-400 mt-1">Forward a job alert to the address above, or upload one from Job matches.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((m) => (
              <div key={m.id} onClick={() => open(m)} className={`rounded-xl border px-4 py-3 cursor-pointer transition-colors ${m.is_read ? "bg-background-50 border-background-200" : "bg-background-100 border-primary-200"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {!m.is_read && <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />}
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-background-200 text-foreground-600 capitalize">{m.source || "email"}</span>
                      <strong className="text-sm text-foreground-950 truncate">{m.subject}</strong>
                    </div>
                    <p className="text-xs text-foreground-600 mt-1 truncate">{m.snippet}</p>
                    <p className="text-[11px] text-foreground-400 mt-1">{m.sender} · {ago(m.received_at)} · <span className="text-primary-700">{m.ingested} role{m.ingested === 1 ? "" : "s"} added</span></p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); remove(m.id); }} className="text-xs text-accent-700 hover:text-accent-900 cursor-pointer flex-shrink-0">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
