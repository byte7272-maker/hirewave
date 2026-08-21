export default function Security() {
  return (
    <section id="security" className="py-24 md:py-32 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6">
            <p className="text-xs uppercase tracking-[0.2em] text-primary-600 font-semibold mb-4">
              Security monitoring
            </p>
            <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-foreground-950 font-medium mb-6">
              Job hunting exposes you.
              <br />
              <span className="italic text-primary-600">We watch your back.</span>
            </h2>
            <p className="text-lg text-foreground-600 leading-relaxed mb-8 max-w-xl">
              Posting your email across job boards puts it in front of scrapers and
              scammers. Hirewave monitors the addresses you own for exposure in known
              data breaches and checks whether your passwords have leaked — privately,
              and only with your consent.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {[
                { i: "ri-shield-check-line", t: "Breach alerts", d: "Get notified when a verified email shows up in a known breach" },
                { i: "ri-lock-password-line", t: "Password check", d: "k-anonymity — your password never leaves your device" },
                { i: "ri-mail-lock-line", t: "Encrypted at rest", d: "Emails stored AES-256-GCM; we keep categories, not secrets" },
                { i: "ri-eye-off-line", t: "No dark-web crawling", d: "Licensed breach intel + ownership-verified identifiers only" },
              ].map((f) => (
                <div key={f.t} className="p-4 rounded-xl border border-background-200 bg-background-100/60">
                  <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-500 text-background-50 mb-3">
                    <i className={f.i}></i>
                  </div>
                  <div className="font-heading text-lg text-foreground-950">{f.t}</div>
                  <div className="text-sm text-foreground-600 mt-1">{f.d}</div>
                </div>
              ))}
            </div>

            <a
              href="#cta"
              className="inline-flex items-center gap-2 bg-primary-500 text-background-50 dark:text-foreground-950 px-6 py-3 rounded-md text-sm font-semibold hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              Protect my search
              <i className="ri-arrow-right-line"></i>
            </a>
          </div>

          <div className="lg:col-span-6">
            <div className="bg-background-100/60 border border-background-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-foreground-950 flex items-center gap-2">
                  <i className="ri-shield-check-line text-primary-600"></i>
                  Exposure monitor
                </div>
                <span className="text-[10px] font-mono text-primary-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
                  Monitoring
                </span>
              </div>

              <div className="flex items-center justify-between border border-background-200 rounded-lg px-3 py-2 bg-background-50 mb-4">
                <span className="flex items-center gap-2 text-sm text-foreground-800">
                  🛡 t****@gmail.com
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-100 text-primary-900">Verified</span>
              </div>

              <div className="space-y-2 mb-4">
                {[
                  { sev: "high", label: "Acme Corp breach", ex: "email · password", tone: "bg-accent-100 text-accent-900" },
                  { sev: "medium", label: "ShopFast leak", ex: "email · name", tone: "bg-secondary-100 text-secondary-900" },
                ].map((f) => (
                  <div key={f.label} className="rounded-lg border border-background-200 bg-background-50 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${f.tone}`}>{f.sev} risk</span>
                      <strong className="text-sm text-foreground-950">{f.label}</strong>
                    </div>
                    <div className="text-xs text-foreground-500 mt-1.5">Exposed: {f.ex}</div>
                  </div>
                ))}
              </div>

              <div className="border-t border-background-200 pt-4">
                <div className="text-[10px] uppercase tracking-widest text-foreground-400 mb-2">
                  Password check
                </div>
                <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 bg-accent-100 text-accent-900">
                  <i className="ri-error-warning-line"></i>
                  Found in 9,659,365 breaches — only a hash prefix was sent.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
