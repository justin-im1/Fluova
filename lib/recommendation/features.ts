import type { FocusBlock, FatigueState, ConfidenceLevel } from "@/lib/domain/types";
import type { TimeBucket } from "@/lib/domain/time";
import { computeReward } from "./reward";


// ── Constants ─────────────────────────────────────────────────────────────────

/** Allowed focus duration arms (in seconds). Bounded set — no arbitrary durations. */
export const FOCUS_ARMS_SEC = [1500, 1800, 2100, 2400, 2700, 3000] as const;
export type FocusArm = (typeof FOCUS_ARMS_SEC)[number];

/** Prior mean reward for untried arms (calibrated empirically). */
export const PRIOR_MEAN = 0.55;

/** Minimum data points per bucket before time-of-day weighting is applied. */
const BUCKET_WEIGHT_THRESHOLD = 2;

/** Weight multiplier for sessions matching the current time bucket. */
const BUCKET_WEIGHT = 1.8;

// ── Break duration ────────────────────────────────────────────────────────────

/**
 * Base break duration for a given focus duration.
 * focus ≤ 30 min → 5 min break
 * focus 35–45 min → 8 min break
 * focus 50 min → 10 min break
 */
export function getBreakDurationForFocus(focusSec: number): number {
  if (focusSec <= 1800) return 300;  // 5 min
  if (focusSec <= 2700) return 480;  // 8 min
  return 600;                        // 10 min
}

/**
 * Returns the recommended break duration adjusted for the user's current fatigue state.
 * Fatigued  → +2 min; Recovered → −1 min; Stable / Reset → base.
 * Bounded [3 min, 15 min].
 */
export function computeBreakForFatigue(focusSec: number, fatigue: FatigueState): number {
  const base = getBreakDurationForFocus(focusSec);
  if (fatigue === "fatigued")  return Math.min(base + 120, 900);
  if (fatigue === "recovered") return Math.max(base - 60, 180);
  // "stable" and "reset" both use the base break duration.
  return base;
}

// ── Time-of-day weighted scoring ──────────────────────────────────────────────

export type ArmScore = { weightedSum: number; totalWeight: number };

/**
 * Computes a weighted average reward score for each arm.
 *
 * If the current time bucket has ≥ BUCKET_WEIGHT_THRESHOLD sessions across ALL
 * arms, that bucket's sessions are weighted BUCKET_WEIGHT× more heavily.
 * Otherwise, all sessions are weighted equally (graceful fallback).
 */
export function computeWeightedArmScores(
  blocks: FocusBlock[],
  currentBucket?: TimeBucket
): Record<FocusArm, ArmScore> {
  const scores = {} as Record<FocusArm, ArmScore>;
  for (const arm of FOCUS_ARMS_SEC) {
    scores[arm] = { weightedSum: 0, totalWeight: 0 };
  }

  // Determine whether there's enough bucket-specific data to weight
  const bucketSessionCount = currentBucket
    ? blocks.filter((b) => b.time_bucket === currentBucket).length
    : 0;
  const useBucketWeighting =
    !!currentBucket && bucketSessionCount >= BUCKET_WEIGHT_THRESHOLD;

  for (const block of blocks) {
    const arm = block.focus_duration_sec as FocusArm;
    if (!(arm in scores)) continue;

    const reward = computeReward(block);
    const isSameBucket =
      useBucketWeighting && block.time_bucket === currentBucket;
    const weight = isSameBucket ? BUCKET_WEIGHT : 1.0;

    scores[arm].weightedSum += weight * reward;
    scores[arm].totalWeight += weight;
  }

  return scores;
}

/**
 * Given weighted arm scores, returns the arm with the highest average reward.
 * Untried arms receive PRIOR_MEAN as their score.
 * Fully deterministic.
 */
export function selectBestArm(armScores: Record<FocusArm, ArmScore>): FocusArm {
  let bestArm: FocusArm = FOCUS_ARMS_SEC[1]; // default: 30 min
  let bestScore = -Infinity;

  for (const arm of FOCUS_ARMS_SEC) {
    const { weightedSum, totalWeight } = armScores[arm];
    const score = totalWeight > 0 ? weightedSum / totalWeight : PRIOR_MEAN;
    if (score > bestScore) {
      bestScore = score;
      bestArm = arm;
    }
  }

  return bestArm;
}

// ── Fatigue state ─────────────────────────────────────────────────────────────

/** Reward slope magnitude required to declare fatigued / recovered. */
const FATIGUE_THRESHOLD = 0.10;

/**
 * Hours gap after which old fatigue is considered stale (multi-day reset).
 * 20 h comfortably spans overnight sleeps while catching true day boundaries.
 */
const RESET_GAP_HOURS = 20;

/**
 * Hours gap within a day that implies meaningful recovery.
 * After this gap the fatigue threshold is raised so a single bad past session
 * doesn't erroneously flag "fatigued" for a refreshed user.
 */
const RECOVERY_GAP_HOURS = 3;

/**
 * Detects the user's current fatigue/recovery state from their recent focus blocks.
 *
 * Signals used:
 *   - Hours since the last session ended.
 *   - Whether the last session was on a prior calendar day (UTC).
 *   - Standard slope of recent vs older block rewards.
 *
 * State semantics:
 *   "reset"     — last session was more than RESET_GAP_HOURS ago or on a prior day.
 *                 Prior fatigue patterns are stale; treat this as a fresh start.
 *   "fatigued"  — reward slope is significantly negative (recent < older).
 *   "recovered" — reward slope is significantly positive (recent > older).
 *   "stable"    — no strong trend detected.
 *
 * Returns null when fewer than 4 blocks exist (not enough signal).
 *
 * @param blocks  Focus blocks, most-recent first.
 * @param now     Current time — defaults to new Date() for server-side calls.
 */
export function computeFatigueState(
  blocks: FocusBlock[],
  now: Date = new Date()
): FatigueState | null {
  if (blocks.length < 4) return null;

  const lastBlock = blocks[0];
  const lastEndedAt = new Date(lastBlock.ended_at);
  const hoursSinceLast =
    (now.getTime() - lastEndedAt.getTime()) / 3_600_000;

  // UTC calendar-day comparison (YYYY-MM-DD prefix of ISO string).
  const todayStr = now.toISOString().slice(0, 10);
  const lastDayStr = lastBlock.ended_at.slice(0, 10);
  const isDifferentDay = lastDayStr < todayStr;

  // ── Reset: prior fatigue is stale ────────────────────────────────────────
  // Triggered when the last session ended on a different UTC day, OR when the
  // gap is so large that overnight recovery has clearly occurred.
  if (isDifferentDay || hoursSinceLast >= RESET_GAP_HOURS) {
    return "reset";
  }

  // ── Standard slope analysis ───────────────────────────────────────────────
  const recent = blocks.slice(0, 3);
  const older  = blocks.slice(3, 6);

  if (older.length === 0) return "stable";

  const avg = (bs: FocusBlock[]) =>
    bs.reduce((s, b) => s + computeReward(b), 0) / bs.length;

  const slope = avg(recent) - avg(older);

  // After a meaningful intra-day gap the user has partially recovered.
  // Raise the threshold so we don't over-penalise based on pre-break sessions.
  const isLargeGap = hoursSinceLast >= RECOVERY_GAP_HOURS;
  const effectiveThreshold = isLargeGap ? FATIGUE_THRESHOLD * 1.8 : FATIGUE_THRESHOLD;

  if (slope < -effectiveThreshold) return "fatigued";
  // After a large gap, any non-negative slope is treated as recovered.
  if (isLargeGap && slope >= 0) return "recovered";
  if (slope > effectiveThreshold)  return "recovered";
  return "stable";
}

/**
 * Adjusts the chosen arm down one step when fatigued.
 * "stable", "recovered", and "reset" all leave the arm unchanged.
 */
export function adjustArmForFatigue(arm: FocusArm, fatigue: FatigueState | null): FocusArm {
  if (fatigue !== "fatigued") return arm;
  const idx = FOCUS_ARMS_SEC.indexOf(arm);
  return idx > 0 ? FOCUS_ARMS_SEC[idx - 1] : arm;
}

// ── Best time bucket ──────────────────────────────────────────────────────────

/**
 * Returns the time bucket with the highest average reward,
 * requiring ≥2 data points. Returns null if no bucket qualifies.
 */
export function computeBestTimeBucket(blocks: FocusBlock[]): TimeBucket | null {
  const buckets: TimeBucket[] = ["morning", "afternoon", "evening", "night"];
  const accum: Record<TimeBucket, { sum: number; count: number }> = {
    morning:   { sum: 0, count: 0 },
    afternoon: { sum: 0, count: 0 },
    evening:   { sum: 0, count: 0 },
    night:     { sum: 0, count: 0 },
  };

  for (const block of blocks) {
    const b = block.time_bucket as TimeBucket;
    if (!buckets.includes(b)) continue;
    accum[b].sum += computeReward(block);
    accum[b].count++;
  }

  let best: TimeBucket | null = null;
  let bestScore = -Infinity;
  for (const b of buckets) {
    if (accum[b].count < 2) continue;
    const score = accum[b].sum / accum[b].count;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return best;
}

// ── Arm stability ─────────────────────────────────────────────────────────────

/**
 * Margin by which the best arm must beat the second-best tried arm for
 * the selection to be considered "stable". Below this the two arms are
 * essentially tied and the recommendation should reflect that uncertainty.
 */
const STABILITY_THRESHOLD = 0.07;

/**
 * Measures how decisively the best arm leads the field.
 *
 * "stable"   — the best arm's average reward beats the second-best tried arm
 *              by ≥ STABILITY_THRESHOLD. The recommendation is clear-cut.
 * "unstable" — fewer than two arms have been tried, or the top two are within
 *              STABILITY_THRESHOLD of each other. The choice is uncertain.
 */
export function computeArmStability(
  armScores: Record<FocusArm, ArmScore>,
  bestArm: FocusArm
): "stable" | "unstable" {
  const triedArms = FOCUS_ARMS_SEC.filter((a) => armScores[a].totalWeight > 0);
  if (triedArms.length < 2) return "unstable";

  const score = (arm: FocusArm) => {
    const { weightedSum, totalWeight } = armScores[arm];
    return totalWeight > 0 ? weightedSum / totalWeight : PRIOR_MEAN;
  };

  const bestScore = score(bestArm);
  let secondBest = -Infinity;
  for (const arm of triedArms) {
    if (arm === bestArm) continue;
    const s = score(arm);
    if (s > secondBest) secondBest = s;
  }

  return bestScore - secondBest >= STABILITY_THRESHOLD ? "stable" : "unstable";
}

// ── Sessions-today pressure ────────────────────────────────────────────────────

/**
 * Minimum sessions completed today before session-count pressure is applied.
 * At this point the user has logged a meaningful amount of work regardless of
 * fatigue signals, and we step the arm down once as a precaution.
 */
const SESSIONS_TODAY_PRESSURE_THRESHOLD = 4;

/**
 * Returns true when the volume of today's sessions alone warrants stepping the
 * arm down — independently of the rolling fatigue signal.
 *
 * Only fires when fatigue is not already "fatigued" (no double-penalising).
 */
export function shouldApplySessionsTodayPressure(
  sessionsToday: number,
  fatigue: FatigueState | null
): boolean {
  return sessionsToday >= SESSIONS_TODAY_PRESSURE_THRESHOLD && fatigue !== "fatigued";
}

// ── Confidence ────────────────────────────────────────────────────────────────

/**
 * Computes confidence level from block volume, arm stability, and whether
 * the engine fell back to general data because type-specific data was sparse.
 *
 * Volume thresholds (baseline):
 *   learning    — < 4 blocks
 *   calibrating — 4–17 blocks
 *   confident   — 18+ blocks
 *
 * Downgrade rules applied on top:
 *   confident → calibrating if arm is "unstable" (best/2nd-best nearly tied).
 *   confident → calibrating if type-specific data was requested but too sparse.
 */
export function computeConfidenceLevel(
  blockCount: number,
  armStability?: "stable" | "unstable",
  typeDataSparse?: boolean
): ConfidenceLevel {
  const raw: ConfidenceLevel =
    blockCount < 4 ? "learning" :
    blockCount < 18 ? "calibrating" :
    "confident";

  if (raw === "confident") {
    if (armStability === "unstable") return "calibrating";
    if (typeDataSparse) return "calibrating";
  }

  return raw;
}

// ── Flow likelihood ───────────────────────────────────────────────────────────

/**
 * Estimates flow likelihood for the chosen arm using bucket-specific data
 * when available, falling back to all-arm data.
 */
export function computeFlowLikelihood(
  blocks: FocusBlock[],
  arm: FocusArm,
  currentBucket?: TimeBucket
): number {
  const armBlocks = blocks.filter((b) => b.focus_duration_sec === arm);

  // Prefer bucket-specific data if ≥2 data points exist
  const bucketArmBlocks = currentBucket
    ? armBlocks.filter((b) => b.time_bucket === currentBucket)
    : [];
  const source = bucketArmBlocks.length >= 2 ? bucketArmBlocks : armBlocks;

  if (source.length === 0) return 0.55; // prior

  const completionRate = source.filter((b) => b.completed).length / source.length;
  const avgRatingNorm =
    source.reduce((s, b) => s + b.focus_rating / 5, 0) / source.length;

  return Math.max(0, Math.min(1, completionRate * avgRatingNorm));
}
