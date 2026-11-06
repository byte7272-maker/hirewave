import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import StatsOverview from "@/pages/dashboard/components/StatsOverview";
import ConnectedSitesSummary from "@/pages/dashboard/components/ConnectedSitesSummary";
import JobMatches from "@/pages/dashboard/components/JobMatches";
import TopMatchCard from "@/pages/dashboard/components/TopMatchCard";
import RecentActivity from "@/pages/dashboard/components/RecentActivity";
import SavedJobs from "@/pages/dashboard/components/SavedJobs";
import DocumentsSummary from "@/pages/dashboard/components/DocumentsSummary";
import WelcomeHero from "@/pages/dashboard/components/WelcomeHero";
import JumpBackInRail from "@/pages/dashboard/components/JumpBackInRail";
import DocumentVersionsRails from "@/pages/dashboard/components/DocumentVersionsRails";
import ConnectSiteCard from "@/pages/dashboard/components/ConnectSiteCard";
import ApprovalWaitingBanner from "@/pages/dashboard/components/ApprovalWaitingBanner";
import OnboardingLauncher from "@/pages/dashboard/onboarding/components/OnboardingLauncher";
import WorkHighlightsCta from "@/pages/dashboard/components/WorkHighlightsCta";
import {
  listMatches,
  listSavedJobs,
  saveJob,
  unsaveJob,
  savedJobId,
  type JobMatch,
  type SavedJob,
} from "@/lib/jobs";

import { type Notification } from "@/lib/notifications";
import type { DashboardOutletContext } from "@/pages/dashboard/DashboardLayout";
import { getFirstName, useCurrentUser } from "@/hooks/useCurrentUser";
import { createAndAddApplication, useApplications } from "@/hooks/useApplicationsStore";
import { useToast } from "@/components/base/ToastProvider";
import WidgetBoundary from "@/components/feature/WidgetBoundary";

export default function Overview() {
  const { searchQuery, summary, summaryLoading } = useOutletContext<DashboardOutletContext>();
  const { showToast } = useToast();

  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const { applications, refresh: refreshApplications } = useApplications();

  const [applyingId, setApplyingId] = useState<string | number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const results = await Promise.allSettled([
        listMatches(),
        listSavedJobs(),
        refreshApplications(),
      ]);
      if (!active) return;
      const [matchesResult, savedResult] = results;
      setMatches(
        matchesResult.status === "fulfilled"
          ? Array.isArray(matchesResult.value)
            ? matchesResult.value
            : []
          : [],
      );
      setSavedJobs(
        savedResult.status === "fulfilled"
          ? Array.isArray(savedResult.value)
            ? savedResult.value
            : []
          : [],
      );
    })();
    return () => {
      active = false;
    };
  }, []);

  const savedIds = savedJobs.map(savedJobId);

  const filtered = matches.filter((m) => {
    const haystack =
      `${m.title} ${m.company} ${m.matching_skills.join(" ")} ${m.gap_skills.join(" ")}`.toLowerCase();
    return haystack.includes(searchQuery.trim().toLowerCase());
  });

  async function toggleSave(m: JobMatch) {
    const id = m.job_id;
    const isSaved = savedJobs.some((j) => String(savedJobId(j)) === String(id));
    if (isSaved) {
      const prev = savedJobs;
      setSavedJobs((cur) => cur.filter((j) => String(savedJobId(j)) !== String(id)));
      try {
        await unsaveJob(id);
        showToast(`Removed “${m.title}” from saved jobs`, "info");
      } catch (err) {
        setSavedJobs(prev);
        showToast(err instanceof Error ? err.message : "Could not remove the job.", "error");
      }
    } else {
      try {
        await saveJob(id);
        showToast(`Saved “${m.title}”`, "success");
        const list = await listSavedJobs();
        setSavedJobs(list ?? []);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not save the job.", "error");
      }
    }
  }

  async function quickApply(m: JobMatch) {
    setApplyingId(m.job_id);
    try {
      await createAndAddApplication({
        title: m.title,
        company: m.company,
        job_id: m.job_id,
      });
      showToast(`Added "${m.title}" to your pipeline`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not quick apply.", "error");
    } finally {
      setApplyingId(null);
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const { user } = useCurrentUser();
  const firstName = user?.full_name ? getFirstName(user.full_name) : "";
  const matchesCount = summary?.matches?.total ?? matches.length;
  const interviewsCount = summary?.interviews ?? 0;
  const applicationsCount = summary?.applications?.total ?? applications.length;
  const weeklyGoalTarget = Math.max(1, summary?.weekly_goal?.target ?? 30);
  const goalDone = Math.min(summary?.weekly_goal?.done ?? 0, weeklyGoalTarget);
  const goalPct = weeklyGoalTarget > 0 ? (goalDone / weeklyGoalTarget) * 100 : 0;

  const recentActivity: Notification[] = (summary?.recent_activity ?? []).map((a, i) => ({
    id: `${a.type ?? "activity"}-${i}`,
    type: a.type,
    message: a.message,
    created_at: a.at,
    read: a.read,
  }));
  const savedJobsCount = summary?.saved_jobs ?? savedJobs.length;
  const savedSearchesCount = summary?.saved_searches ?? 0;

  return (
    <div className="space-y-6">
      <WidgetBoundary label="Your overview">
        <WelcomeHero
          greeting={greeting}
          firstName={firstName}
          matchesCount={matchesCount}
          interviewsCount={interviewsCount}
          goalDone={goalDone}
          goalTarget={weeklyGoalTarget}
          goalPct={goalPct}
        />
      </WidgetBoundary>

      <WidgetBoundary label="Setup">
        <OnboardingLauncher />
      </WidgetBoundary>

      <WidgetBoundary label="Work highlights">
        <WorkHighlightsCta />
      </WidgetBoundary>

      <WidgetBoundary label="Connect a site">
        <ConnectSiteCard />
      </WidgetBoundary>

      <WidgetBoundary label="Approvals">
        <ApprovalWaitingBanner />
      </WidgetBoundary>

      <WidgetBoundary label="Jump back in">
        <JumpBackInRail />
      </WidgetBoundary>

      <WidgetBoundary label="Document versions">
        <DocumentVersionsRails />
      </WidgetBoundary>

      <WidgetBoundary label="Stats">
        <StatsOverview
          matches={matchesCount}
          applications={applicationsCount}
          interviews={interviewsCount}
          extra={<ConnectedSitesSummary />}
        />
      </WidgetBoundary>

      <WidgetBoundary label="Top match">
        <TopMatchCard top={summary?.matches?.top ?? null} />
      </WidgetBoundary>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 animate-fade-in-up">
          <WidgetBoundary label="Top matches">
            <JobMatches
              matches={filtered}
              savedIds={savedIds}
              onToggleSave={toggleSave}
              appliedIds={applications.map((a) => a.job_id).filter((id): id is string | number => id !== undefined)}
              onQuickApply={quickApply}
              applyingId={applyingId}
              limit={3}
              showQualityBar
            />
          </WidgetBoundary>
        </div>
        <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: "0.08s" }}>
          <WidgetBoundary label="Recent activity">
            <RecentActivity items={recentActivity} loading={summaryLoading} />
          </WidgetBoundary>
          <WidgetBoundary label="Documents">
            <DocumentsSummary
              resumeCount={summary?.resumes ?? 0}
              coverLetterCount={summary?.cover_letters ?? 0}
            />
          </WidgetBoundary>
          <WidgetBoundary label="Saved jobs">
            <SavedJobs
              jobs={savedJobs}
              savedCount={savedJobsCount}
              savedSearchesCount={savedSearchesCount}
            />
          </WidgetBoundary>
        </div>
      </div>
    </div>
  );
}