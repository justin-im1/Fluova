"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Props = {
  focusDurationSec: number;
  startedAt: string;
  pausedOffset?: number;
  isPaused?: boolean;
  onComplete?: () => void;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function SessionTimer({
  focusDurationSec,
  startedAt,
  pausedOffset = 0,
  isPaused = false,
  onComplete,
}: Props) {
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const completeFired = useRef(false);
  // Keep a stable ref so the interval never re-creates due to parent re-renders.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    completeFired.current = false;
  }, [focusDurationSec, startedAt]);

  const stableOnComplete = useCallback(() => {
    onCompleteRef.current?.();
  }, []);

  useEffect(() => {
    if (isPaused) return;

    const start = new Date(startedAt).getTime();

    function tick() {
      const now = Date.now();
      const elapsedSec = Math.floor((now - start) / 1000) - pausedOffset;
      const remaining = Math.max(0, focusDurationSec - elapsedSec);
      setRemainingSec(remaining);

      if (remaining <= 0 && !completeFired.current) {
        completeFired.current = true;
        stableOnComplete();
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [focusDurationSec, startedAt, pausedOffset, isPaused, stableOnComplete]);

  if (remainingSec === null) {
    return (
      <div className="text-6xl font-mono font-semibold tabular-nums text-edge sm:text-7xl">
        --:--
      </div>
    );
  }

  const isComplete = remainingSec <= 0;

  return (
    <div
      className={`text-6xl font-mono font-semibold tabular-nums transition-colors duration-300 sm:text-7xl ${
        isComplete ? "text-emerald-400/90" : isPaused ? "text-muted/50" : "text-fg"
      }`}
    >
      {formatTime(remainingSec)}
    </div>
  );
}
