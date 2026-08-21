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
    cta: "Start free",
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
    cta: "Start 14-day trial",
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
      "Priority Claude / GPT-4 quality",
      "Concierge Slack channel",
    ],
    cta: "Talk to sales",
    accent: "accent",
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 md:py-32 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-primary-700 font-semibold mb-4">
            Pricing
          </p>
          <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
            Priced like a coffee habit.
            <br />
            <span className="italic text-primary-600">Worth a salary.</span>
          </h2>
          <p className="mt-5 text-base text-foreground-700">
            Cancel anytime. Every plan honors the human approval gate.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl p-7 flex flex-col relative ${
                p.highlight
                  ? "bg-primary-950 text-background-50 border border-primary-800"
                  : "bg-background-100/60 border border-background-200 text-foreground-950"
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-6 text-[10px] uppercase tracking-widest font-semibold px-3 py-1 rounded-full bg-accent-500 text-background-50">
                  {p.tag}
                </span>
              )}
              <div className="flex items-baseline justify-between mb-1">
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
      </div>
    </section>
  );
}