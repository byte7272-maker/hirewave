const BRANDS = [
  { name: "LinkedIn", weight: "font-semibold" },
  { name: "Indeed", weight: "font-medium" },
  { name: "Greenhouse", weight: "font-semibold" },
  { name: "Workday", weight: "font-medium" },
];

interface WorksWithStripProps {
  /** Heading shown above the logo row. */
  label?: string;
  /** Extra classes for spacing tweaks per surface. */
  className?: string;
}

/** Shared "Works with" logo row, reused on the homepage and the extension page. */
export default function WorksWithStrip({
  label = "Works with the sites you already use",
  className = "",
}: WorksWithStripProps) {
  return (
    <div className={`w-full ${className}`}>
      <p className="text-center text-[11px] md:text-xs uppercase tracking-[0.22em] text-foreground-500 font-semibold mb-7">
        {label}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 md:gap-x-16">
        {BRANDS.map((b) => (
          <span
            key={b.name}
            className={`font-heading text-xl md:text-2xl tracking-tight text-foreground-400 hover:text-foreground-900 transition-colors cursor-default select-none ${b.weight}`}
          >
            {b.name}
          </span>
        ))}
      </div>

      <p className="mt-7 text-center text-xs text-foreground-500">
        …plus 40+ job boards, inboxes and applicant tracking systems.
      </p>
    </div>
  );
}