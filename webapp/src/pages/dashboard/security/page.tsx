import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/lib/toast";
import { checkPasswordPwned, subtleAvailable } from "@/lib/pwned";

interface Identifier { id: string; label: string; verified: boolean }
interface Finding { id: string; title: string; exposed_data_types: string[]; breach_date: string; severity: "low" | "medium" | "high"; acknowledged: boolean }
interface EnrollResp { identifier: Identifier; verification_code: string | null }

const SEV: Record<string, string> = { high: "bg-accent-100 text-accent-900", medium: "bg-secondary-100 text-secondary-900", low: "bg-primary-100 text-primary-900" };

export default function Security() {
  const identifiers = useApi<Identifier[]>("/api/v1/monitoring/identifiers");
  const findings = useApi<Finding[]>("/api/v1/monitoring/findings");
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<{ id: string; code: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const [pw, setPw] = useState("");
  const [pwResult, setPwResult] = useState<number | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const verified = (identifiers.data ?? []).some((i) => i.verified);

  async function enroll() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const r = await api<EnrollResp>("/api/v1/monitoring/identifiers", { method: "POST", body: { email } });
      setPending({ id: r.identifier.id, code: r.verification_code });
      setEmail("");
      identifiers.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Enroll failed.", "error");
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!pending || !code.trim()) return;
    setBusy(true);
    try {
      await api(`/api/v1/monitoring/identifiers/${pending.id}/verify`, { method: "POST", body: { code: code.trim() } });
      setPending(null); setCode("");
      identifiers.reload();
      toast.push("Verified — you can scan now.", "success");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Verification failed.", "error");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try { await api(`/api/v1/monitoring/identifiers/${id}`, { method: "DELETE" }); identifiers.reload(); findings.reload(); } catch { /* */ }
  }
  async function scan() {
    setBusy(true);
    try {
      const r = await api<{ new_findings: number }>("/api/v1/monitoring/scan", { method: "POST" });
      findings.reload();
      toast.push(r.new_findings > 0 ? `Found ${r.new_findings} new exposure(s).` : "No new exposures found.", r.new_findings > 0 ? "error" : "success");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Scan failed.", "error");
    } finally {
      setBusy(false);
    }
  }
  async function acknowledge(id: string) {
    try { await api(`/api/v1/monitoring/findings/${id}/acknowledge`, { method: "PUT" }); findings.reload(); } catch { /* */ }
  }
  async function checkPw() {
    if (!pw) return;
    setPwBusy(true); setPwResult(null);
    try { const c = await checkPasswordPwned(pw); setPwResult(c); setPw(""); }
    catch { toast.push("Password check failed.", "error"); }
    finally { setPwBusy(false); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="animate-fade-in-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Security monitoring</h1>
          <p className="text-sm text-foreground-600 mt-1">Monitor your own email for exposure in known data breaches, and get alerted.</p>
        </div>
        {verified && (
          <button onClick={scan} disabled={busy} className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">
            {busy ? "Scanning…" : "Scan now"}
          </button>
        )}
      </section>

      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up">
        <h2 className="font-heading text-lg font-medium text-foreground-950">Monitored emails</h2>
        <p className="text-xs text-foreground-500 mt-1">You can only monitor addresses you verify you control. We store your email encrypted and use licensed breach data — we never crawl the dark web.</p>
        <div className="space-y-2 my-4">
          {(identifiers.data ?? []).map((i) => (
            <div key={i.id} className="flex items-center justify-between border border-background-200 rounded-lg px-3 py-2 bg-background-50">
              <span className="flex items-center gap-2 text-sm">🛡 {i.label}<span className={`text-[11px] px-2 py-0.5 rounded-full ${i.verified ? "bg-primary-100 text-primary-900" : "bg-secondary-100 text-secondary-900"}`}>{i.verified ? "Verified" : "Unverified"}</span></span>
              <button onClick={() => remove(i.id)} className="text-xs text-accent-700 hover:text-accent-900 cursor-pointer">Remove</button>
            </div>
          ))}
        </div>
        {pending ? (
          <div className="rounded-lg bg-background-50 border border-background-200 p-3">
            <p className="text-xs text-foreground-600 mb-1">Enter the verification code{pending.code ? <> — dev code <strong>{pending.code}</strong> (production emails this).</> : "."}</p>
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" className="h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm max-w-[180px] focus:outline-none focus:ring-2 focus:ring-primary-400" />
              <button onClick={verify} disabled={busy} className="text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">Verify</button>
              <button onClick={() => setPending(null)} className="text-sm text-foreground-600 px-3 cursor-pointer">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm max-w-[320px] flex-1 focus:outline-none focus:ring-2 focus:ring-primary-400" />
            <button onClick={enroll} disabled={busy || !email.trim()} className="text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">Add email</button>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up">
        <h2 className="font-heading text-lg font-medium text-foreground-950">Check a password</h2>
        <p className="text-xs text-foreground-500 mt-1">Your password <strong>never leaves your device</strong> — only a short, anonymized fragment of its hash is sent. Nothing is stored.</p>
        {subtleAvailable() ? (
          <>
            <div className="flex gap-2 mt-3">
              <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setPwResult(null); }} placeholder="Password to check" autoComplete="off" onKeyDown={(e) => e.key === "Enter" && checkPw()} className="h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm max-w-[320px] flex-1 focus:outline-none focus:ring-2 focus:ring-primary-400" />
              <button onClick={checkPw} disabled={pwBusy || !pw} className="text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">{pwBusy ? "…" : "Check"}</button>
            </div>
            {pwResult !== null && (
              <div className={`mt-3 text-sm rounded-lg px-3 py-2 ${pwResult > 0 ? "bg-accent-100 text-accent-900" : "bg-primary-100 text-primary-900"}`}>
                {pwResult > 0 ? `⚠ Found in ${pwResult.toLocaleString()} known breaches — do not use it, and change it anywhere you've reused it.` : "✓ Not found in any known breach. Still, use a unique password per site."}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-foreground-500 mt-2">This check needs a secure context (HTTPS or localhost) with Web Crypto support.</p>
        )}
      </section>

      <section className="animate-fade-in-up">
        <h2 className="font-heading text-lg font-medium text-foreground-950 mb-3">Exposures</h2>
        {(findings.data ?? []).length === 0 ? (
          <div className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-12 text-center">
            <p className="text-sm text-foreground-600">No exposures found.</p>
            <p className="text-xs text-foreground-400 mt-1">{verified ? "Run a scan to check for breaches." : "Add and verify an email to begin."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(findings.data ?? []).map((f) => (
              <div key={f.id} className="rounded-2xl bg-background-100/60 border border-background-200 p-4" style={{ opacity: f.acknowledged ? 0.6 : 1 }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${SEV[f.severity]}`}>{f.severity} risk</span>
                      <strong className="text-sm text-foreground-950">{f.title}</strong>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs text-foreground-500">Exposed:</span>
                      {f.exposed_data_types.map((t) => <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-background-200/70 text-foreground-600">{t}</span>)}
                    </div>
                    {f.breach_date && <p className="text-xs text-foreground-400 mt-1.5">Breach date: {f.breach_date}</p>}
                  </div>
                  {!f.acknowledged && <button onClick={() => acknowledge(f.id)} className="text-xs text-foreground-600 hover:text-foreground-900 cursor-pointer">Acknowledge</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
