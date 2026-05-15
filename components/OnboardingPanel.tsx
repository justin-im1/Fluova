"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "fluova_onboarding_dismissed";

const POINTS: { label: string; desc: string }[] = [
  { label: "Adaptive timing",  desc: "Fluova finds which session length works best for you personally." },
  { label: "Rate honestly",    desc: "Post-session ratings are the main signal. Don't round up." },
  { label: "Sharpens over time", desc: "Recommendations improve meaningfully after 5–10 rated sessions." },
  { label: "Work type matters", desc: "Coding vs. reading may need different durations. Fluova tracks both." },
];

export default function OnboardingPanel({ totalSessions }: { totalSessions: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  if (!visible) return null;

  const isFirstTime = totalSessions === 0;

  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-fg/90">
            {isFirstTime ? "Fluova learns your best way to work." : `${totalSessions} session${totalSessions === 1 ? "" : "s"} in — keep going.`}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted/55">
            {isFirstTime
              ? "Complete a few sessions and rate them honestly. Fluova adapts its recommendations to your rhythm."
              : "Recommendations sharpen with more data. Rate each session honestly so the engine can learn."}
          </p>
        </div>
        <button
          onClick={() => { localStorage.setItem(STORAGE_KEY, "1"); setVisible(false); }}
          className="mt-0.5 flex-shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold text-muted/35 transition-colors hover:bg-edge/20 hover:text-muted/65"
        >
          Got it
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {POINTS.map((p) => (
          <div key={p.label} className="rounded-xl border border-edge/25 bg-surface px-3 py-2.5">
            <p className="text-[11px] font-semibold text-fg/70">{p.label}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted/45">{p.desc}</p>
          </div>
        ))}
      </div>

      {isFirstTime && (
        <div className="mt-4">
          <Link href="/session/new" className="btn-primary inline-block rounded-xl px-5 py-2.5 text-[13px] font-semibold">
            Start first session
          </Link>
        </div>
      )}
    </div>
  );
}
