export default function Hero() {
  return (
    <section
      id="top"
      className="relative min-h-[820px] flex items-center pt-32 pb-20 overflow-hidden"
    >
      <div className="absolute inset-0 -z-10">
        <img
          src="https://readdy.ai/api/search-image?query=Abstract%20soft%20warm%20gradient%20background%20with%20organic%20flowing%20shapes%20in%20cream%2C%20deep%20emerald%20green%2C%20and%20warm%20coral%20persimmon%20tones%2C%20editorial%20minimalist%20composition%2C%20subtle%20paper%20texture%2C%20blurred%20geometric%20forms%2C%20golden%20hour%20lighting%2C%20high%20end%20magazine%20aesthetic%2C%20soft%20depth%20of%20field%2C%20artistic%20abstract%20photography&width=1800&height=1200&seq=hero-hirewave-bg-01&orientation=landscape"
          alt=""
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background-50/70 via-background-50/60 to-background-50"></div>
      </div>

      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 bg-background-100 border border-background-200 text-foreground-800 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
              <span className="w-2 h-2 flex items-center justify-center rounded-full bg-primary-500"></span>
              Now in open beta — no card required
            </div>

            <h1 className="font-heading text-5xl md:text-7xl leading-[1.02] tracking-tight text-foreground-950 font-medium">
              Stop scrolling
              <span className="italic text-primary-600"> job boards.</span>
              <br />
              Start landing
              <span className="italic text-accent-600"> interviews.</span>
            </h1>

            <p className="mt-6 text-lg md:text-xl text-foreground-700 max-w-2xl leading-relaxed">
              Hirewave is your AI job-search co-pilot. It matches you to real
              openings, sniffs out scams, tailors your résumé for every role,
              and applies on your behalf — with you approving every step.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a
                href="#cta"
                className="inline-flex items-center justify-center gap-2 bg-primary-500 text-background-50 dark:text-foreground-950 px-6 py-3.5 rounded-md text-sm font-semibold hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-rocket-2-line"></i>
                Start free — 5 free applies
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
                      H
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}