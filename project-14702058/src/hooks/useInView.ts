import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * One-shot IntersectionObserver: returns a ref to attach to an element and a
 * boolean that flips to `true` (and stays true) once the element has scrolled
 * into view. Used by the Versions marquee so each card's preview thumbnail only
 * fetches + renders as it enters the viewport — a long strip never renders every
 * résumé up front.
 */
export default function useInView<T extends HTMLElement = HTMLDivElement>(
  rootMargin = "160px"
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}