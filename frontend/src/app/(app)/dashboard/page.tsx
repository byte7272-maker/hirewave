"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { PageHeader, StatusBadge } from "@/components/ui";
import type { Application, MatchOut, Notification, Resume } from "@/lib/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const matches = useApi<MatchOut[]>("/api/v1/jobs/matches?limit=5");
  const resumes = useApi<Resume[]>("/api/v1/resumes");
  const apps = useApi<Application[]>("/api/v1/applications");
  const notes = useApi<Notification[]>("/api/v1/notifications?unread_only=true");

  const stat = (v: number | undefined, loading: boolean) =>
    loading ? "—" : String(v ?? 0);

  return (
    <>
      <PageHeader
        title={`Hi${user?.full_name ? ", " + user.full_name.split(" ")[0] : ""} 👋`}
        subtitle="Your job-search command center."
      />

      <div className="grid cols-3" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="faint">Top matches</div>
          <div className="stat">{stat(matches.data?.length, matches.loading)}</div>
          <Link href="/matches" className="faint">View matches →</Link>
        </div>
        <div className="card">
          <div className="faint">Documents</div>
          <div className="stat">{stat(resumes.data?.length, resumes.loading)}</div>
          <div className="row" style={{ gap: 12 }}>
            <Link href="/documents" className="faint">Manage →</Link>
            <Link href="/documents" className="faint">⬆ Upload résumé</Link>
          </div>
        </div>
        <div className="card">
          <div className="faint">Applications</div>
          <div className="stat">{stat(apps.data?.length, apps.loading)}</div>
          <Link href="/applications" className="faint">Track applications →</Link>
        </div>
      </div>

      <div className="grid cols-2">
        <section className="card" aria-labelledby="dm">
          <div className="row between">
            <h2 id="dm">Best matches</h2>
            <Link href="/matches" className="faint">All →</Link>
          </div>
          {matches.loading ? (
            <span className="spinner" />
          ) : matches.data && matches.data.length > 0 ? (
            <div className="stack" style={{ marginTop: 8 }}>
              {matches.data.slice(0, 4).map((m) => (
                <div key={m.job_id} className="row between">
                  <div>
                    <strong>{m.title}</strong>
                    <div className="faint">{m.company}</div>
                  </div>
                  <span className="badge blue">{m.score.toFixed(0)}% match</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No matches yet. <Link href="/matches">Load some jobs →</Link></p>
          )}
        </section>

        <section className="card" aria-labelledby="dn">
          <div className="row between">
            <h2 id="dn">Unread notifications</h2>
            <Link href="/notifications" className="faint">All →</Link>
          </div>
          {notes.loading ? (
            <span className="spinner" />
          ) : notes.data && notes.data.length > 0 ? (
            <div className="stack" style={{ marginTop: 8 }}>
              {notes.data.slice(0, 5).map((n) => (
                <div key={n.id} className="row" style={{ gap: 8 }}>
                  <StatusBadge status={n.type.replace(/_/g, " ")} />
                  <span>{n.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">You&apos;re all caught up.</p>
          )}
        </section>
      </div>
    </>
  );
}
