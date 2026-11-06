import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ApiError } from "@/lib/api";
import {
  contributeQuestion,
  flagQuestion,
  listMyQuestions,
  listQuestionTitles,
  searchQuestions,
  voteQuestion,
  type CommunityQuestion,
  type QuestionTitle,
} from "@/lib/questions";
import QuestionCard from "@/pages/dashboard/questions/components/QuestionCard";
import ContributeModal from "@/pages/dashboard/questions/components/ContributeModal";
import ResetPageButton from "@/components/feature/ResetPageButton";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "@/components/base";
import useViewState from "@/hooks/useViewState";
import useScrollRestore from "@/hooks/useScrollRestore";
import type { DashboardOutletContext } from "@/pages/dashboard/DashboardLayout";

type Tab = "browse" | "mine";

/** Durable, cross-device state for the questions list (backend view "questions"). */
interface QuestionsViewState extends Record<string, unknown> {
  tab?: unknown;
  filters?: { jobTitle?: unknown };
  scrollY?: unknown;
}

export default function Questions() {
  const { searchQuery } = useOutletContext<DashboardOutletContext>();

  const [tab, setTab] = useState<Tab>("browse");
  const [jobTitle, setJobTitle] = useState("");
  const [appliedTitle, setAppliedTitle] = useState("");
  const [questions, setQuestions] = useState<CommunityQuestion[]>([]);
  const [titles, setTitles] = useState<QuestionTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showContribute, setShowContribute] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contributeError, setContributeError] = useState("");
  const viewState = useViewState<QuestionsViewState>("questions");
  const restored = useRef(false);

  // Restore the saved tab + job-title filter once the durable state loads.
  useEffect(() => {
    if (!viewState.loaded || restored.current) return;
    restored.current = true;
    const saved = viewState.saved ?? {};
    if (saved.tab === "browse" || saved.tab === "mine") setTab(saved.tab);
    const jt = saved.filters?.jobTitle;
    if (typeof jt === "string" && jt) {
      setAppliedTitle(jt);
      setJobTitle(jt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.loaded]);

  // Persist the meaningful state on every change (merge-saved, debounced).
  useEffect(() => {
    if (!viewState.loaded) return;
    viewState.save({
      tab,
      filters: { jobTitle: appliedTitle },
      scrollY: Math.round(window.scrollY),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, appliedTitle, viewState.loaded]);

  useScrollRestore(
    "questions",
    viewState.loaded && !loading,
    Number(viewState.saved?.scrollY) || 0,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list =
        tab === "mine" ? await listMyQuestions() : await searchQuestions(appliedTitle);
      setQuestions(list ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load questions.");
    } finally {
      setLoading(false);
    }
  }, [tab, appliedTitle]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listQuestionTitles()
      .then((t) => setTitles(t ?? []))
      .catch(() => setTitles([]));
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q === "") return questions;
    return questions.filter(
      (item) =>
        `${item.question} ${item.job_title} ${item.category ?? ""}`
          .toLowerCase()
          .includes(q)
    );
  }, [questions, searchQuery]);

  function handleSearch() {
    setAppliedTitle(jobTitle.trim());
    setTab("browse");
  }

  async function handleVote(id: string | number) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id
          ? { ...q, upvoted: true, votes: (q.votes ?? 0) + 1 }
          : q
      )
    );
    try {
      await voteQuestion(id);
    } catch {
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === id
            ? { ...q, upvoted: false, votes: Math.max(0, (q.votes ?? 0) - 1) }
            : q
        )
      );
    }
  }

  async function handleFlag(id: string | number) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, flagged: true } : q))
    );
    try {
      await flagQuestion(id);
    } catch {
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, flagged: false } : q))
      );
    }
  }

  async function handleContribute(data: {
    job_title: string;
    question: string;
    category: string;
    tips: string;
  }) {
    setSaving(true);
    setContributeError("");
    try {
      await contributeQuestion(data);
      setShowContribute(false);
      setJobTitle(data.job_title);
      setAppliedTitle("");
      setTab("browse");
      const list = await searchQuestions("");
      setQuestions(list ?? []);
    } catch (err) {
      setContributeError(
        err instanceof ApiError ? err.message : "Could not post your question."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
            Community questions
          </h1>
          <p className="text-sm text-foreground-600 mt-1">
            Real interview questions crowdsourced by job title. Study up, then pay it forward.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button icon="ri-add-line" onClick={() => setShowContribute(true)}>
            Contribute a question
          </Button>
          <ResetPageButton
            view="questions"
            routeKeys="questions"
            onReset={() => {
              setTab("browse");
              setAppliedTitle("");
              setJobTitle("");
            }}
          />
        </div>
      </section>

      <section className="animate-fade-in-up" style={{ animationDelay: "0.04s" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-foreground-400">
              <i className="ri-search-line text-base"></i>
            </span>
            <input
              list="question-titles"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Search by job title — e.g. Product Designer"
              className="w-full rounded-lg bg-background-50 border border-background-200 pl-10 pr-3 py-2.5 text-sm text-foreground-900 placeholder:text-foreground-400 outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
            />
            <datalist id="question-titles">
              {titles.map((t) => (
                <option key={t.title} value={t.title} />
              ))}
            </datalist>
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold bg-foreground-950 text-background-50 hover:bg-foreground-800 cursor-pointer whitespace-nowrap"
          >
            Search
          </button>
        </form>
      </section>

      <div
        className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1 animate-fade-in-up"
        style={{ animationDelay: "0.06s" }}
      >
        <button
          onClick={() => {
            setTab("browse");
            setAppliedTitle("");
            setJobTitle("");
          }}
          className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap ${
            tab === "browse"
              ? "bg-background-50 text-foreground-950 border border-background-200"
              : "text-foreground-600 hover:text-foreground-900"
          }`}
        >
          Browse
        </button>
        <button
          onClick={() => setTab("mine")}
          className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap ${
            tab === "mine"
              ? "bg-background-50 text-foreground-950 border border-background-200"
              : "text-foreground-600 hover:text-foreground-900"
          }`}
        >
          My contributions
        </button>
      </div>

      {error && (
        <Card surface="tinted" className="animate-fade-in-up">
          <ErrorState
            title="We couldn't load questions"
            message={error}
            onRetry={load}
          />
        </Card>
      )}

      {loading ? (
        <Card surface="tinted" className="animate-fade-in-up">
          <div className="p-4 md:p-5">
            <LoadingState label="Loading questions…" rows={4} />
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card surface="tinted" className="animate-fade-in-up">
          <EmptyState
            icon="ri-question-answer-line"
            title={tab === "mine" ? "No contributions yet" : "No questions found"}
            description={
              tab === "mine"
                ? "Questions you share with the community will show up here."
                : "Try a different title, or be the first to contribute one."
            }
            tone="primary"
            action={
              tab === "browse" ? (
                <Button icon="ri-add-line" onClick={() => setShowContribute(true)}>
                  Contribute a question
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3 animate-fade-in-up" style={{ animationDelay: "0.08s" }}>
          {filtered.map((q, index) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={index}
              onVote={handleVote}
              onFlag={handleFlag}
            />
          ))}
        </ul>
      )}

      {showContribute && (
        <ContributeModal
          titles={titles}
          saving={saving}
          error={contributeError}
          onClose={() => setShowContribute(false)}
          onSubmit={handleContribute}
        />
      )}
    </div>
  );
}