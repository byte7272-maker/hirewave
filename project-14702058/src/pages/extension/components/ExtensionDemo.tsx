import { useCallback, useEffect, useRef, useState } from "react";
import { useBrandName, useExtensionName } from "@/hooks/useBranding";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type DemoStep = "idle" | "connecting" | "connected";

const MOCK_JOBS = [
  { title: "Senior Product Designer", company: "Northwind Labs", meta: "Remote · Full-time" },
  { title: "Staff Frontend Engineer", company: "Lattice", meta: "Hybrid · Full-time" },
  { title: "Data Scientist", company: "Harbor Analytics", meta: "Remote · Contract" },
];

const CONNECTING_MS = 1500;

/** Short interactive placeholder demoing the one-click connect flow. */
export default function ExtensionDemo() {
  const extensionName = useExtensionName();
  const brandName = useBrandName();
  const [step, setStep] = useState<DemoStep>("idle");
  const timer = useRef<number | null>(null);
  // Auto-play once, the first time the demo scrolls into view.
  const { ref: sectionRef, visible } = useScrollReveal<HTMLElement>({ threshold: 0.35 });
  const playedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const run = useCallback(() => {
    clearTimer();
    setStep("connecting");
    timer.current = window.setTimeout(() => {
      setStep("connected");
      timer.current = null;
    }, CONNECTING_MS);
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setStep("idle");
  }, [clearTimer]);

  useEffect(() => {
    if (visible && !playedRef.current) {
      playedRef.current = true;
      run();
    }
  }, [visible, run]);

  const steps: { key: DemoStep; label: string }[] = [
    { key: "idle", label: "Extension detects the site" },
    { key: "connecting", label: "You click Connect once" },
    { key: "connected", label: "Site is linked — done" },
  ];

  return (
    <section ref={sectionRef} className="py-20 md:py-28 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-5">
            <p className="text-xs uppercase tracking-[0.2em] text-foreground-600 font-semibold mb-4">
              See it in action
            </p>
            <h2 className="font-heading text-4xl md:text-5xl leading-[1.08] tracking-tight text-foreground-950 font-medium">
              One click. That&apos;s the
              <span className="italic"> whole flow.</span>
            </h2>
            <p className="mt-5 text-base text-foreground-700 leading-relaxed max-w-md">
              Open any board you use and {extensionName} offers to connect it. Tap once and it&apos;s
              linked to {brandName} — no codes, no copying, no extra tabs.
            </p>

            <ol className="mt-8 space-y-4">
              {steps.map((s, i) => {
                const active = step === s.key;
                const done =
                  (s.key === "idle" && step !== "idle") ||
                  (s.key === "connecting" && step === "connected");
                return (
                  <li key={s.key} className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold flex-shrink-0 transition-colors ${
                        active
                          ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                          : done
                            ? "bg-accent-100 text-accent-800"
                            : "bg-background-100 text-foreground-500"
                      }`}
                    >
                      {done ? <i className="ri-check-line"></i> : i + 1}
                    </span>
                    <span
                      className={`text-sm transition-colors ${
                        active ? "text-foreground-950 font-semibold" : "text-foreground-600"
                      }`}
                    >
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={run}
                disabled={step === "connecting"}
                className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-3 rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
              >
                {step === "connecting" ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    Connecting…
                  </>
                ) : (
                  <>
                    <i className="ri-play-circle-line text-base"></i>
                    {step === "connected" ? "Play again" : "Play the demo"}
                  </>
                )}
              </button>
              {step === "connected" && (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 text-sm font-medium px-4 py-3 rounded-md bg-background-100 text-foreground-700 hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-restart-line"></i>
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="relative">
              <div className="absolute -top-6 -right-4 w-32 h-32 rounded-full bg-accent-200/50 blur-3xl"></div>

              <div className="relative rounded-2xl border border-background-200 bg-background-100/70 p-3 md:p-4">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 rounded-xl bg-background-50 border border-background-200 px-3 py-2.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
                  </span>
                  <div className="flex-1 mx-2 flex items-center gap-2 h-6 rounded bg-background-100 px-2.5 text-[11px] text-foreground-500 min-w-0">
                    <i className="ri-lock-2-line text-[11px] flex-shrink-0"></i>
                    <span className="truncate">linkedin.com/jobs/view/4021998731</span>
                  </div>
                  <span
                    className={`w-6 h-6 flex items-center justify-center rounded-md flex-shrink-0 transition-colors ${
                      step === "connected"
                        ? "bg-accent-500 text-background-50 dark:text-foreground-950"
                        : step === "connecting"
                          ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                          : "bg-background-200 text-foreground-600"
                    }`}
                  >
                    <i
                      className={`text-sm ${
                        step === "connecting" ? "ri-loader-4-line animate-spin" : "ri-puzzle-2-line"
                      }`}
                    ></i>
                  </span>
                </div>

                {/* Mock site body */}
                <div className="relative mt-3 rounded-xl bg-background-50 border border-background-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-background-200">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 flex items-center justify-center rounded bg-background-100 text-foreground-600">
                        <i className="ri-briefcase-4-line text-sm"></i>
                      </span>
                      <span className="text-sm font-semibold text-foreground-800">Jobs</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="h-5 w-16 rounded bg-background-100"></span>
                      <span className="h-5 w-10 rounded bg-background-100"></span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2.5">
                    {MOCK_JOBS.map((j, i) => (
                      <div
                        key={j.title}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 ${
                          i === 0
                            ? "border-primary-200 bg-primary-100/50"
                            : "border-background-200 bg-background-50"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground-900 truncate">
                            {j.title}
                          </p>
                          <p className="text-xs text-foreground-500 truncate">
                            {j.company} · {j.meta}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
                          Easy apply
                        </span>
                      </div>
                    ))}
                    <div className="h-16 rounded-lg bg-background-100/70 border border-background-200"></div>
                  </div>

                  {/* Floating connect card */}
                  <div className="absolute top-3 right-3 w-[13.5rem] max-w-[70%] rounded-xl border border-background-200 bg-background-50 p-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 flex items-center justify-center rounded-md bg-primary-100 text-primary-700">
                        <i className="ri-puzzle-2-line text-sm"></i>
                      </span>
                      <span className="text-xs font-semibold text-foreground-800">
                        {extensionName}
                      </span>
                    </div>

                    {step === "idle" && (
                      <>
                        <p className="text-[11px] text-foreground-600 leading-snug mb-2.5">
                          Connect this site so {brandName} can tailor and apply here.
                        </p>
                        <button
                          type="button"
                          onClick={run}
                          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-links-line"></i>
                          Connect
                        </button>
                      </>
                    )}

                    {step === "connecting" && (
                      <div className="flex items-center gap-2 text-[11px] text-foreground-600 py-1">
                        <i className="ri-loader-4-line animate-spin text-primary-600"></i>
                        Connecting this site…
                      </div>
                    )}

                    {step === "connected" && (
                      <div className="space-y-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-secondary-100 text-secondary-900">
                          <i className="ri-check-line"></i>
                          Connected
                        </span>
                        <p className="text-[11px] text-foreground-600 leading-snug">
                          Linked to {brandName}. You can apply from here now.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <p className="mt-3 text-[11px] text-foreground-500 text-center">
                  Illustrative preview — no real site data is used.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}