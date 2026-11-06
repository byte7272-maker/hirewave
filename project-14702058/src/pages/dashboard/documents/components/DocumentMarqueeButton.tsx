import { useState } from "react";
import type { DocumentVersion } from "@/lib/documents";
import type { VersionedDoc, VersionKind } from "./versionMeta";
import DocumentMarqueeDialog from "./DocumentMarqueeDialog";

interface DocumentMarqueeButtonProps<T extends VersionedDoc = VersionedDoc> {
  /** Which document kind this launcher drives. Defaults to résumé. */
  kind?: VersionKind;
  /** The document currently being viewed. */
  docId: string | number;
  /** The current document's title (context for the overlay header). */
  title: string;
  /** The current document's saved versions. */
  versions: DocumentVersion[];
  /** The active version. */
  activeVersion: string | number | null | undefined;
  /** Called with the freshly-returned document after a version action. */
  onChanged: (updated: T) => void;
  /** A change counter forwarded to the versions rail so thumbnails refetch on edits. */
  revisionKey?: string | number;
  /** Icon-only trigger for dense rows (e.g. the document list). */
  compact?: boolean;
  className?: string;
}

/**
 * The prominent, one-click launcher for the document marquee. Drop it into any
 * surface where a résumé or cover letter is on screen and it opens the marquee
 * overlay — versions of this document on top, a switch rail to your other
 * documents below. Render the full labelled button in toolbars, or the `compact`
 * icon-only variant inside list rows.
 */
export default function DocumentMarqueeButton<T extends VersionedDoc = VersionedDoc>({
  kind = "resume",
  docId,
  title,
  versions,
  activeVersion,
  onChanged,
  revisionKey,
  compact = false,
  className = "",
}: DocumentMarqueeButtonProps<T>) {
  const [open, setOpen] = useState(false);
  const noun = kind === "cover-letter" ? "cover letter" : "résumé";
  const triggerTitle = `Browse versions and switch to another ${noun}`;

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={triggerTitle}
          aria-label={triggerTitle}
          className={`w-8 h-8 flex items-center justify-center rounded-md text-accent-700 hover:bg-accent-100 hover:text-accent-900 cursor-pointer ${className}`}
        >
          <i className="ri-slideshow-line"></i>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={triggerTitle}
          className={`inline-flex items-center gap-2 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3 py-2 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap ${className}`}
        >
          <i className="ri-slideshow-line"></i>
          Browse documents
        </button>
      )}

      {open && (
        <DocumentMarqueeDialog
          kind={kind}
          docId={docId}
          title={title}
          versions={versions}
          activeVersion={activeVersion}
          onChanged={onChanged}
          revisionKey={revisionKey}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}