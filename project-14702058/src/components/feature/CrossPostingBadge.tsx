import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { CrossPosting } from "@/lib/jobs";
import { BoardMark } from "@/components/feature/SourceChip";

interface CrossPostingBadgeProps {
  likely_duplicate?: boolean;
  cross_postings?: CrossPosting[];
  cross_posting_ids?: Array<string | number>;
  duplicate_group_id?: string | number;
  consolidated_count?: number;
  consolidated_sources?: string[];
}

function platformOf(p: CrossPosting): string {
  return p.source_display || p.source_platform || p.source || "Another board";
}

export default function CrossPostingBadge({
  likely_duplicate,
  cross_postings,
  cross_posting_ids,
  consolidated_count,
  consolidated_sources,
}: CrossPostingBadgeProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const postings: CrossPosting[] = cross_postings?.length
    ? cross_postings
    : (cross_posting_ids ?? []).map((id) => ({ id }));

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      setPos(null);
    };
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      setPos(null);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - 276);
      setPos({ top: rect.bottom + 6, left });
    } else {
      setPos(null);
    }
    setOpen(true);
  }

  const hasConsolidated = (consolidated_count ?? 0) > 0;
  const hasDuplicate = likely_duplicate === true;

  if (hasConsolidated) {
    const label = consolidated_sources?.length
      ? `Also on ${consolidated_sources.join(", ")}`
      : undefined;
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap"
        title={label}
      >
        <i className="ri-stack-line"></i>
        Seen on {consolidated_count} board{consolidated_count === 1 ? "" : "s"}
      </span>
    );
  }

  if (hasDuplicate) {
    return (
      <>
        <button
          ref={btnRef}
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent-100 text-accent-900 hover:bg-accent-200 transition-colors cursor-pointer whitespace-nowrap"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <i className="ri-file-copy-line"></i>
          Likely the same job
          <i className={open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
        </button>

        {open &&
          pos &&
          createPortal(
            <div
              ref={menuRef}
              className="fixed z-50 w-64 rounded-lg bg-background-50 border border-background-200 p-1.5"
              style={{ top: pos.top, left: pos.left }}
            >
              <p className="px-2 py-1.5 text-[11px] font-semibold text-foreground-500 uppercase tracking-wide">
                Compare sources
              </p>
              <ul className="space-y-0.5">
                {postings.map((p, i) => {
                  const platform = platformOf(p);
                  const key = String(p.id ?? p.job_posting_id ?? p.posting_id ?? i);
                  const inner = (
                    <>
                      <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                        <BoardMark
                          platform={p.source_platform ?? p.source ?? p.source_display}
                          size="w-3.5 h-3.5 text-[8px]"
                        />
                        <span className="truncate">{platform}</span>
                      </span>
                      {p.url ? (
                        <i className="ri-external-link-line text-foreground-400 text-[11px] flex-shrink-0"></i>
                      ) : null}
                    </>
                  );
                  return (
                    <li key={key}>
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-foreground-800 hover:bg-background-100 transition-colors cursor-pointer"
                        >
                          {inner}
                        </a>
                      ) : (
                        <span className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-foreground-700">
                          {inner}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )}
      </>
    );
  }

  return null;
}