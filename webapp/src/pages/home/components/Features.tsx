const FEATURES = [
  {
    icon: "ri-focus-3-line",
    kicker: "01 · Matching",
    title: "AI that actually reads the job description",
    body: "Semantic embeddings + weighted skills, salary, seniority and location scoring produce a composite 0–100 match. Feedback learns from every save, apply and dismiss.",
    accent: "primary",
    image:
      "https://readdy.ai/api/search-image?query=Minimalist%20abstract%20visualization%20of%20AI%20job%20matching%20with%20soft%20emerald%20green%20nodes%20connecting%20across%20warm%20cream%20background%2C%20elegant%20data%20flow%20illustration%2C%20editorial%20design%2C%20soft%20natural%20lighting%2C%20clean%20geometric%20forms%2C%20magazine%20quality%20composition%2C%20warm%20neutral%20tones&width=900&height=700&seq=feat-match-01&orientation=landscape",
  },
  {
    icon: "ri-shield-check-line",
    kicker: "02 · Verification",
    title: "Scam filter that saves you from ghost jobs",
    body: "Urgency-language detection, salary plausibility, off-platform contact flags, domain age and posting velocity feed a 0–100 authenticity score. Sketchy postings never hit your inbox.",
    accent: "accent",
    image:
      "https://readdy.ai/api/search-image?query=Abstract%20shield%20and%20verification%20checkmark%20motif%20in%20warm%20coral%20and%20cream%20tones%2C%20minimalist%20editorial%20illustration%2C%20soft%20paper%20texture%2C%20golden%20hour%20lighting%2C%20clean%20geometric%20composition%2C%20high%20end%20magazine%20aesthetic%2C%20subtle%20depth%20of%20field%2C%20trust%20and%20safety%20theme&width=900&height=700&seq=feat-verify-01&orientation=landscape",
  },
  {
    icon: "ri-quill-pen-line",
    kicker: "03 · Generation",
    title: "Résumés & cover letters tailored per role",
    body: "Keyword extraction, ATS scoring, versioning and a mandatory human approval gate. Bring your own PDF or generate fresh — Claude, GPT or fully offline.",
    accent: "primary",
    image:
      "https://readdy.ai/api/search-image?query=Elegant%20editorial%20flat%20lay%20of%20a%20crisp%20printed%20resume%20document%20on%20warm%20cream%20paper%20with%20soft%20emerald%20accent%20highlights%2C%20fountain%20pen%2C%20minimalist%20workspace%2C%20natural%20window%20lighting%2C%20magazine%20quality%20photography%2C%20warm%20neutral%20tones%2C%20clean%20composition&width=900&height=700&seq=feat-gen-01&orientation=landscape",
  },
  {
    icon: "ri-plug-line",
    kicker: "04 · Integrations",
    title: "Connect LinkedIn, Gmail, Indeed & more",
    body: "OAuth 2.0 with PKCE across LinkedIn, Gmail, Google Drive, Indeed, Greenhouse and Workday. Tokens encrypted at rest, auto-refresh, one-click revoke.",
    accent: "secondary",
    image:
      "https://readdy.ai/api/search-image?query=Minimalist%20abstract%20illustration%20of%20connected%20platforms%20and%20integrations%20in%20warm%20sand%20and%20clay%20tones%20over%20cream%20background%2C%20editorial%20flat%20design%2C%20clean%20geometric%20network%20visualization%2C%20soft%20lighting%2C%20magazine%20quality%2C%20warm%20neutral%20palette&width=900&height=700&seq=feat-int-01&orientation=landscape",
  },
  {
    icon: "ri-send-plane-line",
    kicker: "05 · Automation",
    title: "Applies for you — only after you approve",
    body: "Submits via Gmail, LinkedIn Easy Apply and Indeed with rate limiting and full audit trail. CAPTCHAs escalate to you, unknown fields fall back to manual. Never fabricates answers.",
    accent: "accent",
    image:
      "https://readdy.ai/api/search-image?query=Abstract%20paper%20airplane%20motif%20in%20warm%20coral%20persimmon%20on%20cream%20background%20with%20soft%20emerald%20trailing%20lines%2C%20editorial%20minimalist%20illustration%2C%20golden%20hour%20lighting%2C%20elegant%20composition%2C%20magazine%20photography%20style%2C%20warm%20tones&width=900&height=700&seq=feat-auto-01&orientation=landscape",
  },
  {
    icon: "ri-mic-2-line",
    kicker: "06 · Interview prep",
    title: "Mock interviews with voice + adaptive difficulty",
    body: "AI interviewer personas, live filler-word counter, STAR structure ratings, response-time tracking. Speak your answers, get scored on content and delivery.",
    accent: "primary",
    image:
      "https://readdy.ai/api/search-image?query=Minimalist%20professional%20microphone%20on%20warm%20cream%20background%20with%20soft%20emerald%20green%20sound%20wave%20accents%2C%20editorial%20photography%2C%20golden%20hour%20natural%20lighting%2C%20elegant%20composition%2C%20magazine%20quality%2C%20warm%20neutral%20tones%2C%20clean%20studio%20setup&width=900&height=700&seq=feat-int-prep-01&orientation=landscape",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 md:py-32 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="max-w-2xl mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-primary-700 font-semibold mb-4">
            The six engines
          </p>
          <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
            One platform.
            <br />
            <span className="italic text-foreground-700">
              Six ways it saves your week.
            </span>
          </h2>
          <p className="mt-5 text-lg text-foreground-700">
            Each engine plugs into the next: matched → verified → tailored →
            approved → submitted → interviewed. You stay in control.
          </p>
        </div>

        <div className="space-y-6">
          {FEATURES.map((f, i) => {
            const reverse = i % 2 === 1;
            const badgeBg =
              f.accent === "primary"
                ? "bg-primary-100 text-primary-900"
                : f.accent === "accent"
                ? "bg-accent-100 text-accent-900"
                : "bg-secondary-100 text-secondary-900";
            const iconBg =
              f.accent === "primary"
                ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                : f.accent === "accent"
                ? "bg-accent-500 text-background-50 dark:text-foreground-950"
                : "bg-secondary-500 text-background-50 dark:text-foreground-950";
            return (
              <div
                key={f.kicker}
                className={`grid lg:grid-cols-12 gap-6 lg:gap-10 items-stretch bg-background-100/60 border border-background-200 rounded-2xl p-6 md:p-8 ${
                  reverse ? "" : ""
                }`}
              >
                <div
                  className={`lg:col-span-5 flex flex-col justify-between ${
                    reverse ? "lg:order-2" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-3 mb-5">
                      <div
                        className={`w-11 h-11 flex items-center justify-center rounded-xl ${iconBg}`}
                      >
                        <i className={`${f.icon} text-xl`}></i>
                      </div>
                      <span
                        className={`text-[11px] uppercase tracking-widest font-semibold px-2.5 py-1 rounded ${badgeBg}`}
                      >
                        {f.kicker}
                      </span>
                    </div>
                    <h3 className="font-heading text-2xl md:text-3xl font-medium tracking-tight text-foreground-950 leading-tight">
                      {f.title}
                    </h3>
                    <p className="mt-4 text-base text-foreground-700 leading-relaxed">
                      {f.body}
                    </p>
                  </div>
                  <a
                    href="#cta"
                    className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground-950 hover:text-primary-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Learn more
                    <i className="ri-arrow-right-line"></i>
                  </a>
                </div>
                <div
                  className={`lg:col-span-7 rounded-xl overflow-hidden bg-background-50 border border-background-200 min-h-[260px] ${
                    reverse ? "lg:order-1" : ""
                  }`}
                >
                  <img
                    src={f.image}
                    alt={f.title}
                    className="w-full h-full object-cover object-top min-h-[260px]"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}