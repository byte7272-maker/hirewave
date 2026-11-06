import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  acknowledgeFinding,
  enrollIdentifier,
  listFindings,
  listIdentifiers,
  runScan,
  verifyIdentifier,
  type Finding,
  type Identifier,
} from "@/lib/monitoring";

function severityStyle(s?: string): string {
  const v = (s ?? "").toLowerCase();
  if (v === "critical") return "bg-accent-500 text-background-50";
  if (v === "high") return "bg-accent-100 text-accent-900";
  if (v === "medium") return "bg-secondary-100 text-secondary-900";
  return "bg-foreground-200 text-foreground-700";
}

export default function Security() {
  const [identifiers, setIdentifiers] = useState<Identifier[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [type, setType] = useState("email");
  const [value, setValue] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [ids, finds] = await Promise.all([listIdentifiers(), listFindings()]);
      setIdentifiers(ids ?? []);
      setFindings(finds ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load security status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleEnroll() {
    const v = value.trim();
    if (!v) return;
    setEnrolling(true);
    setError("");
    setNotice("");
    try {
      await enrollIdentifier({ type, value: v });
      setValue("");
      setNotice("Identifier added — verify it below to start monitoring.");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add identifier.");
    } finally {
      setEnrolling(false);
    }
  }

  async function handleVerify(id: Identifier) {
    setIdentifiers((prev) => prev.map((x) => (x.id === id.id ? { ...x, verified: true } : x)));
    try {
      await verifyIdentifier(id.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify identifier.");
    }
  }

  async function handleScan() {
    setScanning(true);
    setError("");
    setNotice("");
    try {
      await runScan();
      setNotice("Scan complete — findings are up to date.");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not run scan.");
    } finally {
      setScanning(false);
    }
  }

  async function handleAcknowledge(f: Finding) {
    setFindings((prev) => prev.map((x) => (x.id === f.id ? { ...x, acknowledged: true } : x)));
    try {
      await acknowledgeFinding(f.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not acknowledge finding.");
    }
  }

  const openFindings = findings.filter((f) => !f.acknowledged);

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up">
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
          Security
        </h1>
        <p className="text-sm text-foreground-600 mt-1">
          Monitor your email and identifiers for data breaches and exposure.
        </p>
      </section>

      <section
        className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up"
        style={{ animationDelay: "0.06s" }}
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-accent-500 text-background-50 dark:text-foreground-950 text-xl flex-shrink-0">
            <i className="ri-shield-check-line"></i>
          </div>
          <div className="flex-1">
            <h2 className="font-heading text-base font-medium text-foreground-950">
              Add an identifier to monitor
            </h2>
            <p className="text-sm text-foreground-600 mt-0.5">
              We'll scan breach databases and alert you if your data appears.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1">
            {(
              [
                { id: "email", label: "Email", icon: "ri-mail-line" },
                { id: "phone", label: "Phone", icon: "ri-phone-line" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                  type === t.id
                    ? "bg-background-50 text-foreground-950"
                    : "text-foreground-600 hover:text-foreground-900"
                }`}
              >
                <i className={t.icon}></i>
                {t.label}
              </button>
            ))}
          </div>
          <input
            type={type === "email" ? "email" : "tel"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEnroll()}
            placeholder={type === "email" ? "you@example.com" : "+1 555 123 4567"}
            className="flex-1 h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
          />
          <button
            onClick={handleEnroll}
            disabled={enrolling || !value.trim()}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            {enrolling ? (
              <i className="ri-loader-4-line animate-spin"></i>
            ) : (
              <i className="ri-add-line"></i>
            )}
            Add
          </button>
        </div>
      </section>

      {notice && (
        <div className="flex items-start gap-2 text-sm text-primary-900 bg-primary-100 rounded-lg px-4 py-3 animate-fade-in-up">
          <i className="ri-information-line mt-0.5"></i>
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm animate-fade-in-up">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{error}</div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <section
          className="lg:col-span-1 animate-fade-in-up"
          style={{ animationDelay: "0.12s" }}
        >
          <div className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
              <h2 className="font-heading text-base font-medium text-foreground-950">
                Monitored identifiers
              </h2>
              <button
                onClick={handleScan}
                disabled={scanning || identifiers.length === 0}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {scanning ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  <i className="ri-radar-line"></i>
                )}
                {scanning ? "Scanning…" : "Scan now"}
              </button>
            </div>
            {loading ? (
              <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i>
                Loading…
              </div>
            ) : identifiers.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
                  <i className="ri-shield-line text-xl"></i>
                </div>
                <p className="text-sm text-foreground-500 mt-3">
                  No identifiers monitored yet.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-background-200">
                {identifiers.map((id) => (
                  <div key={id.id} className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 flex items-center justify-center rounded-full bg-secondary-500 text-background-50">
                        <i className={id.type === "phone" ? "ri-phone-line" : "ri-mail-line"}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground-950 truncate">
                          {id.value}
                        </div>
                        <div className="text-xs text-foreground-500 capitalize">{id.type}</div>
                      </div>
                      {id.verified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-900 bg-primary-100 px-2 py-1 rounded-full whitespace-nowrap">
                          <i className="ri-check-line"></i>
                          Verified
                        </span>
                      ) : (
                        <button
                          onClick={() => handleVerify(id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-accent-900 bg-accent-100 px-2 py-1 rounded-full hover:bg-accent-200 cursor-pointer whitespace-nowrap"
                        >
                          Verify
                        </button>
                      )}
                    </div>
                    {typeof id.breach_count === "number" && id.breach_count > 0 && (
                      <div className="mt-2 text-xs text-accent-900 bg-accent-100 rounded-lg px-3 py-1.5">
                        {id.breach_count} breach{id.breach_count > 1 ? "es" : ""} detected
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section
          className="lg:col-span-2 animate-fade-in-up"
          style={{ animationDelay: "0.18s" }}
        >
          <div className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
              <h2 className="font-heading text-base font-medium text-foreground-950">Findings</h2>
              <span className="text-xs text-foreground-500">
                {openFindings.length} open · {findings.length - openFindings.length} acknowledged
              </span>
            </div>
            {loading ? (
              <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i>
                Loading…
              </div>
            ) : findings.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
                  <i className="ri-shield-check-line text-xl"></i>
                </div>
                <p className="text-sm font-medium text-foreground-900 mt-3">No findings</p>
                <p className="text-sm text-foreground-500 mt-1">
                  Add identifiers and run a scan to check for exposure.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-background-200">
                {findings.map((f) => (
                  <div
                    key={f.id}
                    className={`px-5 py-4 ${f.acknowledged ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${severityStyle(f.severity)}`}
                          >
                            {f.severity ?? "low"}
                          </span>
                          <span className="text-sm font-semibold text-foreground-950">
                            {f.breach ?? "Data breach"}
                          </span>
                          {f.acknowledged && (
                            <span className="text-[11px] text-foreground-500 whitespace-nowrap">
                              Acknowledged
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-foreground-600 mt-1">
                          {f.identifier && (
                            <span className="text-foreground-700 font-medium">{f.identifier}</span>
                          )}{" "}
                          {f.source ? `appeared in ${f.source}` : "may be exposed"}
                        </div>
                        {Array.isArray(f.exposed_fields) && f.exposed_fields.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {f.exposed_fields.map((field) => (
                              <span
                                key={field}
                                className="text-[11px] text-foreground-600 bg-background-200 px-2 py-0.5 rounded-full"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="text-xs text-foreground-500 mt-2">
                          Detected {f.detected_at ?? ""}
                        </div>
                      </div>
                      {!f.acknowledged && (
                        <button
                          onClick={() => handleAcknowledge(f)}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground-700 bg-background-100 border border-background-300 px-3 py-2 rounded-md hover:bg-background-200 cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-check-double-line"></i>
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}