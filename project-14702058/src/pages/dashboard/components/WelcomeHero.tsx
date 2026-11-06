import { useState } from "react";
import { Link } from "react-router-dom";
import { useBrandName } from "@/hooks/useBranding";
import ResumeWhereYouLeftOff from "@/pages/dashboard/components/ResumeWhereYouLeftOff";
import { Badge, Button, Card } from "@/components/base";

interface WelcomeHeroProps {
  greeting: string;
  firstName: string;
  matchesCount: number;
  interviewsCount: number;
  goalDone: number;
  goalTarget: number;
  goalPct: number;
}

/**
 * The dashboard's opening moment — a photographic banner that greets the user,
 * surfaces the day's headline numbers, and keeps the weekly-goal + search CTA
 * that used to sit in the plain header row. If the photo can't load we fall back
 * to a token-based gradient so the block always looks intentional.
 */
export default function WelcomeHero({
  greeting,
  firstName,
  matchesCount,
  interviewsCount,
  goalDone,
  goalTarget,
  goalPct,
}: WelcomeHeroProps) {
  const brandName = useBrandName();
  const [imgOk, setImgOk] = useState(true);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="animate-fade-in-up relative overflow-hidden rounded-2xl border border-background-200 min-h-[260px] md:min-h-[280px]">
      {imgOk ? (
        <>
          <img
            src="https://readdy.ai/api/search-image?query=Bright%20lifestyle%20photograph%20of%20a%20stylish%20professional%20standing%20beside%20a%20tall%20sunlit%20window%20holding%20a%20tablet%2C%20relaxed%20confident%20posture%2C%20airy%20modern%20lounge%20with%20soft%20textiles%2C%20warm%20sand%20and%20gentle%20olive%20palette%20with%20subtle%20terracotta%20accents%2C%20soft%20diffused%20daylight%2C%20shallow%20depth%20of%20field%2C%20upscale%20magazine%20photography%2C%20deep%20shadowed%20zone%20along%20the%20left%20edge%20for%20overlay%20text%2C%20high%20resolution&width=1600&height=560&seq=dash-hero-welcome-02&orientation=landscape"
            alt="A professional standing by a sunlit window with a tablet"
            title={`Your ${brandName} dashboard`}
            onError={() => setImgOk(false)}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground-950/92 via-foreground-950/72 to-foreground-950/45"></div>
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-foreground-950 via-foreground-900 to-primary-700"></div>
      )}

      <div className="relative z-10 p-6 md:p-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div className="max-w-xl">
          <Badge tone="secondary" icon="ri-calendar-line" className="uppercase tracking-widest">
            {today}
          </Badge>
          <h1 className="mt-4 font-heading text-2xl md:text-4xl leading-tight font-medium text-background-50">
            {greeting}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mt-2 text-sm md:text-base text-background-100/90 leading-relaxed">
            You have {matchesCount} match{matchesCount === 1 ? "" : "es"} and{" "}
            {interviewsCount} interview{interviewsCount === 1 ? "" : "s"} coming up.
            Let&apos;s move one of them forward today.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/dashboard/matches"
              className="inline-flex items-center gap-2 text-xs font-semibold text-background-50 bg-background-50/10 border border-background-50/20 rounded-lg px-3 py-1.5 hover:bg-background-50/20 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-focus-3-line text-accent-300"></i>
              {matchesCount} matches
            </Link>
            <Link
              to="/dashboard/interview"
              className="inline-flex items-center gap-2 text-xs font-semibold text-background-50 bg-background-50/10 border border-background-50/20 rounded-lg px-3 py-1.5 hover:bg-background-50/20 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-mic-line text-accent-300"></i>
              {interviewsCount} interviews
            </Link>
            <Link
              to="/dashboard/tester"
              className="inline-flex items-center gap-2 text-xs font-semibold text-background-50 bg-accent-500/25 border border-accent-300/50 rounded-lg px-3 py-1.5 hover:bg-accent-500/40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-flask-line"></i>
              Tester program
              <i className="ri-arrow-right-s-line"></i>
            </Link>
          </div>

          <ResumeWhereYouLeftOff />
        </div>

        <Card surface="tinted" padded className="w-full lg:w-[300px]">
          <div className="flex items-center justify-between text-xs text-foreground-600 mb-2">
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-flag-line text-accent-600"></i>
              Weekly goal
            </span>
            <span className="font-semibold text-foreground-900">
              {goalDone}/{goalTarget} apps
            </span>
          </div>
          <div className="h-2 bg-background-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-500 rounded-full transition-all duration-500"
              style={{ width: `${goalPct}%` }}
            ></div>
          </div>
          <Button
            variant="solid"
            fullWidth
            icon="ri-radar-line"
            to="/dashboard/search"
            className="mt-4"
          >
            Run new search
          </Button>
        </Card>
      </div>
    </section>
  );
}