import type { FocusBlock, SessionType } from "@/lib/domain/types";
import { computeReward } from "./reward";

export type ContextSnapshot = {
  hour_of_day: number;
  day_of_week: number;
  task_type: string | null;
  energy_level: number | null;
  distraction_level: number | null;
  rolling_completion_rate: number;
  rolling_focus_rating_mean: number;
  rolling_fatigue_mean: number | null;
  ewm_reward: number;
  streak_length: number;
  last_session_duration_min: number | null;
  last_session_completed: boolean | null;
  time_since_last_session_hours: number | null;
  sessions_last_24h: number;
  sessions_last_7d: number;
};

const ROLLING_WINDOW = 10;
const EWM_LAMBDA = 0.9;

function computeEwmReward(blocks: FocusBlock[]): number {
  if (blocks.length === 0) return 0.55;
  // blocks are newest-first; iterating in that order gives most-recent the highest weight.
  // ewm = λ*current + (1-λ)*older — so the first (most recent) block dominates.
  let ewm = computeReward(blocks[0]);
  for (let i = 1; i < blocks.length; i++) {
    ewm = EWM_LAMBDA * ewm + (1 - EWM_LAMBDA) * computeReward(blocks[i]);
  }
  return Math.max(0, Math.min(1, ewm));
}

function computeStreakLength(blocks: FocusBlock[], now: Date, clientDateStr: string | null = null): number {
  if (blocks.length === 0) return 0;
  const days = new Set(blocks.map((b) => b.ended_at.slice(0, 10)));
  let streak = 0;
  // Use client-supplied date (YYYY-MM-DD in local time) as the "today" pivot to avoid
  // UTC date mismatch for users in UTC- timezones doing evening sessions.
  const todayStr = clientDateStr ?? now.toISOString().slice(0, 10);
  const d = new Date(todayStr + "T00:00:00Z");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const dateStr = d.toISOString().slice(0, 10);
    if (days.has(dateStr)) {
      streak++;
      d.setUTCDate(d.getUTCDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Builds a serializable context snapshot from recent focus blocks and optional
 * pre-session context inputs.
 *
 * @param blocks          Focus blocks, most-recent first (up to DATA_WINDOW used).
 * @param energyLevel     User-reported energy (1–5) if available; null otherwise.
 * @param distractionLevel User-reported distraction (1–5) if available; null otherwise.
 * @param sessionType     Selected session type; null if none selected.
 * @param recentFatigue   Fatigue rating values from recent sessions (may include nulls).
 * @param now             Current timestamp; defaults to new Date().
 */
export function buildContextSnapshot(
  blocks: FocusBlock[],
  energyLevel: number | null,
  distractionLevel: number | null,
  sessionType: SessionType | null,
  recentFatigue: (number | null)[] = [],
  now: Date = new Date(),
  hourOfDay: number | null = null,
  clientDateStr: string | null = null
): ContextSnapshot {
  const window = blocks.slice(0, ROLLING_WINDOW);
  const last = blocks[0] ?? null;

  const rollingCompletionRate =
    window.length > 0
      ? window.filter((b) => b.completed).length / window.length
      : 0;

  const rollingFocusRatingMean =
    window.length > 0
      ? window.reduce((s, b) => s + b.focus_rating, 0) / window.length
      : 3;

  const validFatigue = recentFatigue.filter((f): f is number => f !== null);
  const rollingFatigueMean =
    validFatigue.length > 0
      ? validFatigue.reduce((s, f) => s + f, 0) / validFatigue.length
      : null;

  const ewmReward = computeEwmReward(window);
  const streakLength = computeStreakLength(blocks, now, clientDateStr);

  const nowMs = now.getTime();
  const MS_PER_HOUR = 3_600_000;
  const MS_PER_DAY = 86_400_000;

  const timeSinceLast = last
    ? (nowMs - new Date(last.ended_at).getTime()) / MS_PER_HOUR
    : null;

  const sessionsLast24h = blocks.filter(
    (b) => nowMs - new Date(b.ended_at).getTime() <= MS_PER_DAY
  ).length;

  const sessionsLast7d = blocks.filter(
    (b) => nowMs - new Date(b.ended_at).getTime() <= 7 * MS_PER_DAY
  ).length;

  return {
    hour_of_day: hourOfDay ?? now.getHours(),
    day_of_week: now.getDay(),
    task_type: sessionType,
    energy_level: energyLevel,
    distraction_level: distractionLevel,
    rolling_completion_rate: rollingCompletionRate,
    rolling_focus_rating_mean: rollingFocusRatingMean,
    rolling_fatigue_mean: rollingFatigueMean,
    ewm_reward: ewmReward,
    streak_length: streakLength,
    last_session_duration_min: last ? last.focus_duration_sec / 60 : null,
    last_session_completed: last ? last.completed : null,
    time_since_last_session_hours: timeSinceLast,
    sessions_last_24h: sessionsLast24h,
    sessions_last_7d: sessionsLast7d,
  };
}
