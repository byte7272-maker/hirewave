import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getResume, resolveResumeTitle, type Resume } from "@/lib/documents";
import ResumeTemplatesPanel from "@/pages/dashboard/documents/templates/ResumeTemplatesPanel";
import DocumentMarqueeButton from "@/pages/dashboard/documents/components/DocumentMarqueeButton";

export default function ResumeTemplates() {
  const { id } = useParams<{ id: string }>();
  const resumeId = id ?? "";
  const [searchParams] = useSearchParams();
  // A role chip on the documents list can carry the role in, pre-selecting the
  // Improve target so you land in Templates aimed at the same role.
  const initialRole = searchParams.get("role") ?? "";
  const initialRoleLabel = searchParams.get("roleLabel");

  // The document is fetched here too so the marquee launcher can offer this
  // document's versions and a rail to switch to another — without leaving the
  // design view. Picking a version bumps `refreshKey`, which reloads the panel.
  const [doc, setDoc] = useState<Resume | null>(null);
  const [refreshKey, setRefreshKey] = useState("");

  useEffect(() => {
    let alive = true;
    getResume(resumeId)
      .then((res) => {
        if (alive) setDoc(res);
      })
      .catch(() => {
        if (alive) setDoc(null);
      });
    return () => {
      alive = false;
    };
  }, [resumeId]);

  const handleMarqueeChange = useCallback((updated: Resume) => {
    setDoc(updated);
    setRefreshKey(String(Date.now()));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          to={`/dashboard/documents/resumes/${resumeId}`}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-background-100 border border-background-200 text-foreground-600 hover:text-foreground-950 cursor-pointer flex-shrink-0"
          aria-label="Back to résumé"
        >
          <i className="ri-arrow-left-line"></i>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl md:text-2xl font-medium text-foreground-950 truncate">
            Templates
          </h1>
          <p className="text-sm text-foreground-600 mt-1 truncate">
            Render this résumé&apos;s structured data into a professional template.
          </p>
        </div>
        {doc && (
          <DocumentMarqueeButton
            kind="resume"
            docId={resumeId}
            title={resolveResumeTitle(doc)}
            versions={doc.versions ?? []}
            activeVersion={doc.active_version}
            onChanged={handleMarqueeChange}
            className="flex-shrink-0"
          />
        )}
      </div>

      <ResumeTemplatesPanel
        resumeId={resumeId}
        refreshKey={refreshKey}
        version={doc?.active_version}
        initialRole={initialRole || undefined}
        initialRoleLabel={initialRoleLabel}
      />
    </div>
  );
}