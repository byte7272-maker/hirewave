import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchBranding, DEFAULT_BRANDING, type Branding } from "@/lib/branding";

const BrandingContext = createContext<Branding | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    let active = true;
    fetchBranding().then((b) => {
      if (!active) return;
      setBranding(b);
      // Mirror the landing-page <title> so the tab reflects the live brand name
      // (the static index.html title can't read the branding API).
      document.title = `${b.name} — AI Application Assistant & Résumé Tailoring`;
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

/** Branding object, or `null` while the initial fetch is still in flight. */
export function useBranding(): Branding | null {
  return useContext(BrandingContext);
}

/** Company display name, falling back to the codename until branding loads. */
export function useBrandName(): string {
  const branding = useContext(BrandingContext);
  return branding?.name ?? DEFAULT_BRANDING.name;
}

/**
 * Browser-extension display name, derived from the live brand so it flips too —
 * e.g. "Acme Connect". The published store URL slug is unaffected.
 */
export function useExtensionName(): string {
  return `${useBrandName()} Connect`;
}