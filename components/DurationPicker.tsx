"use client";

import type { Recommendation } from "@/lib/domain/types";
import { getBreakDurationForFocus } from "@/lib/recommendation/features";

const PRESETS = [
  { label: "25 min", focusSec: 1500 },
  { label: "30 min", focusSec: 1800 },
  { label: "35 min", focusSec: 2100 },
  { label: "40 min", focusSec: 2400 },
  { label: "45 min", focusSec: 2700 },
  { label: "50 min", focusSec: 3000 },
  { label: "55 min", focusSec: 3300 },
];

type Props = {
  recommendation: Recommendation | null;
  focusSec: number;
  breakSec: number;
  onFocusChange: (focusSec: number) => void;
  onBreakChange: (breakSec: number) => void;
};

export default function DurationPicker({
  recommendation,
  focusSec,
  breakSec,
  onFocusChange,
  onBreakChange,
}: Props) {
  function selectRecommended() {
    if (recommendation) {
      onFocusChange(recommendation.recommended_focus_duration_sec);
      onBreakChange(recommendation.recommended_break_duration_sec);
    }
  }

  function selectPreset(presetFocusSec: number) {
    onFocusChange(presetFocusSec);
    onBreakChange(getBreakDurationForFocus(presetFocusSec));
  }

  const isRecommendedSelected =
    recommendation && focusSec === recommendation.recommended_focus_duration_sec;

  return (
    <div className="space-y-4">
      {recommendation && (
        <button
          type="button"
          onClick={selectRecommended}
          className={`w-full rounded-2xl border-2 p-5 text-left transition-all duration-200 ${
            isRecommendedSelected
              ? "border-primary/40 bg-primary/[0.06]"
              : "border-edge/50 hover:border-edge/80"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-semibold text-fg">Recommended</span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
              style={{
                background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))",
                opacity: 0.8,
              }}
            >
              {Math.round(recommendation.estimated_session_score * 100)}% est. score
            </span>
          </div>
          <p className="mt-1.5 text-[13px] tabular-nums text-secondary/70">
            {recommendation.recommended_focus_duration_sec / 60} min focus /{" "}
            {recommendation.recommended_break_duration_sec / 60} min break
          </p>
        </button>
      )}

      <div>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/40">
          Presets
        </p>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.focusSec}
              type="button"
              onClick={() => selectPreset(preset.focusSec)}
              className={`rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                focusSec === preset.focusSec
                  ? "btn-primary border-transparent"
                  : "border-edge/50 text-secondary/70 hover:border-edge/80 hover:text-secondary"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[13px] tabular-nums text-muted/50">
        {focusSec / 60} min focus · {breakSec / 60} min break
      </p>
    </div>
  );
}
