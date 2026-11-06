import { useBrandName } from "@/hooks/useBranding";
import MatchingMock from "@/pages/home/components/features/MatchingMock";
import VerificationMock from "@/pages/home/components/features/VerificationMock";
import GenerationMock from "@/pages/home/components/features/GenerationMock";
import IntegrationsMock from "@/pages/home/components/features/IntegrationsMock";
import AutomationMock from "@/pages/home/components/features/AutomationMock";

export default function Features() {
  const brandName = useBrandName();

  const FEATURES = [
    {
      icon: "ri-focus-3-line",
      kicker: "01 · Matching",
      title: "Matches ranked 0–100, with reasons you can trust",
      body: "See exactly why a role is a fit — skill overlap, salary alignment, location and seniority — not a black-box score. Save the good ones, dismiss the rest.",
      accent: "primary",
      Mock: MatchingMock,
    },
    {
      icon: "ri-shield-check-line",
      kicker: "02 · Verification",
      title: "Posting verification that flags the fakes",
      body: "Every posting gets an authenticity score from urgency language, salary plausibility, domain age and posting velocity. Anything that looks off is flagged before it reaches your shortlist.",
      accent: "accent",
      Mock: VerificationMock,
    },
    {
      icon: "ri-quill-pen-line",
      kicker: "03 · Generation",
      title: "Your résumé, rewritten for the role — not by you",
      body: `Watch your ATS score climb as ${brandName} tailors your bullet points to the job description. Preview the diff, tweak anything, then approve the final copy.`,
      accent: "primary",
      Mock: GenerationMock,
    },
    {
      icon: "ri-plug-line",
      kicker: "04 · Integrations",
      title: "Plug in the tools you already live in",
      body: "Connect LinkedIn, Gmail, Google Drive, Indeed, Greenhouse and Workday with OAuth 2.0. Tokens stay encrypted, auto-refresh, and revoke in one click.",
      accent: "secondary",
      Mock: IntegrationsMock,
    },
    {
      icon: "ri-send-plane-line",
      kicker: "05 · Automation",
      title: "It applies for you — only after you say yes",
      body: `Nothing goes out without your approval. Review each application, hit approve, and ${brandName} submits with a full audit trail. CAPTCHAs and unknowns hand back to you.`,
      accent: "accent",
      Mock: AutomationMock,
    },
  ];

  return (
    <section id="features" className="py-24 md:py-32 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="max-w-2xl mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-primary-700 font-semibold mb-4">
            The five engines
          </p>
          <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
            See it working.
            <br />
            <span className="italic text-foreground-700">
              Not just a promise.
            </span>
          </h2>
          <p className="mt-5 text-lg text-foreground-700">
            Each engine below is a live slice of the actual product. Click
            around — every one of them really works.
          </p>
        </div>

        <div className="space-y-8 md:space-y-12">
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
                className="grid lg:grid-cols-12 gap-6 lg:gap-10 items-center animate-rise"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div
                  className={`lg:col-span-5 flex flex-col ${
                    reverse ? "lg:order-2" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className={`w-12 h-12 flex items-center justify-center rounded-2xl ${iconBg}`}
                    >
                      <i className={`${f.icon} text-xl`}></i>
                    </div>
                    <span
                      className={`text-[11px] uppercase tracking-widest font-semibold px-2.5 py-1 rounded-full ${badgeBg}`}
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
                <div
                  className={`lg:col-span-7 ${
                    reverse ? "lg:order-1" : ""
                  }`}
                >
                  <f.Mock />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}