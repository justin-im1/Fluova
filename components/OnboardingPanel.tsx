"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "fluova_onboarding_dismissed";

const POINTS: { label: string; desc: string }[] = [
  {
    label: "Adaptive timing",
    desc: "Fluova finds which session length works best for you personally.",
  },
  {
    label: "Rate honestly",
    desc: "Your post-session ratings are the main signal. Don't round up.",
  },
  {
    label: "Sharpens over time",
    desc: "Recommendations improve meaningfully after 5–10 rated sessions.",
  },
  {
    label: "Work type matters",
    desc: "Coding vs. reading may need different durations. Fluova tracks both.",
  },
];

interface Props {
  totalSessions: number;
}

export default function OnboardingPanel({ totalSessions }: Props) {
  // Start hidden to avoid hydration mismatch, reveal once localStorage is read
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const isFirstTime = totalSessions === 0;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] px-6 py-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold text-fg">
            {isFirstTime
              ? "Fluova learns your best way to work."
              : `${totalSessions} session${totalSessions === 1 ? "" : "s"} in — keep going.`}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted/60">
            {isFirstTime
              ? "Complete a few sessions and rate them honestly. Fluova adapts its recommendations to your rhythm over time."
              : "Recommendations sharpen with more data. Rate each session honestly so the engine can learn from it."}
          </p>
        </div>
        <button
          onClick={dismiss}
          className="mt-0.5 shrink-0 rounded px-2 py-0.5 text-[10px] font-medium text-muted/35 transition-colors hover:bg-edge/20 hover:text-muted/70"
          aria-label="Dismiss onboarding panel"
        >
          Got it
        </button>
      </div>

      {/* Four pillars */}
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {POINTS.map((p) => (
          <li
            key={p.label}
            className="rounded-xl border border-edge/30 bg-surface px-3.5 py-3"
          >
            <p className="text-[11px] font-semibold text-fg/80">{p.label}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted/50">{p.desc}</p>
          </li>
        ))}
      </ul>

      {/* Primary CTA — only for zero-session users (others already know to start) */}
      {isFirstTime && (
        <div className="mt-4">
          <Link
            href="/session/new"
            className="inline-block rounded-lg bg-primary px-5 py-2.5 text-[13px] font-medium text-white transition-all duration-150 hover:bg-primary-hover"
          >
            Start first session
          </Link>
        </div>
      )}
    </div>
  );
}
