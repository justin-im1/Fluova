"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    const start = new Date(startedAt).getTime();

    function tick() {
      const now = Date.now();
      const elapsedSec = Math.floor((now - start) / 1000);
      const remaining = Math.max(0, focusDurationSec - elapsedSec);
      setRemainingSec(remaining);

      if (remaining <= 0 && onComplete) {
        onComplete();
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [focusDurationSec, startedAt, onComplete]);

  if (remainingSec === null) {
    return (
      <div className="text-4xl font-mono font-medium text-zinc-500">
        --:--
      </div>
    );
  }

  const isComplete = remainingSec <= 0;

  return (
    <div
      className={`text-6xl font-mono font-medium tabular-nums ${
        isComplete ? "text-green-600 dark:text-green-400" : "text-zinc-900 dark:text-zinc-50"
      }`}
    >
      {formatTime(remainingSec)}
    </div>
  );
}
