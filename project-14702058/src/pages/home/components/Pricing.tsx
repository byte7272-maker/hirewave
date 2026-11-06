import {
  PAID_PLANS_ENABLED,
  PAID_PLANS_COMING_SOON_LINE,
} from "@/lib/pricingFlags";

/**
 * Paid tiers below are KEPT INTACT behind `PAID_PLANS_ENABLED` (see
 * `src/lib/pricingFlags.ts`). While paid pricing is being re-priced the flag is
 * off, so only the Free tier renders and no paid price is shown anywhere.
 */
const PLANS = [
  {
    name: "Explorer",
    price: "0",
    tag: "Free forever",
    body: "Get matched, verified and prepped — perfect for a passive search.",
    features: [
      "50 verified matches / month",
      "5 auto-applies / month",
      "1 tailored résumé at a time",
      "Basic interview prep (text)",
    ],
    cta: "Request access",
    accent: "background",
  },
  {
    name: "Focused",
    price: "24",
    tag: "Most popular",
    body: "For active seekers who want their calendar full of interviews.",
    features: [
      "Unlimited verified matches",
      "80 auto-applies / month",
      "Unlimited tailored résumés",
      "Mock interviews + voice mode",
      "Reply inbox unification",
      "Salary negotiation coach",
    ],
    cta: "Request access",
    accent: "primary",
    highlight: true,
  },
  {
    name: "Career",
    price: "58",
    tag: "For senior roles",
    body: "Executive-grade support for staff, principal and leadership roles.",
    features: [
      "Everything in Focused",
      "Unlimited auto-applies",
      "1:1 human résumé review",
      "Recruiter outreach templates",
      "Priority model routing",
      "Concierge Slack channel",
    ],
    cta: "Talk to sales",
    accent: "accent",
  },
];

export default function Pricing() {
  // The Free tier is the single card shown while paid plans are hidden.
  const free = PLANS[0];

  return (
    <section id="pricing" className="py-24 md:py-32 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-primary-700 font-semibold mb-4">
            Pricing
          </p>
          {PAID_PLANS_ENABLED ? (
            <>
              <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
                Priced like a coffee habit.
                <br />
                <span className="italic text-primary-600">Worth a salary.</span>
              </h2>
              <p className="mt-5 text-base text-foreground-700">
                Cancel anytime. Every plan honors the human approval gate.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
                Start free.
                <br />
                <span className="italic text-primary-600">
                  Paid plans coming soon.
                </span>
              </h2>
              <p className="mt-5 text-base text-foreground-700">
                Free to start — no card, no catch. Every action still passes the
                human approval gate.
              </p>
            </>
          )}
        </div>

        {!PAID_PLANS_ENABLED ? (
          <>
            {/* Free-only view (temporary). Shares the card shell with the paid
                tiers below so restoring them keeps one visual language. */}
            <div className="grid md:grid-cols-3 gap-5">
              <div className="hw-lift rounded-2xl p-7 flex flex-col relative overflow-hidden bg-background-100/60 border border-background-200 text-foreground-950 hover:border-primary-300 md:col-start-2">
                <span className="pointer-events-none absolute -right-10 -top-12 w-40 h-40 rounded-full bg-primary-100/70 blur-3xl"></span>
                <div className="relative flex items-baseline justify-between mb-1">
                  <h3 className="font-heading text-2xl font-medium">Free</h3>
                  <span className="text-[10px] uppercase tracking-widest text-primary-700 font-semibold">
                    {free.tag}
                  </span>
                </div>
                <p className="text-sm mb-6 text-foreground-700">{free.body}</p>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {free.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 w-4 h-4 flex items-center justify-center rounded-full flex-shrink-0 bg-primary-500 text-background-50">
                        <i className="ri-check-line text-[10px]"></i>
                      </span>
                      <span className="text-foreground-800">{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#cta"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap bg-foreground-950 text-background-50 hover:bg-foreground-800"
                >
                  {free.cta}
                  <i className="ri-arrow-right-line"></i>
                </a>
              </div>
            </div>

            <p className="mt-10 text-center text-sm text-foreground-600">
              <i className="ri-time-line mr-1.5 text-primary-600"></i>
              {PAID_PLANS_COMING_SOON_LINE}
            </p>
          </>
        ) : (
          /* ---- Original paid pricing (kept behind the flag) ---- */
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`hw-lift rounded-2xl p-7 flex flex-col relative overflow-hidden ${
                  p.highlight
                    ? "bg-primary-950 text-background-50 border border-primary-800 md:-mt-3 md:mb-3"
                    : "bg-background-100/60 border border-background-200 text-foreground-950 hover:border-primary-300"
                }`}
              >
                {p.highlight && (
                  <>
                    <span className="pointer-events-none absolute -right-10 -top-12 w-40 h-40 rounded-full bg-primary-800/60 blur-3xl"></span>
                    <span className="absolute -top-3 left-6 z-10 text-[10px] uppercase tracking-widest font-semibold px-3 py-1 rounded-full bg-accent-500 text-background-50">
                      {p.tag}
                    </span>
                  </>
                )}
                <div className="relative flex items-baseline justify-between mb-1">
                  <h3 className="font-heading text-2xl font-medium">
                    {p.name}
                  </h3>
                  {!p.highlight && (
                    <span className="text-[10px] uppercase tracking-widest text-foreground-600 font-semibold">
                      {p.tag}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mt-4 mb-2">
                  <span className="font-heading text-5xl font-medium">
                    ${p.price}
                  </span>
                  <span className={p.highlight ? "text-background-300 text-sm" : "text-foreground-600 text-sm"}>
                    / month
                  </span>
                </div>
                <p className={`text-sm mb-6 ${p.highlight ? "text-background-200" : "text-foreground-700"}`}>
                  {p.body}
                </p>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-0.5 w-4 h-4 flex items-center justify-center rounded-full flex-shrink-0 ${
                          p.highlight
                            ? "bg-accent-500 text-background-50"
                            : "bg-primary-500 text-background-50"
                        }`}
                      >
                        <i className="ri-check-line text-[10px]"></i>
                      </span>
                      <span className={p.highlight ? "text-background-100" : "text-foreground-800"}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#cta"
                  className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    p.highlight
                      ? "bg-accent-500 text-background-50 hover:bg-accent-600"
                      : p.accent === "accent"
                      ? "bg-accent-500 text-background-50 hover:bg-accent-600"
                      : "bg-foreground-950 text-background-50 hover:bg-foreground-800"
                  }`}
                >
                  {p.cta}
                  <i className="ri-arrow-right-line"></i>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}