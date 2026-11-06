import { Link } from "react-router-dom";
import BasicInfoCard from "@/pages/dashboard/profile/components/BasicInfoCard";
import ProfileDetailsCard from "@/pages/dashboard/profile/components/ProfileDetailsCard";

export default function Profile() {
  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
            Profile
          </h1>
          <p className="text-sm text-foreground-600 mt-1">
            Your account details and professional profile — this is what powers your résumés and matches.
          </p>
        </div>
        <Link
          to="/dashboard/experience"
          className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-award-line"></i>
          My Work Highlights
        </Link>
      </section>

      <div className="grid xl:grid-cols-5 gap-6 items-start">
        <div className="xl:col-span-2 animate-fade-in-up">
          <BasicInfoCard />
        </div>
        <div className="xl:col-span-3 animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
          <ProfileDetailsCard />
        </div>
      </div>
    </div>
  );
}