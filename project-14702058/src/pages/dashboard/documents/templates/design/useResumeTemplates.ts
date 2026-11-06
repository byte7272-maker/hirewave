import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  listResumeTemplateCategories,
  listResumeTemplates,
  type ResumeTemplate,
} from "@/lib/documents";

/** Derive the category chips straight from the catalog when the API omits them. */
function deriveCategories(list: ResumeTemplate[]): string[] {
  const out: string[] = [];
  for (const t of list) if (!out.includes(t.category)) out.push(t.category);
  return out;
}

/**
 * Fetch the template catalog + its categories ONCE, then render every thumbnail
 * from that single payload. Nothing here re-fetches per template.
 */
export default function useResumeTemplates() {
  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listResumeTemplates();
      const cats = await listResumeTemplateCategories().catch(() => [] as string[]);
      setTemplates(list);
      setCategories(cats.length ? cats : deriveCategories(list));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load the template catalog."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Add a freshly generated template to the in-memory catalog (no refetch). */
  const append = useCallback((template: ResumeTemplate) => {
    setTemplates((prev) => [...prev.filter((t) => t.id !== template.id), template]);
    setCategories((prev) =>
      prev.includes(template.category) ? prev : [...prev, template.category]
    );
  }, []);

  return { templates, categories, loading, error, reload: load, append };
}