const QUOTES = [
  {
    body: "Cold applies got me nowhere. Six weeks in I had three offers on the table — and the posting verification caught a couple of listings I'd have wasted a week on.",
    name: "Priya S.",
    role: "Senior PM · hired at Ramp",
    avatar:
      "https://readdy.ai/api/search-image?query=Professional%20headshot%20portrait%20of%20a%20confident%20South%20Asian%20woman%20in%20warm%20natural%20lighting%2C%20soft%20cream%20background%2C%20editorial%20magazine%20photography%2C%20warm%20neutral%20tones%2C%20high%20end%20studio%20portrait%2C%20subtle%20smile%2C%20professional%20attire&width=200&height=200&seq=avatar-priya-01&orientation=squarish",
  },
  {
    body: "The tailored résumé feature is unreal. Same person, same experience — but every posting gets a version that actually maps to their JD. My reply rate finally started moving.",
    name: "Marcus L.",
    role: "Staff Engineer · hired at Stripe",
    avatar:
      "https://readdy.ai/api/search-image?query=Professional%20headshot%20portrait%20of%20a%20confident%20Black%20man%20in%20warm%20natural%20lighting%2C%20soft%20cream%20background%2C%20editorial%20magazine%20photography%2C%20warm%20neutral%20tones%2C%20high%20end%20studio%20portrait%2C%20professional%20attire%2C%20friendly%20expression&width=200&height=200&seq=avatar-marcus-01&orientation=squarish",
  },
  {
    body: "Mock interviews with voice mode were the missing piece. Getting live filler-word feedback while practicing felt embarrassing at first — then addictive.",
    name: "Elena V.",
    role: "Design Lead · hired at Figma",
    avatar:
      "https://readdy.ai/api/search-image?query=Professional%20headshot%20portrait%20of%20a%20confident%20Latina%20woman%20in%20warm%20natural%20lighting%2C%20soft%20cream%20background%2C%20editorial%20magazine%20photography%2C%20warm%20neutral%20tones%2C%20high%20end%20studio%20portrait%2C%20subtle%20smile%2C%20creative%20professional%20attire&width=200&height=200&seq=avatar-elena-01&orientation=squarish",
  },
];

const VALUES = [
  { icon: "ri-shield-check-line", label: "Human approval on every apply" },
  { icon: "ri-lock-2-line", label: "Tokens encrypted AES-256-GCM" },
  { icon: "ri-eye-off-line", label: "No password ever stored" },
  { icon: "ri-time-line", label: "Cancel anytime" },
];

export default function Testimonials() {
  return (
    <section className="py-24 md:py-32 bg-background-100/60">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="max-w-3xl mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-secondary-700 font-semibold mb-4">
            The receipts
          </p>
          <h2 className="font-heading text-4xl md:text-5xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
            Real seekers.
            <br />
            <span className="italic text-secondary-600">Real offers.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {QUOTES.map((q, i) => (
            <figure
              key={q.name}
              className="bg-background-50 border border-background-200 rounded-2xl p-6 flex flex-col"
            >
              <div className="text-4xl font-heading text-primary-600 leading-none mb-4">
                "
              </div>
              <blockquote className="text-base text-foreground-800 leading-relaxed flex-1">
                {q.body}
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 pt-4 border-t border-background-200">
                <img
                  src={q.avatar}
                  alt={q.name}
                  className="w-11 h-11 object-cover object-top rounded-full"
                />
                <div>
                  <div className="text-sm font-semibold text-foreground-950">
                    {q.name}
                  </div>
                  <div className="text-xs text-foreground-600">{q.role}</div>
                </div>
                <span className="ml-auto text-[10px] font-mono text-foreground-500">
                  0{i + 1}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 mt-14 pt-14 border-t border-background-200">
          {VALUES.map((v) => (
            <div key={v.label} className="flex items-start gap-3">
              <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-100 text-primary-800 flex-shrink-0">
                <i className={`${v.icon} text-lg`}></i>
              </span>
              <span className="text-sm text-foreground-700 leading-snug pt-1.5">
                {v.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}