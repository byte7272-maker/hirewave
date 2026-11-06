import Card from "@/components/base/Card";

export type StatTone = "primary" | "accent" | "secondary";

const toneIconBg: Record<StatTone, string> = {
  primary:
    "bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 ring-1 ring-primary-200/70",
  accent:
    "bg-gradient-to-br from-accent-100 to-accent-200 text-accent-700 ring-1 ring-accent-200/70",
  secondary:
    "bg-gradient-to-br from-secondary-100 to-secondary-200 text-secondary-700 ring-1 ring-secondary-200/70",
};

const toneTrend: Record<StatTone, string> = {
  primary: "bg-primary-100 text-primary-800",
  accent: "bg-accent-100 text-accent-800",
  secondary: "bg-secondary-100 text-secondary-800",
};

const toneBar: Record<StatTone, string> = {
  primary: "bg-primary-500",
  accent: "bg-accent-500",
  secondary: "bg-secondary-500",
};

const toneArrow: Record<StatTone, string> = {
  primary: "group-hover:text-primary-700 group-hover:bg-primary-100",
  accent: "group-hover:text-accent-700 group-hover:bg-accent-100",
  secondary: "group-hover:text-secondary-700 group-hover:bg-secondary-100",
};

export interface StatCardProps {
  label: string;
  value: number | string;
  caption?: string;
  /** Remix Icon class. */
  icon: string;
  tone?: StatTone;
  /** Optional trend chip, e.g. "+12%". */
  trend?: string;
  /** When set, the whole card becomes a link. */
  to?: string;
  /** Entrance stagger delay, in seconds. */
  delay?: number;
}

/**
 * The CANONICAL stat card — the "Matches" and "In pipeline" cards are the
 * reference for the whole design system. Built on the shared `Card` primitive,
 * it renders a soft glow, a 48px gradient icon tile that lifts on hover, an
 * optional trend chip, a large tabular-number metric with a caption, a label row
 * whose arrow slides on hover, and a tone underline that brightens — so the card
 * is instantly identifiable AND visibly interactive. Every surface that shows a
 * headline number should compose this.
 *
 * The label + caption + trend are folded into the card's accessible name, so the
 * number is programmatically associated with what it counts, not just visually
 * near it.
 */
export default function StatCard({
  label,
  value,
  caption,
  icon,
  tone = "primary",
  trend,
  to,
  delay = 0,
}: StatCardProps) {
  const ariaLabel = `${label}: ${value}${caption ? `, ${caption}` : ""}${
    trend ? `, ${trend}` : ""
  }`;

  return (
    <Card
      tone={tone}
      surface="plain"
      padded
      interactive={Boolean(to)}
      to={to}
      className="animate-rise"
      style={{ animationDelay: `${delay}s` }}
      aria-label={ariaLabel}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`w-12 h-12 flex items-center justify-center rounded-tile transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3 ${toneIconBg[tone]}`}
        >
          <i className={`${icon} text-xl`} aria-hidden="true"></i>
        </div>
        {trend && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${toneTrend[tone]}`}
          >
            <i className="ri-arrow-up-line text-[10px]" aria-hidden="true"></i>
            {trend}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <span className="font-heading text-4xl md:text-5xl text-foreground-950 font-medium leading-none tabular-nums">
          {value}
        </span>
        {caption && <span className="text-xs text-foreground-500 mb-1">{caption}</span>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground-700">{label}</span>
        {to && (
          <span
            className={`w-7 h-7 flex items-center justify-center rounded-control text-foreground-400 transition-all duration-300 group-hover:translate-x-0.5 ${toneArrow[tone]}`}
          >
            <i className="ri-arrow-right-up-line text-base" aria-hidden="true"></i>
          </span>
        )}
      </div>

      <span
        className={`mt-4 block h-1 rounded-full ${toneBar[tone]} opacity-30 group-hover:opacity-100 transition-opacity duration-300`}
        aria-hidden="true"
      ></span>
    </Card>
  );
}