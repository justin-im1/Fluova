import type { FocusBlock } from "@/lib/domain/types";

/**
 * For each focus_block:
 * completion_binary = completed ? 1 : 0
 * rating_norm = focus_rating / 5
 * fatigue_penalty = (focus_duration_sec - 1500) / 1800 * 0.10 (0 at 25m, ~0.083 at 50m)
 * reward = (0.60 * completion_binary) + (0.40 * rating_norm) - fatigue_penalty
 * Clamp reward to [0, 1].
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
