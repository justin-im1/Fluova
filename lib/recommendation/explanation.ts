import type { Recommendation, ExplanationPayload, ConfidenceLevel } from "@/lib/domain/types";
import type { ContextSnapshot } from "./context";

function buildConfidenceReason(level: ConfidenceLevel, blockCount: number): string {
  const n = blockCount;
  const s = n === 1 ? "" : "s";
  if (level === "learning") {
    return `Based on ${n} session${s} — still learning your pattern`;
  }
  if (level === "calibrating") {
    return `Based on your last ${n} sessions — tuning the recommendation`;
  }
  return `Strong signal from ${n} sessions — Fluova knows your rhythm`;
}

function buildTimeOfDaySignal(rec: Recommendation, ctx: ContextSnapshot): string | null {
  if (!rec.best_time_bucket) return null;
  const bucket = rec.best_time_bucket;
  const h = ctx.hour_of_day;
  const current =
    h >= 5 && h < 12 ? "morning"
    : h >= 12 && h < 17 ? "afternoon"
    : h >= 17 && h < 22 ? "evening"
    : "night";
  if (current === bucket) {
    return `You're in your peak focus window (${bucket}) right now.`;
  }
  return `Your ${bucket} sessions score highest — current window: ${current}.`;
}

function buildFatigueSignal(rec: Recommendation, ctx: ContextSnapshot): string | null {
  if (!rec.fatigue_state || rec.fatigue_state === "stable") return null;
  if (rec.fatigue_state === "reset") {
    return "Starting fresh — prior fatigue pattern has reset.";
  }
  if (rec.fatigue_state === "fatigued") {
    const avg =
      ctx.rolling_fatigue_mean !== null
        ? ` (avg fatigue ${ctx.rolling_fatigue_mean.toFixed(1)}/5)`
        : "";
    return `Fatigue is elevated${avg} — shorter block recommended.`;
  }
  if (rec.fatigue_state === "recovered") {
    return "Recent sessions are improving — good conditions for focused work.";
  }
  return null;
}

function buildCompletionTrendSignal(ctx: ContextSnapshot): string | null {
  if (ctx.sessions_last_7d === 0) return null;
  const pct = Math.round(ctx.rolling_completion_rate * 100);
  if (pct >= 80) return `Your last sessions completed at ${pct}% — solid momentum.`;
  if (pct < 50 && ctx.sessions_last_7d >= 3) {
    return `Recent completion rate is ${pct}% — a shorter session may help.`;
  }
  return `Recent completion rate: ${pct}%.`;
}

function buildArmStabilitySignal(rec: Recommendation): string | null {
  if (rec.block_count < 4) return null;
  if (rec.confidence_level === "confident") {
    return `${rec.recommended_focus_duration_sec / 60}-min sessions are consistently outperforming others.`;
  }
  return null;
}

function buildSessionsTodaySignal(ctx: ContextSnapshot): string | null {
  if (ctx.sessions_last_24h >= 4) {
    return `${ctx.sessions_last_24h} sessions logged today — stepping down to protect your energy.`;
  }
  if (ctx.sessions_last_24h >= 2) {
    return `${ctx.sessions_last_24h} sessions logged today.`;
  }
  return null;
}

export function buildExplanationPayload(
  rec: Recommendation,
  ctx: ContextSnapshot
): ExplanationPayload {
  return {
    version: "v1",
    rationale: rec.rationale,
    signals: {
      time_of_day: buildTimeOfDaySignal(rec, ctx),
      fatigue: buildFatigueSignal(rec, ctx),
      completion_trend: buildCompletionTrendSignal(ctx),
      arm_stability: buildArmStabilitySignal(rec),
      sessions_today: buildSessionsTodaySignal(ctx),
    },
    confidence_level: rec.confidence_level,
    confidence_reason: buildConfidenceReason(rec.confidence_level, rec.block_count),
  };
}
