"use client";

import { useEffect, useRef, useState } from "react";

const SNAPSHOT_INTERVAL = 300_000;
const DISPLAY_INTERVAL = 5_000;

export function useCommunityCount(category: string, fallback: number, modelId?: string) {
  const [count, setCount] = useState(fallback);
  const [spinKey, setSpinKey] = useState(0);
  const displayedCount = useRef(fallback);

  useEffect(() => {
    let active = true;
    let animation = { from: fallback, to: fallback, startedAt: Date.now() };
    const query = new URLSearchParams({ category });
    if (modelId) query.set("modelId", modelId);

    async function refresh() {
      try {
        const response = await fetch(`/api/community-stats?${query}`);
        if (!response.ok) return;
        const data = await response.json() as { people?: number };
        if (active && typeof data.people === "number") {
          animation = { from: displayedCount.current, to: data.people, startedAt: Date.now() };
        }
      } catch {
        // Retain the most recent snapshot while the live count is unavailable.
      }
    }

    setCount(fallback);
    displayedCount.current = fallback;
    void refresh();
    const snapshotTimer = window.setInterval(refresh, SNAPSHOT_INTERVAL);
    const displayTimer = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - animation.startedAt) / SNAPSHOT_INTERVAL);
      const next = animation.from + Math.trunc((animation.to - animation.from) * progress);
      if (next !== displayedCount.current) {
        displayedCount.current = next;
        setCount(next);
      }
      setSpinKey((current) => current + 1);
    }, DISPLAY_INTERVAL);

    return () => {
      active = false;
      window.clearInterval(snapshotTimer);
      window.clearInterval(displayTimer);
    };
  }, [category, fallback, modelId]);

  return { count, spinKey };
}
