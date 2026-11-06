import { useState } from "react";

const VERIFIED = {
  label: "Verified posting",
  title: "Growth Product Manager",
  co: "Ramp",
  score: 97,
  verdict: "Looks legitimate",
  verdictColor: "text-primary-700 bg-primary-100",
  flags: [
    { ok: true, text: "Employer domain verified (ramp.com)" },
    { ok: true, text: "Salary band within market range" },
    { ok: true, text: "No off-platform contact requested" },
    { ok: true, text: "Posting age: 6 days · healthy" },
  ],
};

const FLAGGED = {
  label: "Flagged posting",
  title: "Remote UX Designer",
  co: "“TechCorp Hiring”",
  score: 22,
  verdict: "High scam risk",
  verdictColor: "text-accent-800 bg-accent-100",
  flags: [
    { ok: false, text: "Asks you to apply via WhatsApp" },
    { ok: false, text: "Salary 3× market rate — too good" },
    { ok: false, text: "Domain registered 4 days ago" },
    { ok: false, text: "Urgency language: “apply today only”" },
  ],
};

export default function VerificationMock() {
  const [mode, setMode] = useState<"verified" | "flagged">("verified");
  const data = mode === "verified" ? VERIFIED : FLAGGED;

  return (
    <div className="bg-background-50 border border-background-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
        </div>
        <span className="text-xs font-mono text-foreground-500">
          authenticity check
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-1 bg-background-100 rounded-full p-1 w-fit mb-4">
          {(["verified", "flagged"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                mode === m
                  ? "bg-background-50 text-foreground-950 shadow-sm"
                  : "text-foreground-600 hover:text-foreground-900"
              }`}
            >
              {m === "verified" ? "Verified" : "Flagged"}
            </button>
          ))}
        </div>

        <div className="p-4 rounded-xl border border-background-200 bg-background-100/60">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 flex items-center justify-center rounded-lg bg-background-50 border border-background-200 font-heading font-semibold text-foreground-900 flex-shrink-0">
              {data.co.replace(/[^A-Za-z]/g, "")[0]?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground-950 truncate">
                {data.title}
              </div>
              <div className="text-xs text-foreground-600 truncate">
                {data.co} · {data.label}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-2xl font-heading font-semibold font-mono text-foreground-950">
                {data.score}
              </div>
              <div className="text-[10px] text-foreground-500">/100</div>
            </div>
          </div>

          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${data.verdictColor}`}
            >
              <i
                className={
                  mode === "verified"
                    ? "ri-shield-check-line"
                    : "ri-alert-line"
                }
              ></i>
              {data.verdict}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {data.flags.map((f) => (
              <div key={f.text} className="flex items-start gap-2 text-xs">
                <span
                  className={`w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                    f.ok
                      ? "bg-primary-100 text-primary-700"
                      : "bg-accent-100 text-accent-700"
                  }`}
                >
                  <i
                    className={`${
                      f.ok ? "ri-check-line" : "ri-close-line"
                    } text-sm`}
                  ></i>
                </span>
                <span className="text-foreground-700 leading-relaxed pt-0.5">
                  {f.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}