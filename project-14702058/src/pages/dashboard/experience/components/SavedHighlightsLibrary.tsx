import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { listExperience, type Experience } from "@/lib/experience";
import HighlightCard from "@/pages/dashboard/experience/components/HighlightCard";
import AddHighlightModal from "@/pages/dashboard/experience/components/AddHighlightModal";
import UploadHighlightModal from "@/pages/dashboard/experience/components/UploadHighlightModal";
import EditHighlightModal from "@/pages/dashboard/experience/components/EditHighlightModal";
import HighlightsWizard from "@/pages/dashboard/onboarding/components/HighlightsWizard";

/**
 * The persistent library of saved work highlights — the narrative material that
 * feeds Interview Prep. Kept as a self-contained section so the workspace page
 * can focus on the live document + the three import zones above, while this
 * remain the place highlights live once they're saved.
 */
export default function SavedHighlightsLibrary() {
  const [items, setItems] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<Experience | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const list = await listExperience();
      setItems(list ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your highlights.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary-100 text-primary-700 flex-shrink-0">
            <i className="ri-award-line text-xl"></i>
          </span>
          <div>
            <h2 className="font-heading text-xl font-medium text-foreground-950">
              Saved highlights
            </h2>
            <p className="text-sm text-foreground-600 mt-0.5">
              Narrative material that goes beyond your résumé bullets — and sharpens your
              interview answers.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-secondary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-upload-2-line"></i>
            Upload file
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Add highlight
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{error}</div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-sm text-foreground-500 flex items-center justify-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading your highlights…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-12 text-center">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl bg-background-200 text-foreground-500 mb-3">
            <i className="ri-award-line text-xl"></i>
          </div>
          <p className="text-sm font-medium text-foreground-900">No saved highlights yet.</p>
          <p className="text-xs text-foreground-500 mt-1 max-w-sm mx-auto">
            Add your first accomplishment, STAR story, or project write-up — it&rsquo;ll make your
            interview answers sharper.
          </p>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="mt-4 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Add your first highlight
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <HighlightCard
              key={item.id}
              item={item}
              onEdit={setEditing}
              onDeleted={(id) => setItems((prev) => prev.filter((it) => it.id !== id))}
            />
          ))}
        </div>
      )}

      {addOpen && (
        <AddHighlightModal
          onClose={() => setAddOpen(false)}
          onCreated={(item) => setItems((prev) => [item, ...prev])}
        />
      )}
      {uploadOpen && (
        <UploadHighlightModal
          onClose={() => setUploadOpen(false)}
          onCreated={(item) => setItems((prev) => [item, ...prev])}
        />
      )}
      {editing && (
        <EditHighlightModal
          item={editing}
          onClose={() => setEditing(null)}
          onUpdated={(updated) =>
            setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
          }
        />
      )}
      {wizardOpen && (
        <HighlightsWizard
          onComplete={() => {
            setWizardOpen(false);
            load();
          }}
          onSkip={() => setWizardOpen(false)}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </section>
  );
}