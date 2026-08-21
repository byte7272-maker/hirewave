const STEPS = [
  {
    n: "01",
    title: "Connect & upload",
    body: "Sign in with Google, connect LinkedIn or Gmail, and drop your existing résumé. We'll extract everything — nothing typed twice.",
    icon: "ri-plug-2-line",
  },
  {
    n: "02",
    title: "Review your matches",
    body: "Every morning you get a fresh shortlist ranked 0–100, each one verified as legit. Skip the noise, save the good ones.",
    icon: "ri-radar-line",
  },
  {
    n: "03",
    title: "Tailor with one click",
    body: "Hirewave rewrites your résumé & cover letter for each role. Preview the ATS score, tweak anything, then approve.",
    icon: "ri-magic-line",
  },
  {
    n: "04",
    title: "Auto-apply — you stay in the loop",
    body: "Only approved applications are ever sent. Track status, get replies in one inbox, jump into interview prep for the ones you land.",
    icon: "ri-checkbox-circle-line",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="py-24 md:py-32 bg-background-100/60">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 items-end mb-14">
          <div className="lg:col-span-7">
            <p className="text-xs uppercase tracking-[0.2em] text-accent-700 font-semibold mb-4">
              How it works
            </p>
            <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
              From "I need a job"
              <br />
              <span className="italic text-accent-600">to "I got the offer"</span>
            </h2>
          </div>
          <div className="lg:col-span-5 text-foreground-700 text-base">
            Four steps, roughly 12 minutes of setup. After that, Hirewave runs
            in the background — you just show up for the good conversations.
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="relative bg-background-50 border border-background-200 rounded-xl p-6 hover:border-primary-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-6">
                <span className="font-mono text-xs text-foreground-500">
                  {s.n}
                </span>
                <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary-100 text-primary-800">
                  <i className={`${s.icon} text-xl`}></i>
                </div>
              </div>
              <h3 className="font-heading text-xl font-medium text-foreground-950 mb-2 tracking-tight">
                {s.title}
              </h3>
              <p className="text-sm text-foreground-700 leading-relaxed">
                {s.body}
              </p>
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 text-foreground-400">
                  <i className="ri-arrow-right-line"></i>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}