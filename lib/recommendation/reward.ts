import type { FocusBlock } from "@/lib/domain/types";

/**
 * Heuristic reward — used by the arm-scoring engine for FocusBlocks.
 */
export function computeReward(block: FocusBlock): number {
  const completionBinary = block.completed ? 1 : 0;
  const ratingNorm = block.focus_rating / 5;
  const fatiguePenalty =
    ((block.focus_duration_sec - 1500) / 1800) * 0.1;
  const reward =
    0.6 * completionBinary + 0.4 * ratingNorm - fatiguePenalty;
  return Math.max(0, Math.min(1, reward));
}

/**
 * PRD reward_v1 formula.
 * reward_v1 = 0.35*completion_full + 0.20*completion_fraction + 0.30*focus_norm - 0.15*fatigue_norm
 * Clamped to [0, 1].
 *
 * If fatigue_rating is unavailable, pass focus_rating as a proxy and set
 * version to "reward_v1_no_fatigue".
 */
export function computeRewardV1(params: {
  completed: boolean;
  actual_focus_minutes: number;
  planned_focus_minutes: number;
  focus_rating: number;
  fatigue_rating: number;
}): { value: number; version: "reward_v1" } {
  const completion_full = params.completed ? 1 : 0;
  const completion_fraction = Math.min(
    params.actual_focus_minutes / Math.max(params.planned_focus_minutes, 1),
    1.0
  );
  const focus_norm = (params.focus_rating - 1) / 4;
  const fatigue_norm = (params.fatigue_rating - 1) / 4;
  const value =
    0.35 * completion_full +
    0.20 * completion_fraction +
    0.30 * focus_norm -
    0.15 * fatigue_norm;
  return { value: Math.max(0, Math.min(1, value)), version: "reward_v1" };
}
