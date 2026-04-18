"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  focusDurationSec: number;
  startedAt: string;
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
  onComplete,
}: Props) {
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const completeFired = useRef(false);

  useEffect(() => {
    completeFired.current = false;
  }, [focusDurationSec, startedAt]);

  useEffect(() => {
    const start = new Date(startedAt).getTime();

    function tick() {
      const now = Date.now();
      const elapsedSec = Math.floor((now - start) / 1000);
      const remaining = Math.max(0, focusDurationSec - elapsedSec);
      setRemainingSec(remaining);

      if (remaining <= 0 && onComplete && !completeFired.current) {
        completeFired.current = true;
        onComplete();
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [focusDurationSec, startedAt, onComplete]);

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
        isComplete ? "text-emerald-400/90" : "text-fg"
      }`}
    >
      {formatTime(remainingSec)}
    </div>
  );
}
