import { type ReactNode, useEffect, useRef, useState } from 'react';

interface LazySectionProps {
  children: ReactNode;
  fallback?: ReactNode;
  /** Start loading slightly before the section enters the viewport */
  rootMargin?: string;
}

export function LazySection({ children, fallback = null, rootMargin = '200px 0px' }: LazySectionProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (active) return;

    const el = hostRef.current;
    if (!el) return;

    // If IntersectionObserver isn't available, just render immediately
    if (typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        obs.disconnect();
        setActive(true);
      },
      { root: null, rootMargin, threshold: 0.01 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [active, rootMargin]);

  return <div ref={hostRef}>{active ? children : fallback}</div>;
}
