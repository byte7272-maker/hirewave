import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { useToast } from "@/components/base/ToastProvider";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import { ApiError, isAuthError } from "@/lib/api";
import {
  activateCoverLetterVersion,
  activateResumeVersion,
  deleteCoverLetterVersion,
  deleteResumeVersion,
  renameCoverLetterVersion,
  renameResumeVersion,
  restoreCoverLetterVersionAsCopy,
  restoreResumeVersionAsCopy,
  setCoverLetterVersionTemplate,
  setResumeVersionTemplate,
  type DocumentVersion,
} from "@/lib/documents";
import {
  versionTitle,
  asText,
  type BusyAction,
  type VersionKind,
  type VersionedDoc,
} from "./versionMeta";
import VersionCard from "./VersionCard";
import VersionsCompareDialog from "./VersionsCompareDialog";
import { invalidateVersionPreview, useVersionContentMap } from "./useVersionPreview";
import { countChangedSections } from "./versionDiffCount";
import {
  readHideIdentical,
  writeHideIdentical,
  writeRailScroll,
} from "@/lib/versionRailMemory";
import { useRailGlide } from "@/hooks/useRailGlide";
import { Card, SectionHeader } from "@/components/base";

/**
 * A version card's fixed footprint — the card is `w-[248px]` in a `gap-3` (12px)
 * rail — used to size the windowed mount range and the off-window placeholders.
 */
const CARD_W = 248;
const CARD_STEP = CARD_W + 12;
/** How many cards to keep mounted past each edge of the visible window. */
const WINDOW_OVERSCAN = 3;
/** A card's rough rendered height, so an off-window placeholder holds the rail's height. */
const CARD_MIN_H = 520;
/** Below this many versions the whole rail mounts — windowing isn't worth the churn. */
const WINDOW_MIN_TOTAL = 10;

export type { VersionKind, VersionedDoc } from "./versionMeta";

/** Activate a version on the right document kind. */
function activateVersion(
  kind: VersionKind,
  id: string | number,
  version: string | number
): Promise<VersionedDoc> {
  return kind === "cover-letter"
    ? activateCoverLetterVersion(id, version)
    : activateResumeVersion(id, version);
}

/** Delete a version on the right document kind. */
function deleteVersion(
  kind: VersionKind,
  id: string | number,
  version: string | number
): Promise<VersionedDoc> {
  return kind === "cover-letter"
    ? deleteCoverLetterVersion(id, version)
    : deleteResumeVersion(id, version);
}

/** Restore an old version as a new copy on the right document kind. */
function restoreVersionAsCopy(
  kind: VersionKind,
  id: string | number,
  version: string | number
): Promise<VersionedDoc> {
  return kind === "cover-letter"
    ? restoreCoverLetterVersionAsCopy(id, version)
    : restoreResumeVersionAsCopy(id, version);
}

/** Rename a version on the right document kind. */
function renameVersion(
  kind: VersionKind,
  id: string | number,
  version: string | number,
  label: string
): Promise<VersionedDoc> {
  return kind === "cover-letter"
    ? renameCoverLetterVersion(id, version, label)
    : renameResumeVersion(id, version, label);
}

/** Set (or clear) a single version's own design on the right document kind. */
function setVersionTemplate(
  kind: VersionKind,
  id: string | number,
  version: string | number,
  templateId: string
): Promise<VersionedDoc> {
  return kind === "cover-letter"
    ? setCoverLetterVersionTemplate(id, version, templateId)
    : setResumeVersionTemplate(id, version, templateId);
}

/** A version's change read-out, resolved from its text vs the current version. */
interface VersionDiffInfo {
  /** True when the text matches the current version, false when it differs, null while unknown. */
  identical: boolean | null;
  /** How many sections differ (0 when identical); null while unknown. */
  count: number | null;
  /** The display names of the sections that differ, for the chip's hover popover. */
  sections: string[];
}

interface VersionsStripProps<T extends VersionedDoc> {
  /** Which document type this strip drives — routes activate/delete/rename/restore. */
  kind?: VersionKind;
  /** The document id — the résumé or cover letter these versions belong to. */
  docId: string | number;
  versions: DocumentVersion[];
  activeVersion: string | number | null | undefined;
  /** Called with the freshly-returned document after an activate / delete / rename / restore. */
  onChanged: (updated: T) => void;
  /**
   * When provided (the dashboard), clicking a card opens that version instead of
   * activating it in place — the editor activates it on arrival via `?version=`.
   */
  onOpenVersion?: (version: string | number) => void;
  /** Optional heading override. */
  title?: string;
  className?: string;
  /** Visual skin: the light card, or the dashboard's dark gradient section. */
  variant?: "light" | "dark";
  /** Light-skin card surface: `tinted` (default) or a solid `plain` panel. */
  surface?: "tinted" | "plain";
  /** Show a small "Template · Accent · Typeface" line on every card. */
  showStyleLabel?: boolean;
  /**
   * When true, clicking a version card opens its full-size overlay (where you
   * choose to make it current or open it in the editor) instead of pinning the
   * small hover bubble. Used by the My Work Highlights marquee.
   */
  clickOpensFull?: boolean;
  /**
   * Show a prominent "Select" control directly on every card's thumbnail, so a
   * version can be made current in one tap without opening the hover bubble or
   * the full overlay. Used by the My Work Highlights marquee.
   */
  showSelect?: boolean;
  /** Open a version in the full document editor (shown in the full-size overlay). */
  onOpenInEditor?: (version: string | number) => void;
  /**
   * Called when a version card is clicked to PREVIEW it (before it is made
   * current) — the editor's main viewer uses this to show that same version large
   * above the strip.
   */
  onViewVersion?: (version: string | number) => void;
  /**
   * The version currently being PREVIEWED large above the rail but not yet made
   * current. Its card flags "not yet applied" and carries a prominent one-tap
   * Select control, so the required second step is obvious at a glance.
   */
  previewVersion?: string | number | null;
  /**
   * Called with the version we just switched AWAY from whenever an activation
   * succeeds and a one-tap Undo is offered — so an editor can mirror that same
   * undo on Cmd/Ctrl+Z alongside the toast.
   */
  onUndoableSwitch?: (previous: string | number) => void;
  /**
   * A change counter the host bumps on EVERY document mutation — including an
   * in-place save that keeps the same version number. It is forwarded to each
   * card's preview so the marquee thumbnails and peeks re-fetch (never a stale
   * paint) the instant the underlying content changes. All these preview
   * responses are `no-store`, so refetching always yields the latest render.
   */
  revisionKey?: string | number;
}

/**
 * A horizontally-scrolling marquee of every saved version of a document — newest
 * first, the Original last. Each card is a REAL scaled-down render of that
 * version through its template (fetched lazily as it scrolls into view), with a
 * larger preview on hover / focus. It glides left or right when the pointer rests
 * near either edge and carries explicit scroll arrows. It activates on click
 * (editor) or opens in place (dashboard), can be renamed or branched into a
 * brand-new copy, compared against the current version, and carries its own
 * delete control. It always re-renders from the API response; no local cache is
 * trusted.
 *
 * On arrival it glides the CURRENT version to the centre of the rail, lets you
 * hide versions that are textually identical to the current one, and shows a
 * compact "N sections changed" read on each differing card.
 */
export default function VersionsStrip<T extends VersionedDoc>({
  kind = "resume",
  docId,
  versions,
  activeVersion,
  onChanged,
  onOpenVersion,
  title = "Versions",
  className = "",
  variant = "light",
  surface = "tinted",
  showStyleLabel = false,
  clickOpensFull = false,
  showSelect = false,
  onOpenInEditor,
  onViewVersion,
  previewVersion,
  onUndoableSwitch,
  revisionKey,
}: VersionsStripProps<T>) {
  const dark = variant === "dark";
  const { showToast } = useToast();
  /** The version currently running its activate / delete / rename / restore call. */
  const [busy, setBusy] = useState<string | number | null>(null);
  /** Which action that call is, so the matching glyph can show a spinner. */
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  /** The version awaiting delete confirmation. */
  const [pendingDelete, setPendingDelete] = useState<DocumentVersion | null>(null);
  /** The version whose card opened the compare view (the "before" side). */
  const [compareVersion, setCompareVersion] = useState<DocumentVersion | null>(null);
  /** Which card currently owns the marquee's single tab stop (roving tabindex). */
  const [focusIdx, setFocusIdx] = useState(0);
  /** The version whose action bubble is pinned open (clicked, not just hovered). */
  const [pinnedVersion, setPinnedVersion] = useState<string | number | null>(null);
  /** The version whose full-size readable view is open (keyed by version). */
  const [fullKey, setFullKey] = useState<string | null>(null);
  /** Whether the bulk "reset every version's design" confirmation is open. */
  const [pendingResetAll, setPendingResetAll] = useState(false);
  /** True while that bulk reset is running. */
  const [resettingAll, setResettingAll] = useState(false);
  /** Whether the strip can still scroll each way — gates the arrows + edge glide. */
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  /** How many cards sit fully off-screen past each faded edge, for the "N more" cue. */
  const [moreCounts, setMoreCounts] = useState({ left: 0, right: 0 });
  /** Whether versions identical to the current one are hidden (remembered per document). */
  const [hideIdentical, setHideIdentical] = useState(() =>
    readHideIdentical(kind, docId)
  );
  /** The live name filter over the rail — matches a card's nickname / title as you type. */
  const [query, setQuery] = useState("");
  /** 0-based index of the card nearest the rail's centre — powers the "X of N" read. */
  const [railIndex, setRailIndex] = useState(0);
  /**
   * The half-open `[start, end)` range of `visible` indices whose VersionCards are
   * actually MOUNTED. Far cards become fixed-size placeholders, so a long rail
   * never mounts every version's DOM at once — the main-thread freeze this fixes.
   * Recomputed from the scroll offset as the rail moves.
   */
  const [mountWindow, setMountWindow] = useState({ start: 0, end: WINDOW_MIN_TOTAL });
  /** The current visible count, read inside the scroll effect without re-binding it. */
  const visibleCountRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** The marquee's own bounds — used to read the pointer's edge proximity. */
  const wrapRef = useRef<HTMLDivElement>(null);
  /**
   * The current version whose card we last centred. Re-centring only happens
   * when the CURRENT version changes, so filtering / re-rendering never yanks
   * the rail; the first centring is instant, later ones glide smoothly.
   */
  const centeredKeyRef = useRef<string>("");
  /** The debounce timer for persisting the rail's scroll offset. */
  const saveTimer = useRef<number | null>(null);
  /**
   * The shared rail glide: a soft spin-up on hover, a gentle ease-out settle on
   * leave, and a user-tunable base speed. It owns the rAF loop and suspends
   * scroll-snap while gliding so the rail can actually move under the pointer.
   */
  const glide = useRailGlide({ scrollRef, wrapRef, edgeThreshold: 72 });
  /**
   * True on touch / no-hover devices. There is no hover to glide with, so the
   * arrows step exactly one card per tap via their onClick instead.
   */
  const touchDevice = glide.touchDevice;

  // left → right, newest → oldest. Numeric version order when available, else
  // the server's own order. Memoized so downstream memos stay stable.
  const ordered = useMemo(
    () =>
      [...versions].sort((a, b) => {
        const na = Number(a.version);
        const nb = Number(b.version);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
        return 0;
      }),
    [versions]
  );

  // Resolve every version's text once, so the filter + change counts share one
  // pass. Embedded text is instant; metadata-only versions use the shared cache.
  const contentMap = useVersionContentMap(kind, docId, versions);

  const activeKey =
    activeVersion !== null && activeVersion !== undefined ? String(activeVersion) : "";
  // The version the viewer is PREVIEWING above the rail (not yet current), so the
  // matching card can say "not yet applied" and surface a one-tap Select control.
  const previewKey =
    previewVersion === null || previewVersion === undefined ? "" : String(previewVersion);
  const currentEntry = activeKey ? contentMap.get(activeKey) : undefined;
  const currentText = currentEntry?.text ?? "";
  const currentFingerprint = currentEntry?.fingerprint ?? null;

  // The change read-out for every card, computed once per content/current change.
  const diffByVersion = useMemo(() => {
    const out = new Map<string, VersionDiffInfo>();
    for (const v of ordered) {
      const key = String(v.version);
      if (key === activeKey) {
        out.set(key, { identical: null, count: null, sections: [] });
        continue;
      }
      const entry = contentMap.get(key);
      const known =
        entry &&
        entry.loaded &&
        !entry.error &&
        entry.fingerprint !== null &&
        currentFingerprint !== null &&
        currentText !== "";
      if (!known) {
        out.set(key, { identical: null, count: null, sections: [] });
      } else if (entry.fingerprint === currentFingerprint) {
        out.set(key, { identical: true, count: 0, sections: [] });
      } else {
        const diff = countChangedSections(entry.text, currentText);
        out.set(key, {
          identical: false,
          count: diff.changed,
          sections: diff.changedSections,
        });
      }
    }
    return out;
  }, [ordered, contentMap, activeKey, currentFingerprint, currentText]);

  // How many versions the hide-identical filter removed — always keeps the current.
  const hideIdenticalCount = useMemo(
    () =>
      hideIdentical
        ? ordered.filter(
            (v) =>
              String(v.version) !== activeKey &&
              diffByVersion.get(String(v.version))?.identical === true
          ).length
        : 0,
    [ordered, hideIdentical, activeKey, diffByVersion]
  );

  // What actually renders: the hide-identical filter first, then a live name
  // filter on top — matching a card's displayed name (a nickname, or its default
  // title) so typing narrows the rail to the versions you mean.
  const visible = useMemo(() => {
    const base = hideIdentical
      ? ordered.filter((v) => {
          const key = String(v.version);
          if (key === activeKey) return true;
          return diffByVersion.get(key)?.identical !== true;
        })
      : ordered;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((v) => versionTitle(v).toLowerCase().includes(q));
  }, [ordered, hideIdentical, activeKey, diffByVersion, query]);
  // Keep the current visible count in a ref the scroll effect can read.
  visibleCountRef.current = visible.length;

  // Re-read the remembered preference whenever the strip switches documents, and
  // reset the position read so it re-derives from the new rail.
  useEffect(() => {
    setHideIdentical(readHideIdentical(kind, docId));
    setQuery("");
    setRailIndex(0);
    setPinnedVersion(null);
    setFullKey(null);
    // A new document re-centres instantly, never animation-gliding from the old rail.
    centeredKeyRef.current = "";
  }, [kind, docId]);

  // The backend rejects deleting a document's only version — hide the control too.
  const singleVersion = ordered.length <= 1;

  // Versions that carry their OWN design (a non-empty `template_id`) — the only
  // ones a "reset all to the document's design" pass would change. When this is
  // empty there is nothing to reset, so the bulk action stays hidden.
  const ownDesignVersions = useMemo(
    () => ordered.filter((v) => asText(v.template_id) !== ""),
    [ordered]
  );

  // Whether the rail overflows each way. This one flag drives BOTH the arrows
  // and the edge-hover glide, so it must never go stale: it is re-measured on
  // scroll, on window resize, and via a ResizeObserver on the rail AND on each
  // card — so a late layout (fonts/images settling, a pane resize, the rail
  // becoming visible, a card mounting via the filter) always re-arms both.
  const measureOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setCanScroll((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right }
    );
    // Keep the "X of N" read pinned to the card nearest the rail's centre, so
    // the indicator tracks what you're actually looking at while scrolling.
    const cards = cardsIn(el);
    if (cards.length) {
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      let offLeft = 0;
      let offRight = 0;
      const viewLeft = el.scrollLeft;
      const viewRight = el.scrollLeft + el.clientWidth;
      cards.forEach((card, i) => {
        const cardLeft = card.offsetLeft;
        const cardRight = cardLeft + card.offsetWidth;
        const cardCenter = cardLeft + card.offsetWidth / 2;
        const dist = Math.abs(cardCenter - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
        // Fully scrolled past an edge = one more version waiting that way.
        if (cardRight <= viewLeft + 4) offLeft += 1;
        else if (cardLeft >= viewRight - 4) offRight += 1;
      });
      setRailIndex((prev) => (prev === best ? prev : best));
      setMoreCounts((prev) =>
        prev.left === offLeft && prev.right === offRight
          ? prev
          : { left: offLeft, right: offRight }
      );
    }
  }, []);

  /** Debounced write of the rail's current offset, so reopening lands you back here. */
  const persistScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      writeRailScroll(kind, docId, el.scrollLeft);
    }, 220);
  }, [kind, docId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    /** Recompute the mounted window from the rail's current scroll offset. */
    const updateWindow = () => {
      const total = visibleCountRef.current;
      if (total <= WINDOW_MIN_TOTAL) {
        setMountWindow((prev) =>
          prev.start === 0 && prev.end === total ? prev : { start: 0, end: total }
        );
        return;
      }
      const first = Math.floor(el.scrollLeft / CARD_STEP);
      const slots = Math.max(1, Math.ceil(el.clientWidth / CARD_STEP));
      const start = Math.max(0, first - WINDOW_OVERSCAN);
      const end = Math.min(total, first + slots + WINDOW_OVERSCAN);
      setMountWindow((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end }
      );
    };
    const onScroll = () => {
      persistScroll();
      // Coalesce the layout reads (measureOverflow reads every mounted card's
      // offset*) onto ONE frame, so a fast scroll never forces a layout read per
      // event — the other half of the "no main-thread jank while scrolling" goal.
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        measureOverflow();
        updateWindow();
      });
    };
    let scrollRaf = 0;
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        measureOverflow();
        updateWindow();
      });
      // The rail box itself — catches the strip being laid out after mount.
      ro.observe(el);
      // Each card — catches content width changing without the rail box resizing
      // (a card mounting/unmounting, the hide-identical filter, lazy loads).
      Array.from(el.children).forEach((child) => ro?.observe(child));
    }

    // Measure + window now, next frame, and again once late layout has settled.
    measureOverflow();
    updateWindow();
    const raf = requestAnimationFrame(() => {
      measureOverflow();
      updateWindow();
    });
    const t1 = window.setTimeout(() => {
      measureOverflow();
      updateWindow();
    }, 200);
    const t2 = window.setTimeout(() => {
      measureOverflow();
      updateWindow();
    }, 700);

    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
      cancelAnimationFrame(raf);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      // Flush the last known position on unmount / when the layout changes.
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      writeRailScroll(kind, docId, el.scrollLeft);
    };
  }, [measureOverflow, persistScroll, kind, docId, visible.length]);

  // Land the rail with the CURRENT version's card centred, so the highlighted one
  // is always in view on arrival — never scrolled off past a faded edge. The first
  // centring is instant (no animation from the rail's zero position); changing the
  // current version afterwards glides it smoothly back to centre. The remembered
  // scroll offset is deliberately NOT used to place the rail, because it could
  // leave a different card sitting under the highlight.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activeKey) return;
    const card = el.querySelector<HTMLElement>(
      `[data-version-card][data-version-key="${activeKey}"]`
    );
    if (!card) return;
    if (centeredKeyRef.current === activeKey) return;
    const first = centeredKeyRef.current === "";
    centeredKeyRef.current = activeKey;
    const elRect = el.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const delta = cardRect.left + cardRect.width / 2 - (elRect.left + elRect.width / 2);
    if (first) {
      el.scrollLeft += delta;
    } else {
      el.scrollTo({ left: el.scrollLeft + delta, behavior: "smooth" });
    }
  }, [activeKey, visible.length, kind, docId]);

  // Keep the roving tab stop valid when the number of visible versions changes.
  useEffect(() => {
    setFocusIdx((i) => (i > visible.length - 1 ? Math.max(0, visible.length - 1) : i));
  }, [visible.length]);

  // Drop a pinned bubble whose version fell out of the visible set (filtered or deleted).
  useEffect(() => {
    if (pinnedVersion === null) return;
    const stillThere = visible.some((v) => String(v.version) === String(pinnedVersion));
    if (!stillThere) setPinnedVersion(null);
  }, [visible, pinnedVersion]);

  // Close the full-size view if its version falls out of the visible set.
  useEffect(() => {
    if (fullKey === null) return;
    if (!visible.some((v) => String(v.version) === fullKey)) setFullKey(null);
  }, [visible, fullKey]);

  // ONE-KEY COMMIT: while a version is PREVIEWED (but not yet current), pressing
  // Enter applies it — so the required second step never needs the button. It is
  // deliberately shy: it stands down while the caret is in a field, while a
  // button is focused (that button handles its own Enter), while a version card
  // is focused (the card handles Enter itself to preview / open), and on any
  // modified keypress. `runAction` is hoisted, so referring to it here is safe.
  useEffect(() => {
    if (previewKey === "" || previewKey === activeKey) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (busy !== null) return;
      const t = event.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        t?.isContentEditable
      ) {
        return;
      }
      if (t?.closest("button") || t?.closest("[data-version-card]")) return;
      event.preventDefault();
      void runAction(previewVersion as string | number, "activate");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // The effect only needs to re-arm when the pending preview or busy state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, activeKey, previewVersion, busy]);

  if (ordered.length === 0) return null;

  // Where the open full-size version sits, and its neighbours, so ← / → flip
  // through the SAME set the user sees (the filtered `visible` list).
  const fullIndex =
    fullKey === null ? -1 : visible.findIndex((v) => String(v.version) === fullKey);
  const fullPrev = fullIndex > 0 ? visible[fullIndex - 1] : null;
  const fullNext =
    fullIndex >= 0 && fullIndex < visible.length - 1 ? visible[fullIndex + 1] : null;
  const fullPosition = fullIndex >= 0 ? `${fullIndex + 1} of ${visible.length}` : "";

  const openMode = Boolean(onOpenVersion);

  // A soft fade at each scrollable edge so it's obvious there are more versions
  // that way. Done as a CSS mask on the rail (not a coloured overlay), so it
  // blends into whatever surface the strip sits on and fades the cards
  // themselves rather than painting a rectangle over them.
  const edgeMask = (() => {
    if (!canScroll.left && !canScroll.right) return undefined;
    const stops: string[] = [];
    if (canScroll.left) stops.push("transparent 0px", "black 44px");
    else stops.push("black 0px");
    if (canScroll.right) stops.push("black calc(100% - 44px)", "transparent 100%");
    else stops.push("black 100%");
    return `linear-gradient(to right, ${stops.join(", ")})`;
  })();

  /** Every card element, in DOM (i.e. visual) order. */
  function cardsIn(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>("[data-version-card]"));
  }

  /**
   * Hop the strip by exactly ONE version — the measured width of a card plus the
   * gap between cards — so the arrows give fine, predictable browsing instead of
   * leaping a whole screenful.
   */
  function scrollByOne(dir: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-version-card]");
    const styles = window.getComputedStyle(el);
    const gap = parseFloat(styles.columnGap || styles.gap || "12") || 12;
    const step = (card?.offsetWidth ?? Math.round(el.clientWidth * 0.5)) + gap;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  /**
   * Glide the rail while the pointer rests on one of the floating arrows — a
   * direct, unambiguous trigger so hovering an arrow always moves the marquee,
   * independent of the pointer's distance from the rail's edge.
   */
  function handleArrowHover(dir: -1 | 1) {
    // Touch devices have no hover: a tap steps exactly one card via onClick, so
    // never start a continuous glide there (it would run past a single step and
    // its stop event never fires to end it). `hoverArrow` guards this too, but we
    // bail first so a phantom touch-hover never even dismisses a pinned bubble.
    if (touchDevice) return;
    // Reaching for an arrow while an action bubble is pinned dismisses it, so a
    // floating bubble can never sit between the pointer and a nav arrow.
    setPinnedVersion(null);
    // Spin the glide up gently; the shared glide owns "pointer is on an arrow",
    // so the rail's own edge-band mousemove can never stop it underneath you.
    glide.hoverArrow(dir);
  }

  /** Pointer left an arrow — ease the glide out into place. */
  function handleArrowLeave() {
    glide.releaseArrow();
  }

  /**
   * Skip straight to one extreme of the rail in a single tap — the newest version
   * lives at the far left, the oldest (the Original) at the far right.
   */
  function jumpToEnd(which: "newest" | "oldest") {
    const el = scrollRef.current;
    if (!el) return;
    const target = which === "newest" ? 0 : el.scrollWidth;
    el.scrollTo({ left: target, behavior: "smooth" });
  }

  /**
   * Hover the rail: the shared glide eases toward whichever edge the pointer is
   * near. Scrollable bounds are read LIVE off the element (never from the cached
   * `canScroll` state), so a stale measurement can never leave the glide dead.
   */
  const handlePointerMove = glide.handlePointerMove;

  /** Track which card owns the single tab stop as focus moves (mouse or keyboard). */
  function handleFocus(e: FocusEvent<HTMLDivElement>) {
    const container = scrollRef.current;
    if (!container) return;
    const card = (e.target as HTMLElement).closest("[data-version-card]");
    if (!card) return;
    const idx = cardsIn(container).indexOf(card as HTMLElement);
    if (idx >= 0) setFocusIdx(idx);
  }

  /**
   * ← / → / Home / End hop focus between the marquee cards (roving tabindex), so
   * keyboard users browse the strip like a toolbar. Because each card previews on
   * focus, the hover preview follows keyboard focus for free.
   */
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Never hijack keys while the caret is in the inline nickname editor (or any
    // field) — ← / → / Home / End must move the caret there, not the rail.
    const el = e.target as HTMLElement;
    if (
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable
    ) {
      return;
    }
    const key = e.key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") {
      return;
    }
    const container = scrollRef.current;
    if (!container) return;
    const cards = cardsIn(container);
    if (cards.length === 0) return;
    const focused = (e.target as HTMLElement).closest("[data-version-card]");
    const from = focused ? Math.max(0, cards.indexOf(focused as HTMLElement)) : focusIdx;
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

  /**
   * Offer a one-tap "Undo switch" right after a version change, so a mistaken
   * pick can be reverted without hunting for the previous card. The previous
   * version is captured from the click, and reverting is itself a switch (so it
   * offers its own undo, letting you bounce back and forth).
   */
  function offerUndoSwitch(
    previous: string | number | null | undefined,
    next: string | number,
    updated: VersionedDoc
  ) {
    const prevKey =
      previous === null || previous === undefined ? "" : String(previous);
    if (!prevKey || prevKey === String(next)) return;
    onUndoableSwitch?.(previous as string | number);
    const record = (updated.versions ?? []).find(
      (v) => String(v.version) === String(updated.active_version ?? next)
    );
    const label = record ? versionTitle(record) : `Version ${next}`;
    showToast(`Switched to ${label}`, "success", {
      label: "Undo switch",
      onUndo: () => runAction(previous as string | number, "activate"),
    });
  }

  async function runAction(version: string | number, action: BusyAction) {
    setBusy(version);
    setBusyAction(action);
    try {
      if (action === "activate") {
        const previous = activeVersion;
        const updated = await activateVersion(kind, docId, version);
        onChanged(updated as T);
        offerUndoSwitch(previous, version, updated);
      } else if (action === "restore") {
        const updated = await restoreVersionAsCopy(kind, docId, version);
        onChanged(updated as T);
        showToast("Restored as a new version", "success");
      } else {
        const updated = await deleteVersion(kind, docId, version);
        onChanged(updated as T);
        showToast("Version deleted", "success");
      }
    } catch (err) {
      // A dead session is already being torn down + redirected by the guard.
      if (isAuthError(err)) return;
      if (action === "delete" && err instanceof ApiError && err.status === 400) {
        showToast("You can't delete your only version", "error");
      } else {
        const fallback =
          action === "delete"
            ? "Could not delete that version."
            : action === "restore"
              ? "Could not restore that version."
              : "Could not switch to that version.";
        showToast(err instanceof ApiError ? err.message : fallback, "error");
      }
    } finally {
      setBusy(null);
      setBusyAction(null);
    }
  }

  /**
   * Save a version's nickname. Returns `true` on success so the card's inline
   * editor can close; on failure it toasts and returns `false` so the editor
   * stays open for a retry. A 401 is already being refreshed/torn down by the
   * API layer, so it is left to the session guard.
   */
  async function handleRename(version: string | number, label: string): Promise<boolean> {
    setBusy(version);
    setBusyAction("rename");
    try {
      const updated = await renameVersion(kind, docId, version, label);
      onChanged(updated as T);
      showToast(label.trim() ? "Nickname saved" : "Nickname cleared", "success");
      return true;
    } catch (err) {
      if (isAuthError(err)) return false;
      showToast(
        err instanceof ApiError ? err.message : "Could not rename that version.",
        "error"
      );
      return false;
    } finally {
      setBusy(null);
      setBusyAction(null);
    }
  }

  /** Pin / unpin the action bubble for a card — clicking the same card toggles it off. */
  function togglePin(v: DocumentVersion) {
    setPinnedVersion((cur) =>
      cur !== null && String(cur) === String(v.version) ? null : v.version
    );
  }

  /**
   * Reset a version to the document's own design — clears the version's own
   * template so it inherits the résumé / cover letter again. Re-renders from the
   * returned document and drops the cached per-version render, so the main
   * viewer, the marquee thumbnail and the full-size view all repaint the
   * inherited design at once.
   */
  async function handleResetDesign(version: DocumentVersion) {
    setBusy(version.version);
    setBusyAction("reset");
    try {
      const updated = await setVersionTemplate(kind, docId, version.version, "");
      invalidateVersionPreview(kind, docId, version.version);
      onChanged(updated as T);
      showToast("Reset this version to the document's design", "success");
    } catch (err) {
      if (isAuthError(err)) return;
      showToast(
        err instanceof ApiError ? err.message : "Could not reset that version's design.",
        "error"
      );
    } finally {
      setBusy(null);
      setBusyAction(null);
    }
  }

  /**
   * Reset EVERY version that carries its own design back to the document's own
   * design in one go — clearing each version's `template_id` so the whole rail
   * inherits the résumé / cover letter again. It runs through the same
   * per-version endpoint, dropping each cached render, then re-renders from the
   * last returned document so the viewer, every thumbnail and the full-size view
   * all repaint the inherited design at once.
   */
  async function handleResetAllDesigns() {
    const targets = ownDesignVersions;
    if (targets.length === 0) {
      setPendingResetAll(false);
      return;
    }
    setResettingAll(true);
    try {
      let updated: T | null = null;
      for (const v of targets) {
        updated = (await setVersionTemplate(kind, docId, v.version, "")) as T;
        invalidateVersionPreview(kind, docId, v.version);
      }
      if (updated) onChanged(updated);
      showToast(
        `Reset ${targets.length} ${targets.length === 1 ? "version" : "versions"} to the document's design`,
        "success"
      );
    } catch (err) {
      if (isAuthError(err)) return;
      showToast(
        err instanceof ApiError
          ? err.message
          : "Could not reset the versions' designs.",
        "error"
      );
    } finally {
      setResettingAll(false);
      setPendingResetAll(false);
    }
  }

  function handleCardClick(v: DocumentVersion) {
    if (busy !== null) return;
    if (openMode) {
      onOpenVersion?.(v.version);
      return;
    }
    if (String(v.version) === String(activeVersion ?? "")) return;
    void runAction(v.version, "activate");
  }

  const subtitle =
    "Newest to oldest · centred on the current version · hover an edge to glide · ← → to browse · ⇤ ⇥ to jump · click for actions";

  // How much sits scrolled off each faded edge, surfaced in the rail HEADER as
  // well as on the rail itself — so the "N more" count stays visible even when
  // the edge arrows are out of view or hidden at an end.
  const moreLeft = canScroll.left && moreCounts.left > 0;
  const moreRight = canScroll.right && moreCounts.right > 0;
  const leftMoreTitle = `${moreCounts.left} more ${moreCounts.left === 1 ? "version" : "versions"} to the left`;
  const rightMoreTitle = `${moreCounts.right} more ${moreCounts.right === 1 ? "version" : "versions"} to the right`;

  // A version is being PREVIEWED large above but isn't the current one yet. The
  // header carries a small, always-visible hint naming it — so the "this isn't
  // applied yet" state survives even when the viewer above is scrolled out of
  // view — plus a one-tap Select and the Enter shortcut, so committing never
  // needs the second step hidden in a bubble.
  const previewing = previewKey !== "" && previewKey !== activeKey;
  const previewRecord = previewing
    ? ordered.find((v) => String(v.version) === previewKey)
    : undefined;
  const previewingLabel = previewRecord
    ? versionTitle(previewRecord)
    : previewVersion !== null && previewVersion !== undefined
      ? `v${previewVersion}`
      : "";
  const previewingHint = previewing ? (
    <div
      role="status"
      aria-live="polite"
      className={`px-3.5 py-2 flex items-center gap-2 flex-wrap border-b ${
        dark ? "border-background-50/10 bg-accent-500/15" : "border-accent-200 bg-accent-50"
      }`}
    >
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${
          dark ? "text-accent-200" : "text-accent-900"
        }`}
      >
        <i className="ri-eye-line" aria-hidden="true"></i>
        Previewing {previewingLabel} — not applied
      </span>
      <button
        type="button"
        onClick={() => void runAction(previewVersion as string | number, "activate")}
        disabled={busy !== null}
        title="Make this previewed version the current one"
        className="inline-flex items-center gap-1 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-2.5 py-1 rounded-full hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <i className="ri-check-double-line" aria-hidden="true"></i>
        Select this version
      </button>
      <span
        className={`inline-flex items-center gap-1 text-[11px] whitespace-nowrap ${
          dark ? "text-background-200" : "text-foreground-500"
        }`}
      >
        or press
        <kbd
          className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
            dark
              ? "border-background-50/20 bg-background-50/10 text-background-100"
              : "border-background-200 bg-background-50 text-foreground-700"
          }`}
        >
          Enter
        </kbd>
      </span>
    </div>
  ) : null;

  const header = dark ? (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3 border-b border-background-50/10">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent-500 text-foreground-950 flex-shrink-0">
          <i className="ri-git-branch-line text-lg" aria-hidden="true"></i>
        </span>
        <div className="min-w-0">
          <h3 className="font-heading text-base font-medium text-background-50 truncate">
            {title}
          </h3>
          <p className="text-xs text-background-200 truncate">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {moreLeft && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-background-100 bg-background-50/10 border border-background-50/15 px-1.5 py-0.5 rounded-full whitespace-nowrap"
            title={leftMoreTitle}
            aria-label={leftMoreTitle}
          >
            <i className="ri-arrow-left-s-line"></i>
            {moreCounts.left} more
          </span>
        )}
        {moreRight && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-background-100 bg-background-50/10 border border-background-50/15 px-1.5 py-0.5 rounded-full whitespace-nowrap"
            title={rightMoreTitle}
            aria-label={rightMoreTitle}
          >
            {moreCounts.right} more
            <i className="ri-arrow-right-s-line"></i>
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-background-50 bg-background-50/10 border border-background-50/15 px-2.5 py-1 rounded-full whitespace-nowrap">
          {ordered.length}
          {ordered.length === 1 ? " version" : " versions"}
        </span>
      </div>
    </div>
  ) : (
    <SectionHeader
      icon="ri-git-branch-line"
      tone="accent"
      title={title}
      subtitle={subtitle}
      count={ordered.length}
      countLabel={ordered.length === 1 ? "version" : "versions"}
      action={
        moreLeft || moreRight ? (
          <div className="flex items-center gap-1.5">
            {moreLeft && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-foreground-600 bg-background-50 border border-background-200 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                title={leftMoreTitle}
                aria-label={leftMoreTitle}
              >
                <i className="ri-arrow-left-s-line"></i>
                {moreCounts.left} more
              </span>
            )}
            {moreRight && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-foreground-600 bg-background-50 border border-background-200 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                title={rightMoreTitle}
                aria-label={rightMoreTitle}
              >
                {moreCounts.right} more
                <i className="ri-arrow-right-s-line"></i>
              </span>
            )}
          </div>
        ) : undefined
      }
    />
  );

  // --- Windowed mounting -----------------------------------------------------
  // Only the cards near the rail's visible window are MOUNTED; the rest render as
  // fixed-size placeholders that keep the rail's width, its scroll math, and the
  // "N more" / centring reads intact (they still carry `data-version-card`). Any
  // card whose affordance is live — the current version, the previewed one, a
  // pinned bubble, or an open full-size overlay — is force-mounted so none of
  // those can unmount out from under the user while they're using it.
  const activeIdx = activeKey ? visible.findIndex((v) => String(v.version) === activeKey) : -1;
  const previewIdx = previewKey ? visible.findIndex((v) => String(v.version) === previewKey) : -1;
  const pinnedIdx =
    pinnedVersion !== null
      ? visible.findIndex((v) => String(v.version) === String(pinnedVersion))
      : -1;
  const fullIdx =
    fullKey !== null ? visible.findIndex((v) => String(v.version) === fullKey) : -1;
  let mountStart = mountWindow.start;
  let mountEnd = mountWindow.end;
  if (visible.length <= WINDOW_MIN_TOTAL) {
    // Small rail — mount everything; windowing isn't worth the churn here.
    mountStart = 0;
    mountEnd = visible.length;
  } else {
    // Clamp so a shrunken / filtered list can never blank the rail while the
    // scroll effect catches up to the new count.
    mountStart = Math.min(mountStart, Math.max(0, visible.length - 1));
    mountEnd = Math.max(mountEnd, mountStart + 1);
  }
  for (const i of [activeIdx, previewIdx, pinnedIdx, fullIdx]) {
    if (i >= 0) {
      mountStart = Math.min(mountStart, i);
      mountEnd = Math.max(mountEnd, i + 1);
    }
  }

  const body = (
    <>
      {header}
      {previewingHint}
      <div className={dark ? "p-3" : "p-4"}>
        {ordered.length > 1 && (
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <i
                className={`ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none ${
                  dark ? "text-background-200" : "text-foreground-400"
                }`}
                aria-hidden="true"
              ></i>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a version by name…"
                aria-label="Search versions by name or nickname"
                className={`w-full text-sm rounded-md border pl-8 pr-8 py-1.5 focus:outline-none focus:ring-2 ${
                  dark
                    ? "bg-background-50/10 border-background-50/20 text-background-50 placeholder:text-background-200/80 focus:ring-accent-400/60"
                    : "bg-background-50 border-background-200 text-foreground-950 placeholder:text-foreground-400 focus:ring-primary-400"
                }`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear version search"
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md cursor-pointer ${
                    dark
                      ? "text-background-200 hover:text-background-50 hover:bg-background-50/15"
                      : "text-foreground-400 hover:text-foreground-800 hover:bg-background-100"
                  }`}
                >
                  <i className="ri-close-line text-sm"></i>
                </button>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hideIdentical}
              onClick={() =>
                setHideIdentical((on) => {
                  const next = !on;
                  writeHideIdentical(kind, docId, next);
                  return next;
                })
              }
              title={
                hideIdentical
                  ? "Show every version again"
                  : "Hide versions whose text matches the current version"
              }
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer transition-colors whitespace-nowrap ${
                dark
                  ? hideIdentical
                    ? "bg-accent-500 text-foreground-950 border-accent-500"
                    : "bg-background-50/10 text-background-100 border-background-50/20 hover:border-accent-400/60"
                  : hideIdentical
                    ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                    : "bg-background-50 text-foreground-700 border-background-200 hover:border-primary-300"
              }`}
            >
              <i className={hideIdentical ? "ri-eye-off-line" : "ri-eye-line"}></i>
              {hideIdentical ? "Identical hidden" : "Hide identical"}
              {hideIdentical && hideIdenticalCount > 0 && (
                <span className="text-[10px] opacity-90 tabular-nums">· {hideIdenticalCount}</span>
              )}
            </button>

            {ownDesignVersions.length > 0 && (
              <button
                type="button"
                onClick={() => setPendingResetAll(true)}
                disabled={resettingAll || busy !== null}
                title="Reset every version that carries its own design back to this document's design"
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
                  dark
                    ? "bg-background-50/10 text-background-100 border-background-50/20 hover:border-accent-400/60"
                    : "bg-background-50 text-foreground-700 border-background-200 hover:border-primary-300"
                }`}
              >
                {resettingAll ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  <i className="ri-restart-line"></i>
                )}
                Reset all to design
                <span className="text-[10px] opacity-90 tabular-nums">· {ownDesignVersions.length}</span>
              </button>
            )}

            <div className="flex items-center gap-1.5">
              {query.trim() ? (
                <span
                  className={`text-[11px] tabular-nums whitespace-nowrap ${
                    dark ? "text-background-200" : "text-foreground-500"
                  }`}
                  aria-live="polite"
                >
                  {visible.length} {visible.length === 1 ? "match" : "matches"}
                </span>
              ) : (
                (canScroll.left || canScroll.right) && (
                  <span
                    className={`text-[11px] tabular-nums whitespace-nowrap ${
                      dark ? "text-background-200" : "text-foreground-500"
                    }`}
                    title="Where you are in the rail"
                    aria-live="polite"
                  >
                    {Math.min(railIndex, visible.length - 1) + 1} of {visible.length}
                  </span>
                )
              )}
              <button
                type="button"
                onClick={() => jumpToEnd("newest")}
                disabled={!canScroll.left}
                title="Jump to the newest version"
                aria-label="Jump to the newest version"
                className={`w-7 h-7 rounded-full border flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  dark
                    ? "border-background-50/20 bg-background-50/10 text-background-100 hover:bg-accent-500 hover:text-foreground-950 hover:border-accent-500"
                    : "border-background-200 bg-background-50 text-foreground-600 hover:bg-primary-500 hover:text-background-50 hover:border-primary-500"
                }`}
              >
                <i className="ri-arrow-left-double-line"></i>
              </button>
              <button
                type="button"
                onClick={() => jumpToEnd("oldest")}
                disabled={!canScroll.right}
                title="Jump to the oldest version"
                aria-label="Jump to the oldest version"
                className={`w-7 h-7 rounded-full border flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  dark
                    ? "border-background-50/20 bg-background-50/10 text-background-100 hover:bg-accent-500 hover:text-foreground-950 hover:border-accent-500"
                    : "border-background-200 bg-background-50 text-foreground-600 hover:bg-primary-500 hover:text-background-50 hover:border-primary-500"
                }`}
              >
                <i className="ri-arrow-right-double-line"></i>
              </button>
            </div>
          </div>
        )}

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
            aria-label={`${title} — use the left and right arrow keys to browse`}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            style={
              edgeMask
                ? { maskImage: edgeMask, WebkitMaskImage: edgeMask }
                : undefined
            }
            className="relative z-0 flex gap-3 overflow-x-auto pb-2 snap-x"
          >
            {visible.length === 0 && (
              <div
                className={`w-full flex flex-col items-center justify-center gap-2 py-12 text-center rounded-xl border border-dashed ${
                  dark
                    ? "border-background-50/20 text-background-200"
                    : "border-background-200 text-foreground-500"
                }`}
              >
                <i className="ri-search-line text-2xl"></i>
                <p className="text-sm">
                  No versions match <span className="font-semibold">{query.trim()}</span>.
                </p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer whitespace-nowrap ${
                    dark
                      ? "border-background-50/25 text-background-100 hover:bg-background-50/10"
                      : "border-background-200 text-foreground-700 hover:bg-background-100"
                  }`}
                >
                  Clear search
                </button>
              </div>
            )}
            {visible.map((v, idx) => {
              // Off-window: a lightweight placeholder of the exact same footprint,
              // so the rail's geometry and the marquee's reads stay correct without
              // mounting a heavy VersionCard for a card nobody can see.
              if (idx < mountStart || idx >= mountEnd) {
                return (
                  <div
                    key={String(v.version)}
                    data-version-card
                    data-version-key={String(v.version)}
                    tabIndex={idx === focusIdx ? 0 : -1}
                    aria-label={`${versionTitle(v)} — load to view`}
                    className="shrink-0 snap-start rounded-xl border border-transparent"
                    style={{ width: CARD_W, minHeight: CARD_MIN_H }}
                  />
                );
              }
              const diff = diffByVersion.get(String(v.version));
              return (
                <VersionCard
                  key={String(v.version)}
                  kind={kind}
                  docId={docId}
                  version={v}
                  activeVersion={activeVersion}
                  diffCount={diff?.count ?? null}
                  diffSections={diff?.sections ?? []}
                  identical={diff?.identical ?? null}
                  tabIndexValue={idx === focusIdx ? 0 : -1}
                  openMode={openMode}
                  singleVersion={singleVersion}
                  busy={busy === v.version}
                  busyAction={busyAction}
                  variant={variant}
                  showStyleLabel={showStyleLabel}
                  clickOpensFull={clickOpensFull}
                  showSelect={showSelect}
                  previewing={
                    previewKey !== "" && previewKey === String(v.version) && previewKey !== activeKey
                  }
                  revision={revisionKey}
                  onOpenInEditor={onOpenInEditor ? () => onOpenInEditor(v.version) : undefined}
                  onPreview={onViewVersion ? () => onViewVersion(v.version) : undefined}
                  pinned={pinnedVersion !== null && String(pinnedVersion) === String(v.version)}
                  pinnedElsewhere={pinnedVersion !== null && String(pinnedVersion) !== String(v.version)}
                  onClick={handleCardClick}
                  onRenameSubmit={(v, label) => handleRename(v.version, label)}
                  onCompare={setCompareVersion}
                  onRestore={(ver) => void runAction(ver.version, "restore")}
                  onDelete={setPendingDelete}
                  onTogglePin={togglePin}
                  onResetDesign={handleResetDesign}
                  fullOpen={fullKey === String(v.version)}
                  fullViewActive={fullKey !== null}
                  fullPosition={fullPosition}
                  hasFullPrev={fullPrev !== null}
                  hasFullNext={fullNext !== null}
                  fullPrevLabel={fullPrev ? versionTitle(fullPrev) : undefined}
                  fullNextLabel={fullNext ? versionTitle(fullNext) : undefined}
                  onOpenFull={() => setFullKey(String(v.version))}
                  onCloseFull={() => setFullKey(null)}
                  onFullPrev={() => {
                    if (fullPrev) setFullKey(String(fullPrev.version));
                  }}
                  onFullNext={() => {
                    if (fullNext) setFullKey(String(fullNext.version));
                  }}
                />
              );
            })}
          </div>

          <button
            type="button"
            data-marquee-arrow="left"
            onClick={(e) => {
              e.stopPropagation();
              scrollByOne(-1);
            }}
            onMouseEnter={() => handleArrowHover(-1)}
            onMouseLeave={handleArrowLeave}
            disabled={!canScroll.left}
            aria-label="Scroll one version toward newer"
            title="One newer version"
            className={`absolute left-1 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer transition disabled:opacity-0 disabled:pointer-events-none hover:scale-110 active:scale-95 ${
              dark
                ? "border-accent-500 bg-accent-500 text-foreground-950 hover:bg-accent-400 hover:border-accent-400"
                : "border-background-200 bg-background-50 text-foreground-700 hover:bg-primary-500 hover:text-background-50 hover:border-primary-500"
            }`}
          >
            <i className="ri-arrow-left-s-line text-lg"></i>
          </button>
          <button
            type="button"
            data-marquee-arrow="right"
            onClick={(e) => {
              e.stopPropagation();
              scrollByOne(1);
            }}
            onMouseEnter={() => handleArrowHover(1)}
            onMouseLeave={handleArrowLeave}
            disabled={!canScroll.right}
            aria-label="Scroll one version toward older"
            title="One older version"
            className={`absolute right-1 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer transition disabled:opacity-0 disabled:pointer-events-none hover:scale-110 active:scale-95 ${
              dark
                ? "border-accent-500 bg-accent-500 text-foreground-950 hover:bg-accent-400 hover:border-accent-400"
                : "border-background-200 bg-background-50 text-foreground-700 hover:bg-primary-500 hover:text-background-50 hover:border-primary-500"
            }`}
          >
            <i className="ri-arrow-right-s-line text-lg"></i>
          </button>

          {canScroll.left && moreCounts.left > 0 && (
            <span
              className={`pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 z-20 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
                dark
                  ? "bg-background-950/70 text-background-50 border-background-50/20"
                  : "bg-background-50/95 text-foreground-600 border-background-200"
              }`}
              title={`${moreCounts.left} more ${moreCounts.left === 1 ? "version" : "versions"} to the left`}
            >
              <i className="ri-arrow-left-s-line"></i>
              {moreCounts.left} more
            </span>
          )}

          {canScroll.right && moreCounts.right > 0 && (
            <span
              className={`pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 z-20 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
                dark
                  ? "bg-background-950/70 text-background-50 border-background-50/20"
                  : "bg-background-50/95 text-foreground-600 border-background-200"
              }`}
              title={`${moreCounts.right} more ${moreCounts.right === 1 ? "version" : "versions"} to the right`}
            >
              {moreCounts.right} more
              <i className="ri-arrow-right-s-line"></i>
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {dark ? (
        <div
          className={`relative overflow-hidden rounded-xl border border-background-50/15 bg-background-50/5 backdrop-blur-sm ${className}`}
          aria-label={title}
        >
          {body}
        </div>
      ) : (
        <Card surface={surface} className={`overflow-hidden ${className}`} aria-label={title}>
          {body}
        </Card>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this version?"
          message="Delete this version? This can't be undone."
          confirmLabel="Delete version"
          onConfirm={async () => {
            await runAction(pendingDelete.version, "delete");
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingResetAll && (
        <ConfirmDialog
          title="Reset every version's design?"
          message={`Reset ${ownDesignVersions.length} ${ownDesignVersions.length === 1 ? "version" : "versions"} that carry their own design back to this document's design? You can re-design any version afterwards.`}
          confirmLabel="Reset all"
          onConfirm={handleResetAllDesigns}
          onCancel={() => setPendingResetAll(false)}
        />
      )}

      {compareVersion && (
        <VersionsCompareDialog
          kind={kind}
          docId={docId}
          versions={versions}
          activeVersion={activeVersion}
          baseVersion={compareVersion.version}
          busy={busy !== null}
          onClose={() => setCompareVersion(null)}
          onActivate={(version) => {
            setCompareVersion(null);
            if (openMode) onOpenVersion?.(version);
            else void runAction(version, "activate");
          }}
          onRestoreAsCopy={(version) => {
            setCompareVersion(null);
            void runAction(version, "restore");
          }}
        />
      )}
    </>
  );
}