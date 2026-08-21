export default function InterviewPrep() {
  return (
    <section id="interview" className="py-24 md:py-32 bg-primary-950 text-background-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20 bg-noise"></div>
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto relative">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 lg:order-2">
            <p className="text-xs uppercase tracking-[0.2em] text-accent-400 font-semibold mb-4">
              Interview mode
            </p>
            <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-background-50 font-medium mb-6">
              Practice out loud.
              <br />
              <span className="italic text-accent-400">Show up ready.</span>
            </h2>
            <p className="text-lg text-background-200 leading-relaxed mb-8 max-w-xl">
              A live mock interviewer generated for the exact role, company and
              style you're preparing for. Speak your answers, get scored on STAR
              structure, specificity, filler words and response time.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {[
                { i: "ri-mic-line", t: "Voice-first", d: "Real speech recognition + synthesis" },
                { i: "ri-bar-chart-2-line", t: "STAR scoring", d: "0–100 with concrete improvement tips" },
                { i: "ri-timer-2-line", t: "Response time", d: "Per-answer + session average" },
                { i: "ri-fire-line", t: "Adaptive difficulty", d: "Easy → Normal → Hard on the fly" },
              ].map((f) => (
                <div
                  key={f.t}
                  className="p-4 rounded-xl border border-primary-800 bg-primary-900/40"
                >
                  <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent-500 text-background-50 mb-3">
                    <i className={`${f.i}`}></i>
                  </div>
                  <div className="font-heading text-lg text-background-50">{f.t}</div>
                  <div className="text-sm text-background-300 mt-1">{f.d}</div>
                </div>
              ))}
            </div>

            <a
              href="#cta"
              className="inline-flex items-center gap-2 bg-accent-500 text-background-50 dark:text-foreground-950 px-6 py-3 rounded-md text-sm font-semibold hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              Try mock interview
              <i className="ri-arrow-right-line"></i>
            </a>
          </div>

          <div className="lg:col-span-5 lg:order-1">
            <div className="relative">
              <div className="bg-primary-900/60 border border-primary-800 rounded-2xl p-5 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 flex items-center justify-center rounded-full bg-accent-500 font-heading font-semibold text-background-50">
                    M
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Maya · Design Director</div>
                    <div className="text-xs text-background-300">Notion · Behavioral style</div>
                  </div>
                  <span className="ml-auto text-[10px] font-mono text-accent-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 flex items-center justify-center rounded-full bg-accent-400 animate-pulse"></span>
                    Live
                  </span>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="text-sm bg-primary-800/50 border border-primary-700 rounded-lg p-3 text-background-100">
                    "Tell me about a time you shipped a design that failed. What
                    did the metrics say, and what did you do next?"
                  </div>
                  <div className="text-xs text-background-300 flex items-center gap-2">
                    <i className="ri-mic-fill text-accent-400"></i>
                    Recording · 0:47 · 3 filler words
                  </div>
                </div>

                <div className="border-t border-primary-800 pt-4">
                  <div className="text-[10px] uppercase tracking-widest text-background-300 mb-3">
                    Live rating
                  </div>
                  <div className="space-y-2">
                    {[
                      { l: "Structure (STAR)", v: 82 },
                      { l: "Specificity", v: 74 },
                      { l: "Confidence", v: 68 },
                      { l: "Conciseness", v: 88 },
                    ].map((r) => (
                      <div key={r.l}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-background-200">{r.l}</span>
                          <span className="font-mono text-accent-400">{r.v}</span>
                        </div>
                        <div className="h-1.5 bg-primary-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent-500"
                            style={{ width: `${r.v}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}