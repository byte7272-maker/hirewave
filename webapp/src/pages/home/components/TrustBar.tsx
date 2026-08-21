const LOGOS = [
  "Y Combinator alumni",
  "Google",
  "Stripe",
  "Airbnb",
  "Shopify",
  "Notion",
  "Linear",
  "Figma",
  "Vercel",
  "Anthropic",
];

export default function TrustBar() {
  return (
    <section className="py-14 border-y border-background-200 bg-background-100/50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-foreground-600 mb-8">
          Job seekers hired at
        </p>
        <div className="relative overflow-hidden">
          <div className="flex gap-14 animate-marquee whitespace-nowrap">
            {[...LOGOS, ...LOGOS].map((l, i) => (
              <span
                key={i}
                className="font-heading text-2xl md:text-3xl text-foreground-500 italic tracking-tight"
              >
                {l}
              </span>
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background-100 to-transparent pointer-events-none"></div>
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background-100 to-transparent pointer-events-none"></div>
        </div>
      </div>
    </section>
  );
}