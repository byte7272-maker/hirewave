import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GlossaryEntry } from "@/lib/glossary";
import GlossaryDrawer from "./GlossaryDrawer";

interface GlossaryContextValue {
  /** Open the "Learn more" drawer for a glossary term. */
  openTerm: (entry: GlossaryEntry) => void;
}

const GlossaryContext = createContext<GlossaryContextValue | null>(null);

/**
 * Holds the single glossary drawer for the whole app, so any term link
 * (review advice, tailor panels, improve chips, …) can open it via `useGlossary`.
 */
export function GlossaryProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<GlossaryEntry | null>(null);

  const openTerm = useCallback((next: GlossaryEntry) => setEntry(next), []);
  const close = useCallback(() => setEntry(null), []);

  const value = useMemo(() => ({ openTerm }), [openTerm]);

  return (
    <GlossaryContext.Provider value={value}>
      {children}
      <GlossaryDrawer entry={entry} onClose={close} />
    </GlossaryContext.Provider>
  );
}

export function useGlossary(): GlossaryContextValue {
  const ctx = useContext(GlossaryContext);
  if (!ctx) {
    return { openTerm: () => {} };
  }
  return ctx;
}