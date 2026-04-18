"use client";

import type { Recommendation } from "@/lib/domain/types";

const PRESETS = [
  { label: "25 min", focusSec: 1500 },
  { label: "30 min", focusSec: 1800 },
  { label: "35 min", focusSec: 2100 },
  { label: "40 min", focusSec: 2400 },
  { label: "45 min", focusSec: 2700 },
  { label: "50 min", focusSec: 3000 },
];

function getBreakForFocus(focusSec: number): number {
  if (focusSec <= 1800) return 300;
  if (focusSec <= 2700) return 480;
  return 600;
}

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
    onBreakChange(getBreakForFocus(presetFocusSec));
  }

  return (
    <div className="space-y-4">
      {recommendation && (
        <button
          type="button"
          onClick={selectRecommended}
          className={`w-full rounded-xl border-2 p-4 text-left transition-colors ${
            focusSec === recommendation.recommended_focus_duration_sec
              ? "border-primary bg-primary/10"
              : "border-edge hover:border-muted/30"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-fg">
              Recommended
            </span>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
              {Math.round(recommendation.estimated_session_score * 100)}% est. score
            </span>
          </div>
          <p className="mt-1 text-[13px] tabular-nums text-secondary">
            {recommendation.recommended_focus_duration_sec / 60} min focus /{" "}
            {recommendation.recommended_break_duration_sec / 60} min break
          </p>
        </button>
      )}

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
          Presets
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.focusSec}
              type="button"
              onClick={() => selectPreset(preset.focusSec)}
              className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors ${
                focusSec === preset.focusSec
                  ? "border-primary bg-primary text-white"
                  : "border-edge text-secondary hover:border-muted/30"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[13px] tabular-nums text-muted">
        {focusSec / 60} min focus · {breakSec / 60} min break
      </p>
    </div>
  );
}
