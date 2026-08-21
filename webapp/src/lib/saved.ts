// Client-side saved jobs (localStorage). Stores the full match view-model so the
// Saved page can render without re-fetching.
import { useCallback, useEffect, useState } from "react";
import type { JobMatchVM } from "./backend";

const KEY = "hw_saved_jobs";

function read(): JobMatchVM[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function write(list: JobMatchVM[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("hw-saved-changed"));
}

export function useSavedJobs() {
  const [saved, setSaved] = useState<JobMatchVM[]>(read);

  useEffect(() => {
    const sync = () => setSaved(read());
    window.addEventListener("hw-saved-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hw-saved-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isSaved = useCallback((id: string) => saved.some((j) => j.id === id), [saved]);
  const toggle = useCallback(
    (job: JobMatchVM) => {
      const list = read();
      const next = list.some((j) => j.id === job.id)
        ? list.filter((j) => j.id !== job.id)
        : [...list, job];
      write(next);
      setSaved(next);
    },
    []
  );
  const remove = useCallback((id: string) => {
    const next = read().filter((j) => j.id !== id);
    write(next);
    setSaved(next);
  }, []);

  return { saved, isSaved, toggle, remove };
}
