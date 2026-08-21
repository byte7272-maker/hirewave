import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/lib/toast";

interface IntegrationDef {
  id: string; // backend provider id
  name: string;
  desc: string;
  icon: string;
  tone: string;
}

const INTEGRATIONS: IntegrationDef[] = [
  { id: "linkedin", name: "LinkedIn", desc: "Source jobs and auto-apply to postings", icon: "ri-linkedin-fill", tone: "bg-primary-500" },
  { id: "gmail", name: "Gmail", desc: "Send and track applications from your inbox", icon: "ri-mail-line", tone: "bg-accent-500" },
  { id: "google_drive", name: "Google Drive", desc: "Store generated résumés and cover letters", icon: "ri-folder-line", tone: "bg-secondary-500" },
  { id: "indeed", name: "Indeed", desc: "Sync job board searches into one queue", icon: "ri-search-line", tone: "bg-primary-500" },
  { id: "greenhouse", name: "Greenhouse", desc: "Import ATS postings and apply", icon: "ri-building-2-line", tone: "bg-accent-500" },
  { id: "workday", name: "Workday", desc: "Track applications across companies", icon: "ri-briefcase-line", tone: "bg-secondary-500" },
];

interface Connection {
  provider: string;
  expired: boolean;
}

export default function Integrations() {
  const conns = useApi<Connection[]>("/api/v1/integrations");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const connected = new Map((conns.data ?? []).map((c) => [c.provider, c]));

  async function connect(id: string) {
    setBusy(id);
    try {
      const r = await api<{ authorization_url: string; state: string }>(`/api/v1/integrations/connect/${id}`, { method: "POST" });
      // Mock OAuth: complete the callback inline so the connection appears.
      await api(`/api/v1/integrations/callback/${id}?code=demo-code&state=${encodeURIComponent(r.state)}`);
      toast.push(`Connected ${id.replace("_", " ")}.`, "success");
      conns.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Connect failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    setBusy(id);
    try {
      await api(`/api/v1/integrations/${id}`, { method: "DELETE" });
      toast.push(`Disconnected ${id.replace("_", " ")}.`, "info");
      conns.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Revoke failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up">
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Integrations</h1>
        <p className="text-sm text-foreground-600 mt-1">Connect the tools you use so Hirewave can find, verify, and apply for you. You can revoke access anytime.</p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
        {INTEGRATIONS.map((it) => {
          const conn = connected.get(it.id);
          const isConnected = !!conn;
          return (
            <div key={it.id} className="rounded-2xl bg-background-100/60 border border-background-200 p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className={`w-11 h-11 flex items-center justify-center rounded-xl text-background-50 dark:text-foreground-950 text-xl ${it.tone}`}>
                  <i className={it.icon}></i>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${isConnected ? (conn?.expired ? "bg-accent-100 text-accent-900" : "bg-primary-100 text-primary-900") : "bg-background-200 text-foreground-500"}`}>
                  {isConnected ? (conn?.expired ? "Re-auth needed" : "Connected") : "Not connected"}
                </span>
              </div>
              <h2 className="font-heading text-lg font-medium text-foreground-950 mt-4">{it.name}</h2>
              <p className="text-sm text-foreground-600 mt-1 flex-1">{it.desc}</p>
              <button
                onClick={() => (isConnected ? disconnect(it.id) : connect(it.id))}
                disabled={busy === it.id}
                className={`mt-4 h-10 inline-flex items-center justify-center gap-2 text-sm font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-60 ${
                  isConnected
                    ? "border border-background-300 text-foreground-700 hover:bg-background-100"
                    : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600"
                }`}
              >
                {busy === it.id ? "Working…" : isConnected ? "Disconnect" : "Connect"}
              </button>
              {it.id === "linkedin" && (
                <Link to="/dashboard/settings?import=linkedin" className="mt-2 h-9 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer">
                  <i className="ri-download-2-line"></i> Import profile
                </Link>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
