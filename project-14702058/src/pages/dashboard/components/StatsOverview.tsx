import type { ReactNode } from "react";
import StatCard, { type StatTone } from "@/pages/dashboard/components/StatCard";

interface StatsOverviewProps {
  matches: number;
  applications: number;
  interviews: number;
  /** Optional extra widget rendered as an additional card in the same row. */
  extra?: ReactNode;
}

const CARDS: {
  id: "matches" | "applications" | "interviews";
  label: string;
  caption: string;
  icon: string;
  tone: StatTone;
  trend: string;
  to: string;
}[] = [
  {
    id: "matches",
    label: "Matches",
    caption: "verified this week",
    icon: "ri-focus-3-line",
    tone: "primary",
    trend: "+12%",
    to: "/dashboard/matches",
  },
  {
    id: "applications",
    label: "In pipeline",
    caption: "awaiting a reply",
    icon: "ri-send-plane-line",
    tone: "accent",
    trend: "+5",
    to: "/dashboard/applications",
  },
  {
    id: "interviews",
    label: "Interviews",
    caption: "scheduled ahead",
    icon: "ri-mic-line",
    tone: "secondary",
    trend: "+2",
    to: "/dashboard/interview",
  },
];

/**
 * The dashboard's headline stat row. Now built on the shared `StatCard`, so the
 * dashboard, Applications board and Interview hub all share one stat-card rhythm.
 */
export default function StatsOverview({
  matches,
  applications,
  interviews,
  extra,
}: StatsOverviewProps) {
  const values: Record<string, number> = {
    matches,
    applications,
    interviews,
  };

  return (
    <section
      className={`grid grid-cols-1 sm:grid-cols-2 ${
        extra ? "xl:grid-cols-4" : "xl:grid-cols-3"
      } gap-4`}
    >
      {CARDS.map((c, i) => (
        <StatCard
          key={c.id}
          label={c.label}
          value={values[c.id]}
          caption={c.caption}
          icon={c.icon}
          tone={c.tone}
          trend={c.trend}
          to={c.to}
          delay={i * 0.06}
        />
      ))}
      {extra}
    </section>
  );
}