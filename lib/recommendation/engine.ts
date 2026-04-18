import type { FocusBlock, Recommendation, ConfidenceLevel, FatigueState, SessionType } from "@/lib/domain/types";
import type { TimeBucket } from "@/lib/domain/time";
import {
  FOCUS_ARMS_SEC,
  type FocusArm,
  type ArmScore,
  computeWeightedArmScores,
  selectBestArm,
  computeFatigueState,
  adjustArmForFatigue,
  computeBreakForFatigue,
  computeBestTimeBucket,
  computeConfidenceLevel,
  computeFlowLikelihood,
  getBreakDurationForFocus,
  computeArmStability,
  shouldApplySessionsTodayPressure,
} from "./features";
import { buildNextPlan } from "./planner";

/** How many recent blocks to consider. */
const DATA_WINDOW = 12;

/**
 * Minimum type-specific blocks required before switching to type-specific scoring.
 * Mirrors the general early-stage cutoff so the quality bar is the same.
 */
const TYPE_DATA_THRESHOLD = 4;

// ── Rationale builder ─────────────────────────────────────────────────────────

interface RationaleParams {
  chosenArm: FocusArm;
  /** Arm before fatigue adjustment — same as chosenArm when not fatigued. */
  unadjustedBestArm: FocusArm;
  /** Arm before sessions-today adjustment — used to note high session count. */
  armBeforeTodayPressure: FocusArm;
  confidence: ConfidenceLevel;
  blockCount: number;
  fatigueState: FatigueState | null;
  bestTimeBucket: TimeBucket | null;
  currentBucket?: TimeBucket;
  sessionTypeUsed?: SessionType | null;
  /** Whether a type was requested but we fell back to general data. */
  typeDataSparse?: boolean;
  sessionsToday: number;
  armStability: "stable" | "unstable";
}

function buildRationale(p: RationaleParams): string {
  const sentences: string[] = [];

  const typePrefix = p.sessionTypeUsed
    ? `For your ${p.sessionTypeUsed.replace("_", " ")} sessions`
    : null;

  // ── Sentence 1: Core duration reasoning ──────────────────────────────────
  if (p.confidence === "learning") {
    sentences.push(
      `Try this ${p.chosenArm / 60}-min session to help Fluova calibrate to your rhythm.`
    );
  } else if (p.fatigueState === "fatigued" && p.chosenArm !== p.unadjustedBestArm) {
    sentences.push(
      `Your strongest duration is ${p.unadjustedBestArm / 60} min, but recent sessions show fatigue — a shorter ${p.chosenArm / 60}-min block is recommended.`
    );
  } else if (typePrefix) {
    const qualifier =
      p.confidence === "confident"
        ? `${typePrefix}, Fluova has high confidence:`
        : `${typePrefix} (last ${p.blockCount}):`;
    sentences.push(`${qualifier} ${p.chosenArm / 60}-min blocks perform best.`);
  } else {
    const qualifier =
      p.confidence === "confident"
        ? `Fluova has high confidence:`
        : `Based on your last ${p.blockCount} sessions:`;
    sentences.push(`${qualifier} ${p.chosenArm / 60}-min blocks perform best for you.`);
  }

  // ── Sentence 2: Arm stability / type fallback notice ─────────────────────
  if (p.armStability === "unstable" && p.blockCount >= 4) {
    sentences.push(
      `Two durations are closely matched — try both to help Fluova pick the clear winner.`
    );
  } else if (p.typeDataSparse && p.sessionTypeUsed == null) {
    sentences.push(
      `Not enough data for your selected session type yet — using your overall history as a fallback.`
    );
  }

  // ── Sentence 3: Time-of-day insight ──────────────────────────────────────
  if (p.bestTimeBucket) {
    if (p.currentBucket && p.currentBucket === p.bestTimeBucket) {
      sentences.push(
        `You're currently in your peak focus window (${p.bestTimeBucket}) — good conditions right now.`
      );
    } else if (p.currentBucket && p.currentBucket !== p.bestTimeBucket) {
      sentences.push(
        `Your peak focus window is ${p.bestTimeBucket}; current conditions are ${p.currentBucket}.`
      );
    } else {
      sentences.push(`Your ${p.bestTimeBucket} sessions consistently score highest.`);
    }
  }

  // ── Sentence 4: Recovery / fatigue / reset ───────────────────────────────
  if (p.fatigueState === "reset") {
    sentences.push(
      `Fluova reset your fatigue pattern — you're starting fresh, so previous session trends won't affect this recommendation.`
    );
  } else if (p.fatigueState === "recovered" && p.confidence !== "learning") {
    sentences.push(
      `Recent scores are improving — you're in good shape for a focused session.`
    );
  }

  // ── Sentence 5: Sessions-today pressure ──────────────────────────────────
  if (p.chosenArm !== p.armBeforeTodayPressure) {
    sentences.push(
      `${p.sessionsToday} sessions logged today — stepping down to protect your energy.`
    );
  }

  return sentences.join(" ");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Counts focus blocks completed on today's UTC date.
 * Used to detect high-volume days and apply sessions-today arm pressure.
 */
function countSessionsToday(blocks: FocusBlock[], now: Date = new Date()): number {
  const todayStr = now.toISOString().slice(0, 10);
  return blocks.filter((b) => b.ended_at.slice(0, 10) === todayStr).length;
}

// ── Main recommendation ───────────────────────────────────────────────────────

/**
 * Computes the deterministic "best next session" recommendation.
 *
 * Contextual signals used:
 *   - Historical arm scores with time-of-day weighting.
 *   - Session type (type-specific scoring when ≥ TYPE_DATA_THRESHOLD blocks).
 *   - Fatigue/recovery state from rolling reward slope.
 *   - Sessions completed today (high count → soft arm downgrade).
 *   - Arm stability (best vs. second-best margin → honest confidence).
 *   - Sample count / confidence level.
 *
 * @param blocks       All historical focus blocks, most-recent first.
 * @param currentBucket  The user's current local time-of-day bucket.
 * @param sessionType  Optional session type selected by the user.
 */
export function computeRecommendation(
  blocks: FocusBlock[],
  currentBucket?: TimeBucket,
  sessionType?: SessionType
): Recommendation {
  const window = blocks.slice(0, DATA_WINDOW);

  // ── Session-type filtering ────────────────────────────────────────────────
  let workingBlocks = window;
  let sessionTypeUsed: SessionType | null = null;
  let typeDataSparse = false;

  if (sessionType) {
    const typeBlocks = window.filter((b) => b.session_type === sessionType);
    if (typeBlocks.length >= TYPE_DATA_THRESHOLD) {
      workingBlocks = typeBlocks;
      sessionTypeUsed = sessionType;
    } else {
      // Requested type but not enough data — note the fallback for rationale/confidence.
      typeDataSparse = true;
    }
  }

  const blockCount = workingBlocks.length;

  // ── Cold start (0 blocks) ────────────────────────────────────────────────
  if (blockCount === 0) {
    const coldRationale = sessionType
      ? `No ${sessionType.replace("_", " ")} sessions yet — start with 30 min to build your baseline.`
      : "Start with a 30-minute session to calibrate Fluova to your rhythm.";

    return {
      recommended_focus_duration_sec: 1800,
      recommended_break_duration_sec: 300,
      estimated_session_score: 0.55,
      confidence_level: "learning",
      rationale: coldRationale,
      model_version: "heuristic_v3",
      best_time_bucket: null,
      fatigue_state: null,
      block_count: 0,
      session_type_used: null,
    };
  }

  // ── Early stage (1–3 blocks): best tried arm, no fatigue yet ────────────
  if (blockCount < 4) {
    const armScores = computeWeightedArmScores(workingBlocks, currentBucket);
    const triedArms = FOCUS_ARMS_SEC.filter((arm) => armScores[arm].totalWeight > 0);
    let chosenArm: FocusArm = FOCUS_ARMS_SEC[1]; // default 30 min
    if (triedArms.length > 0) {
      chosenArm = selectBestArm(
        Object.fromEntries(
          FOCUS_ARMS_SEC.map((arm) =>
            triedArms.includes(arm)
              ? [arm, armScores[arm]]
              : [arm, { weightedSum: -Infinity, totalWeight: 1 }]
          )
        ) as Record<FocusArm, ArmScore>
      );
    }

    const breakSec = getBreakDurationForFocus(chosenArm);
    const estimatedScore = computeFlowLikelihood(workingBlocks, chosenArm, currentBucket);
    const bestTimeBucket = computeBestTimeBucket(workingBlocks);

    const earlyRationale = sessionTypeUsed
      ? `Building your ${sessionType!.replace("_", " ")} baseline — try different durations to help Fluova learn.`
      : `Still building your baseline — try different durations to help Fluova learn your patterns.`;

    return {
      recommended_focus_duration_sec: chosenArm,
      recommended_break_duration_sec: breakSec,
      estimated_session_score: estimatedScore,
      confidence_level: "learning",
      rationale: earlyRationale,
      model_version: "heuristic_v3",
      best_time_bucket: bestTimeBucket,
      fatigue_state: null,
      block_count: blockCount,
      session_type_used: sessionTypeUsed,
    };
  }

  // ── Full engine (4+ blocks) ───────────────────────────────────────────────

  // 1. Score arms with time-of-day weighting.
  const armScores = computeWeightedArmScores(workingBlocks, currentBucket);

  // 2. Pick best arm deterministically.
  const unadjustedBestArm = selectBestArm(armScores);

  // 3. Measure arm stability — how clearly the best arm leads.
  const armStability = computeArmStability(armScores, unadjustedBestArm);

  // 4. Detect fatigue state from rolling reward slope + time gap.
  const fatigueState = computeFatigueState(workingBlocks);

  // 5. Adjust arm down one step if fatigued.
  const armAfterFatigue = adjustArmForFatigue(unadjustedBestArm, fatigueState);

  // 6. Count sessions already logged today and apply volume pressure if high.
  //    Uses the full window (not just working type-filtered blocks) so the count
  //    reflects all of the user's work today, regardless of session type.
  const sessionsToday = countSessionsToday(window);
  const applyTodayPressure = shouldApplySessionsTodayPressure(sessionsToday, fatigueState);
  const chosenArm = applyTodayPressure
    ? adjustArmForFatigue(armAfterFatigue, "fatigued") // step down one more notch
    : armAfterFatigue;

  // 7. Break duration adjusted for fatigue.
  const breakSec = computeBreakForFatigue(chosenArm, fatigueState ?? "stable");

  // 8. Estimated session score (bucket-aware flow likelihood).
  const estimatedScore = computeFlowLikelihood(workingBlocks, chosenArm, currentBucket);

  // 9. Best historical time bucket.
  const bestTimeBucket = computeBestTimeBucket(workingBlocks);

  // 10. Confidence: volume + stability + type-sparsity.
  const confidence = computeConfidenceLevel(blockCount, armStability, typeDataSparse);

  // 11. Rationale.
  const rationale = buildRationale({
    chosenArm,
    unadjustedBestArm,
    armBeforeTodayPressure: armAfterFatigue,
    confidence,
    blockCount,
    fatigueState,
    bestTimeBucket,
    currentBucket,
    sessionTypeUsed,
    typeDataSparse,
    sessionsToday,
    armStability,
  });

  const rec: Recommendation = {
    recommended_focus_duration_sec: chosenArm,
    recommended_break_duration_sec: breakSec,
    estimated_session_score: estimatedScore,
    confidence_level: confidence,
    rationale,
    model_version: "heuristic_v3",
    best_time_bucket: bestTimeBucket,
    fatigue_state: fatigueState,
    block_count: blockCount,
    session_type_used: sessionTypeUsed,
  };

  // 12. Next-best plan (2–3 block projection).
  const nextPlan = buildNextPlan(rec, window);

  return { ...rec, next_plan: nextPlan };
}
