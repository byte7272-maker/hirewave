import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DocumentVersion } from "@/lib/documents";
import VersionMarkdownPreview from "@/pages/dashboard/documents/templates/VersionMarkdownPreview";
import useInView from "@/hooks/useInView";
import {
  SOURCE_META,
  asText,
  formatDate,
  isCustomLabel,
  sourceKind,
  truncate,
  versionTitle,
  versionTemplateId,
  NICKNAME_COUNTER_FROM,
  NICKNAME_MAX,
  type BusyAction,
  type VersionKind,
} from "./versionMeta";
import useVersionPreview from "./useVersionPreview";
import useVersionPreviewImage from "./useVersionPreviewImage";
import useVersionPreviewHtml from "./useVersionPreviewHtml";
import { getTheme } from "@/pages/dashboard/documents/templates/themeRegistry";
import { getAccent } from "@/pages/dashboard/documents/templates/accent";
import { getFont } from "@/pages/dashboard/documents/templates/styleFonts";
import DiffSectionsPopover from "./DiffSectionsPopover";
import NicknameCharCounter from "./NicknameCharCounter";
import VersionFullPreview from "./VersionFullPreview";

// A4 ratio (794 × 1123), so every preview frame matches a real page.
const THUMB_W = 224;
const THUMB_H = Math.round((THUMB_W * 1123) / 794);
// The hover "peek" is a compact bubble — a small page you can read the layout
// and catch some wording from, not a full-size sheet. Kept near the card
// thumbnail's scale so it reads as a floating bubble, not a second page.
const HOVER_W = 328;
const HOVER_H = Math.round((HOVER_W * 1123) / 794);
const POPOVER_W = HOVER_W + 32;
const POPOVER_H = HOVER_H + 150;

interface VersionCardProps {
  kind: VersionKind;
  docId: string | number;
  version: DocumentVersion;
  activeVersion: string | number | null | undefined;
  /** How many sections differ from the current version — null while unknown. */
  diffCount: number | null;
  /** The display names of the sections that differ, for the chip's hover popover. */
  diffSections: string[];
  /** True when this version's text matches the current one; null while unknown. */
  identical: boolean | null;
  /** Roving tabindex: 0 for the one card that owns the tab stop, else -1. */
  tabIndexValue: number;
  openMode: boolean;
  singleVersion: boolean;
  busy: boolean;
  busyAction: BusyAction | null;
  /** Visual skin — `dark` is the dashboard's gradient marquee section. */
  variant?: "light" | "dark";
  /** Show the small "Template · Accent · Typeface" line naming this version's style. */
  showStyleLabel?: boolean;
  /**
   * When true, clicking the card opens its full-size overlay (make current / open
   * in the editor) instead of pinning the small hover bubble.
   */
  clickOpensFull?: boolean;
  /**
   * Show a prominent "Select" control directly on the thumbnail (the My Work
   * Highlights marquee). It makes the version current in one tap, right on the
   * image, instead of hiding selection inside the hover bubble / full overlay.
   */
  showSelect?: boolean;
  /**
   * True when this version is the one being PREVIEWED large above the rail but
   * is NOT yet the current version. Its card then flags "not yet applied" and
   * carries a prominent one-tap Select control, so the required second step is
   * obvious instead of hidden in the hover bubble.
   */
  previewing?: boolean;
  /**
   * A change counter bumped by the host on EVERY document mutation — including an
   * in-place save that does NOT change the version number or its design. It is
   * folded into the thumbnail / peek / full-size revision marker, so the preview
   * images re-fetch (never a stale paint) the moment the underlying content
   * changes. Defaults to "" so callers that don't track edits stay unchanged.
   */
  revision?: string | number;
  /** Open this version in the full document editor (shown in the full-size overlay). */
  onOpenInEditor?: () => void;
  /**
   * Called when the card is clicked to PREVIEW it (before it is made current) —
   * the editor's main viewer shows that same version large above the strip.
   */
  onPreview?: (version: DocumentVersion) => void;
  /** Whether this card's action bubble is pinned open (clicked, not just hovered). */
  pinned: boolean;
  /** Whether some OTHER card's bubble is pinned — suppresses this card's hover peek. */
  pinnedElsewhere: boolean;
  /** The card's primary action: open in the editor, or activate in place. */
  onClick: (version: DocumentVersion) => void;
  /**
   * Save a new nickname for this version via the inline editor (an empty value
   * clears it). Resolves `true` on success so the editor can close; on failure it
   * resolves `false` and the editor stays open for a retry.
   */
  onRenameSubmit: (version: DocumentVersion, label: string) => Promise<boolean>;
  onCompare: (version: DocumentVersion) => void;
  onRestore: (version: DocumentVersion) => void;
  onDelete: (version: DocumentVersion) => void;
  /**
   * Reset this version to the document's own design — dropping its own design so
   * it inherits the résumé / cover letter again. Only offered when the version
   * actually carries its own design (see `hasOwnDesign`).
   */
  onResetDesign?: (version: DocumentVersion) => void;
  /** Pin / unpin this card's action bubble. */
  onTogglePin: (version: DocumentVersion) => void;
  /** Whether THIS card's full-screen readable view is open. */
  fullOpen: boolean;
  /** Whether ANY card's full-screen readable view is open (suppresses peeks). */
  fullViewActive: boolean;
  /** Where this version sits in the strip, e.g. "2 of 5". */
  fullPosition: string;
  hasFullPrev: boolean;
  hasFullNext: boolean;
  fullPrevLabel?: string;
  fullNextLabel?: string;
  /** Open / close THIS card's full-screen readable view. */
  onOpenFull: () => void;
  onCloseFull: () => void;
  onFullPrev: () => void;
  onFullNext: () => void;
}

/**
 * One card in the Versions marquee: a REAL scaled-down render of that version
 * (through the résumé/cover-letter template it is saved on). Hovering the card
 * peeks a floating "bubble" with a larger preview; clicking the card PINS that
 * bubble open (it stays put and becomes interactive) with a primary open /
 * make-current action plus rename, compare, restore and delete. Clicking outside
 * or pressing Escape dismisses a pinned bubble.
 *
 * The thumbnail renders lazily: its content is fetched only once the card has
 * scrolled into view, and the large bubble preview is rendered on demand (never
 * upfront), so a long strip stays cheap. Each card also compares its own content
 * against the current version to flag "changed vs current" at a glance.
 */
export default function VersionCard({
  kind,
  docId,
  version,
  activeVersion,
  diffCount,
  diffSections,
  identical,
  tabIndexValue,
  openMode,
  singleVersion,
  busy,
  busyAction,
  variant = "light",
  showStyleLabel,
  clickOpensFull = false,
  showSelect = false,
  previewing = false,
  revision,
  onOpenInEditor,
  onPreview,
  pinned,
  pinnedElsewhere,
  onClick,
  onRenameSubmit,
  onCompare,
  onRestore,
  onDelete,
  onResetDesign,
  onTogglePin,
  fullOpen,
  fullViewActive,
  fullPosition,
  hasFullPrev,
  hasFullNext,
  fullPrevLabel,
  fullNextLabel,
  onOpenFull,
  onCloseFull,
  onFullPrev,
  onFullNext,
}: VersionCardProps) {
  const dark = variant === "dark";
  const [ref, inView] = useInView<HTMLDivElement>();
  const preview = useVersionPreview(kind, docId, version, inView || fullOpen);
  // The style the preview actually renders with — resolved by the hook from the
  // local choice, else the server-authoritative template, else the document's
  // template. Painting with the hook's own style keeps the card's label and its
  // image in lockstep (the design can never drift from the version's real one).
  const style = preview.style;
  // The three style dimensions this version renders with, named through the SAME
  // registries the renderer uses — so the label can't name a style the page isn't
  // actually drawn with. Only computed when the label is shown.
  const themeName = showStyleLabel ? getTheme(style.themeId).name : "";
  const accentName = showStyleLabel ? getAccent(style.accentId).name : "";
  const fontName = showStyleLabel ? getFont(style.fontId).name : "";
  // The design shown on this card was NOT resolved from an authoritative source
  // (the version's own template, the server's rendered template, or a saved local
  // choice) — we fell back to the built-in default. Surface it instead of letting
  // a backend data issue pass silently. Only once the load has settled, so the
  // note never flashes while the card is still fetching.
  const designFallback =
    !preview.loading && (preview.error || (preview.loaded && !style.resolved));

  const [peeked, setPeeked] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const timer = useRef<number | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const isActive = String(version.version) === String(activeVersion ?? "");
  // True when this version carries its OWN design (a non-empty `template_id`),
  // which is exactly when "reset to the document's design" has something to do.
  // Coerced to a string so a numeric id from the API can never break a string op.
  const ownTemplateId = versionTemplateId(version);
  const hasOwnDesign = Boolean(ownTemplateId);
  // The revision marker that keys every preview fetch for this card. The
  // version's OWN design is included so a re-design / reset re-fetches, and the
  // host's change counter is appended so an in-place save (same version, same
  // design) still busts the cache and repaints the latest content.
  const previewRevision = `${ownTemplateId}:${revision ?? ""}`;
  const meta = SOURCE_META[sourceKind(version)];
  const date = formatDate(version.created_at);
  const summary = version.change_summary ? truncate(version.change_summary, 90) : "";
  const renamed = isCustomLabel(version);
  const canCompare = !singleVersion;

  /** Inline nickname editing: the input's open/closed state and its draft value. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // The bubble is open when the card is pinned OR hovered/focused (a "peek"),
  // and a peek is suppressed while some other card is pinned — or while the
  // full-screen readable view is up (its own overlay sits below the bubble's
  // z-layer, so the bubble must never compete with it). It is also suppressed
  // while the nickname editor is open, so the peek can never cover the input.
  const bubbleOpen =
    !editing && !fullViewActive && (pinned || (peeked && !pinnedElsewhere));

  // The lightweight PAGE IMAGE for this card — a single rasterised page instead
  // of mounting the version's full document DOM. Because the marquee shows many
  // versions at once, this is what keeps a long strip cheap (no mounting freeze):
  // the thumbnail image loads lazily as the card scrolls into view, and the
  // larger scale=2 image is only fetched when the bubble / full-size view opens.
  // The demo build has no render endpoint, so it falls back to a client-rendered
  // page (see `useRasterThumb`).
  const thumbImage = useVersionPreviewImage(
    kind,
    docId,
    version.version,
    inView,
    1,
    previewRevision
  );
  const largeImage = useVersionPreviewImage(
    kind,
    docId,
    version.version,
    bubbleOpen || fullOpen,
    2,
    previewRevision
  );
  // The version's HTML page — fetched ONLY for the full-size readable view, the
  // crisp/selectable read. The marquee thumbnails and the hover peek stay on the
  // lightweight rasterised page images above, so a long strip still stays cheap.
  const fullHtml = useVersionPreviewHtml(
    kind,
    docId,
    version.version,
    fullOpen,
    previewRevision
  );
  const useRasterThumb = !__IS_PREVIEW__;

  // The compact "changed vs current" read, resolved by the strip from every
  // version's content: `identical` is true/false once known, else null; `diffCount`
  // is how many sections differ (0 when identical).
  const diffKnown = !isActive && identical !== null;
  const diffNote = !diffKnown
    ? ""
    : identical
      ? " — identical to the current version"
      : diffCount !== null
        ? ` — ${diffCount} ${diffCount === 1 ? "section" : "sections"} changed from the current version${
            diffSections.length ? ` (${diffSections.join(", ")})` : ""
          }`
        : " — changed from the current version";

  const deleting = busy && busyAction === "delete";
  const restoring = busy && busyAction === "restore";
  const renaming = busy && busyAction === "rename";
  const reseting = busy && busyAction === "reset";

  function showPreview() {
    if (editing) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPeeked(true), 220);
  }
  function hidePreview() {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setPeeked(false);
  }

  /**
   * Enter inline nickname editing, pre-filled with the current label. Focus and
   * select the text so a re-name starts from the existing value.
   */
  function startEdit() {
    if (busy) return;
    setDraft(asText(version.label));
    setEditing(true);
  }

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, [editing]);

  /**
   * Commit the nickname. Trimmed and capped at 80 chars (the API's own limit); an
   * empty value clears the nickname. Keeps the editor open when the save fails so
   * the name can be retried, and ignores a no-op (unchanged) value.
   */
  async function commitEdit() {
    if (!editing) return;
    const next = draft.trim().slice(0, NICKNAME_MAX);
    const current = asText(version.label);
    if (next === current) {
      setEditing(false);
      return;
    }
    const ok = await onRenameSubmit(version, next);
    if (ok) setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  /** Open the full-screen, fully readable view — collapsing any peek / pin first. */
  function openFullView() {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setPeeked(false);
    if (pinned) onTogglePin(version);
    onOpenFull();
  }

  /**
   * The card's primary click / keyboard action. In the My Work Highlights
   * marquee (`clickOpensFull`) it opens the full-size overlay, where you choose
   * to make the version current or open it in the editor. Everywhere else it
   * pins the small action bubble, as before.
   */
  function primaryActivate() {
    if (busy) return;
    // Let the host (the editor's main viewer) follow the click — show this same
    // version large above the strip, even before it's made current.
    onPreview?.(version);
    if (clickOpensFull) {
      openFullView();
      return;
    }
    onTogglePin(version);
  }

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  // Position the floating bubble beside the card. Prefer below; flip above when
  // there isn't room beneath.
  const place = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - POPOVER_W / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - POPOVER_W - 12));
    let above = false;
    let top = rect.bottom + 14;
    if (top + POPOVER_H > window.innerHeight - 12) {
      above = true;
      top = Math.max(12, rect.top - POPOVER_H - 14);
    }
    setPos({ top, left, above });
  }, [ref]);

  useEffect(() => {
    if (!bubbleOpen) {
      setPos(null);
      return;
    }
    place();
  }, [bubbleOpen, place]);

  // Keep a PINNED bubble glued to its card while the page scrolls / resizes.
  useEffect(() => {
    if (!pinned) return undefined;
    const update = () => place();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [pinned, place]);

  // Clicking outside (or Escape) dismisses a pinned bubble.
  useEffect(() => {
    if (!pinned) return undefined;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (bubbleRef.current?.contains(t)) return;
      onTogglePin(version);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTogglePin(version);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned, onTogglePin, version, ref]);

  // Auto-dismiss a PINNED bubble the moment it would cover one of the marquee's
  // navigation arrows, so an open bubble can never sit between the pointer and an
  // arrow. Disabled arrows are skipped (they're pointer-events-none anyway). This
  // re-checks whenever the bubble is repositioned — on open and on scroll / resize.
  useEffect(() => {
    if (!pinned) return undefined;
    const check = () => {
      const bubble = bubbleRef.current?.getBoundingClientRect();
      if (!bubble) return;
      const rail = ref.current?.closest("[data-marquee-rail]");
      if (!rail) return;
      const margin = 6;
      const arrows = rail.querySelectorAll<HTMLElement>("[data-marquee-arrow]");
      for (const arrow of Array.from(arrows)) {
        if ((arrow as HTMLButtonElement).disabled) continue;
        const r = arrow.getBoundingClientRect();
        const overlaps = !(
          bubble.right < r.left - margin ||
          bubble.left > r.right + margin ||
          bubble.bottom < r.top - margin ||
          bubble.top > r.bottom + margin
        );
        if (overlaps) {
          onTogglePin(version);
          return;
        }
      }
    };
    const raf = requestAnimationFrame(check);
    const t = window.setTimeout(check, 140);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [pinned, pos, onTogglePin, version, ref]);

  // --- skin -----------------------------------------------------------------
  // The CURRENT version card carries a loud, unmissable surround so, in a long
  // scrolling marquee, it is obvious at a glance which version is live: a thick
  // 2px ring in the role colour, a tinted fill, and a left accent bar.
  const cardCls = dark
    ? isActive
      ? "border-accent-400 bg-accent-500/20 ring-2 ring-accent-400 ring-offset-2 ring-offset-foreground-950"
      : "border-background-50/15 bg-background-50/5 hover:border-accent-400/60"
    : isActive
      ? "border-primary-400 bg-primary-50 ring-2 ring-primary-400 ring-offset-2 ring-offset-background-50"
      : "border-background-200 bg-background-50 hover:border-primary-300";

  const titleCls = dark ? "text-background-50" : "text-foreground-950";
  const summaryCls = dark ? "text-background-100/85" : "text-foreground-600";
  const dateCls = dark ? "text-background-200" : "text-foreground-400";

  const iconBtn = (lightHover: string) =>
    `w-6 h-6 flex items-center justify-center rounded-md cursor-pointer flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      dark
        ? "bg-background-50/10 text-background-100 hover:bg-background-50/25 hover:text-background-50"
        : `bg-background-50/95 text-foreground-500 ${lightHover}`
    }`;

  // Bubble buttons — the bubble always sits on a light "paper" surface, so these
  // keep the light-on-paper hovers regardless of the surrounding skin.
  const bubbleBtn = (lightHover: string) =>
    `w-8 h-8 flex items-center justify-center rounded-md border border-background-200 text-foreground-500 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${lightHover}`;

  return (
    <>
      <div
        ref={ref}
        role="button"
        data-version-card
        data-version-key={String(version.version)}
        tabIndex={tabIndexValue}
        aria-label={`${versionTitle(version)}${isActive ? " (current)" : ""}${diffNote}`}
        aria-busy={busy}
        aria-expanded={clickOpensFull ? fullOpen : pinned}
        onClick={primaryActivate}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (busy) return;
          if (clickOpensFull) return;
          openFullView();
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && e.shiftKey) {
            e.preventDefault();
            if (busy) return;
            openFullView();
            return;
          }
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            primaryActivate();
          }
        }}
        onMouseEnter={showPreview}
        onMouseLeave={hidePreview}
        onFocus={showPreview}
        onBlur={hidePreview}
        className={`group relative w-[248px] flex-shrink-0 snap-start text-left rounded-xl border p-2.5 cursor-pointer hw-lift ${cardCls}${
          previewing && !isActive ? " ring-2 ring-accent-400/60" : ""
        }`}
      >
        {isActive && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full ${
              dark ? "bg-accent-400" : "bg-primary-500"
            }`}
          ></span>
        )}
        <div className="relative">
          {useRasterThumb ? (
            thumbImage.url ? (
              <div
                className="rounded-md border border-background-200 bg-white overflow-hidden"
                style={{ width: THUMB_W, height: THUMB_H }}
              >
                <img
                  src={thumbImage.url}
                  alt={`${versionTitle(version)} preview`}
                  decoding="async"
                  className="w-full h-full object-cover object-top"
                />
              </div>
            ) : thumbImage.status === "loading" || thumbImage.status === "idle" ? (
              <div
                className="rounded-md border border-background-200 bg-white overflow-hidden"
                style={{ width: THUMB_W, height: THUMB_H }}
              >
                <div className="h-full w-full p-4 space-y-2.5 animate-pulse">
                  <div className="h-3 w-2/3 rounded bg-background-200/70"></div>
                  <div className="h-2 w-1/3 rounded bg-background-200/60"></div>
                  <div className="h-2 w-1/2 rounded bg-background-200/50"></div>
                  <div className="mt-5 space-y-2">
                    <div className="h-2 w-full rounded bg-background-200/50"></div>
                    <div className="h-2 w-5/6 rounded bg-background-200/50"></div>
                    <div className="h-2 w-4/6 rounded bg-background-200/50"></div>
                    <div className="h-2 w-5/6 rounded bg-background-200/40"></div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center gap-1 rounded-md border border-background-200 bg-background-100 text-foreground-400"
                style={{ width: THUMB_W, height: THUMB_H }}
              >
                <i
                  className={
                    thumbImage.status === "empty"
                      ? "ri-file-text-line text-xl"
                      : "ri-image-line text-xl"
                  }
                ></i>
                <span className="text-[10px] text-center px-2">
                  {thumbImage.status === "empty" ? "No preview yet" : "Preview unavailable"}
                </span>
              </div>
            )
          ) : preview.markdown ? (
            <VersionMarkdownPreview
              markdown={preview.markdown}
              themeId={style.themeId}
              accentId={style.accentId}
              fontId={style.fontId}
              width={THUMB_W}
              height={THUMB_H}
            />
          ) : preview.error ? (
            <div
              className="flex flex-col items-center justify-center gap-1 rounded-md border border-background-200 bg-background-100 text-foreground-400"
              style={{ width: THUMB_W, height: THUMB_H }}
            >
              <i className="ri-file-forbid-line text-xl"></i>
              <span className="text-[10px]">No preview</span>
            </div>
          ) : preview.loaded ? (
            <div
              className="flex flex-col items-center justify-center gap-1 rounded-md border border-background-200 bg-background-100 text-foreground-400"
              style={{ width: THUMB_W, height: THUMB_H }}
            >
              <i className="ri-file-text-line text-xl"></i>
              <span className="text-[10px] text-center px-2">This version has no content yet</span>
            </div>
          ) : (
            <div
              className="rounded-md border border-background-200 bg-white overflow-hidden"
              style={{ width: THUMB_W, height: THUMB_H }}
            >
              <div className="h-full w-full p-4 space-y-2.5 animate-pulse">
                <div className="h-3 w-2/3 rounded bg-background-200/70"></div>
                <div className="h-2 w-1/3 rounded bg-background-200/60"></div>
                <div className="h-2 w-1/2 rounded bg-background-200/50"></div>
                <div className="mt-5 space-y-2">
                  <div className="h-2 w-full rounded bg-background-200/50"></div>
                  <div className="h-2 w-5/6 rounded bg-background-200/50"></div>
                  <div className="h-2 w-4/6 rounded bg-background-200/50"></div>
                  <div className="h-2 w-5/6 rounded bg-background-200/40"></div>
                </div>
              </div>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 p-2 flex items-start justify-between gap-1.5">
            <div className="flex items-center gap-1 min-w-0">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}
              >
                <i className={meta.icon}></i>
                {meta.label}
              </span>
              {isActive && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full whitespace-nowrap bg-primary-500 text-background-50 dark:text-foreground-950 ring-1 ring-primary-300">
                  <i className="ri-checkbox-circle-fill"></i>
                  Current
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit();
                }}
                disabled={busy}
                title="Rename this version"
                aria-label={`Rename ${versionTitle(version)}`}
                className={iconBtn("hover:text-secondary-700")}
              >
                {renaming ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-pencil-line"></i>}
              </button>
              {canCompare && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (busy) return;
                    onCompare(version);
                  }}
                  disabled={busy}
                  title="Compare with another version"
                  aria-label={`Compare ${versionTitle(version)} with another version`}
                  className={iconBtn("hover:text-secondary-700")}
                >
                  <i className="ri-arrow-left-right-line"></i>
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (busy) return;
                  onRestore(version);
                }}
                disabled={busy}
                title="Restore as a copy — branch this version into a new one"
                aria-label={`Restore ${versionTitle(version)} as a copy`}
                className={iconBtn("hover:text-primary-700")}
              >
                {restoring ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-git-branch-line"></i>}
              </button>
              {!singleVersion && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (busy) return;
                    onDelete(version);
                  }}
                  disabled={busy}
                  title="Delete this version"
                  aria-label="Delete this version"
                  className={iconBtn("hover:text-accent-700")}
                >
                  {deleting ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-close-line"></i>}
                </button>
              )}
            </div>
          </div>

          {(showSelect || previewing) && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (busy || isActive) return;
                onClick(version);
              }}
              disabled={busy}
              aria-disabled={busy || isActive}
              title={
                isActive
                  ? "This version is already current"
                  : previewing
                    ? "Select this version to make it current — it isn't applied yet"
                    : "Select this version — show it here and make it current"
              }
              aria-label={
                isActive
                  ? `${versionTitle(version)} is the current version`
                  : previewing
                    ? `Select ${versionTitle(version)} as the current version — not yet applied`
                    : `Select ${versionTitle(version)} as the current version`
              }
              className={`absolute bottom-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors whitespace-nowrap ${
                previewing && !isActive
                  ? "text-xs py-2 px-3 bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 cursor-pointer ring-2 ring-primary-300"
                  : isActive
                    ? "text-[11px] py-1.5 px-2.5 bg-background-50/95 text-primary-800 border border-primary-300 cursor-default"
                    : "text-[11px] py-1.5 px-2.5 bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 cursor-pointer"
              }`}
            >
              {busy ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className={isActive ? "ri-check-line" : "ri-check-double-line"}></i>
              )}
              {isActive ? "Current" : previewing ? "Select this version" : "Select"}
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (busy) return;
              openFullView();
            }}
            title="Read this version full size"
            aria-label={`Read ${versionTitle(version)} full size`}
            className="group/expand absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-foreground-950/60 hover:bg-foreground-950/80 text-background-50 text-[10px] font-semibold py-1 px-1.5 transition-colors cursor-pointer"
          >
            <i className="ri-expand-diagonal-line"></i>
            <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover/expand:max-w-[64px] group-hover/expand:opacity-100">
              Read
            </span>
          </button>
        </div>

        {editing ? (
          <div className="mt-2.5">
            <input
              ref={inputRef}
              value={draft}
              maxLength={NICKNAME_MAX}
              disabled={busy}
              placeholder={versionTitle(version)}
              aria-label="Nickname this version"
              aria-describedby={`nickname-count-${version.version}`}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                // Keep every key inside the field: Enter saves, Esc cancels, and no
                // keystroke bubbles up to the card's Enter/Space / arrow handling.
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onBlur={(e) => {
                // Save on blur — unless focus merely moved to another control on
                // this same card (e.g. compare / delete), which keeps editing open.
                const next = e.relatedTarget as Node | null;
                if (next && ref.current?.contains(next)) return;
                void commitEdit();
              }}
              className="w-full text-sm font-semibold px-2 py-1 rounded-md bg-background-50 border border-primary-300 text-foreground-950 placeholder:text-foreground-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            {draft.length >= NICKNAME_COUNTER_FROM && (
              <div
                id={`nickname-count-${version.version}`}
                className="mt-1 flex justify-end"
              >
                <NicknameCharCounter length={draft.length} />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2.5 flex items-center gap-1 min-w-0">
            <p
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startEdit();
              }}
              title="Double-click to rename"
              className={`text-sm font-semibold truncate cursor-text flex-1 min-w-0 ${titleCls}`}
            >
              {versionTitle(version)}
            </p>
            {renamed && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (busy) return;
                  void onRenameSubmit(version, "");
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                disabled={busy}
                title={`Clear nickname “${versionTitle(version)}”`}
                aria-label={`Clear nickname for ${versionTitle(version)}`}
                className={iconBtn("hover:text-accent-700")}
              >
                {renaming ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  <i className="ri-close-circle-line"></i>
                )}
              </button>
            )}
          </div>
        )}
        {summary && (
          <p className={`mt-0.5 text-xs truncate ${summaryCls}`} title={version.change_summary}>
            {summary}
          </p>
        )}

        {showStyleLabel && (
          <span
            className={`mt-1 flex items-center gap-1 min-w-0 text-[10px] ${dark ? "text-background-200" : "text-foreground-400"}`}
            title={`Rendered with the ${themeName} template, ${accentName} accent, and ${fontName} typeface`}
          >
            <i className="ri-palette-line flex-shrink-0" aria-hidden="true"></i>
            <span className="truncate">
              {themeName} · {accentName} · {fontName}
            </span>
          </span>
        )}

        {designFallback && (
          <span
            className={`mt-1 flex items-center gap-1 min-w-0 text-[10px] ${
              dark ? "text-accent-300" : "text-accent-700"
            }`}
            title="We couldn't load this version's saved design from the server, so it's shown with a default look. Reopen this version to try again."
          >
            <i className="ri-error-warning-line flex-shrink-0" aria-hidden="true"></i>
            <span className="truncate">Couldn't load this version's design</span>
          </span>
        )}

        {diffKnown && identical && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap text-secondary-900 bg-secondary-100">
            <i className="ri-check-double-line"></i>
            Identical to current
          </span>
        )}
        {diffKnown && !identical && diffCount !== null && (
          <div className="mt-1.5">
            <DiffSectionsPopover
              sections={diffSections}
              title={`${diffCount} ${diffCount === 1 ? "section" : "sections"} changed`}
            >
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap text-accent-900 bg-accent-100 cursor-help">
                <i className="ri-arrow-left-right-line"></i>
                {`${diffCount} ${diffCount === 1 ? "section" : "sections"} changed`}
              </span>
            </DiffSectionsPopover>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 min-h-[20px]">
          <div className="flex items-center gap-1.5 min-w-0">
            {date && (
              <span className={`text-[11px] whitespace-nowrap ${dateCls}`}>{date}</span>
            )}
            {renamed && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium text-secondary-900 bg-secondary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                title={`Renamed: ${version.label}`}
              >
                <i className="ri-price-tag-3-line"></i>
                Renamed
              </span>
            )}
          </div>
          {isActive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-900 bg-primary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              <i className="ri-check-line"></i>
              Current
            </span>
          )}
        </div>

        {!isActive && !busy && (
          <span
            className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${
              dark ? "text-accent-300" : "text-primary-700"
            } opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap`}
          >
            <i className="ri-cursor-line"></i>
            Click for actions · ⤢ to read full size
          </span>
        )}
      </div>

      {bubbleOpen &&
        pos &&
        createPortal(
          <div
            ref={bubbleRef}
            aria-hidden={!pinned}
            className={`hw-paper fixed z-[80] ${pinned ? "pointer-events-auto" : "pointer-events-none"}`}
            style={{ top: pos.top, left: pos.left, width: POPOVER_W }}
          >
            <div className="animate-bubble-in relative rounded-[30px] border border-background-200 bg-background-50 overflow-hidden">
              <span
                aria-hidden="true"
                className={`absolute left-1/2 w-3.5 h-3.5 -translate-x-1/2 rotate-45 bg-background-50 border-background-200 ${
                  pos.above ? "-bottom-1.5 border-r border-b" : "-top-1.5 border-l border-t"
                }`}
              ></span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-14 rounded-t-[30px] bg-gradient-to-b from-background-100/70 to-transparent"
              ></span>

              <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-foreground-950 truncate">
                    {versionTitle(version)}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}
                    >
                      <i className={meta.icon}></i>
                      {meta.label}
                    </span>
                    {date && <span className="text-[11px] text-foreground-500">{date}</span>}
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-900 bg-primary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        <i className="ri-check-line"></i>
                        Current
                      </span>
                    )}
                    {previewing && !isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-900 bg-accent-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        <i className="ri-eye-line"></i>
                        Previewing — not yet applied
                      </span>
                    )}
                  </div>
                </div>
                {pinned && (
                  <button
                    type="button"
                    onClick={() => onTogglePin(version)}
                    title="Close"
                    aria-label="Close version actions"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer flex-shrink-0"
                  >
                    <i className="ri-close-line"></i>
                  </button>
                )}
              </div>

              <div className="p-4 bg-background-100/50 flex justify-center">
                {largeImage.url ? (
                  <div
                    className="rounded-md border border-background-200 bg-white overflow-hidden"
                    style={{ width: HOVER_W, height: HOVER_H }}
                  >
                    <img
                      src={largeImage.url}
                      alt={`${versionTitle(version)} preview`}
                      decoding="async"
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                ) : preview.markdown ? (
                  <VersionMarkdownPreview
                    markdown={preview.markdown}
                    themeId={style.themeId}
                    accentId={style.accentId}
                    fontId={style.fontId}
                    width={HOVER_W}
                    height={HOVER_H}
                  />
                ) : preview.error || preview.loaded ? (
                  <div
                    className="flex flex-col items-center justify-center gap-1 rounded-md border border-background-200 bg-background-100 text-foreground-400"
                    style={{ width: HOVER_W, height: HOVER_H }}
                  >
                    <i className="ri-file-forbid-line text-xl"></i>
                    <span className="text-xs">No preview available</span>
                  </div>
                ) : (
                  <div
                    className="rounded-md border border-background-200 bg-white overflow-hidden"
                    style={{ width: HOVER_W, height: HOVER_H }}
                  >
                    <div className="h-full w-full p-4 space-y-4 animate-pulse">
                      <div className="h-3 w-2/3 rounded bg-background-200/70"></div>
                      <div className="h-2 w-1/3 rounded bg-background-200/60"></div>
                      <div className="h-2 w-1/2 rounded bg-background-200/50"></div>
                      <div className="mt-5 space-y-2">
                        <div className="h-2 w-full rounded bg-background-200/50"></div>
                        <div className="h-2 w-5/6 rounded bg-background-200/50"></div>
                        <div className="h-2 w-4/6 rounded bg-background-200/50"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {pinned ? (
                <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-background-200">
                  {(!isActive || openMode) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        onClick(version);
                        onTogglePin(version);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-bold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-lg hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ring-1 ring-primary-400/50"
                    >
                      {busy ? (
                        <i className="ri-loader-4-line animate-spin"></i>
                      ) : (
                        <i className={openMode ? "ri-external-link-line" : "ri-check-double-line"}></i>
                      )}
                      {openMode ? "Open this version" : "Select this version"}
                    </button>
                  )}
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      title="Rename this version"
                      aria-label={`Rename ${versionTitle(version)}`}
                      disabled={busy}
                      onClick={() => {
                        if (busy) return;
                        onTogglePin(version);
                        startEdit();
                      }}
                      className={bubbleBtn("hover:text-secondary-700")}
                    >
                      {renaming ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-pencil-line"></i>}
                    </button>
                    {renamed && (
                      <button
                        type="button"
                        title="Clear nickname"
                        aria-label={`Clear nickname for ${versionTitle(version)}`}
                        disabled={busy}
                        onClick={() => {
                          if (busy) return;
                          void onRenameSubmit(version, "");
                        }}
                        className={bubbleBtn("hover:text-accent-700")}
                      >
                        {renaming ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-close-circle-line"></i>}
                      </button>
                    )}
                    <button
                      type="button"
                      title="Read this version full size"
                      aria-label={`Read ${versionTitle(version)} full size`}
                      disabled={busy}
                      onClick={() => {
                        if (busy) return;
                        onTogglePin(version);
                        openFullView();
                      }}
                      className={bubbleBtn("hover:text-primary-700")}
                    >
                      <i className="ri-expand-diagonal-line"></i>
                    </button>
                    {canCompare && (
                      <button
                        type="button"
                        title="Compare with another version"
                        aria-label={`Compare ${versionTitle(version)}`}
                        disabled={busy}
                        onClick={() => {
                          if (busy) return;
                          onTogglePin(version);
                          onCompare(version);
                        }}
                        className={bubbleBtn("hover:text-secondary-700")}
                      >
                        <i className="ri-arrow-left-right-line"></i>
                      </button>
                    )}
                    <button
                      type="button"
                      title="Restore as a copy — branch this version into a new one"
                      aria-label={`Restore ${versionTitle(version)} as a copy`}
                      disabled={busy}
                      onClick={() => {
                        if (busy) return;
                        onTogglePin(version);
                        onRestore(version);
                      }}
                      className={bubbleBtn("hover:text-primary-700")}
                    >
                      <i className="ri-git-branch-line"></i>
                    </button>
                    {hasOwnDesign && onResetDesign && (
                      <button
                        type="button"
                        title="Reset this version to the document's own design"
                        aria-label={`Reset ${versionTitle(version)} to the document's own design`}
                        disabled={busy}
                        onClick={() => {
                          if (busy) return;
                          onResetDesign(version);
                        }}
                        className={bubbleBtn("hover:text-accent-700")}
                      >
                        {reseting ? (
                          <i className="ri-loader-4-line animate-spin"></i>
                        ) : (
                          <i className="ri-restart-line"></i>
                        )}
                      </button>
                    )}
                    {!singleVersion && (
                      <button
                        type="button"
                        title="Delete this version"
                        aria-label="Delete this version"
                        disabled={busy}
                        onClick={() => {
                          if (busy) return;
                          onTogglePin(version);
                          onDelete(version);
                        }}
                        className={bubbleBtn("hover:text-accent-700")}
                      >
                        <i className="ri-close-line"></i>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-2.5 border-t border-background-200 text-[11px] text-foreground-500 flex items-center gap-1.5">
                  <i className="ri-cursor-line"></i>
                  Click the card for actions · double-click to read full size
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {fullOpen && (
        <VersionFullPreview
          kind={kind}
          docId={docId}
          version={version.version}
          title={versionTitle(version)}
          markdown={preview.markdown}
          isLoading={preview.loading}
          style={style}
          previewHtml={fullHtml.html}
          previewHtmlStatus={fullHtml.status}
          sourceLabel={meta.label}
          sourceIcon={meta.icon}
          sourceCls={meta.cls}
          date={date}
          changeSummary={version.change_summary ?? undefined}
          isActive={isActive}
          openMode={openMode}
          busy={busy}
          busyAction={busyAction}
          singleVersion={singleVersion}
          canCompare={canCompare}
          hasPrev={hasFullPrev}
          hasNext={hasFullNext}
          prevLabel={fullPrevLabel}
          nextLabel={fullNextLabel}
          position={fullPosition}
          onPrev={onFullPrev}
          onNext={onFullNext}
          onClose={onCloseFull}
          onSelect={() => {
            onClick(version);
            onCloseFull();
          }}
          onOpenInEditor={
            onOpenInEditor
              ? () => {
                  onCloseFull();
                  onOpenInEditor();
                }
              : undefined
          }
          label={version.label}
          onRenameSubmit={(label) => onRenameSubmit(version, label)}
          onCompare={() => {
            onCloseFull();
            onCompare(version);
          }}
          onRestore={() => {
            onCloseFull();
            onRestore(version);
          }}
          onDelete={() => {
            onCloseFull();
            onDelete(version);
          }}
          canResetDesign={hasOwnDesign}
          onResetDesign={onResetDesign ? () => onResetDesign(version) : undefined}
        />
      )}
    </>
  );
}