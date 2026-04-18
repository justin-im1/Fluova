"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Recommended break duration in seconds. */
  durationSec: number;
  /** The moment the break began — used to derive elapsed time. */
  startedAt: Date;
  /**
   * Called when the user clicks "Ready" after the break timer reaches zero.
   * Parent uses this to navigate to recap with outcome=completed.
   */
  onDone: () => void;
  /**
   * Called when the user explicitly skips the break.
   * `elapsedSec` lets the parent classify outcome as skipped vs shortened.
   */
  onSkip: (elapsedSec: number) => void;
};

export default function BreakTimer({ durationSec, startedAt, onDone, onSkip }: Props) {
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    return Math.max(0, durationSec - elapsed);
  });
  const [breakDone, setBreakDone] = useState(remaining === 0);
  const doneFired = useRef(false);

  useEffect(() => {
    if (remaining === 0) return;
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const rem = Math.max(0, durationSec - elapsed);
      setRemaining(rem);
      if (rem === 0 && !doneFired.current) {
        doneFired.current = true;
        setBreakDone(true);
        clearInterval(id);
      }
    }, 500);
    return () => clearInterval(id);
  }, [durationSec, startedAt, remaining]);

  function handleSkip() {
    const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    onSkip(elapsed);
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  const progressPct = durationSec > 0
    ? Math.round(((durationSec - remaining) / durationSec) * 100)
    : 100;

  return (
    <div className="flex flex-col items-center space-y-10 animate-fade-in">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted/50">
        Break
      </p>

      <div
        className={`font-mono text-7xl font-light tracking-tight transition-colors duration-500 ${
          breakDone ? "text-emerald-400" : "text-fg"
        }`}
      >
        {mm}:{ss}
      </div>

      {/* Minimal progress bar */}
      <div className="h-0.5 w-44 overflow-hidden rounded-full bg-surface-elevated">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            breakDone ? "bg-emerald-400" : "bg-primary/50"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <p className="text-[12px] tabular-nums text-muted/30">
        {durationSec / 60} min break recommended
      </p>

      {breakDone ? (
        <div className="flex flex-col items-center space-y-3">
          <p className="text-[13px] text-muted/60">
            Break complete. Ready when you are.
          </p>
          <button
            onClick={onDone}
            className="rounded-lg bg-primary px-6 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-primary-hover"
          >
            Continue to recap
          </button>
        </div>
      ) : (
        <button
          onClick={handleSkip}
          className="rounded-lg px-5 py-2 text-[13px] font-medium text-muted/40 transition-colors hover:text-muted"
        >
          Skip break
        </button>
      )}
    </div>
  );
}
