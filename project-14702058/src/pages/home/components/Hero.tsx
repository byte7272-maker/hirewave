import SmartImage from "@/components/base/SmartImage";
import { useBrandName } from "@/hooks/useBranding";

export default function Hero() {
  const brandName = useBrandName();
  return (
    <section
      id="top"
      className="relative min-h-[820px] flex items-center pt-32 pb-20 overflow-hidden"
    >
      <div className="absolute inset-0 -z-10">
        <SmartImage
          src="https://readdy.ai/api/search-image?query=Cinematic%20editorial%20business%20photography%20of%20a%20confident%20professional%20woman%20in%20business%20casual%20attire%20working%20on%20a%20laptop%20in%20a%20bright%20sunlit%20modern%20office%20with%20large%20windows%2C%20warm%20golden%20hour%20natural%20light%2C%20soft%20cream%20and%20warm%20neutral%20tones%20with%20subtle%20emerald%20green%20plants%20and%20coral%20accent%20details%2C%20shallow%20depth%20of%20field%2C%20premium%20magazine%20aesthetic%2C%20aspirational%20calm%20mood%2C%20high%20detail%2C%20organic%20composition&width=1800&height=1200&seq=hero-hirewave-bg-01&orientation=landscape&nocache=true"
          alt="Professional working in a bright modern office"
          className="w-full h-full object-cover object-top"
          fallbackClassName="bg-gradient-to-br from-background-100 via-background-50 to-accent-100"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background-50 via-background-50/70 to-background-50/5"></div>
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background-50 to-transparent"></div>
        <div className="absolute inset-0 hw-dotgrid opacity-40 [mask-image:radial-gradient(60%_60%_at_70%_35%,black,transparent)]"></div>
      </div>

      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 bg-background-50/80 backdrop-blur-sm border border-background-200 text-foreground-800 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
              <span className="w-2 h-2 hw-pulse flex items-center justify-center rounded-full bg-primary-500"></span>
              Now in private beta — access by request
            </div>

            <h1 className="font-heading text-5xl md:text-7xl leading-[1.02] tracking-tight text-foreground-950 font-medium">
              Keep the job boards
              <span className="italic text-primary-600"> you love.</span>
              <br />
              We prep your résumé — you
              <span className="italic text-accent-600"> ace the interviews.</span>
            </h1>

            <p className="mt-6 text-lg md:text-xl text-foreground-700 max-w-2xl leading-relaxed">
              {brandName} is your AI application assistant. Keep the job boards
              you already love — we tailor your résumé for every role and apply
              on your behalf, with you approving every step.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a
                href="#cta"
                className="inline-flex items-center justify-center gap-2 bg-primary-500 text-background-50 dark:text-foreground-950 px-6 py-3.5 rounded-md text-sm font-semibold hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-rocket-2-line"></i>
                Request early access
              </a>
              <a
                href="#how"
                className="inline-flex items-center justify-center gap-2 bg-background-50 border border-background-300 text-foreground-950 px-6 py-3.5 rounded-md text-sm font-semibold hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-play-circle-line text-lg"></i>
                Watch 90s demo
              </a>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-6 text-xs text-foreground-600">
              <div className="flex items-center gap-2">
                <i className="ri-shield-check-line text-primary-600 text-base"></i>
                Human approval on every apply
              </div>
              <div className="flex items-center gap-2">
                <i className="ri-lock-2-line text-primary-600 text-base"></i>
                Tokens encrypted AES-256-GCM
              </div>
              <div className="flex items-center gap-2">
                <i className="ri-eye-off-line text-primary-600 text-base"></i>
                No password ever stored
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative">
              <div className="absolute -top-6 -left-6 w-32 h-32 rounded-full bg-accent-200/60 blur-3xl"></div>
              <div className="absolute -bottom-8 -right-6 w-40 h-40 rounded-full bg-primary-200/60 blur-3xl"></div>

              <div className="relative bg-background-50 border border-background-200 rounded-2xl p-5 animate-float-slow">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 flex items-center justify-center rounded-md bg-primary-500 text-background-50 text-xs font-semibold">
                      P
                    </span>
                    <span className="text-xs font-medium text-foreground-700">
                      Today's top matches
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-foreground-500">
                    Live
                  </span>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      role: "Senior Product Designer",
                      co: "Linear",
                      score: 96,
                      loc: "Remote · US",
                      tag: "Verified",
                      tagColor: "primary",
                    },
                    {
                      role: "Staff Frontend Engineer",
                      co: "Vercel",
                      score: 91,
                      loc: "SF · Hybrid",
                      tag: "New",
                      tagColor: "accent",
                    },
                    {
                      role: "Design Systems Lead",
                      co: "Figma",
                      score: 88,
                      loc: "Remote · Global",
                      tag: "Applied",
                      tagColor: "secondary",
                    },
                  ].map((j) => (
                    <div
                      key={j.role}
                      className="flex items-center gap-3 p-3 rounded-lg bg-background-100 border border-background-200 hover:border-primary-300 transition-colors cursor-pointer"
                    >
                      <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-background-50 border border-background-200 text-foreground-800 font-heading font-semibold">
                        {j.co[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground-950 truncate">
                          {j.role}
                        </div>
                        <div className="text-xs text-foreground-600 truncate">
                          {j.co} · {j.loc}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-semibold text-primary-700">
                          {j.score}
                        </div>
                        <div
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            j.tagColor === "primary"
                              ? "bg-primary-100 text-primary-900"
                              : j.tagColor === "accent"
                              ? "bg-accent-100 text-accent-900"
                              : "bg-secondary-100 text-secondary-900"
                          }`}
                        >
                          {j.tag}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-background-200 flex items-center justify-between text-xs">
                  <span className="text-foreground-600">
                    <i className="ri-sparkling-2-line text-accent-600"></i> 24
                    new matches today
                  </span>
                  <span className="text-primary-700 font-medium cursor-pointer">
                    View all →
                  </span>
                </div>
              </div>

              <div className="absolute -bottom-5 -left-4 sm:-left-6 bg-background-50 border border-background-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-none">
                <span className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                  <i className="ri-file-check-line text-xl"></i>
                </span>
                <div>
                  <div className="text-xs text-foreground-600">Résumé match</div>
                  <div className="font-heading text-lg font-semibold text-foreground-950 leading-none">
                    94<span className="text-primary-600 text-sm">/100</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <a
        href="#how"
        className="hidden md:flex absolute left-1/2 -translate-x-1/2 bottom-7 flex-col items-center gap-1.5 text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer"
        aria-label="Scroll to see how it works"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">Scroll</span>
        <i className="ri-arrow-down-line animate-bounce"></i>
      </a>
    </section>
  );
}