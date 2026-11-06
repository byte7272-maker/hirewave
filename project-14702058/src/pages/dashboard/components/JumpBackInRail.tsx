import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  entryKey,
  openRecentlyViewedEntry,
  openRecentlyViewedEntryAtVersion,
} from "@/lib/jumpBackIn";
import type { RecentlyViewedEntry, RecentlyViewedKind } from "@/lib/recentlyViewed";
import { useJumpBackIn } from "@/hooks/useJumpBackInStore";
import { getRecentChangeInfo, type RecentChangeInfo } from "@/lib/recentChangeNote";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import { useToast } from "@/components/base/ToastProvider";

const KIND_META: Record<RecentlyViewedKind, { icon: string; label: string; bubble: string }> = {
  resume: {
    icon: "ri-file-text-line",
    label: "Résumé",
    bubble: "bg-primary-100 text-primary-700",
  },
  cover_letter: {
    icon: "ri-mail-send-line",
    label: "Cover letter",
    bubble: "bg-secondary-100 text-secondary-900",
  },
  match: {
    icon: "ri-focus-3-line",
    label: "Job match",
    bubble: "bg-accent-100 text-accent-900",
  },
  application: {
    icon: "ri-briefcase-line",
    label: "Application",
    bubble: "bg-primary-100 text-primary-700",
  },
};

function relativeTime(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** True when the key event landed in a field the user is typing into. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

/**
 * The dashboard "Jump back in" banner — a loud, low-effort way back into the
 * things the user last opened (résumés, cover letters, job matches,
 * applications). The most-recently-viewed item is featured large on the left
 * with a single "jump back in" action, while the rest sit in a selectable rail
 * on the right — click one (or move through them with the arrow keys) to bring
 * it into focus, then open it. Any item can be pinned as the always-first pick
 * straight from its row (the pinned row slides to the top of the rail and stays
 * there), a featured document's last-change note reopens it at that exact
 * version, and pressing "J" — or "1"–"9" for the Nth "Choose another" item —
 * jumps straight in.
 */
export default function JumpBackInRail() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { entries, pinnedKey, loaded, setPinned, clear } = useJumpBackIn();
  const [confirmClear, setConfirmClear] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** Last change info per entry key, so re-selecting one doesn't re-fetch. */
  const [notes, setNotes] = useState<Record<string, RecentChangeInfo | null>>({});
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Seed the selection: the pinned pick when it's in the rail, else the newest.
  // A user's own selection is preserved as long as it's still present.
  useEffect(() => {
    if (!loaded) return;
    setSelectedKey((current) => {
      if (current && entries.some((e) => entryKey(e) === current)) return current;
      if (pinnedKey && entries.some((e) => entryKey(e) === pinnedKey)) return pinnedKey;
      return entries[0] ? entryKey(entries[0]) : null;
    });
  }, [loaded, entries, pinnedKey]);

  const featured = entries.find((e) => entryKey(e) === selectedKey) ?? entries[0] ?? null;
  const featuredKey = featured ? entryKey(featured) : null;

  // Fetch the featured document's last change info, once per entry (cached above).
  useEffect(() => {
    if (!featured || !featuredKey) return;
    if (featuredKey in notes) return;
    if (featured.kind !== "resume" && featured.kind !== "cover_letter") {
      setNotes((prev) => ({ ...prev, [featuredKey]: { note: null, version: null } }));
      return;
    }
    let alive = true;
    (async () => {
      const info = await getRecentChangeInfo(featured);
      if (alive) setNotes((prev) => ({ ...prev, [featuredKey]: info }));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredKey]);

  /**
   * The "Choose another" list: everything except the featured item — except the
   * pinned pick, which stays in the list (and slides to the top) so it's always
   * visible in the rail, even while it's the featured card.
   */
  const rest = useMemo(() => {
    if (!featured) return [];
    const list = entries.filter(
      (e) => entryKey(e) !== entryKey(featured) || entryKey(e) === pinnedKey,
    );
    if (!pinnedKey) return list;
    return [...list].sort((a, b) => {
      const aPinned = entryKey(a) === pinnedKey ? 0 : 1;
      const bPinned = entryKey(b) === pinnedKey ? 0 : 1;
      return aPinned - bPinned;
    });
  }, [entries, featured, pinnedKey]);

  function openEntry(entry: RecentlyViewedEntry) {
    openRecentlyViewedEntry(navigate, entry);
  }

  // Jump into the featured item (J) or the Nth "Choose another" item (1–9) from
  // anywhere on the dashboard — guarded against typing and modifier keys.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === "j" || event.key === "J") {
        if (!featured) return;
        event.preventDefault();
        openRecentlyViewedEntry(navigate, featured);
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const target = rest[Number(event.key) - 1];
        if (!target) return;
        event.preventDefault();
        openRecentlyViewedEntry(navigate, target);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [featured, rest, navigate]);

  /** Pin/unpin any entry — the shared logic behind both the featured and row toggles. */
  function togglePinEntry(entry: RecentlyViewedEntry) {
    const key = entryKey(entry);
    const title = entry.title || "Untitled";
    if (pinnedKey === key) {
      setPinned(null);
      showToast(`Unpinned “${title}”`, "info");
    } else {
      setPinned(key);
      showToast(`“${title}” is now your first pick`, "success");
    }
  }

  async function handleClear() {
    await clear();
    setSelectedKey(null);
    setConfirmClear(false);
    showToast("Cleared your recently viewed history", "success");
  }

  /**
   * Roving focus for the "Choose another" rail: arrow keys (left/right as asked,
   * plus up/down to match the vertical list) move focus between items; Enter or
   * Space selects the focused one.
   */
  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : null;
    const back = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : null;
    if (forward === null && back === null) return;
    event.preventDefault();
    const refs = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (refs.length === 0) return;
    const current = refs.indexOf(document.activeElement as HTMLButtonElement);
    const dir = forward ?? back ?? 1;
    const next =
      current === -1
        ? dir > 0
          ? 0
          : refs.length - 1
        : Math.min(refs.length - 1, Math.max(0, current + dir));
    const el = refs[next];
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }

  // Nothing to jump back to yet — stay out of the way.
  if (!loaded || !featured) return null;

  const featuredMeta = KIND_META[featured.kind] ?? KIND_META.match;
  const featuredTime = relativeTime(featured.ts);
  const isPinned = pinnedKey === entryKey(featured);
  const featuredInfo = notes[featuredKey ?? ""] ?? null;
  const featuredNote = featuredInfo?.note ?? null;
  const featuredNoteVersion = featuredInfo?.version ?? null;

  return (
    <section
      className="animate-fade-in-up relative overflow-hidden rounded-2xl border border-foreground-900 bg-gradient-to-br from-foreground-950 via-foreground-900 to-primary-800 p-5 md:p-6 text-background-50"
      aria-label="Jump back in"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 w-72 h-72 rounded-full blur-3xl bg-accent-500/25"
      ></span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 bottom-0 w-72 h-72 rounded-full blur-3xl bg-primary-500/20"
      ></span>

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3 mb-4 md:mb-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 flex items-center justify-center rounded-xl bg-accent-500 text-foreground-950">
              <i className="ri-history-line text-lg"></i>
            </span>
            <div>
              <h2 className="font-heading text-lg md:text-xl font-medium text-background-50">
                Jump back in
              </h2>
              <p className="text-xs md:text-sm text-background-200">
                Pick up right where you left off — {entries.length} thing
                {entries.length === 1 ? "" : "s"} waiting.
              </p>
            </div>
          </div>
          <button
            onClick={() => setConfirmClear(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-background-200 hover:text-background-50 px-2.5 py-1.5 rounded-md hover:bg-background-50/10 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-delete-bin-line"></i>
            Clear
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] items-stretch">
          {/* Featured — most-recently-selected item, large and loud */}
          <div className="relative flex flex-col justify-between rounded-xl bg-background-50/10 border border-background-50/20 backdrop-blur-md p-5">
            <div>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold text-accent-300 bg-accent-500/15 border border-accent-400/30 rounded-full px-2.5 py-1">
                    <i className="ri-flashlight-line"></i>
                    {isPinned ? "Pinned first pick" : "Pick up where you left off"}
                  </span>
                  {featuredTime && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-background-200">
                      <i className="ri-time-line"></i>
                      {featuredTime}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => togglePinEntry(featured)}
                  title={
                    isPinned
                      ? "Unpin — let the most recent item lead again"
                      : "Pin this as your always-first pick"
                  }
                  aria-pressed={isPinned}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    isPinned
                      ? "bg-accent-500 text-foreground-950 hover:bg-accent-400"
                      : "text-background-100 bg-background-50/10 border border-background-50/20 hover:bg-background-50/20"
                  }`}
                >
                  <i className={isPinned ? "ri-pushpin-fill" : "ri-pushpin-line"}></i>
                  {isPinned ? "Pinned" : "Pin"}
                </button>
              </div>

              <div className="flex items-start gap-3.5">
                <span
                  className={`w-12 h-12 flex items-center justify-center rounded-xl flex-shrink-0 ${featuredMeta.bubble}`}
                >
                  <i className={`${featuredMeta.icon} text-xl`}></i>
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-widest text-background-200 font-semibold">
                    {featuredMeta.label}
                  </p>
                  <p className="font-heading text-xl md:text-2xl font-medium text-background-50 leading-snug mt-1 truncate">
                    {featured.title || "Untitled"}
                  </p>
                  {featured.subtitle && (
                    <p className="text-sm text-background-100/90 mt-1 truncate">
                      {featured.subtitle}
                    </p>
                  )}
                  {featuredNote &&
                    (featuredNoteVersion != null ? (
                      <button
                        onClick={() =>
                          openRecentlyViewedEntryAtVersion(navigate, featured, featuredNoteVersion)
                        }
                        title="Reopen this document at that version"
                        className="group/note mt-2 inline-flex max-w-full items-start gap-1.5 text-xs text-background-200 hover:text-background-50 transition-colors cursor-pointer text-left"
                      >
                        <i className="ri-chat-quote-line mt-0.5 flex-shrink-0"></i>
                        <span className="truncate underline-offset-2 group-hover/note:underline">
                          Last change · {featuredNote}
                        </span>
                        <i className="ri-arrow-right-up-line mt-0.5 flex-shrink-0 opacity-70 group-hover/note:opacity-100"></i>
                      </button>
                    ) : (
                      <p className="text-xs text-background-200 mt-2 flex items-start gap-1.5">
                        <i className="ri-chat-quote-line mt-0.5 flex-shrink-0"></i>
                        <span className="truncate">Last change · {featuredNote}</span>
                      </p>
                    ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => openEntry(featured)}
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-accent-500 text-foreground-950 px-5 py-2.5 rounded-md hover:bg-accent-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                Jump back in
                <i className="ri-arrow-right-line"></i>
              </button>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-background-200">
                <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded border border-background-50/30 bg-background-50/10 font-sans font-semibold text-background-50">
                  J
                </kbd>
                to jump in from anywhere
              </span>
            </div>
          </div>

          {/* The rest — selectable rail to bring any of them into focus */}
          {rest.length > 0 && (
            <div className="rounded-xl bg-background-50/5 border border-background-50/10 p-3 flex flex-col">
              <div className="flex items-center justify-between gap-2 px-1.5 mb-2">
                <p className="text-[11px] uppercase tracking-widest font-semibold text-background-200">
                  Choose another
                </p>
                <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-background-200">
                  <i className="ri-arrow-up-down-line"></i>
                  arrows to move
                  <span className="text-background-50/40">·</span>
                  1–9 to jump
                </span>
              </div>
              <div
                onKeyDown={handleListKeyDown}
                className="flex flex-col gap-2 max-h-[248px] overflow-y-auto pr-1"
              >
                {rest.map((entry, index) => {
                  const meta = KIND_META[entry.kind] ?? KIND_META.match;
                  const time = relativeTime(entry.ts);
                  const rowPinned = pinnedKey === entryKey(entry);
                  const shortcut = index < 9 ? String(index + 1) : null;
                  return (
                    <div
                      key={entryKey(entry)}
                      className="group flex items-center gap-1 rounded-lg bg-background-50/5 border border-background-50/10 hover:bg-background-50/15 hover:border-background-50/25 transition-colors p-1"
                    >
                      <button
                        ref={(el) => {
                          itemRefs.current[index] = el;
                        }}
                        onClick={() => setSelectedKey(entryKey(entry))}
                        className="flex-1 min-w-0 flex items-center gap-2.5 text-left rounded-md px-1.5 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 cursor-pointer"
                      >
                        {shortcut && (
                          <kbd className="hidden sm:inline-flex items-center justify-center w-5 h-5 rounded border border-background-50/25 bg-background-50/10 font-sans text-[11px] font-semibold text-background-100 flex-shrink-0">
                            {shortcut}
                          </kbd>
                        )}
                        <span
                          className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${meta.bubble}`}
                        >
                          <i className={`${meta.icon} text-sm`}></i>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-background-50 truncate">
                            {entry.title || "Untitled"}
                          </p>
                          <p className="text-[11px] text-background-200 truncate mt-0.5">
                            {meta.label}
                            {time ? ` · ${time}` : ""}
                          </p>
                        </div>
                        <i className="ri-corner-down-left-line text-background-200 group-hover:text-accent-300 transition-colors flex-shrink-0"></i>
                      </button>
                      <button
                        onClick={() => togglePinEntry(entry)}
                        title={
                          rowPinned
                            ? "Unpin this first pick"
                            : "Pin as your always-first pick"
                        }
                        aria-pressed={rowPinned}
                        aria-label={
                          rowPinned
                            ? `Unpin ${entry.title || "Untitled"}`
                            : `Pin ${entry.title || "Untitled"} as your first pick`
                        }
                        className={`w-8 h-8 flex items-center justify-center rounded-md flex-shrink-0 transition-colors cursor-pointer ${
                          rowPinned
                            ? "bg-accent-500 text-foreground-950 hover:bg-accent-400"
                            : "text-background-200 hover:text-background-50 hover:bg-background-50/15"
                        }`}
                      >
                        <i
                          className={`${rowPinned ? "ri-pushpin-fill" : "ri-pushpin-line"} text-sm`}
                        ></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Clear your recently viewed?"
          message="This empties the Jump back in banner on every device. Your documents, matches, and applications aren't affected."
          confirmLabel="Clear"
          onConfirm={handleClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </section>
  );
}