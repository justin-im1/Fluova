import type { FocusBlock, Recommendation } from "@/lib/domain/types";
import { FOCUS_ARMS_SEC, getBreakDurationForFocus } from "./features";
import { computeReward } from "./reward";

const DATA_WINDOW = 12;
const EPSILON = 0.1;
const PRIOR_MEAN = 0.55;
const UNEXPLORED_PROB = 0.25;
const EXPLORATION_THRESHOLD = 12;

export function computeRecommendation(blocks: FocusBlock[]): Recommendation {
  const recentBlocks = blocks.slice(0, DATA_WINDOW);

  // Cold start: 0 blocks
  if (recentBlocks.length === 0) {
    return {
      recommended_focus_duration_sec: 1800,
      recommended_break_duration_sec: 300,
      flow_likelihood: 0.65,
      rationale: "Building your rhythm—this is a starting recommendation.",
      model_version: "heuristic_v1",
    };
  }

  // 1–3 blocks: recommend best among tried, else 30/5
  if (recentBlocks.length < 4) {
    const bestArm = selectBestArm(recentBlocks);
    const focusSec = bestArm ?? 1800;
    const breakSec = getBreakDurationForFocus(focusSec);
    const flowLikelihood = bestArm
      ? computeFlowLikelihood(recentBlocks, bestArm)
      : 0.65;

    return {
      recommended_focus_duration_sec: focusSec,
      recommended_break_duration_sec: breakSec,
      flow_likelihood: flowLikelihood,
      rationale: "Building your rhythm—this is a starting recommendation.",
      model_version: "heuristic_v1",
    };
  }

  // 4+ blocks: full engine
  const unexploredArms = FOCUS_ARMS_SEC.filter(
    (arm) => !recentBlocks.some((b) => b.focus_duration_sec === arm)
  );
  const hasUnexplored = unexploredArms.length > 0;

  let chosenArm: number;

  if (
    hasUnexplored &&
    recentBlocks.length < EXPLORATION_THRESHOLD &&
    Math.random() < UNEXPLORED_PROB
  ) {
    chosenArm = unexploredArms[Math.floor(Math.random() * unexploredArms.length)]!;
  } else if (Math.random() < EPSILON) {
    chosenArm =
      FOCUS_ARMS_SEC[Math.floor(Math.random() * FOCUS_ARMS_SEC.length)]!;
  } else {
    chosenArm = selectBestArm(recentBlocks) ?? 1800;
  }

  const breakSec = getBreakDurationForFocus(chosenArm);
  const flowLikelihood = computeFlowLikelihood(recentBlocks, chosenArm);

  const rationale = `Based on your last ${recentBlocks.length} sessions, ${chosenArm / 60}-minute blocks perform best for you.`;

  return {
    recommended_focus_duration_sec: chosenArm,
    recommended_break_duration_sec: breakSec,
    flow_likelihood: flowLikelihood,
    rationale,
    model_version: "heuristic_v1",
  };
}

function selectBestArm(blocks: FocusBlock[]): number | null {
  const armScores: Record<number, { sum: number; count: number }> = {};

  for (const arm of FOCUS_ARMS_SEC) {
    armScores[arm] = { sum: 0, count: 0 };
  }

  for (const block of blocks) {
    const arm = block.focus_duration_sec;
    if (arm in armScores) {
      const reward = computeReward(block);
      armScores[arm]!.sum += reward;
      armScores[arm]!.count += 1;
    }
  }

  let bestArm: number | null = null;
  let bestScore = -1;

  for (const arm of FOCUS_ARMS_SEC) {
    const { sum, count } = armScores[arm]!;
    const meanReward = count > 0 ? sum / count : PRIOR_MEAN;
    if (meanReward > bestScore) {
      bestScore = meanReward;
      bestArm = arm;
    }
  }

  return bestArm;
}

function computeFlowLikelihood(
  blocks: FocusBlock[],
  arm: number
): number {
  const armBlocks = blocks.filter((b) => b.focus_duration_sec === arm);

  const completionRate =
    armBlocks.length > 0
      ? armBlocks.filter((b) => b.completed).length / armBlocks.length
      : 0.6;

  const avgRatingNorm =
    armBlocks.length > 0
      ? armBlocks.reduce((acc, b) => acc + b.focus_rating / 5, 0) /
        armBlocks.length
      : 0.7;

  const flow = completionRate * avgRatingNorm;
  return Math.max(0, Math.min(1, flow));
}
