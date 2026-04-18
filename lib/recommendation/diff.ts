import type { Recommendation } from "@/lib/domain/types";
import { SESSION_TYPE_LABELS } from "@/lib/domain/types";

/**
 * Generates a concise, human-readable explanation of what changed between
 * the previously persisted recommendation and the newly computed one.
 *
 * Returns null when:
 *   - oldFocusSec / oldBreakSec are null (first session — nothing to compare against).
 *   - Neither focus duration nor break duration changed.
 *
 * Examples:
 *   "Focus 40 → 35 min because recent sessions showed declining performance.
 *    Break 8 → 10 min — extended due to fatigue signals."
 *
 *   "Focus 30 → 35 min as recent performance is trending up."
 */
export function buildRecommendationChangeDiff(
  oldFocusSec: number | null,
  oldBreakSec: number | null,
  newRec: Recommendation
): string | null {
  if (oldFocusSec === null || oldBreakSec === null) return null;

  const newFocusSec = newRec.recommended_focus_duration_sec;
  const newBreakSec = newRec.recommended_break_duration_sec;
  const focusChanged = oldFocusSec !== newFocusSec;
  const breakChanged = oldBreakSec !== newBreakSec;

  if (!focusChanged && !breakChanged) return null;

  const parts: string[] = [];
  const fatigue = newRec.fatigue_state;
  const typeUsed = newRec.session_type_used;

  if (focusChanged) {
    const oldMin = oldFocusSec / 60;
    const newMin = newFocusSec / 60;
    const wentDown = newMin < oldMin;

    let reason: string;
    if (fatigue === "fatigued") {
      reason = wentDown
        ? "because recent sessions showed declining performance"
        : "adjusted despite recent fatigue signals";
    } else if (fatigue === "reset") {
      reason = "starting fresh after a gap — prior fatigue patterns cleared";
    } else if (fatigue === "recovered") {
      reason = "as recent performance is trending up";
    } else if (typeUsed) {
      reason = `from your ${SESSION_TYPE_LABELS[typeUsed].toLowerCase()} session history`;
    } else {
      reason = "based on updated performance data";
    }

    parts.push(`Focus ${oldMin} → ${newMin} min ${reason}.`);
  }

  if (breakChanged) {
    const oldBreakMin = Math.round(oldBreakSec / 60);
    const newBreakMin = Math.round(newBreakSec / 60);
    const breakIncreased = newBreakSec > oldBreakSec;

    let reason: string;
    if (fatigue === "fatigued" && breakIncreased) {
      reason = "extended due to fatigue signals";
    } else if (fatigue === "recovered" && !breakIncreased) {
      reason = "reduced as you're recovering well";
    } else if (focusChanged) {
      reason = "adjusted to match the new focus duration";
    } else {
      reason = "rebalanced based on recent patterns";
    }

    parts.push(`Break ${oldBreakMin} → ${newBreakMin} min — ${reason}.`);
  }

  return parts.join(" ");
}
