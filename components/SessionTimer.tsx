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
      <div className="font-mono text-[80px] font-light tabular-nums leading-none text-edge sm:text-[100px]">
        --:--
      </div>
    );
  }

  const isComplete = remainingSec <= 0;

  return (
    <div
      className={`font-mono text-[80px] font-light tabular-nums leading-none transition-colors duration-500 sm:text-[100px] ${
        isComplete
          ? "text-emerald-400/90"
          : isPaused
          ? "text-muted/40"
          : "text-fg"
      }`}
    >
      {formatTime(remainingSec)}
    </div>
  );
}
