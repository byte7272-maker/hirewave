import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/base/ToastProvider";
import {
  activateResumeVersion,
  getResumeVersion,
  getResumeVersionRender,
  resolveResumeTitle,
  versionContentText,
  versionEmbeddedText,
  type DocumentVersion,
  type Resume,
} from "@/lib/documents";
import { readSkillsLayout } from "@/lib/skillsLayoutMemory";
import { parseResumeMarkdown } from "@/lib/resumeMarkdown";
import VersionMarkdownPreview from "@/pages/dashboard/documents/templates/VersionMarkdownPreview";
import ResumeDesignModal from "@/pages/dashboard/documents/templates/design/ResumeDesignModal";
import { getTheme } from "@/pages/dashboard/documents/templates/themeRegistry";
import { getAccent } from "@/pages/dashboard/documents/templates/accent";
import { getFont } from "@/pages/dashboard/documents/templates/styleFonts";
import { PAPER_WIDTH, PAPER_MIN_HEIGHT } from "@/pages/dashboard/documents/templates/themes/paper";
import ReadablePreviewModal from "@/pages/dashboard/documents/components/ReadablePreviewModal";
import VersionHtmlPreview from "@/pages/dashboard/documents/components/VersionHtmlPreview";
import VersionFullSizeReader from "@/pages/dashboard/documents/components/VersionFullSizeReader";
import useVersionPreviewHtml from "@/pages/dashboard/documents/components/useVersionPreviewHtml";
import { printVersionHtml } from "@/pages/dashboard/documents/components/printVersionHtml";
import { resolveVersionPreviewStyle, type VersionPreviewStyle } from "@/pages/dashboard/documents/components/useVersionPreview";
import { asText, versionTitle } from "@/pages/dashboard/documents/components/versionMeta";
import HighlightsVersionMarquee from "./HighlightsVersionMarquee";

const THUMB_W = 288;
const THUMB_H = Math.round((THUMB_W * PAPER_MIN_HEIGHT) / PAPER_WIDTH);

/**
 * The last line of defense against a permanently spinning viewer. The per-version
 * fetches already time out individually, but if a load still hasn't produced a
 * page after this long (a slow chain of stalled calls), the viewer gives up and
 * offers a retry rather than spinning forever.
 */
const RENDER_WATCHDOG_MS = 32000;

/** Which path painted the current page — the server render, or the version's own text. */
type RenderSource = "server" | "text";

interface HighlightsDocumentViewerProps {
  /** The résumé being improved — its active version is what the viewer shows. */
  resume: Resume;
  /** Called with the freshly-returned résumé after a version is activated. */
  onResumeChange: (updated: Resume) => void;
  /** Open the full editor (optionally on a specific version). */
  onOpenEditor: (version?: string | number) => void;
  /**
   * Called with the style the viewer actually painted the page with — the
   * server-authoritative template resolved for the selected version. The page
   * shares it with the accept/review preview so that surface can never paint a
   * different template than the one shown here.
   */
  onStyleResolved?: (style: VersionPreviewStyle) => void;
  /**
   * A section to spotlight in the preview — set when a review card on the right
   * jumps to its target section. Null clears any existing spotlight.
   */
  spotlight?: { section: string; nonce: number } | null;
  /** Dismiss the current spotlight (the banner's Clear button). */
  onClearSpotlight?: () => void;
}

/**
 * The document viewer for the My Work Highlights workspace.
 *
 * ONE version drives everything. `selectedVersion` (the résumé's active version)
 * is the single source of truth for three surfaces at once:
 *   • the viewer preview — rendered through the version's own template;
 *   • the "Change version" marquee — which marks the same version "Current";
 *   • the full-size lightbox — which reads the very same loaded content.
 * Activating a version returns a fresh résumé from the API, and all three
 * re-derive from that response together — so the version marked Current, the one
 * captioned "Current", and the one on the paper can never drift apart.
 *
 * The loaded content is TAGGED with the version it belongs to, so while a switch
 * is in flight the viewer shows a loading state instead of one version's text
 * under another version's style.
 */
export default function HighlightsDocumentViewer({
  resume,
  onResumeChange,
  onOpenEditor,
  onStyleResolved,
  spotlight,
  onClearSpotlight,
}: HighlightsDocumentViewerProps) {
  const resumeId = resume.id;
  const { showToast } = useToast();
  // ---- The one version that drives all three surfaces ----------------------
  // Sourced from the active version, so every activate/rename/restore response
  // re-syncs the viewer, the marquee and the lightbox at the same moment.
  const selectedVersion = resume.active_version ?? null;
  const versions = resume.versions ?? [];
  const selectedRecord: DocumentVersion | undefined = versions.find(
    (v) => String(v.version) === String(selectedVersion)
  );
  // The caption's base record — a real version when we have one, else a synthetic
  // one carrying just the active number so the title still resolves sensibly.
  const captionRecord: DocumentVersion =
    selectedRecord ?? { version: selectedVersion ?? 1, label: "" };

  // Newest-first, so the version selector in the full-size view reads the same
  // way the marquee does.
  const orderedVersions = useMemo(
    () =>
      [...versions].sort((a, b) => {
        const na = Number(a.version);
        const nb = Number(b.version);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
        return 0;
      }),
    [versions]
  );

  // Every loaded payload is tagged with the version it came from. `ready` is
  // false for the whole window where the selected version has changed but its own
  // content hasn't arrived yet — so no mismatched paint can slip through.
  const versionKey =
    selectedVersion === null || selectedVersion === undefined
      ? ""
      : String(selectedVersion);

  const [loaded, setLoaded] = useState<{
    key: string;
    markdown: string | null;
    source: RenderSource;
  } | null>(null);
  const [error, setError] = useState("");
  const [marqueeOpen, setMarqueeOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [selecting, setSelecting] = useState(false);
  // Bumped when a design is applied to the selected version, so the viewer
  // re-fetches that version's render immediately and repaints with the new look.
  const [designRefresh, setDesignRefresh] = useState(0);
  // The template the SERVER rendered the selected version with — the durable
  // source of its design. Used when no explicit design is saved on this device.
  const [serverTemplate, setServerTemplate] = useState<string | null>(null);

  // This version's OWN design (empty = inherit the résumé's), coerced to a string
  // so a numeric template id from the API can never break a downstream string op.
  const selectedTemplate = asText(selectedRecord?.template_id);

  // Resolve the design EXACTLY the way the marquee's version cards do: the
  // server-authoritative template when the per-version render returns one, else
  // the same built-in default the cards use. We deliberately do NOT fall back to
  // the résumé's own `template_id` — the cards never do, and that extra fallback
  // was exactly why this viewer could paint a DIFFERENT design than the marquee
  // for the same version. Matching the card's resolution keeps them in lockstep.
  const style = resolveVersionPreviewStyle(
    "resume",
    resumeId,
    selectedVersion ?? 1,
    serverTemplate || selectedTemplate
  );

  // The version's rendered HTML PAGE — the SAME server-authoritative surface the
  // main résumé editor's viewer paints. The page carries the version's REAL
  // LAYOUT (sidebar rail, timeline gutter, classic centered header…), which the
  // client markdown renderer cannot reproduce — which is exactly why this viewer
  // used to show a different-looking template than the editor. Painting the same
  // page here makes the two agree, and it also gets the per-section bold / italic
  // injected (via docKey / version below), matching the editor and the Templates
  // tab. The markdown renderer is kept only as a fallback (a preview-mode build,
  // or a version the server can't render).
  const useServerPage = !__IS_PREVIEW__;
  const htmlState = useVersionPreviewHtml(
    "resume",
    resumeId,
    selectedVersion ?? 1,
    useServerPage && Boolean(versionKey),
    `${selectedTemplate}|${designRefresh}`
  );
  const htmlAvailable =
    useServerPage && htmlState.status === "ready" && Boolean(htmlState.html);
  const htmlUnavailable =
    !useServerPage || htmlState.status === "empty" || htmlState.status === "error";

  // The three style dimensions a version is rendered with, named for the caption
  // label beneath "Current" — resolved through the SAME registries the renderer
  // uses, so the label can never name a template the page isn't actually using.
  const themeName = getTheme(style.themeId).name;
  const accentName = getAccent(style.accentId).name;
  const fontName = getFont(style.fontId).name;

  // Publish the resolved style upward (the page shares it with the accept/review
  // preview). Keyed on the three primitives so this fires only when the style
  // genuinely changes — never on every render — so it cannot loop.
  const { themeId: resolvedThemeId, accentId: resolvedAccentId, fontId: resolvedFontId } =
    style;
  const resolvedIsResolved = style.resolved;
  useEffect(() => {
    onStyleResolved?.({
      themeId: resolvedThemeId,
      accentId: resolvedAccentId,
      fontId: resolvedFontId,
      resolved: resolvedIsResolved,
    });
  }, [onStyleResolved, resolvedThemeId, resolvedAccentId, resolvedFontId, resolvedIsResolved]);

  // The selected version's text when its record already carries it — the same
  // preferred source the version thumbnails use, so no request is needed and the
  // render is guaranteed to match the version chosen as Current.
  const embeddedText = versionEmbeddedText(selectedRecord);

  const load = useCallback(async () => {
    setError("");
    // No version selected → there is nothing to render. We NEVER fall back to the
    // document's active body here: a version viewer must show the version.
    if (!versionKey || selectedVersion === null || selectedVersion === undefined) {
      setLoaded({ key: versionKey, markdown: null, source: "text" });
      return;
    }
    try {
      let markdown = "";
      // Which path painted the page, so the viewer can say so plainly.
      let source: RenderSource = "text";
      // Preferred: the server-authoritative per-version render, whose response
      // now carries the version's FULL raw markdown. Painting that directly always
      // shows the résumé — even when the structured data is sparse (a
      // plainly-formatted / docx-extracted document). `template_id` is OMITTED so
      // the SERVER resolves the version's OWN saved template; we adopt it as the
      // durable design source instead of a browser-local guess.
      try {
        const rendered = await getResumeVersionRender(
          resumeId,
          selectedVersion
        );
        if (rendered.template) setServerTemplate(rendered.template);
        if (rendered.markdown && rendered.markdown.trim()) {
          markdown = rendered.markdown;
          source = "server";
        }
      } catch {
        /* fall through to the version's own text below */
      }
      // Fallback: the version's OWN text (embedded, else fetched) — scoped to
      // THIS version, so it can never be the document's active body.
      if (!markdown.trim()) {
        let ownText = embeddedText;
        if (!ownText) {
          const version = await getResumeVersion(resumeId, selectedVersion);
          ownText = versionContentText(version);
        }
        if (ownText.trim()) {
          markdown = ownText;
          source = "text";
        }
      }
      setLoaded({
        key: versionKey,
        markdown: markdown.trim() ? markdown : null,
        source,
      });
    } catch (err) {
      // 401s are refreshed + retried by the API layer; anything that still fails
      // surfaces here as a retryable message.
      setError(err instanceof ApiError ? err.message : "Could not load your résumé.");
    }
  }, [resumeId, versionKey, embeddedText, selectedVersion, selectedTemplate, designRefresh]);

  // Re-render whenever the selected version changes (a switch / rename / restore
  // returns a fresh résumé, and the active version number is our trigger).
  useEffect(() => {
    void load();
  }, [load]);

  // WIPE: the moment the selected version changes, drop the rendered page outright
  // so a switch never leaves the previous version's content sitting on screen while
  // the new one loads — the viewer always clears, then draws the selected version.
  // The stale server template is cleared too, so a version with no render can
  // never inherit the previous version's design.
  useEffect(() => {
    setLoaded(null);
    setServerTemplate(null);
  }, [versionKey, resumeId]);

  const ready = loaded !== null && loaded.key === versionKey;
  const markdown = ready ? loaded.markdown : null;
  // Which path painted the page that's on screen — surfaced as a small indicator.
  const renderSource: RenderSource | null = htmlAvailable
    ? "server"
    : ready
      ? loaded.source
      : null;
  // Which surface paints the preview: the server's rendered page (the editor's
  // own surface), the client markdown fallback, a spinner, or the honest empty
  // state. The server page is preferred; markdown only fills in when it isn't
  // available. With no version selected there is nothing to render at all.
  const mdReady = ready && Boolean(markdown);
  const previewKind: "html" | "md" | "spinner" | "empty" = htmlAvailable
    ? "html"
    : !versionKey
      ? ready
        ? "empty"
        : "spinner"
      : !htmlUnavailable
        ? "spinner"
        : mdReady
          ? "md"
          : ready
            ? "empty"
            : "spinner";
  // The version's content as structured data, so the Design chooser in this
  // viewer can actually render previews of the résumé being re-designed (the
  // viewer only holds the markdown, so it is parsed here — memoized).
  const designData = useMemo(
    () => (markdown ? parseResumeMarkdown(markdown) : null),
    [markdown]
  );

  // WATCHDOG: if a load never produces a page, stop spinning and offer a retry.
  // The version fetches time out on their own; this catches anything else (e.g. a
  // stalled token refresh ahead of the request) so the spinner is never permanent.
  useEffect(() => {
    if (ready || error) return undefined;
    const timer = setTimeout(() => {
      setError(
        "This version is taking too long to render. Your connection may be blocked — try again."
      );
    }, RENDER_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [ready, error, versionKey]);

  /** "Open in full editor" — activate this version (safety), then navigate. */
  async function openInEditor() {
    if (opening) return;
    setOpening(true);
    try {
      if (selectedVersion !== null) await activateResumeVersion(resumeId, selectedVersion);
    } catch {
      /* the editor activates it on arrival too — a failure here is not fatal */
    } finally {
      setOpening(false);
      setLightboxOpen(false);
      onOpenEditor(selectedVersion ?? undefined);
    }
  }

  /**
   * Make another saved version the current one, straight from the full-size
   * readable view. The activate response is adopted wholesale, so the viewer,
   * the marquee and this lightbox all re-sync to the version just picked.
   */
  async function selectVersion(version: string | number) {
    if (selecting) return;
    if (String(version) === String(selectedVersion ?? "")) return;
    setSelecting(true);
    try {
      const updated = await activateResumeVersion(resumeId, version);
      onResumeChange(updated);
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Could not switch to that version.",
        "error"
      );
    } finally {
      setSelecting(false);
    }
  }

  // The primary action, pinned in the lightbox's always-visible header so it can
  // never scroll out of reach while reading the document.
  const openInEditorButton = (
    <button
      type="button"
      onClick={openInEditor}
      disabled={opening}
      title="Open this version in the full résumé editor"
      className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
    >
      {opening ? (
        <i className="ri-loader-4-line animate-spin"></i>
      ) : (
        <i className="ri-external-link-line"></i>
      )}
      <span className="hidden sm:inline">Open in full editor</span>
    </button>
  );

  // The PDF action for the full-size readable view — exports exactly the version
  // on screen by printing the version's own `preview.html` (an iframe's inner
  // document can't be printed from the parent page).
  const downloadPdfButton = (
    <button
      type="button"
      onClick={() => {
        if (htmlState.html) printVersionHtml(htmlState.html, versionTitle(captionRecord));
      }}
      disabled={!htmlAvailable || !htmlState.html}
      title="Save this version as a PDF"
      className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <i className="ri-download-2-line"></i>
      Download PDF
    </button>
  );

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-background-200 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
            <i className="ri-file-text-line text-lg"></i>
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-base font-medium text-foreground-950">
              The document you&rsquo;re improving
            </h2>
            <p className="text-xs text-foreground-500 mt-0.5">
              Your live résumé — showing{" "}
              <span className="font-medium text-foreground-700">{versionTitle(captionRecord)}</span>. Switch
              version or open it full size without leaving this page.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMarqueeOpen(true)}
          disabled={versions.length === 0}
          title={
            versions.length === 0
              ? "This résumé has no saved versions yet"
              : "Pick, rename, or restore a version"
          }
          className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <i className="ri-git-branch-line text-base"></i>
          <span className="flex flex-col items-start leading-tight text-left">
            <span>Change version</span>
            <span className="text-[11px] font-normal opacity-90">
              Now showing {versionTitle(captionRecord)}
            </span>
          </span>
          {versions.length > 1 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-background-50/20 dark:bg-foreground-950/15 text-[11px] font-semibold">
              {versions.length}
            </span>
          )}
        </button>
      </div>

      <div className="p-5">
        {error ? (
          <div className="rounded-lg bg-accent-50 border border-accent-200 border-l-4 border-l-accent-500 px-3.5 py-3 flex items-start gap-3">
            <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
              <i className="ri-error-warning-line"></i>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground-800">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-refresh-line"></i>
                Try again
              </button>
            </div>
          </div>
        ) : previewKind === "spinner" ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-foreground-400">
            <i className="ri-loader-4-line text-2xl animate-spin"></i>
            <span className="text-sm">Rendering this version…</span>
          </div>
        ) : previewKind === "empty" ? (
          <div className="rounded-lg bg-background-50 border border-dashed border-background-200 py-16 text-center">
            <i className="ri-file-forbid-line text-2xl text-foreground-400"></i>
            <p className="mt-2 text-sm text-foreground-600">
              This version has no content yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {spotlight && (
              <div className="w-full rounded-lg bg-accent-100 border border-accent-200 px-3 py-2 flex items-center gap-2">
                <i className="ri-focus-3-line text-accent-700 flex-shrink-0"></i>
                <span className="min-w-0 flex-1 text-xs text-accent-900 truncate">
                  Spotlighting the <span className="font-semibold">{spotlight.section}</span> section
                </span>
                {onClearSpotlight && (
                  <button
                    type="button"
                    onClick={onClearSpotlight}
                    title="Clear the spotlight"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-900 hover:text-accent-700 px-2 py-0.5 rounded-md hover:bg-accent-200/60 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                  >
                    <i className="ri-close-line"></i>
                    Clear
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              title="Click to read this version full size"
              className={`group relative rounded-xl border border-background-200 bg-background-50 p-2 transition-colors hover:border-primary-300 cursor-pointer ${
                spotlight ? "ring-2 ring-accent-400" : ""
              }`}
            >
              {previewKind === "html" ? (
                <div
                  className="pointer-events-none select-none rounded-md border border-background-200 bg-white overflow-hidden"
                  style={{ width: THUMB_W, height: THUMB_H }}
                >
                  <VersionHtmlPreview
                    html={htmlState.html}
                    status={htmlState.status}
                    title={versionTitle(captionRecord)}
                    width={PAPER_WIDTH}
                    docKey={resumeId}
                    version={versionKey}
                    zoom="fit"
                    spotlightSection={spotlight?.section}
                    spotlightNonce={spotlight?.nonce}
                  />
                </div>
              ) : (
                <VersionMarkdownPreview
                  markdown={markdown ?? ""}
                  themeId={style.themeId}
                  accentId={style.accentId}
                  fontId={style.fontId}
                  width={THUMB_W}
                  height={THUMB_H}
                />
              )}
              <span className="absolute inset-0 m-2 rounded-md bg-foreground-950/0 group-hover:bg-foreground-950/10 transition-colors flex items-center justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground-950/70 text-background-50 text-xs font-semibold px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  <i className="ri-expand-diagonal-line"></i>
                  Read full size
                </span>
              </span>
            </button>

            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="text-sm font-semibold text-foreground-900">
                  {versionTitle(captionRecord)}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-900 bg-primary-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                  <i className="ri-check-line"></i>
                  Current
                </span>
                {renderSource && (
                  <span
                    title={
                      renderSource === "server"
                        ? "Painted by the server from this version's own render endpoint"
                        : "Painted from this version's own saved text"
                    }
                    className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                      renderSource === "server"
                        ? "text-secondary-900 bg-secondary-100"
                        : "text-foreground-600 bg-background-100 border border-background-200"
                    }`}
                  >
                    <i
                      className={
                        renderSource === "server" ? "ri-server-line" : "ri-file-text-line"
                      }
                    ></i>
                    {renderSource === "server" ? "Server render" : "Version text"}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDesignOpen(true)}
                title={`Rendered with the ${themeName} template, ${accentName} accent, and ${fontName} typeface — click to change the design`}
                className="group inline-flex items-center gap-1 text-[11px] text-foreground-500 hover:text-primary-700 rounded-md px-1.5 py-0.5 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-palette-line"></i>
                {themeName} · {accentName} · {fontName}
                <i className="ri-edit-line text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"></i>
              </button>
              {versions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setMarqueeOpen(true)}
                  title="Pick a different saved version to show here"
                  className="mt-1 inline-flex items-center gap-2 text-sm font-semibold border border-primary-300 bg-primary-50 text-primary-800 px-3.5 py-2 rounded-md hover:bg-primary-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-git-branch-line"></i>
                  Change version
                  <span className="text-[11px] font-medium text-primary-700">
                    {versions.length} saved
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {marqueeOpen && (
        <HighlightsVersionMarquee
          resumeId={resumeId}
          versions={versions}
          activeVersion={selectedVersion}
          onChanged={(updated) => {
            // Adopt the API response wholesale — the active version it carries is
            // the same value that drives the viewer, the marquee's "Current" mark
            // and the lightbox, so all three re-sync together.
            onResumeChange(updated);
          }}
          onOpenEditor={(version) => {
            // Open the chosen version in the full résumé editor (leave this page).
            setMarqueeOpen(false);
            onOpenEditor(version);
          }}
          onClose={() => setMarqueeOpen(false)}
        />
      )}

      {lightboxOpen && (
        <ReadablePreviewModal
          title={versionTitle(captionRecord)}
          subtitle="Current version · full readable view"
          onClose={() => setLightboxOpen(false)}
          revision={
            htmlAvailable ? (
              <VersionFullSizeReader
                html={htmlState.html}
                status={htmlState.status}
                title={versionTitle(captionRecord)}
                docId={resumeId}
                version={selectedVersion ?? undefined}
                trailing={downloadPdfButton}
              />
            ) : ready && markdown ? (
              <VersionMarkdownPreview
                markdown={markdown}
                themeId={style.themeId}
                accentId={style.accentId}
                fontId={style.fontId}
              />
            ) : error ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-foreground-400">
                <i className="ri-error-warning-line text-2xl"></i>
                <span className="text-sm">{error}</span>
              </div>
            ) : !ready ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-foreground-400">
                <i className="ri-loader-4-line text-2xl animate-spin"></i>
                <span className="text-sm">Rendering this version…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-foreground-400">
                <i className="ri-file-forbid-line text-2xl"></i>
                <span className="text-sm">This version has no content yet</span>
              </div>
            )
          }
          revisionWidth={PAPER_WIDTH}
          fitRevision={!htmlAvailable}
          hideToolbar={htmlAvailable}
          onDownloadPdf={
            htmlAvailable && htmlState.html
              ? () =>
                  printVersionHtml(
                    htmlState.html as string,
                    versionTitle(captionRecord)
                  )
              : undefined
          }
          headerActions={openInEditorButton}
          actions={
            <div className="flex items-center gap-2 flex-wrap w-full">
              {orderedVersions.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-xs font-medium text-foreground-500 whitespace-nowrap">
                    Select version:
                  </span>
                  {orderedVersions.map((v) => {
                    const active = String(v.version) === String(selectedVersion ?? "");
                    return (
                      <button
                        key={String(v.version)}
                        type="button"
                        disabled={active || selecting}
                        onClick={() => void selectVersion(v.version)}
                        title={
                          active
                            ? `${versionTitle(v)} (current)`
                            : `Make ${versionTitle(v)} the current version`
                        }
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full border transition-colors whitespace-nowrap disabled:opacity-60 ${
                          active
                            ? "bg-primary-100 text-primary-900 border-primary-300 cursor-default"
                            : "bg-background-50 text-foreground-700 border-background-200 hover:bg-primary-50 hover:text-primary-800 hover:border-primary-300 cursor-pointer"
                        }`}
                      >
                        {selecting && !active ? (
                          <i className="ri-loader-4-line animate-spin"></i>
                        ) : (
                          <i className={active ? "ri-check-line" : "ri-check-double-line"}></i>
                        )}
                        <span className="max-w-[120px] truncate">{versionTitle(v)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setLightboxOpen(false);
                  setMarqueeOpen(true);
                }}
                className="ml-auto inline-flex items-center justify-center gap-1.5 text-sm font-semibold border border-background-200 bg-background-50 text-foreground-800 px-3.5 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-git-branch-line"></i>
                More version actions
              </button>
            </div>
          }
        />
      )}

      {designOpen && (
        <ResumeDesignModal
          resumeId={String(resumeId)}
          version={selectedVersion ?? undefined}
          title={resolveResumeTitle(resume)}
          data={designData}
          currentTemplateId={selectedTemplate || asText(resume.template_id)}
          skillsLayout={readSkillsLayout(String(resumeId))}
          onClose={() => setDesignOpen(false)}
          onApplied={(updated) => {
            // Adopt the returned résumé, then force this version's render to be
            // re-read so the viewer repaints with the new design at once.
            onResumeChange(updated);
            setDesignRefresh((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}