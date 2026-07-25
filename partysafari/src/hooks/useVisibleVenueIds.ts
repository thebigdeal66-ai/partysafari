"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useVisibleVenueIds() {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementByVenueIdRef = useRef<Map<string, Element>>(new Map());
  const [visibleVenueIds, setVisibleVenueIds] = useState<string[]>([]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisibleVenueIds((current) => {
          const next = new Set(current);

          for (const entry of entries) {
            const venueId = (entry.target as HTMLElement).dataset.venueId;
            if (!venueId) {
              continue;
            }

            if (entry.isIntersecting) {
              next.add(venueId);
            } else {
              next.delete(venueId);
            }
          }

          return Array.from(next);
        });
      },
      {
        root: null,
        rootMargin: "120px",
        threshold: 0.2,
      }
    );

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      elementByVenueIdRef.current.clear();
    };
  }, []);

  const registerVenueNode = useCallback((venueId: string, node: HTMLElement | null) => {
    const observer = observerRef.current;
    const previous = elementByVenueIdRef.current.get(venueId);

    if (observer && previous) {
      observer.unobserve(previous);
      elementByVenueIdRef.current.delete(venueId);
    }

    if (observer && node) {
      node.dataset.venueId = venueId;
      elementByVenueIdRef.current.set(venueId, node);
      observer.observe(node);
    }
  }, []);

  return {
    visibleVenueIds,
    registerVenueNode,
  };
}
