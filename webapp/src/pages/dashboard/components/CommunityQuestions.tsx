import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import {
  searchQuestions, submitQuestion, voteQuestion, flagQuestion, myQuestions, popularTitles,
  QUESTION_CATEGORIES, type CommunityQuestion, type TitleCount,
} from "@/lib/community";

/** Search / contribute crowdsourced interview questions for a job title.
 *  `onPractice` starts a mock interview seeded with the selected questions. */
export default function CommunityQuestions({ onPractice }: { onPractice: (questions: string[]) => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<"search" | "mine">("search");

  const [jobTitle, setJobTitle] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState<CommunityQuestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [titles, setTitles] = useState<TitleCount[]>([]);
  const [mine, setMine] = useState<CommunityQuestion[]>([]);

  // submit form
  const [fTitle, setFTitle] = useState("");
  const [fCategory, setFCategory] = useState("behavioral");
  const [fQuestion, setFQuestion] = useState("");
  const [fTips, setFTips] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { popularTitles().then(setTitles).catch(() => {}); }, []);
  const reloadMine = useCallback(() => { myQuestions().then(setMine).catch(() => {}); }, []);
  useEffect(() => { if (tab === "mine") reloadMine(); }, [tab, reloadMine]);

  const runSearch = useCallback(async (title: string, cat: string) => {
    if (!title.trim()) { setResults(null); return; }
    setSearching(true);
    try {
      setResults(await searchQuestions(title, { category: cat || undefined, limit: 40 }));
      setSelected(new Set());
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Search failed.", "error");
    } finally {
      setSearching(false);
    }
  }, [toast]);

  async function vote(q: CommunityQuestion) {
    try {
      const updated = await voteQuestion(q.id);
      setResults((r) => r?.map((x) => (x.id === q.id ? updated : x)) ?? r);
      setMine((m) => m.map((x) => (x.id === q.id ? updated : x)));
    } catch { /* ignore */ }
  }

  async function flag(q: CommunityQuestion) {
    try {
      await flagQuestion(q.id);
      toast.push("Thanks — flagged for review.", "success");
      setResults((r) => r?.filter((x) => x.id !== q.id) ?? r);
    } catch { /* ignore */ }
  }

  async function submit() {
    if (!fTitle.trim() || fQuestion.trim().length < 8) {
      toast.push("Add a job title and a question (at least 8 characters).", "error");
      return;
    }
    setSubmitting(true);
    try {
      await submitQuestion({ job_title: fTitle.trim(), question: fQuestion.trim(), category: fCategory, tips: fTips.trim() });
      toast.push("Question shared with the community. Thank you!", "success");
      setFQuestion(""); setFTips("");
      popularTitles().then(setTitles).catch(() => {});
      if (jobTitle.trim()) runSearch(jobTitle, category);
      reloadMine();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Submit failed.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function practiceSelected() {
    const pool = results ?? [];
    const chosen = pool.filter((q) => selected.has(q.id));
    const questions = (chosen.length ? chosen : pool).map((q) => q.question);
    if (!questions.length) { toast.push("Search and pick some questions first.", "error"); return; }
    onPractice(questions.slice(0, 10));
  }

  const QuestionCard = ({ q, selectable }: { q: CommunityQuestion; selectable?: boolean }) => (
    <div className="rounded-xl bg-background-50 border border-background-200 p-4">
      <div className="flex items-start gap-3">
        {selectable && (
          <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)}
            className="mt-1 w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer" />
        )}
        <button onClick={() => vote(q)} title={q.voted ? "Remove upvote" : "Upvote — helpful"}
          className={`flex flex-col items-center justify-center w-11 rounded-lg py-1 cursor-pointer transition-colors ${q.voted ? "bg-primary-500 text-background-50 dark:text-foreground-950" : "bg-background-100 text-foreground-600 hover:bg-background-200"}`}>
          <i className="ri-arrow-up-s-line text-lg leading-none"></i>
          <span className="text-xs font-semibold">{q.votes}</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-background-200 text-foreground-600 capitalize">{q.category}</span>
            <span className="text-[11px] text-foreground-500">{q.job_title}</span>
            {q.mine && <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-100 text-accent-800">you</span>}
          </div>
          <p className="text-sm text-foreground-900 mt-1.5">{q.question}</p>
          {q.tips && <p className="text-xs text-foreground-500 mt-1">💡 {q.tips}</p>}
        </div>
        {!q.mine && (
          <button onClick={() => flag(q)} title="Flag as inappropriate" className="text-foreground-300 hover:text-accent-600 cursor-pointer">
            <i className="ri-flag-line text-sm"></i>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-background-200 overflow-hidden">
        {(["search", "mine"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium cursor-pointer ${tab === t ? "bg-background-200 text-foreground-950" : "text-foreground-600 hover:bg-background-100"}`}>
            {t === "search" ? "Find questions" : "My submissions"}
          </button>
        ))}
      </div>

      {tab === "search" ? (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {/* search bar */}
            <div className="rounded-2xl bg-background-100/60 border border-background-200 p-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch(jobTitle, category)}
                  placeholder="Search a job type, e.g. Senior Backend Engineer"
                  className="flex-1 h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                <select value={category} onChange={(e) => { setCategory(e.target.value); if (jobTitle.trim()) runSearch(jobTitle, e.target.value); }}
                  className="h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-primary-400">
                  <option value="">All categories</option>
                  {QUESTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => runSearch(jobTitle, category)} disabled={searching || !jobTitle.trim()}
                  className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">
                  <i className="ri-search-line"></i>{searching ? "…" : "Search"}
                </button>
              </div>
              {titles.length > 0 && !results && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs text-foreground-500">Popular:</span>
                  {titles.slice(0, 8).map((t) => (
                    <button key={t.job_title} onClick={() => { setJobTitle(t.job_title); runSearch(t.job_title, category); }}
                      className="text-xs px-2 py-0.5 rounded-full bg-background-200 text-foreground-700 hover:bg-background-300 cursor-pointer">
                      {t.job_title} · {t.count}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* results */}
            {results && (
              results.length === 0 ? (
                <div className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-10 text-center">
                  <p className="text-sm text-foreground-600">No questions yet for “{jobTitle}”.</p>
                  <p className="text-xs text-foreground-400 mt-1">Be the first — add one on the right.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-foreground-600">{results.length} question{results.length === 1 ? "" : "s"} · pick some to practise</p>
                    <button onClick={practiceSelected} className="inline-flex items-center gap-2 text-sm font-semibold bg-accent-600 text-white px-4 py-2 rounded-md hover:bg-accent-700 cursor-pointer">
                      <i className="ri-vidicon-line"></i>Practise {selected.size > 0 ? `${selected.size} selected` : "these"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {results.map((q) => <QuestionCard key={q.id} q={q} selectable />)}
                  </div>
                </>
              )
            )}
          </div>

          {/* submit */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl bg-background-100/60 border border-background-200 p-4 lg:sticky lg:top-4">
              <h3 className="font-heading text-base font-medium text-foreground-950">Add a question</h3>
              <p className="text-xs text-foreground-500 mt-1 mb-3">Help others prep — share a real question you were asked.</p>
              <div className="space-y-2">
                <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="Job title (e.g. Data Scientist)"
                  className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-primary-400">
                  {QUESTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea value={fQuestion} onChange={(e) => setFQuestion(e.target.value)} rows={3} placeholder="The interview question…"
                  className="w-full px-3 py-2 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                <input value={fTips} onChange={(e) => setFTips(e.target.value)} placeholder="Optional tip for answering"
                  className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                <button onClick={submit} disabled={submitting} className="w-full text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">
                  {submitting ? "Sharing…" : "Share question"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {mine.length === 0 ? (
            <div className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-10 text-center">
              <p className="text-sm text-foreground-600">You haven't shared any questions yet.</p>
            </div>
          ) : mine.map((q) => <QuestionCard key={q.id} q={q} />)}
        </div>
      )}
    </div>
  );
}
