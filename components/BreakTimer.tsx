"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  durationSec: number;
  startedAt: Date;
  onDone: () => void;
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
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-muted/40">
        Break
      </p>

      <div
        className={`font-mono text-[80px] font-light tabular-nums leading-none transition-colors duration-700 sm:text-[100px] ${
          breakDone ? "text-emerald-400/80" : "text-secondary/60"
        }`}
      >
        {mm}:{ss}
      </div>

      {/* Progress bar */}
      <div className="h-px w-52 overflow-hidden rounded-full bg-edge/30">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${progressPct}%`,
            background: breakDone
              ? "linear-gradient(90deg, #34D399, #10b981)"
              : "linear-gradient(90deg, var(--color-primary), var(--color-primary-hover))",
            opacity: 0.5,
          }}
        />
      </div>

      <p className="text-[12px] tabular-nums text-muted/30">
        {durationSec / 60} min break
      </p>

      {breakDone ? (
        <div className="flex flex-col items-center space-y-3">
          <p className="text-[13px] text-muted/50">
            Break complete. Ready when you are.
          </p>
          <button
            onClick={onDone}
            className="btn-primary rounded-xl px-6 py-2.5 text-[13px] font-semibold"
          >
            Continue to recap
          </button>
        </div>
      ) : (
        <button
          onClick={handleSkip}
          className="rounded-lg px-5 py-2 text-[13px] font-medium text-muted/35 transition-colors hover:text-muted/70"
        >
          Skip break
        </button>
      )}
    </div>
  );
}
