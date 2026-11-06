import { useEffect, useState, type ReactNode } from "react";
import type { AccentColor } from "@/pages/dashboard/documents/templates/accent";
import type { DocFont } from "@/pages/dashboard/documents/templates/styleFonts";
import DesignThumbnail from "./DesignThumbnail";
import DesignPreviewPaper from "./DesignPreviewPaper";
import { Badge, Button, Card } from "@/components/base";

/**
 * One design in the chooser. `render` returns the FULL-SIZE A4 paper for the
 * user's OWN document in that design — the shell only scales it, so every card
 * and the large preview reuse the document data that's already loaded (no
 * per-design requests). It takes the accent + font stack to paint with, so the
 * large preview can reflect a fine-tuned look before anything is applied.
 */
export interface DesignCard {
  id: string;
  name: string;
  description?: string;
  /** Layout family, used to group/filter the chooser. */
  category: string;
  /** The template's own default accent — shown as the card's swatch. */
  accent: AccentColor;
  /** Short typeface label shown on the card, e.g. "Serif". */
  fontLabel: string;
  /** Full typeface name shown in the focused preview, e.g. "Georgia". */
  fontName: string;
  /** The template's own default font stack. */
  fontStack?: string;
  /** Render the paper with the given accent + font stack. */
  render: (accent: AccentColor, fontStack?: string) => ReactNode;
}

/**
 * How a tuned look deviates from the focused template's own signature — the
 * accent and/or typeface the user changed. Empty fields mean "unchanged", so
 * the preview header only flags a genuine customization.
 */
export interface DesignCustomization {
  accentFrom?: string;
  accentTo?: string;
  fontFrom?: string;
  fontTo?: string;
}

interface DesignChooserDialogProps {
  /** The document's display title, shown in the header. */
  title: string;
  /** Singular noun for the header/loading copy, e.g. "résumé" or "cover letter". */
  noun: string;
  cards: DesignCard[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  /** The design persisted on the document — gets the "Current" badge. */
  currentId?: string;
  /** The focused (previewed) design id — controlled by the caller. */
  focusedId: string;
  onFocus: (id: string) => void;
  category: string;
  categories: string[];
  onCategory: (category: string) => void;
  /** False while the document data isn't ready — previews show a skeleton. */
  previewReady: boolean;
  applying: boolean;
  onApply: () => void;
  /** Whether the current selection differs from what's applied (enables Apply). */
  hasChanges?: boolean;
  /** Accent choices — when provided, an accent picker appears under the preview. */
  accents?: AccentColor[];
  accentId?: string;
  onAccent?: (id: string) => void;
  /** Typeface choices — when provided, a typeface picker appears under the preview. */
  fonts?: DocFont[];
  fontId?: string;
  onFont?: (id: string) => void;
  /** How the accent/typeface deviate from the focused template's signature. */
  customization?: DesignCustomization;
  /** Reset the accent/typeface back to the focused template's own defaults. */
  onResetStyle?: () => void;
  /** Save the current tuned look (layout + accent + typeface) to the style library. */
  onSaveLook?: () => void;
  /** Extra controls beside the style pickers (e.g. "Match my résumé's style"). */
  styleActions?: ReactNode;
  /** Extra controls kept behind an "Advanced" disclosure (optional). */
  advanced?: ReactNode;
  onClose: () => void;
}

/**
 * The shared in-context Design chooser. It renders a gallery of the user's own
 * document in every design (lazy thumbnails), a large live preview of the
 * focused design, accent + typeface controls to fine-tune the look before
 * applying, and a single explicit "Use this template" apply. Focusing a card is
 * non-destructive — it only re-renders client-side. The résumé and cover-letter
 * editors both mount this, so the experience is identical.
 */
export default function DesignChooserDialog({
  title,
  noun,
  cards,
  loading = false,
  error = "",
  onRetry,
  currentId,
  focusedId,
  onFocus,
  category,
  categories,
  onCategory,
  previewReady,
  applying,
  onApply,
  hasChanges,
  accents,
  accentId,
  onAccent,
  fonts,
  fontId,
  onFont,
  customization,
  onResetStyle,
  onSaveLook,
  styleActions,
  advanced,
  onClose,
}: DesignChooserDialogProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Close on Escape so the dialog behaves like every other overlay.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // A remembered category that no longer exists (e.g. a removed template) falls
  // back to "All" so the gallery is never accidentally empty.
  const activeCategory =
    category !== "All" && categories.includes(category) ? category : "All";
  const visible =
    activeCategory === "All" ? cards : cards.filter((c) => c.category === activeCategory);
  const focused = cards.find((c) => c.id === focusedId) ?? cards[0];
  const isCurrent = focused ? focused.id === currentId : false;

  const showAccents = Boolean(accents && accents.length && onAccent);
  const showFonts = Boolean(fonts && fonts.length && onFont);
  const showStyleControls = showAccents || showFonts || Boolean(styleActions);

  const selectedAccent =
    (showAccents ? accents!.find((a) => a.id === accentId) : undefined) ?? focused?.accent;
  const selectedFont = showFonts ? fonts!.find((f) => f.id === fontId) : undefined;
  const previewFontStack = selectedFont?.stack ?? focused?.fontStack;
  const canApply = hasChanges ?? (focused ? focused.id !== currentId : false);

  // How the tuned look deviates from the focused template's own signature.
  const deltaParts: string[] = [];
  if (customization?.accentTo) {
    deltaParts.push(`Accent ${customization.accentFrom} → ${customization.accentTo}`);
  }
  if (customization?.fontTo) {
    deltaParts.push(`Typeface ${customization.fontFrom} → ${customization.fontTo}`);
  }
  const styleCustomized = deltaParts.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="absolute inset-0 bg-foreground-950/50 dark:bg-black/60" onClick={onClose}></div>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a ${noun} design`}
        className="relative w-full max-w-6xl bg-background-50 rounded-2xl border border-background-200 flex flex-col max-h-[92vh] overflow-hidden animate-fade-in-up"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-medium text-foreground-950 flex items-center gap-2">
              <i className="ri-palette-line text-primary-600"></i>
              Design
            </h3>
            <p className="text-xs text-foreground-500 mt-0.5 truncate">
              Pick a look for “{title}” — tune the accent and typeface too, and nothing saves until you apply.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-950 cursor-pointer flex-shrink-0"
            aria-label="Close"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {loading ? (
            <div className="py-20 text-sm text-foreground-500 flex items-center justify-center gap-2">
              <i className="ri-loader-4-line animate-spin"></i>
              Loading designs…
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-2xl bg-accent-100 text-accent-700">
                <i className="ri-error-warning-line text-2xl"></i>
              </div>
              <p className="mt-4 text-sm font-medium text-foreground-900">
                Couldn&apos;t load the designs
              </p>
              <p className="mt-1 text-xs text-foreground-500 max-w-sm mx-auto">{error}</p>
              {onRetry && (
                <Button icon="ri-refresh-line" className="mt-4" onClick={onRetry}>
                  Try again
                </Button>
              )}
            </div>
          ) : cards.length === 0 ? (
            <div className="py-16 text-center text-sm text-foreground-500">
              No designs are available yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* LEFT — gallery */}
              <div className="min-w-0 space-y-4">
                {categories.length > 1 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {["All", ...categories].map((c) => {
                      const on = c === activeCategory;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => onCategory(c)}
                          aria-pressed={on}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                            on
                              ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                              : "bg-background-100 text-foreground-600 hover:bg-background-200"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {visible.map((card) => {
                    const selected = card.id === focusedId;
                    const current = card.id === currentId;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => onFocus(card.id)}
                        aria-pressed={selected}
                        title={card.description}
                        className={`group text-left rounded-xl border overflow-hidden transition-colors cursor-pointer ${
                          selected
                            ? "border-primary-400 ring-1 ring-primary-300"
                            : "border-background-200 hover:border-background-300"
                        }`}
                      >
                        <span className="relative block">
                          {previewReady ? (
                            // Each card shows that template's own signature look.
                            <DesignThumbnail
                              render={() => card.render(card.accent, card.fontStack)}
                              fontStack={card.fontStack}
                            />
                          ) : (
                            <span className="block aspect-[794/1123] w-full bg-background-100 animate-pulse" />
                          )}
                          {current && (
                            <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-900 bg-primary-100 px-1.5 py-0.5 rounded">
                              <i className="ri-check-line"></i>
                              Current
                            </span>
                          )}
                          {selected && !current && (
                            <span className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-primary-500 text-background-50">
                              <i className="ri-check-line text-[10px]"></i>
                            </span>
                          )}
                        </span>
                        <span className="block px-2.5 py-2 bg-background-50">
                          <span className="flex items-center justify-between gap-1.5">
                            <span className="text-xs font-semibold text-foreground-950 truncate">
                              {card.name}
                            </span>
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                              style={{ background: card.accent.value }}
                              aria-hidden="true"
                            ></span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-foreground-400 truncate">
                            <span className="truncate">{card.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="whitespace-nowrap">{card.fontLabel}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Advanced — kept out of the way so the default view stays clean */}
                {advanced && (
                  <div className="pt-3 border-t border-background-200">
                    <button
                      type="button"
                      onClick={() => setAdvancedOpen((v) => !v)}
                      aria-expanded={advancedOpen}
                      className="w-full flex items-center justify-between gap-2 text-xs font-semibold text-foreground-600 hover:text-foreground-900 cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <i className="ri-equalizer-line"></i>
                        Advanced
                      </span>
                      <i
                        className={`ri-arrow-down-s-line transition-transform ${
                          advancedOpen ? "rotate-180" : ""
                        }`}
                      ></i>
                    </button>
                    {advancedOpen && <div className="mt-3 space-y-3">{advanced}</div>}
                  </div>
                )}
              </div>

              {/* RIGHT — large live preview of the focused design */}
              <div className="min-w-0 lg:sticky lg:top-0">
                <Card className="overflow-hidden">
                  <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <Badge tone="foreground" variant="soft" icon="ri-layout-line">
                        {focused?.name ?? "—"}
                      </Badge>
                      {selectedAccent && (
                        <Badge tone="foreground" variant="soft">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: selectedAccent.value }}
                          ></span>
                          {selectedAccent.name}
                        </Badge>
                      )}
                      <Badge tone="foreground" variant="soft" icon="ri-font-size">
                        {selectedFont?.name ?? focused?.fontName ?? "—"}
                      </Badge>
                      {styleCustomized && (
                        <>
                          <Badge tone="accent" icon="ri-magic-line">
                            Customized
                          </Badge>
                          <span className="text-[11px] text-foreground-400">{deltaParts.join(" · ")}</span>
                        </>
                      )}
                    </div>
                    {isCurrent && (
                      <Badge tone="primary" icon="ri-check-line">
                        Current
                      </Badge>
                    )}
                  </div>

                  <div className="p-3 md:p-4 space-y-3">
                    {previewReady && focused ? (
                      <div className="rounded-xl border border-background-200 overflow-hidden">
                        <DesignPreviewPaper
                          render={() => focused.render(selectedAccent ?? focused.accent, previewFontStack)}
                          fontStack={previewFontStack}
                          frameHeight={460}
                        />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-background-200 bg-background-100/50 h-[460px] flex items-center justify-center text-sm text-foreground-500 gap-2">
                        <i className="ri-loader-4-line animate-spin"></i>
                        Loading your {noun}…
                      </div>
                    )}

                    {/* Fine-tune the look before applying */}
                    {showStyleControls && (
                      <div className="rounded-xl border border-background-200 bg-background-100/60 p-3 space-y-3">
                        {showAccents && (
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-700">
                                <i className="ri-palette-line"></i>
                                Accent
                              </span>
                              <span className="text-xs text-foreground-400">
                                {selectedAccent?.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {accents!.map((a) => {
                                const on = a.id === accentId;
                                return (
                                  <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => onAccent!(a.id)}
                                    title={a.name}
                                    aria-label={`${a.name} accent`}
                                    aria-pressed={on}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                                      on
                                        ? "ring-2 ring-offset-2 ring-foreground-400 scale-105"
                                        : "hover:scale-105"
                                    }`}
                                    style={{ background: a.value }}
                                  >
                                    {on && <i className="ri-check-line text-white text-xs"></i>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {showFonts && (
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-700">
                                <i className="ri-font-size-2"></i>
                                Typeface
                              </span>
                              <span className="text-xs text-foreground-400">
                                {selectedFont?.name ?? "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {fonts!.map((f) => {
                                const on = f.id === fontId;
                                return (
                                  <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => onFont!(f.id)}
                                    title={f.description}
                                    aria-pressed={on}
                                    className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors cursor-pointer whitespace-nowrap ${
                                      on
                                        ? "border-primary-400 bg-primary-100/50 text-primary-900 font-semibold"
                                        : "border-background-200 text-foreground-600 hover:bg-background-100"
                                    }`}
                                    style={{ fontFamily: f.stack }}
                                  >
                                    {f.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {styleActions}

                        {(onSaveLook || (onResetStyle && styleCustomized)) && (
                          <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-background-200">
                            {onSaveLook ? (
                              <Button
                                variant="outline"
                                size="sm"
                                icon="ri-bookmark-3-line"
                                onClick={onSaveLook}
                              >
                                Save this tuned look
                              </Button>
                            ) : (
                              <span />
                            )}
                            {onResetStyle && styleCustomized && (
                              <button
                                type="button"
                                onClick={onResetStyle}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-500 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
                              >
                                <i className="ri-restart-line"></i>
                                Reset to {focused?.name ?? "template"} defaults
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <Button
                      variant={canApply ? "solid" : "subtle"}
                      fullWidth
                      icon={canApply ? "ri-check-double-line" : "ri-check-line"}
                      loading={applying}
                      disabled={applying || !focused || !canApply}
                      onClick={onApply}
                    >
                      {applying
                        ? "Applying…"
                        : canApply
                          ? "Use this template"
                          : "Current design"}
                    </Button>
                    <p className="text-[11px] text-foreground-400 flex items-center gap-1.5">
                      <i className="ri-information-line"></i>
                      Previews are instant and non-destructive — exports follow the applied design.
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}