import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  listCoverLetters,
  listResumes,
  resolveResumeTitle,
  resolveUpdatedAt,
  type CoverLetter,
  type DocumentVersion,
  type Resume,
} from "@/lib/documents";
import { useRailGlide } from "@/hooks/useRailGlide";
import VersionsStrip from "./VersionsStrip";
import {
  asText,
  formatDate,
  isCustomLabel,
  type VersionKind,
  type VersionedDoc,
} from "./versionMeta";

/** Icon, label, and editor route for each document kind. */
const KIND_ICON: Record<VersionKind, string> = {
  resume: "ri-file-text-line",
  "cover-letter": "ri-mail-send-line",
};
const KIND_LABEL: Record<VersionKind, string> = {
  resume: "résumé",
  "cover-letter": "cover letter",
};
const KIND_ROUTE: Record<VersionKind, (id: string | number) => string> = {
  resume: (id) => `/dashboard/documents/resumes/${id}`,
  "cover-letter": (id) => `/dashboard/documents/cover-letters/${id}`,
};

/** A document normalized for the switch marquee's cards. */
interface MarqueeDoc {
  id: string | number;
  title: string;
  subtitle: string;
  /** The nickname of the document's active version (its custom label), when set. */
  nickname?: string;
  grade?: string;
  versionCount: number;
  updated: string;
  flagged: boolean;
  archived: boolean;
}

/**
 * A document's active version's nickname (a user-set label), or "" when the
 * active version carries no nickname — so a sibling doc can be recognised by the
 * version you hand-named, not just its default title.
 */
function activeVersionNickname(doc: Resume | CoverLetter): string {
  const active = (doc.versions ?? []).find(
    (v) => String(v.version) === String(doc.active_version)
  );
  return active && isCustomLabel(active) ? asText(active.label) : "";
}

/** Coerce a résumé or cover letter into the marquee card's shape. */
function toMarqueeDoc(kind: VersionKind, doc: Resume | CoverLetter): MarqueeDoc {
  if (kind === "resume") {
    const r = doc as Resume;
    return {
      id: r.id,
      title: resolveResumeTitle(r),
      subtitle: asText(r.target_role) || "Résumé",
      nickname: activeVersionNickname(r) || undefined,
      grade: r.quality_grade,
      versionCount: r.versions?.length ?? 0,
      updated: resolveUpdatedAt(r) ?? "",
      flagged: Boolean(r.flagged),
      archived: Boolean(r.archived),
    };
  }
  const l = doc as CoverLetter;
  return {
    id: l.id,
    title:
      l.original_filename ||
      (l.source === "uploaded" ? `Cover letter ${l.id}` : "Generated cover letter"),
    subtitle: l.source === "uploaded" ? "Uploaded cover letter" : "Generated cover letter",
    nickname: activeVersionNickname(l) || undefined,
    grade: l.quality_grade,
    versionCount: l.versions?.length ?? 0,
    updated: l.created_at ?? l.generated_at ?? "",
    flagged: Boolean(l.flagged),
    archived: Boolean(l.archived),
  };
}

/**
 * A horizontally-scrolling marquee of the user's OTHER documents of the same kind
 * — click one to jump straight to its editor. The current document is shown for
 * context (marked "Current") but doesn't navigate.
 */
function DocMarquee({
  docs,
  currentId,
  kind,
  onPick,
}: {
  docs: MarqueeDoc[];
  currentId: string | number;
  kind: VersionKind;
  onPick: (doc: MarqueeDoc) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [can, setCan] = useState({ left: false, right: false });
  const [moreCounts, setMoreCounts] = useState({ left: 0, right: 0 });
  /**
   * The shared rail glide: a soft spin-up on hover, a gentle ease-out settle on
   * leave, and a user-tunable base speed.
   */
  const glide = useRailGlide({ scrollRef, wrapRef, edgeThreshold: 64 });
  /**
   * True on touch / no-hover devices. There is no hover to glide with, so the
   * arrows step exactly one card per tap via their onClick instead.
   */
  const touchDevice = glide.touchDevice;
  /** Which focusable card owns the rail's single tab stop (roving tabindex). */
  const [focusIdx, setFocusIdx] = useState(0);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setCan((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    // Count how many cards sit fully off-screen past each faded edge.
    const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-marquee-card]"));
    let offLeft = 0;
    let offRight = 0;
    const viewLeft = el.scrollLeft;
    const viewRight = el.scrollLeft + el.clientWidth;
    cards.forEach((card) => {
      const cardLeft = card.offsetLeft;
      const cardRight = cardLeft + card.offsetWidth;
      if (cardRight <= viewLeft + 4) offLeft += 1;
      else if (cardLeft >= viewRight - 4) offRight += 1;
    });
    setMoreCounts((prev) =>
      prev.left === offLeft && prev.right === offRight ? prev : { left: offLeft, right: offRight }
    );
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measure());
      ro.observe(el);
      Array.from(el.children).forEach((child) => ro?.observe(child));
    }
    measure();
    const raf = requestAnimationFrame(measure);
    const t = window.setTimeout(measure, 250);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [measure, docs.length]);

  // Keep the roving tab stop valid when the set of switchable documents changes.
  useEffect(() => {
    const count = docs.filter((d) => String(d.id) !== String(currentId)).length;
    setFocusIdx((i) => (i > count - 1 ? Math.max(0, count - 1) : i));
  }, [docs, currentId]);

  /** Step the rail by exactly one card so the arrows never overshoot. */
  function step(dir: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-marquee-card]");
    const width = (card?.offsetWidth ?? Math.round(el.clientWidth * 0.7)) + 12;
    el.scrollBy({ left: dir * width, behavior: "smooth" });
  }

  // A soft fade at each scrollable edge, so it reads as "there's more this way".
  const edgeMask = (() => {
    if (!can.left && !can.right) return undefined;
    const stops: string[] = [];
    if (can.left) stops.push("transparent 0px", "black 40px");
    else stops.push("black 0px");
    if (can.right) stops.push("black calc(100% - 40px)", "transparent 100%");
    else stops.push("black 100%");
    return `linear-gradient(to right, ${stops.join(", ")})`;
  })();

  /** Glide the rail while the pointer rests on a nav arrow, independent of the
   * pointer's distance from the rail's edge. */
  function handleArrowHover(dir: -1 | 1) {
    // Touch devices have no hover: a tap steps exactly one card via onClick, so
    // never start a continuous glide there.
    if (touchDevice) return;
    glide.hoverArrow(dir);
  }

  /** Pointer left an arrow — ease the glide out into place. */
  function handleArrowLeave() {
    glide.releaseArrow();
  }

  /** Resting near either edge glides that way; leaving it eases the glide out. */
  const handlePointerMove = glide.handlePointerMove;

  /**
   * The switch rail's focusable cards — every document EXCEPT the one you're
   * already viewing (its card is a disabled "Current" marker), so the roving tab
   * stop and the arrow-key hops never land on a dead card.
   */
  function enabledCards(): HTMLButtonElement[] {
    const el = scrollRef.current;
    if (!el) return [];
    return Array.from(
      el.querySelectorAll<HTMLButtonElement>("[data-marquee-card]:not([disabled])")
    );
  }

  /** Track which card owns the single tab stop as focus moves (mouse or keyboard). */
  function handleRailFocus(e: FocusEvent<HTMLDivElement>) {
    const card = (e.target as HTMLElement).closest("[data-marquee-card]");
    if (!card) return;
    const idx = enabledCards().indexOf(card as HTMLButtonElement);
    if (idx >= 0) setFocusIdx(idx);
  }

  /**
   * ← / → / Home / End hop focus between the document cards (roving tabindex), so
   * the switch rail browses like a toolbar; Enter (or Space) opens the focused
   * document, since each card is a real button.
   */
  function handleRailKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const key = e.key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") {
      return;
    }
    const cards = enabledCards();
    if (cards.length === 0) return;
    const focused = document.activeElement?.closest("[data-marquee-card]") as
      | HTMLButtonElement
      | null;
    const from = focused ? Math.max(0, cards.indexOf(focused)) : focusIdx;
    let next = from;
    if (key === "ArrowLeft") next = Math.max(0, from - 1);
    else if (key === "ArrowRight") next = Math.min(cards.length - 1, from + 1);
    else if (key === "Home") next = 0;
    else next = cards.length - 1;
    if (next === from) return;
    e.preventDefault();
    setFocusIdx(next);
    const target = cards[next];
    target.focus();
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  // Order index of each focusable (non-current) card, for the roving tab stop.
  const enabledIndexById = new Map<string, number>();
  {
    let ei = 0;
    for (const d of docs) {
      if (String(d.id) !== String(currentId)) enabledIndexById.set(String(d.id), ei++);
    }
  }

  const arrowCls =
    "absolute top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full border border-background-200 bg-background-50 text-foreground-700 flex items-center justify-center cursor-pointer transition-colors hover:bg-primary-500 hover:text-background-50 hover:border-primary-500 disabled:opacity-0 disabled:pointer-events-none";

  return (
    <div
      ref={wrapRef}
      data-marquee-rail
      className="relative"
      onMouseMove={handlePointerMove}
      onMouseLeave={handleArrowLeave}
    >
      <div
        ref={scrollRef}
        role="group"
        aria-label="Switch to another document — use the left and right arrow keys to browse, Enter to open"
        onFocus={handleRailFocus}
        onKeyDown={handleRailKeyDown}
        style={edgeMask ? { maskImage: edgeMask, WebkitMaskImage: edgeMask } : undefined}
        className="relative z-0 flex gap-3 overflow-x-auto pb-2 snap-x"
      >
        {docs.map((doc) => {
          const current = String(doc.id) === String(currentId);
          const updatedLabel = formatDate(doc.updated);
          return (
            <button
              key={String(doc.id)}
              type="button"
              data-marquee-card
              disabled={current}
              tabIndex={!current && enabledIndexById.get(String(doc.id)) === focusIdx ? 0 : -1}
              onClick={() => onPick(doc)}
              aria-current={current ? "true" : undefined}
              title={current ? "This is the document you're viewing" : `Open ${doc.title}`}
              className={`snap-start flex-shrink-0 w-[228px] text-left rounded-xl border p-3.5 transition-colors ${
                current
                  ? "border-primary-300 bg-primary-50 cursor-default"
                  : "border-background-200 bg-background-50 hover:border-primary-300 hover:bg-background-100 cursor-pointer"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary-100 text-secondary-700 flex-shrink-0">
                  <i className={KIND_ICON[kind]}></i>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground-950 truncate">
                      {doc.title}
                    </span>
                    {current && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary-900 bg-primary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        <i className="ri-check-line"></i>
                        Current
                      </span>
                    )}
                  </div>
                  <span className="block text-xs text-foreground-500 truncate mt-0.5">
                    {doc.subtitle}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                {doc.nickname && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-secondary-900 bg-secondary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                    title={`Nickname: ${doc.nickname}`}
                  >
                    <i className="ri-price-tag-3-line flex-shrink-0"></i>
                    <span className="truncate max-w-[150px]">{doc.nickname}</span>
                  </span>
                )}
                {doc.versionCount > 1 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-secondary-900 bg-secondary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    <i className="ri-git-branch-line"></i>
                    {doc.versionCount} versions
                  </span>
                )}
                {doc.grade && (
                  <span className="inline-flex items-center text-[11px] font-medium text-foreground-700 bg-background-200/70 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    Grade {doc.grade}
                  </span>
                )}
                {doc.flagged && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-900 bg-accent-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    <i className="ri-flag-line"></i>
                    Needs attention
                  </span>
                )}
                {doc.archived && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-600 bg-background-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    <i className="ri-archive-line"></i>
                    Archived
                  </span>
                )}
                {updatedLabel && (
                  <span className="text-[11px] text-foreground-400 whitespace-nowrap">
                    {updatedLabel}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => step(-1)}
        onMouseEnter={() => handleArrowHover(-1)}
        onMouseLeave={handleArrowLeave}
        disabled={!can.left}
        data-marquee-arrow="left"
        aria-label="Scroll toward newer documents"
        title="One document back"
        className={`${arrowCls} left-1`}
      >
        <i className="ri-arrow-left-s-line text-lg"></i>
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        onMouseEnter={() => handleArrowHover(1)}
        onMouseLeave={handleArrowLeave}
        disabled={!can.right}
        data-marquee-arrow="right"
        aria-label="Scroll toward older documents"
        title="One document forward"
        className={`${arrowCls} right-1`}
      >
        <i className="ri-arrow-right-s-line text-lg"></i>
      </button>

      {can.left && moreCounts.left > 0 && (
        <span
          className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 z-20 inline-flex items-center gap-0.5 text-[10px] font-semibold text-foreground-600 bg-background-50/95 border border-background-200 px-1.5 py-0.5 rounded-full whitespace-nowrap"
          title={`${moreCounts.left} more ${moreCounts.left === 1 ? "document" : "documents"} to the left`}
        >
          <i className="ri-arrow-left-s-line"></i>
          {moreCounts.left} more
        </span>
      )}
      {can.right && moreCounts.right > 0 && (
        <span
          className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 z-20 inline-flex items-center gap-0.5 text-[10px] font-semibold text-foreground-600 bg-background-50/95 border border-background-200 px-1.5 py-0.5 rounded-full whitespace-nowrap"
          title={`${moreCounts.right} more ${moreCounts.right === 1 ? "document" : "documents"} to the right`}
        >
          {moreCounts.right} more
          <i className="ri-arrow-right-s-line"></i>
        </span>
      )}
    </div>
  );
}

interface DocumentMarqueeDialogProps<T extends VersionedDoc = VersionedDoc> {
  /** Which document type this marquee drives — routes the switch rail + versions. */
  kind?: VersionKind;
  /** The document currently being viewed. */
  docId: string | number;
  /** The current document's title, shown as context. */
  title: string;
  /** The current document's saved versions (drives the versions rail). */
  versions: DocumentVersion[];
  /** The active version — the versions rail marks it "Current". */
  activeVersion: string | number | null | undefined;
  /** Called with the freshly-returned document after a version action. */
  onChanged: (updated: T) => void;
  /**
   * A change counter bumped by the host on every edit, so the versions rail's
   * thumbnails re-fetch after an in-place save (same version, same design).
   */
  revisionKey?: string | number;
  onClose: () => void;
}

/**
 * The "document marquee" — a quick, prominent overlay that opens from anywhere a
 * résumé or cover letter is on screen. It carries TWO rails: the saved versions of
 * the document you're viewing (so you can pick a version in place), and a marquee
 * of your other documents of the same kind (so you can jump straight to another
 * résumé or cover letter without going back to the list).
 */
export default function DocumentMarqueeDialog<T extends VersionedDoc = VersionedDoc>({
  kind = "resume",
  docId,
  title,
  versions,
  activeVersion,
  onChanged,
  revisionKey,
  onClose,
}: DocumentMarqueeDialogProps<T>) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<MarqueeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load the user's documents of this kind for the switch rail. Best-effort: a
  // failure never blocks the versions rail that's already on screen.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const raw = kind === "cover-letter" ? await listCoverLetters() : await listResumes();
        if (!alive) return;
        const list = (Array.isArray(raw) ? raw : []) as Array<Resume | CoverLetter>;
        const mapped = list
          .map((doc) => toMarqueeDoc(kind, doc))
          .sort((a, b) => {
            const ta = a.updated ? new Date(a.updated).getTime() : 0;
            const tb = b.updated ? new Date(b.updated).getTime() : 0;
            return tb - ta;
          });
        setDocs(mapped);
      } catch {
        if (alive) {
          setError(
            "Couldn't load your other documents — you can still pick a version above."
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [kind]);

  // Escape closes; the page behind never scrolls while the overlay is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Every document of this kind, minus archived ones — but always keep the
  // document you're viewing, even if it happens to be archived.
  const switchDocs = useMemo(
    () => docs.filter((d) => !d.archived || String(d.id) === String(docId)),
    [docs, docId]
  );

  function pickDoc(doc: MarqueeDoc) {
    if (String(doc.id) === String(docId)) return;
    onClose();
    navigate(KIND_ROUTE[kind](doc.id));
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Browse documents"
    >
      <div
        className="animate-fade absolute inset-0 bg-foreground-950/45 dark:bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-background-50 border border-background-200 rounded-2xl overflow-hidden animate-pop">
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent-100 text-accent-700 flex-shrink-0">
              <i className="ri-slideshow-line text-lg" aria-hidden="true"></i>
            </span>
            <div className="min-w-0">
              <h3 className="font-heading text-lg font-medium text-foreground-950 truncate">
                Browse documents
              </h3>
              <p className="text-xs text-foreground-500 truncate">
                Pick a saved version, or jump to another {KIND_LABEL[kind]}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-900 cursor-pointer flex-shrink-0"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {versions.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                <span className="w-6 h-6 flex items-center justify-center rounded-md bg-secondary-100 text-secondary-700 flex-shrink-0">
                  <i className="ri-git-branch-line text-sm"></i>
                </span>
                <h4 className="font-heading text-sm font-medium text-foreground-950">
                  This document — versions
                </h4>
                <span className="text-[11px] text-foreground-500 truncate">· {title}</span>
              </div>
              <VersionsStrip
                kind={kind}
                docId={docId}
                versions={versions}
                activeVersion={activeVersion}
                onChanged={onChanged}
                title="This document · versions"
                surface="plain"
                revisionKey={revisionKey}
              />
            </section>
          )}

          <section>
            <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center rounded-md bg-primary-100 text-primary-700 flex-shrink-0">
                  <i className="ri-folder-transfer-line text-sm"></i>
                </span>
                <h4 className="font-heading text-sm font-medium text-foreground-950">
                  Switch to another {KIND_LABEL[kind]}
                </h4>
              </div>
              {!loading && !error && switchDocs.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {switchDocs.length > 1 && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-foreground-500 whitespace-nowrap">
                      <i className="ri-arrow-left-right-line"></i>
                      ← → to browse · Enter to open
                    </span>
                  )}
                  <span className="text-[11px] text-foreground-500 whitespace-nowrap">
                    {switchDocs.length} {switchDocs.length === 1 ? "document" : "documents"}
                  </span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="py-8 text-sm text-foreground-500 flex items-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i>
                Loading your documents…
              </div>
            ) : error ? (
              <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
                <i className="ri-error-warning-line text-base mt-0.5"></i>
                <span>{error}</span>
              </div>
            ) : switchDocs.length <= 1 ? (
              <p className="text-xs text-foreground-500 py-6 text-center rounded-xl border border-dashed border-background-200">
                You don&rsquo;t have another {KIND_LABEL[kind]} yet — create or upload one to
                switch between documents here.
              </p>
            ) : (
              <DocMarquee docs={switchDocs} currentId={docId} kind={kind} onPick={pickDoc} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}