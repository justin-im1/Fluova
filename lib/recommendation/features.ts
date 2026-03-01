/**
 * Allowed focus duration arms (in seconds).
 */
export const FOCUS_ARMS_SEC = [1500, 1800, 2100, 2400, 2700, 3000] as const;

/**
 * Break duration mapping for v1 heuristic.
 * focus <= 30min (1800) → 5min
 * 35–45min (2100–2700) → 8min
 * 50min (3000) → 10min
 */
export function getBreakDurationForFocus(focusSec: number): number {
  if (focusSec <= 1800) return 300; // 5 min
  if (focusSec <= 2700) return 480; // 8 min
  return 600; // 10 min
}
