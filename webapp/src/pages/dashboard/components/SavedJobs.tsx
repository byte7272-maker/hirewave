import { Link } from "react-router-dom";
import { useSavedJobs } from "@/lib/saved";

export default function SavedJobs() {
  const { saved } = useSavedJobs();

  return (
    <section id="saved-jobs" className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
        <h2 className="font-heading text-lg font-medium text-foreground-950">Saved jobs</h2>
        <span className="text-xs text-foreground-500">{saved.length} saved</span>
      </div>
      {saved.length === 0 ? (
        <p className="px-5 py-8 text-sm text-foreground-500 text-center">Bookmark roles from your matches to see them here.</p>
      ) : (
        <ul className="divide-y divide-background-200">
          {saved.slice(0, 5).map((j) => (
            <li key={j.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-background-200 font-heading font-semibold text-foreground-900 flex-shrink-0">
                {j.companyInitial}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground-900 truncate">{j.title}</p>
                <p className="text-xs text-foreground-600 truncate mt-0.5">{j.company} · {j.location}</p>
                <p className="text-[11px] text-foreground-400 mt-0.5">{j.salary}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="px-5 py-3 border-t border-background-200">
        <Link to="/dashboard/saved" className="block w-full text-center text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap">
          View all saved
        </Link>
      </div>
    </section>
  );
}
