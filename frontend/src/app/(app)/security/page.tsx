"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { PageHeader, Empty } from "@/components/ui";
import { checkPasswordPwned, subtleAvailable } from "@/lib/pwned";
import type { ExposureFinding, MonitoredIdentifier } from "@/lib/types";

const SEV: Record<string, string> = { high: "red", medium: "amber", low: "blue" };

interface EnrollResp {
  identifier: MonitoredIdentifier;
  verification_code: string | null;
}

export default function SecurityPage() {
  const identifiers = useApi<MonitoredIdentifier[]>("/api/v1/monitoring/identifiers");
  const findings = useApi<ExposureFinding[]>("/api/v1/monitoring/findings");
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<{ id: string; code: string | null } | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [busy, setBusy] = useState(false);

  const [pw, setPw] = useState("");
  const [pwChecking, setPwChecking] = useState(false);
  const [pwResult, setPwResult] = useState<number | null>(null);

  async function checkPassword() {
    if (!pw) return;
    setPwChecking(true);
    setPwResult(null);
    try {
      const count = await checkPasswordPwned(pw);
      setPwResult(count);
      setPw(""); // never keep the password around
    } catch {
      toast.push("Password check failed.", "error");
    } finally {
      setPwChecking(false);
    }
  }

  async function enroll() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const r = await api<EnrollResp>("/api/v1/monitoring/identifiers", {
        method: "POST",
        body: { email },
      });
      setPending({ id: r.identifier.id, code: r.verification_code });
      setEmail("");
      identifiers.reload();
      toast.push("Enrolled — verify ownership to start monitoring.", "success");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Enroll failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!pending || !codeInput.trim()) return;
    setBusy(true);
    try {
      await api(`/api/v1/monitoring/identifiers/${pending.id}/verify`, {
        method: "POST",
        body: { code: codeInput.trim() },
      });
      setPending(null);
      setCodeInput("");
      identifiers.reload();
      toast.push("Verified — you can scan now.", "success");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Verification failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/v1/monitoring/identifiers/${id}`, { method: "DELETE" });
      identifiers.reload();
      findings.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed.", "error");
    }
  }

  async function scan() {
    setBusy(true);
    try {
      const r = await api<{ new_findings: number }>("/api/v1/monitoring/scan", { method: "POST" });
      findings.reload();
      toast.push(
        r.new_findings > 0
          ? `Found ${r.new_findings} new exposure${r.new_findings > 1 ? "s" : ""}.`
          : "No new exposures found.",
        r.new_findings > 0 ? "error" : "success"
      );
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Scan failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function acknowledge(id: string) {
    try {
      await api(`/api/v1/monitoring/findings/${id}/acknowledge`, { method: "PUT" });
      findings.reload();
    } catch {
      /* ignore */
    }
  }

  const verified = (identifiers.data ?? []).some((i) => i.verified);

  return (
    <>
      <PageHeader
        title="Security Monitoring"
        subtitle="Monitor your own email for exposure in known data breaches, and get alerted."
        action={
          verified ? (
            <button className="btn primary" onClick={scan} disabled={busy}>
              {busy ? <span className="spinner" /> : "Scan now"}
            </button>
          ) : undefined
        }
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Monitored emails</h2>
        <p className="faint" style={{ marginTop: 0 }}>
          You can only monitor addresses you verify you control. We store your email
          encrypted, and record only <em>what</em> leaked and <em>where</em> — never the
          leaked data itself. We use licensed breach data — we never crawl the dark web.
        </p>

        <div className="stack" style={{ margin: "12px 0" }}>
          {(identifiers.data ?? []).map((i) => (
            <div key={i.id} className="row between list-item" style={{ padding: "10px 14px" }}>
              <div className="row" style={{ gap: 10 }}>
                <span>🛡 {i.label}</span>
                <span className={`badge ${i.verified ? "green" : "amber"}`}>
                  {i.verified ? "Verified" : "Unverified"}
                </span>
              </div>
              <button className="btn ghost sm danger" onClick={() => remove(i.id)}>Remove</button>
            </div>
          ))}
        </div>

        {pending ? (
          <div className="card" style={{ background: "var(--bg)" }}>
            <label htmlFor="code">Enter the verification code</label>
            {pending.code && (
              <p className="faint" style={{ margin: "4px 0" }}>
                Dev mode — your code is <strong>{pending.code}</strong> (production emails this).
              </p>
            )}
            <div className="row" style={{ gap: 8 }}>
              <input
                id="code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="6-digit code"
                style={{ maxWidth: 200 }}
              />
              <button className="btn primary" onClick={verify} disabled={busy}>Verify</button>
              <button className="btn ghost" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ maxWidth: 320 }}
            />
            <button className="btn primary" onClick={enroll} disabled={busy || !email.trim()}>
              Add email
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Check a password</h2>
        <p className="faint" style={{ marginTop: 0 }}>
          See if a password has appeared in known breaches. Your password{" "}
          <strong>never leaves your device</strong> — only a short, anonymized fragment of its
          hash is sent (k-anonymity). Nothing is stored.
        </p>
        {subtleAvailable() ? (
          <>
            <div className="row" style={{ gap: 8 }}>
              <input
                type="password"
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  setPwResult(null);
                }}
                placeholder="Password to check"
                autoComplete="off"
                style={{ maxWidth: 320 }}
                onKeyDown={(e) => e.key === "Enter" && checkPassword()}
              />
              <button className="btn primary" onClick={checkPassword} disabled={pwChecking || !pw}>
                {pwChecking ? <span className="spinner" /> : "Check"}
              </button>
            </div>
            {pwResult !== null && (
              <div
                className={`toast ${pwResult > 0 ? "error" : "success"}`}
                role="status"
                style={{ marginTop: 12 }}
              >
                {pwResult > 0
                  ? `⚠ Found in ${pwResult.toLocaleString()} known breaches — do not use this password, and change it anywhere you've reused it.`
                  : "✓ Not found in any known breach. (Still, use a unique password per site.)"}
              </div>
            )}
          </>
        ) : (
          <p className="faint">
            This check needs a secure context (HTTPS or localhost) with Web Crypto support.
          </p>
        )}
      </div>

      <h2>Exposures</h2>
      {findings.loading ? (
        <span className="spinner" />
      ) : findings.data && findings.data.length > 0 ? (
        <div className="stack">
          {findings.data.map((f) => (
            <article key={f.id} className="list-item" style={{ opacity: f.acknowledged ? 0.6 : 1 }}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div>
                  <div className="row" style={{ gap: 10 }}>
                    <span className={`badge ${SEV[f.severity]}`}>{f.severity} risk</span>
                    <strong>{f.title}</strong>
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <span className="faint">Exposed:</span>
                    {f.exposed_data_types.map((t) => (
                      <span key={t} className="chip gap">{t}</span>
                    ))}
                  </div>
                  {f.breach_date && (
                    <div className="faint" style={{ marginTop: 6 }}>Breach date: {f.breach_date}</div>
                  )}
                </div>
                {!f.acknowledged && (
                  <button className="btn ghost sm" onClick={() => acknowledge(f.id)}>
                    Acknowledge
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty>
          <p>No exposures found.</p>
          <p className="faint">
            {verified ? "Run a scan to check for breaches." : "Add and verify an email to begin."}
          </p>
        </Empty>
      )}
    </>
  );
}
