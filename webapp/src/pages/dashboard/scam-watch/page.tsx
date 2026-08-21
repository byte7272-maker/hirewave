import { useCallback, useEffect, useState } from "react";
import { listFlagged, VERDICT_META, EMPLOYER_META, type Authenticity } from "@/lib/authenticity";

export default function ScamWatch() {
  const [items, setItems] = useState<Authenticity[] | null>(null);
  const reload = useCallback(() => { listFlagged().then(setItems).catch(() => setItems([])); }, []);
  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="animate-fade-in-up flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Scam watch</h1>
          <p className="text-sm text-foreground-600 mt-1">Postings the community flagged as dubious or fake — shared across everyone, fused with employer-site checks and fraud signals.</p>
        </div>
        <button onClick={reload} className="text-sm font-medium text-foreground-600 hover:text-foreground-900 cursor-pointer"><i className="ri-refresh-line"></i></button>
      </section>

      {items === null ? (
        <div className="py-16 text-center text-foreground-500"><i className="ri-loader-4-line text-2xl animate-spin"></i></div>
      ) : items.length === 0 ? (
        <section className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-16 text-center animate-fade-in-up">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl bg-primary-100 text-primary-700 mb-3"><i className="ri-shield-check-line text-xl"></i></div>
          <p className="text-sm text-foreground-600">Nothing flagged yet.</p>
          <p className="text-xs text-foreground-400 mt-1">Report suspicious postings from your matches to help everyone.</p>
        </section>
      ) : (
        <section className="space-y-3 animate-fade-in-up">
          {items.map((r) => {
            const meta = VERDICT_META[r.verdict] ?? VERDICT_META.dubious;
            return (
              <div key={r.key} className="rounded-2xl bg-background-100/60 border border-background-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${meta.cls}`}><i className={meta.icon}></i>{meta.label}</span>
                      <strong className="text-sm text-foreground-950">{r.title || "(untitled role)"}</strong>
                      <span className="text-xs text-foreground-500">· {r.company || "unknown company"}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-foreground-500 flex-wrap">
                      <span>🚩 {r.tally.scam} scam · {r.tally.dubious} dubious · {r.tally.legit} legit</span>
                      <span>· {EMPLOYER_META[r.employer_status] ?? r.employer_status}</span>
                      <span>· fraud score {r.min_authenticity_score}/100</span>
                    </div>
                    {r.reasons.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {r.reasons.slice(0, 3).map((reason, i) => <li key={i} className="text-xs text-foreground-600">“{reason}”</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
