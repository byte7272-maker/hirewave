import { useApi } from "@/lib/useApi";
import { toneIconBg, toneBadge } from "@/pages/dashboard/components/tone";
import { DATA_CHANGED, type Application, type MatchOut } from "@/lib/backend";

type Tone = "primary" | "accent" | "secondary" | "foreground";

export default function StatsOverview() {
  const matches = useApi<MatchOut[]>("/api/v1/jobs/matches?limit=100", [DATA_CHANGED]);
  const apps = useApi<Application[]>("/api/v1/applications", [DATA_CHANGED]);

  const a = apps.data ?? [];
  const submitted = a.filter((x) => x.status === "submitted").length;
  const interviewing = a.filter((x) => x.status === "interviewing").length;
  const offers = a.filter((x) => x.status === "offered").length;

  const stats: { label: string; value: number; icon: string; tone: Tone; hint: string }[] = [
    { label: "Job matches", value: matches.data?.length ?? 0, icon: "ri-focus-3-line", tone: "primary", hint: "AI-ranked" },
    { label: "Applications", value: a.length, icon: "ri-send-plane-line", tone: "accent", hint: `${submitted} submitted` },
    { label: "Interviewing", value: interviewing, icon: "ri-calendar-line", tone: "secondary", hint: "in progress" },
    { label: "Offers", value: offers, icon: "ri-trophy-line", tone: "foreground", hint: "received" },
  ];

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <div key={s.label} className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up" style={{ animationDelay: `${i * 0.06}s` }}>
          <div className="flex items-start justify-between gap-3">
            <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${toneIconBg[s.tone]}`}>
              <i className={`${s.icon} text-lg`}></i>
            </div>
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${toneBadge[s.tone]}`}>{s.hint}</span>
          </div>
          <div className="mt-4 font-heading text-3xl md:text-4xl text-foreground-950 font-medium">{s.value}</div>
          <div className="text-sm text-foreground-600 mt-0.5">{s.label}</div>
        </div>
      ))}
    </section>
  );
}
