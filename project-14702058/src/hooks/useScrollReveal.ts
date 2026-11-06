import { useEffect, useRef, useState } from 'react';

interface UseScrollRevealOptions {
  /** How much of the element must be in view before revealing. */
  threshold?: number;
  /** Shrinks the viewport so elements reveal a touch before the very edge. */
  rootMargin?: string;
  /** Reveal only the first time the element scrolls into view. */
  once?: boolean;
}

/**
 * Reveals an element the first time it scrolls into view.
 * Returns a ref to attach to the element and a `visible` flag to drive the
 * fade/slide. Falls back to "always visible" when the visitor prefers reduced
 * motion or the browser lacks IntersectionObserver, so content is never hidden.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseScrollRevealOptions = {},
) {
  const { threshold = 0.15, rootMargin = '0px 0px -10% 0px', once = true } = options;
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        });
      },
      { threshold, rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, visible };
}

export default useScrollReveal;