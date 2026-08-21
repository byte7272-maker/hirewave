"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { PageHeader } from "@/components/ui";
import type { Integration } from "@/lib/types";

const PROVIDERS = [
  { id: "linkedin", label: "LinkedIn", use: "Profile import & Easy Apply" },
  { id: "gmail", label: "Gmail", use: "Track application emails" },
  { id: "google_drive", label: "Google Drive", use: "Store generated resumes" },
  { id: "indeed", label: "Indeed", use: "Job ingestion & Indeed Apply" },
  { id: "greenhouse", label: "Greenhouse", use: "ATS ingestion & apply" },
  { id: "workday", label: "Workday", use: "ATS ingestion & apply" },
];

export default function IntegrationsPage() {
  const conns = useApi<Integration[]>("/api/v1/integrations");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const connected = new Map((conns.data ?? []).map((c) => [c.provider, c]));

  async function connect(provider: string) {
    setBusy(provider);
    try {
      const r = await api<{ authorization_url: string; state: string }>(
        `/api/v1/integrations/connect/${provider}`,
        { method: "POST" }
      );
      // Real OAuth would send the user to r.authorization_url. In this offline
      // build we complete the mock flow directly so the connection appears.
      const url = new URL(r.authorization_url);
      const redirect = url.searchParams.get("redirect_uri") ?? "";
      void redirect;
      await api(
        `/api/v1/integrations/callback/${provider}?code=demo-code&state=${encodeURIComponent(r.state)}`
      );
      toast.push(`Connected ${provider}.`, "success");
      conns.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Connect failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(provider: string) {
    setBusy(provider);
    try {
      await api(`/api/v1/integrations/${provider}`, { method: "DELETE" });
      toast.push(`Disconnected ${provider}.`, "info");
      conns.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Revoke failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Connect accounts via OAuth 2.0. You control access and can revoke anytime."
      />
      <div className="grid cols-2">
        {PROVIDERS.map((p) => {
          const conn = connected.get(p.id);
          return (
            <div key={p.id} className="card">
              <div className="row between">
                <h2 style={{ margin: 0 }}>{p.label}</h2>
                {conn ? (
                  <span className={`badge ${conn.expired ? "amber" : "green"}`}>
                    {conn.expired ? "Re-auth needed" : "Connected"}
                  </span>
                ) : (
                  <span className="badge">Not connected</span>
                )}
              </div>
              <p className="muted" style={{ margin: "8px 0 14px" }}>{p.use}</p>
              {conn ? (
                <button
                  className="btn danger sm"
                  onClick={() => revoke(p.id)}
                  disabled={busy === p.id}
                >
                  {busy === p.id ? <span className="spinner" /> : "Disconnect"}
                </button>
              ) : (
                <button
                  className="btn primary sm"
                  onClick={() => connect(p.id)}
                  disabled={busy === p.id}
                >
                  {busy === p.id ? <span className="spinner" /> : "Connect"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
