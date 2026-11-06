import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  resumeEvidencePrompts,
  type EvidencePrompt,
  type EvidencePromptsResult,
} from "@/lib/documents";
import { formatPromptsClipboard } from "@/lib/highlightsWorkspace";
import {
  readCollapsedCategories,
  writeCollapsedCategories,
  writePromptCopied,
} from "@/lib/evidencePromptMemory";
import {
  generatedPromptsKey,
  readGeneratedPrompts,
  writeGeneratedPrompts,
} from "@/lib/generatedPromptsStore";

interface ZonePromptsProps {
  resumeId: string | number;
  /** Optional target job so the prompts lean toward that role. */
  jobPostingId?: string;
  /** Fired the first time a prompt is copied — the zone nav marks Prompts done. */
  onCopied?: () => void;
  /**
   * Hand the freshly-loaded prompts up to the workspace, so its one-tap
   * "Copy all + Clear draft" shortcut can put them on the clipboard (for reuse on
   * the next résumé) without re-fetching them.
   */
  onPromptsLoaded?: (prompts: EvidencePrompt[]) => void;
}

/** Sentinel so the "all copied" state never collides with a real prompt key. */
const ALL_COPIED = "__all__";

/** A numbered mini-header for a zone. */
function ZoneHeader({
  step,
  icon,
  title,
  subtitle,
}: {
  step: string;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-4 border-b border-background-200">
      <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
        <i className={`${icon} text-lg`}></i>
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-400">
            {step}
          </span>
        </div>
        <h2 className="font-heading text-base font-medium text-foreground-950">{title}</h2>
        <p className="text-xs text-foreground-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * Zone A — Generate prompts for your work AI. Everything stays on this page: the
 * guidance, the prompts grouped by category (each copyable), and a one-click
 * "copy all". The user runs the prompt in their own company AI and pastes the
 * answer into Zone B — nothing leaves the app until they paste it back.
 *
 * Generating is an explicit action: nothing is fetched on mount or when the
 * résumé / target role changes. The generated set is held (per résumé + role,
 * across reloads) until the user asks to generate again, so the same prompts sit
 * here for reuse instead of being rebuilt on every visit.
 */
export default function ZonePrompts({
  resumeId,
  jobPostingId,
  onCopied,
  onPromptsLoaded,
}: ZonePromptsProps) {
  const [prompts, setPrompts] = useState<EvidencePromptsResult | null>(null);
  // Reading back a previously generated set (fast, local) vs. generating one.
  const [restoring, setRestoring] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(readCollapsedCategories(resumeId))
  );
  const copyTimer = useRef<number | null>(null);

  const storeKey = generatedPromptsKey(resumeId, jobPostingId);

  /**
   * Restore the held set for this résumé + target role. This never calls the API
   * — it only reads back a set the user already asked to generate, so neither a
   * mount nor a résumé/role switch regenerates anything on its own.
   */
  useEffect(() => {
    let alive = true;
    setRestoring(true);
    setError("");
    setPrompts(null);
    setCopied(null);
    void readGeneratedPrompts(storeKey)
      .then((stored) => {
        if (!alive || !stored) return;
        setPrompts(stored);
        onPromptsLoaded?.(stored.prompts);
      })
      .finally(() => {
        if (alive) setRestoring(false);
      });
    return () => {
      alive = false;
    };
  }, [storeKey, onPromptsLoaded]);

  // Re-sync the collapsed categories when the résumé changes (the initializer
  // only runs on first mount, and the component isn't remounted on a switch).
  useEffect(() => {
    setCollapsed(new Set(readCollapsedCategories(resumeId)));
  }, [resumeId]);

  /** The one and only place the API is called — a direct response to a click. */
  const generate = useCallback(async () => {
    setGenerating(true);
    setError("");
    try {
      const result = await resumeEvidencePrompts(resumeId, jobPostingId);
      setPrompts(result);
      onPromptsLoaded?.(result.prompts);
      await writeGeneratedPrompts(storeKey, result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not generate the prompts. Please try again."
      );
    } finally {
      setGenerating(false);
    }
  }, [resumeId, jobPostingId, storeKey, onPromptsLoaded]);

  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    []
  );

  useEffect(() => {
    writeCollapsedCategories(resumeId, Array.from(collapsed));
  }, [resumeId, collapsed]);

  async function copyText(text: string, key?: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key ?? text);
      // Mark the "Prompts" zone as done for this résumé + tell the nav.
      writePromptCopied(resumeId);
      onCopied?.();
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard may be blocked — the prompt is still selectable by hand */
    }
  }

  function toggleCategory(category: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  // Group the prompts by category, preserving the API's order.
  const grouped = (() => {
    const map = new Map<string, EvidencePromptsResult["prompts"]>();
    for (const p of prompts?.prompts ?? []) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return Array.from(map.entries());
  })();

  const allCollapsed =
    grouped.length > 0 && grouped.every(([category]) => collapsed.has(category));
  const totalPrompts = prompts?.prompts.length ?? 0;

  function copyAll() {
    const list = prompts?.prompts ?? [];
    if (!list.length) return;
    void copyText(formatPromptsClipboard(list), ALL_COPIED);
  }

  return (
    <section
      id="my-work-highlights-prompts"
      className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden scroll-mt-32"
    >
      <ZoneHeader
        step="Zone A"
        icon="ri-magic-line"
        title="Generate prompts for your work AI"
        subtitle="Copy a prompt, run it in your company AI (Copilot, Teams, chat, docs), then paste the answer below."
      />

      <div className="p-5 space-y-4">
        {restoring ? (
          <div className="py-10 flex items-center justify-center gap-2 text-sm text-foreground-500">
            <i className="ri-loader-4-line animate-spin"></i>
            Restoring your prompts…
          </div>
        ) : !prompts ? (
          error ? (
            <div className="rounded-lg bg-accent-50 border border-accent-200 border-l-4 border-l-accent-500 px-3.5 py-3 flex items-start gap-3">
              <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
                <i className="ri-error-warning-line"></i>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground-800">{error}</p>
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <i className={generating ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
                  Try again
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-background-300 bg-background-50 px-5 py-9 text-center">
              <span className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                <i className="ri-magic-line text-xl"></i>
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground-900">
                Generate your work prompts
              </p>
              <p className="mt-1 text-xs text-foreground-500 max-w-md mx-auto leading-relaxed">
                We&rsquo;ll build a ready-to-run prompt set tailored to this résumé
                {jobPostingId ? " and target role" : ""}. They stay right here — we only
                regenerate when you ask, so you can come back to them later.
              </p>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={generating}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <i className={generating ? "ri-loader-4-line animate-spin" : "ri-magic-line"}></i>
                {generating ? "Generating prompts…" : "Generate prompts"}
              </button>
            </div>
          )
        ) : (
          <>
            {error && (
              <div className="rounded-lg bg-accent-50 border border-accent-200 px-3.5 py-2.5 flex items-start gap-2.5">
                <i className="ri-error-warning-line text-accent-600 mt-0.5"></i>
                <p className="min-w-0 flex-1 text-xs text-foreground-700">{error}</p>
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating}
                  className="text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Try again
                </button>
              </div>
            )}

            {prompts.guidance && (
              <div className="rounded-lg bg-secondary-50 border border-secondary-200 border-l-4 border-l-secondary-500 px-3.5 py-3 flex items-start gap-3">
                <span className="w-7 h-7 flex items-center justify-center rounded-md bg-secondary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
                  <i className="ri-shield-check-line"></i>
                </span>
                <p className="text-xs text-foreground-700 leading-relaxed">{prompts.guidance}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() =>
                  setCollapsed(allCollapsed ? new Set() : new Set(grouped.map(([c]) => c)))
                }
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-600 hover:text-foreground-950 px-2.5 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="w-4 h-4 flex items-center justify-center">
                  <i className={allCollapsed ? "ri-expand-diagonal-line" : "ri-collapse-diagonal-line"}></i>
                </span>
                {allCollapsed ? "Expand all" : "Collapse all"}
              </button>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating}
                  title="Generate a fresh prompt set for this résumé"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-background-200 bg-background-50 text-foreground-700 hover:bg-background-100 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <i className={generating ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
                  {generating ? "Regenerating…" : "Regenerate"}
                </button>
                <button
                  type="button"
                  onClick={copyAll}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    copied === ALL_COPIED
                      ? "bg-primary-100 text-primary-800"
                      : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600"
                  }`}
                >
                  <i className={copied === ALL_COPIED ? "ri-check-line" : "ri-file-copy-2-line"}></i>
                  {copied === ALL_COPIED ? "All prompts copied" : `Copy all prompts (${totalPrompts})`}
                </button>
              </div>
            </div>

            {grouped.map(([category, items]) => {
              const isCollapsed = collapsed.has(category);
              return (
                <div key={category} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    aria-expanded={!isCollapsed}
                    className="w-full flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground-500 hover:text-foreground-950 transition-colors cursor-pointer"
                  >
                    <span className="w-4 h-4 flex items-center justify-center">
                      <i className={isCollapsed ? "ri-arrow-right-s-line" : "ri-arrow-down-s-line"}></i>
                    </span>
                    {category}
                    <span className="text-foreground-400 font-normal normal-case">({items.length})</span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-2">
                      {items.map((p) => (
                        <div
                          key={p.title}
                          className="rounded-lg border border-background-200 bg-background-50 px-3.5 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground-900">{p.title}</p>
                            <button
                              type="button"
                              onClick={() => copyText(p.prompt)}
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                                copied === p.prompt
                                  ? "bg-primary-100 text-primary-800"
                                  : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600"
                              }`}
                            >
                              <i className={copied === p.prompt ? "ri-check-line" : "ri-file-copy-line"}></i>
                              {copied === p.prompt ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <p className="mt-1.5 text-xs text-foreground-600 leading-relaxed whitespace-pre-wrap">
                            {p.prompt}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}