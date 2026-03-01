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
        <div>
          <button
            type="button"
            onClick={selectRecommended}
            className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${
              focusSec === recommendation.recommended_focus_duration_sec
                ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-800"
                : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
            }`}
          >
            <span className="font-medium">
              Recommended: {recommendation.recommended_focus_duration_sec / 60}{" "}
              min focus / {recommendation.recommended_break_duration_sec / 60}{" "}
              min break
            </span>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {recommendation.rationale}
            </p>
          </button>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Presets
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRESETS.map((preset) => (
            <button
              key={preset.focusSec}
              type="button"
              onClick={() => selectPreset(preset.focusSec)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                focusSec === preset.focusSec
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        Selected: {focusSec / 60} min focus, {breakSec / 60} min break
      </div>
    </div>
  );
}
