import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getCoverLetter, type CoverLetter } from "@/lib/documents";
import CoverLetterTemplatesPanel from "@/pages/dashboard/documents/templates/CoverLetterTemplatesPanel";
import DocumentMarqueeButton from "@/pages/dashboard/documents/components/DocumentMarqueeButton";

/** A cover letter's display title, matching the marquee's own card labelling. */
function letterTitle(letter: CoverLetter): string {
  return (
    letter.original_filename ||
    (letter.source === "uploaded" ? `Cover letter ${letter.id}` : "Generated cover letter")
  );
}

export default function CoverLetterTemplates() {
  const { id } = useParams<{ id: string }>();
  const letterId = id ?? "";
  const [searchParams] = useSearchParams();
  // A role chip on the documents list can carry the role in, pre-selecting the
  // Improve target so you land in Templates aimed at the same role.
  const initialRole = searchParams.get("role") ?? "";
  const initialRoleLabel = searchParams.get("roleLabel");

  // The letter is fetched here too so the marquee launcher can offer this
  // letter's versions and a rail to switch to another — without leaving the
  // design view. Picking a version bumps `refreshKey`, which reloads the panel.
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [refreshKey, setRefreshKey] = useState("");

  useEffect(() => {
    let alive = true;
    getCoverLetter(letterId)
      .then((res) => {
        if (alive) setLetter(res);
      })
      .catch(() => {
        if (alive) setLetter(null);
      });
    return () => {
      alive = false;
    };
  }, [letterId]);

  const handleMarqueeChange = useCallback((updated: CoverLetter) => {
    setLetter(updated);
    setRefreshKey(String(Date.now()));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          to={`/dashboard/documents/cover-letters/${letterId}`}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-background-100 border border-background-200 text-foreground-600 hover:text-foreground-950 cursor-pointer flex-shrink-0"
          aria-label="Back to cover letter"
        >
          <i className="ri-arrow-left-line"></i>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl md:text-2xl font-medium text-foreground-950 truncate">
            Templates
          </h1>
          <p className="text-sm text-foreground-600 mt-1 truncate">
            Render this cover letter into a matching professional layout.
          </p>
        </div>
        {letter && (
          <DocumentMarqueeButton
            kind="cover-letter"
            docId={letterId}
            title={letterTitle(letter)}
            versions={letter.versions ?? []}
            activeVersion={letter.active_version}
            onChanged={handleMarqueeChange}
            className="flex-shrink-0"
          />
        )}
      </div>

      <CoverLetterTemplatesPanel
        letterId={letterId}
        refreshKey={refreshKey}
        version={letter?.active_version}
        initialRole={initialRole || undefined}
        initialRoleLabel={initialRoleLabel}
      />
    </div>
  );
}