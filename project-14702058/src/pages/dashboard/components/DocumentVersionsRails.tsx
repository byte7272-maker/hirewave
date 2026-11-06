import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCoverLetter,
  getResume,
  listCoverLetters,
  listResumes,
  versionEmbeddedText,
  type CoverLetter,
  type DocumentVersion,
  type Resume,
} from "@/lib/documents";
import VersionsStrip from "@/pages/dashboard/documents/components/VersionsStrip";
import WidgetBoundary from "@/components/feature/WidgetBoundary";

/** The timestamp used to rank documents as "most recent". */
function docTime(doc: { created_at?: string; updated_at?: string }): number {
  const iso = doc.updated_at ?? doc.created_at;
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Whether the rail must fetch the full record: true when the list payload has no
 * versions, or has only metadata-only versions (no embedded text to render).
 */
function needsFullDoc(doc: { versions?: DocumentVersion[] }): boolean {
  if (!doc.versions || doc.versions.length === 0) return true;
  return !doc.versions.some((v) => versionEmbeddedText(v));
}

/** The most recently updated non-archived document (falls back to any). */
function pickLatest<T extends { archived?: boolean; created_at?: string; updated_at?: string }>(
  items: T[]
): T | undefined {
  if (!items.length) return undefined;
  const active = items.filter((d) => !d.archived);
  const pool = active.length ? active : items;
  return [...pool].sort((a, b) => docTime(b) - docTime(a))[0];
}

/**
 * The document versions rails — a shared, headline block that resolves the
 * user's primary résumé (most recent, non-archived) AND the most recent cover
 * letter, renders the shared `VersionsStrip` for each, and opens the editor on
 * the clicked version (`?version=N`, which the editor activates). Everything
 * comes from the list/get calls already made — no separate versions request —
 * and a document with no saved versions simply isn't shown. Used on the
 * dashboard home and the Documents page.
 */
export default function DocumentVersionsRails() {
  const navigate = useNavigate();
  const [resume, setResume] = useState<Resume | null>(null);
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [resumes, letters] = await Promise.all([
          listResumes().catch(() => [] as Resume[]),
          listCoverLetters().catch(() => [] as CoverLetter[]),
        ]);
        if (!alive) return;

        const resumePick = pickLatest(
          Array.isArray(resumes) ? resumes : []
        );
        const letterPick = pickLatest(
          Array.isArray(letters) ? letters : []
        );

        // The list already carries versions[]; fetch the single record when the
        // versions are missing OR are metadata-only (no embedded text), so each
        // rail always has real per-version content to render.
        const [fullResume, fullLetter] = await Promise.all([
          resumePick && needsFullDoc(resumePick)
            ? getResume(resumePick.id).catch(() => resumePick)
            : Promise.resolve(resumePick),
          letterPick && needsFullDoc(letterPick)
            ? getCoverLetter(letterPick.id).catch(() => letterPick)
            : Promise.resolve(letterPick),
        ]);

        if (!alive) return;
        setResume(fullResume ?? null);
        setLetter(fullLetter ?? null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const showResume = Boolean(resume && resume.versions && resume.versions.length);
  const showLetter = Boolean(letter && letter.versions && letter.versions.length);

  if (loading || (!showResume && !showLetter)) return null;

  return (
    <section
      className="animate-fade-in-up relative overflow-hidden rounded-2xl border border-background-50/20 bg-gradient-to-br from-foreground-950/70 via-foreground-950/60 to-primary-950/50 backdrop-blur-2xl backdrop-saturate-150 p-5 md:p-6 text-background-50 ring-1 ring-background-50/10"
      aria-label="Document versions"
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
            <span className="w-10 h-10 flex items-center justify-center rounded-xl bg-accent-500 text-foreground-950 flex-shrink-0">
              <i className="ri-stack-line text-lg"></i>
            </span>
            <div>
              <h2 className="font-heading text-lg md:text-xl font-medium text-background-50">
                Document versions
              </h2>
              <p className="text-xs md:text-sm text-background-200">
                Every saved version of your latest documents — hover a card to peek, click for actions.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {showResume && resume && (
            <WidgetBoundary label="Your résumé versions" tone="dark">
              <VersionsStrip
                variant="dark"
                docId={resume.id}
                versions={resume.versions ?? []}
                activeVersion={resume.active_version}
                title="Your résumé · versions"
                onChanged={(updated: Resume) => setResume(updated)}
                onOpenVersion={(version) =>
                  navigate(`/dashboard/documents/resumes/${resume.id}?version=${version}`)
                }
              />
            </WidgetBoundary>
          )}
          {showLetter && letter && (
            <WidgetBoundary label="Your cover letter versions" tone="dark">
              <VersionsStrip
                variant="dark"
                kind="cover-letter"
                docId={letter.id}
                versions={letter.versions ?? []}
                activeVersion={letter.active_version}
                title="Your latest cover letter · versions"
                onChanged={(updated: CoverLetter) => setLetter(updated)}
                onOpenVersion={(version) =>
                  navigate(`/dashboard/documents/cover-letters/${letter.id}?version=${version}`)
                }
              />
            </WidgetBoundary>
          )}
        </div>
      </div>
    </section>
  );
}