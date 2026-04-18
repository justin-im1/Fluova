import type { FocusBlock, PlanBlock, Recommendation } from "@/lib/domain/types";
import { FOCUS_ARMS_SEC, type FocusArm, getBreakDurationForFocus } from "./features";

/**
 * Generates a short 2–3 block plan for the upcoming work window.
 *
 * The plan accounts for natural focus decay over consecutive sessions:
 *   Block 1 — the recommendation itself (best arm for current conditions).
 *   Block 2 — one arm shorter (accumulated effort from Block 1).
 *   Block 3 — two arms shorter, marked optional (deep in the work window).
 *
 * Block 3 is omitted when:
 *   - Block 2 is already at the minimum arm (can't step down further).
 *   - The user has completed ≥ 4 sessions today (already a long day).
 *
 * Returns undefined when block_count < 4 (not enough data for a useful plan).
 *
 * @param rec    The computed recommendation for Block 1.
 * @param blocks Focus blocks, most-recent first (used to count today's sessions).
 * @param now    Current time — defaults to new Date() for server-side calls.
 */
export function buildNextPlan(
  rec: Recommendation,
  blocks: FocusBlock[],
  now: Date = new Date()
): PlanBlock[] | undefined {
  if (rec.block_count < 4) return undefined;

  const baseArm = rec.recommended_focus_duration_sec as FocusArm;
  const baseIdx = FOCUS_ARMS_SEC.indexOf(baseArm);
  if (baseIdx < 0) return undefined;

  const fatigue = rec.fatigue_state;

  // Count sessions already completed today (UTC date comparison).
  const todayStr = now.toISOString().slice(0, 10);
  const sessionsToday = blocks.filter(
    (b) => b.ended_at.slice(0, 10) === todayStr
  ).length;

  const plan: PlanBlock[] = [];

  // ── Block 1: recommendation as-is ────────────────────────────────────────
  plan.push({
    block_number: 1,
    focus_duration_sec: rec.recommended_focus_duration_sec,
    break_duration_sec: rec.recommended_break_duration_sec,
  });

  // ── Block 2: step down 1 arm ──────────────────────────────────────────────
  const arm2Idx = Math.max(0, baseIdx - 1);
  const arm2: FocusArm = FOCUS_ARMS_SEC[arm2Idx];
  // If we couldn't step down (already at minimum), reuse Block 1's break.
  const break2 =
    arm2 === baseArm
      ? rec.recommended_break_duration_sec
      : getBreakDurationForFocus(arm2);

  plan.push({
    block_number: 2,
    focus_duration_sec: arm2,
    break_duration_sec: break2,
    note: arm2 < baseArm ? "accounting for accumulated effort" : undefined,
  });

  // ── Block 3: step down 2 arms from base (optional) ───────────────────────
  // Included only when there is room to step down and the day isn't already long.
  if (arm2Idx > 0 && sessionsToday < 4) {
    const arm3Idx = arm2Idx - 1;
    const arm3: FocusArm = FOCUS_ARMS_SEC[arm3Idx];
    // Add 2-minute buffer to the break — more recovery needed late in a work window.
    const break3 = Math.min(getBreakDurationForFocus(arm3) + 120, 900);

    plan.push({
      block_number: 3,
      focus_duration_sec: arm3,
      break_duration_sec: break3,
      note:
        fatigue === "fatigued"
          ? "short block recommended — fatigue detected"
          : "optional — continue if energy allows",
    });
  }

  return plan;
}
