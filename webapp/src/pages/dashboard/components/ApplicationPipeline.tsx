import { toneDot } from "@/pages/dashboard/components/tone";
import type { Application } from "@/lib/backend";

export interface PipelineCardVM {
  app: Application;
  role: string;
  company: string;
  companyInitial: string;
  detail: string;
  time: string;
  canSubmit: boolean;
}
export interface PipelineColumnVM {
  id: string;
  title: string;
  tone: "background" | "primary" | "accent" | "secondary";
  cards: PipelineCardVM[];
}

export default function ApplicationPipeline({
  columns,
  onSubmit,
  submittingId,
}: {
  columns: PipelineColumnVM[];
  onSubmit: (app: Application) => void;
  submittingId: string | null;
}) {
  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-background-200">
        <div>
          <h2 className="font-heading text-xl font-medium text-foreground-950">Application pipeline</h2>
          <p className="text-xs text-foreground-500 mt-0.5">Your full funnel, at a glance</p>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {columns.map((col) => (
          <div key={col.id} className="rounded-xl bg-background-50 border border-background-200">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-background-200">
              <span className={`w-2.5 h-2.5 rounded-full ${toneDot[col.tone]}`}></span>
              <span className="text-sm font-semibold text-foreground-900">{col.title}</span>
              <span className="ml-auto text-xs text-foreground-500 font-medium bg-background-100 px-1.5 py-0.5 rounded">{col.cards.length}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[60px]">
              {col.cards.length === 0 && <p className="text-xs text-foreground-400 px-2 py-3 text-center">Empty</p>}
              {col.cards.map((c) => (
                <div key={c.app.id} className="p-3 rounded-lg bg-background-100 border border-background-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-7 h-7 flex items-center justify-center rounded-md bg-background-200 font-heading text-xs font-semibold text-foreground-900 flex-shrink-0">{c.companyInitial}</span>
                    <span className="text-xs font-medium text-foreground-700 truncate">{c.company}</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground-950 leading-snug">{c.role}</p>
                  <p className="text-xs text-foreground-500 mt-1">{c.detail}</p>
                  <p className="text-[11px] text-foreground-400 mt-1.5 flex items-center gap-1"><i className="ri-time-line"></i> {c.time}</p>
                  {c.canSubmit && (
                    <button
                      onClick={() => onSubmit(c.app)}
                      disabled={submittingId === c.app.id}
                      className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {submittingId === c.app.id ? "Submitting…" : "Approve & submit"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
