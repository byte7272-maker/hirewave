import { useState } from "react";
import type { CommunityQuestion } from "@/lib/questions";
import { Card } from "@/components/base";
import RankBadge from "@/pages/dashboard/components/RankBadge";
import { fitSpine } from "@/pages/dashboard/components/tone";

const CATEGORY_TONE: Record<string, string> = {
  Behavioral: "bg-accent-100 text-accent-900",
  Technical: "bg-primary-100 text-primary-900",
  "Case study": "bg-secondary-100 text-secondary-900",
  Leadership: "bg-foreground-100 text-foreground-800",
  General: "bg-background-200 text-foreground-700",
};

function toneFor(category?: string) {
  if (!category) return "bg-background-200 text-foreground-700";
  return CATEGORY_TONE[category] ?? "bg-background-200 text-foreground-700";
}

function formatDate(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A question is a ranked list entry, but it has no fit score to band by — so it
// wears the same quiet, neutral spine the ranked lists fall back to when no
// score exists, keeping the language consistent without inventing a metric.
const QUIET_SPINE = fitSpine(null).color;

interface QuestionCardProps {
  question: CommunityQuestion;
  /** 0-based position in the list — shown as the rank badge. */
  index: number;
  onVote: (id: string | number) => void;
  onFlag: (id: string | number) => void;
}

export default function QuestionCard({ question, index, onVote, onFlag }: QuestionCardProps) {
  const [showTips, setShowTips] = useState(false);

  const upvoted = !!question.upvoted;
  const flagged = !!question.flagged;
  const votes = question.votes ?? 0;

  return (
    <li>
      <Card surface="tinted" padded spine={QUIET_SPINE} className="animate-fade-in-up">
        <div className="flex items-start gap-3">
          <RankBadge rank={index + 1} variant="neutral" className="mt-0.5" />

          <button
            onClick={() => !upvoted && onVote(question.id)}
            disabled={upvoted}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-tile border transition-colors flex-shrink-0 ${
              upvoted
                ? "bg-primary-500 border-primary-500 text-background-50 cursor-default"
                : "border-background-300 text-foreground-600 hover:border-primary-300 hover:text-primary-700 cursor-pointer"
            }`}
            aria-label="Upvote question"
          >
            <i className="ri-arrow-up-line text-base leading-none"></i>
            <span className="text-xs font-semibold">{votes}</span>
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {question.category && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${toneFor(
                    question.category
                  )}`}
                >
                  {question.category}
                </span>
              )}
              {question.is_mine && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-400">
                  <i className="ri-user-line"></i>
                  Yours
                </span>
              )}
            </div>

            <p className="mt-1.5 text-sm font-medium text-foreground-950 leading-relaxed">
              {question.question}
            </p>

            <div className="mt-2 flex items-center gap-3 text-[11px] text-foreground-400 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <i className="ri-briefcase-line"></i>
                {question.job_title}
              </span>
              {question.author && <span>{question.author}</span>}
              {question.created_at && <span>{formatDate(question.created_at)}</span>}
            </div>

            {question.tips && (
              <div className="mt-2.5">
                <button
                  onClick={() => setShowTips((s) => !s)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-500 hover:text-foreground-800 cursor-pointer"
                >
                  <i
                    className={`ri-arrow-down-s-line transition-transform ${
                      showTips ? "rotate-180" : ""
                    }`}
                  ></i>
                  Interview tips
                </button>
                {showTips && (
                  <p className="mt-1.5 text-xs text-foreground-600 bg-background-50 border border-background-200 rounded-control px-3 py-2 leading-relaxed">
                    {question.tips}
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => !flagged && onFlag(question.id)}
            disabled={flagged}
            className={`w-8 h-8 flex items-center justify-center rounded-control transition-colors flex-shrink-0 ${
              flagged
                ? "text-accent-600 cursor-default"
                : "text-foreground-400 hover:bg-accent-100 hover:text-accent-700 cursor-pointer"
            }`}
            aria-label="Flag question"
            title={flagged ? "Flagged" : "Flag as inappropriate"}
          >
            <i className={`${flagged ? "ri-flag-fill" : "ri-flag-line"} text-base`}></i>
          </button>
        </div>
      </Card>
    </li>
  );
}