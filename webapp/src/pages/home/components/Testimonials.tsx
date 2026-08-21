const QUOTES = [
  {
    body: "I went from 200 cold applies with zero replies to 3 offers in 5 weeks. The scam filter alone saved me from a dozen fake recruiter emails.",
    name: "Priya S.",
    role: "Senior PM · hired at Ramp",
    avatar:
      "https://readdy.ai/api/search-image?query=Professional%20headshot%20portrait%20of%20a%20confident%20South%20Asian%20woman%20in%20warm%20natural%20lighting%2C%20soft%20cream%20background%2C%20editorial%20magazine%20photography%2C%20warm%20neutral%20tones%2C%20high%20end%20studio%20portrait%2C%20subtle%20smile%2C%20professional%20attire&width=200&height=200&seq=avatar-priya-01&orientation=squarish",
  },
  {
    body: "The tailored résumé feature is unreal. Same person, same experience — but every posting gets a version that actually maps to their JD. Response rate 4x.",
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

export default function Testimonials() {
  return (
    <section className="py-24 md:py-32 bg-background-100/60">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="max-w-3xl mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-secondary-700 font-semibold mb-4">
            The receipts
          </p>
          <h2 className="font-heading text-4xl md:text-5xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
            2,847 offers signed
            <br />
            <span className="italic text-secondary-600">in the last 12 months</span>
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

        <div className="grid md:grid-cols-4 gap-6 mt-14 pt-14 border-t border-background-200">
          {[
            { n: "2,847", l: "Offers signed" },
            { n: "12.4 days", l: "Median time to offer" },
            { n: "4.2×", l: "Reply-rate lift" },
            { n: "$47M", l: "Total salary negotiated" },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-heading text-4xl md:text-5xl text-foreground-950 font-medium tracking-tight">
                {s.n}
              </div>
              <div className="text-sm text-foreground-600 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}