import { createAdminClient } from "@/lib/supabase/admin";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

function blockReward(completed: boolean, focus_rating: number, focus_duration_sec: number): number {
  const fatiguePenalty = ((focus_duration_sec - 1500) / 1800) * 0.1;
  const r = 0.6 * (completed ? 1 : 0) + 0.4 * (focus_rating / 5) - fatiguePenalty;
  return Math.max(0, Math.min(1, r));
}

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-admin-api-key");
  const expectedKey = process.env.ADMIN_API_KEY?.trim();
  if (!apiKey || !expectedKey || apiKey !== expectedKey) {
    return errorResponse("unauthorized", "Invalid or missing admin API key", 401);
  }

  const supabase = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [sessionsResult, recEventsResult, policyResult, blocksResult] = await Promise.all([
    supabase
      .from("sessions")
      .select("focus_duration_sec, reward_value, session_type, started_at, ended_at")
      .not("reward_value", "is", null)
      .gte("started_at", thirtyDaysAgo)
      .limit(500),
    supabase
      .from("recommendation_events")
      .select("overridden, exploration_flag, accepted")
      .gte("shown_at", thirtyDaysAgo)
      .limit(500),
    supabase
      .from("policy_evaluations")
      .select("estimated_policy_value")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("focus_blocks")
      .select("focus_rating, completed, focus_duration_sec, time_bucket, session_type, ended_at")
      .gte("ended_at", thirtyDaysAgo)
      .limit(500),
  ]);

  const sessions = sessionsResult.data ?? [];
  const recEvents = recEventsResult.data ?? [];
  const blocks = blocksResult.data ?? [];

  // avg_reward_over_time — daily buckets
  const dailyRewardMap: Record<string, { sum: number; count: number }> = {};
  for (const s of sessions) {
    const date = (s.started_at as string).slice(0, 10);
    if (!dailyRewardMap[date]) dailyRewardMap[date] = { sum: 0, count: 0 };
    dailyRewardMap[date]!.sum += s.reward_value as number;
    dailyRewardMap[date]!.count++;
  }
  const avgRewardOverTime = Object.entries(dailyRewardMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({
      date,
      avg_reward: Math.round((sum / count) * 1000) / 1000,
    }));

  // action_distribution — session count per focus_minutes
  const actionDistMap: Record<string, number> = {};
  for (const s of sessions) {
    const min = String(Math.round(s.focus_duration_sec / 60));
    actionDistMap[min] = (actionDistMap[min] ?? 0) + 1;
  }

  // override_rate and exploration_rate
  const totalEvents = recEvents.length;
  const overriddenCount = recEvents.filter((e) => e.overridden).length;
  const explorationCount = recEvents.filter((e) => e.exploration_flag).length;
  const overrideRate = totalEvents > 0 ? Math.round((overriddenCount / totalEvents) * 1000) / 1000 : 0;
  const explorationRate = totalEvents > 0 ? Math.round((explorationCount / totalEvents) * 1000) / 1000 : 0;

  // reward_by_action — avg reward_v1 per focus_minutes (from sessions)
  const rewardByActionMap: Record<string, { sum: number; count: number }> = {};
  for (const s of sessions) {
    const min = String(Math.round(s.focus_duration_sec / 60));
    if (!rewardByActionMap[min]) rewardByActionMap[min] = { sum: 0, count: 0 };
    rewardByActionMap[min]!.sum += s.reward_value as number;
    rewardByActionMap[min]!.count++;
  }
  const rewardByAction: Record<string, number> = {};
  for (const [min, { sum, count }] of Object.entries(rewardByActionMap)) {
    rewardByAction[min] = Math.round((sum / count) * 1000) / 1000;
  }

  // reward_by_segment — time_bucket and session_type averages (from focus_blocks via heuristic)
  const segmentMap: Record<string, { sum: number; count: number }> = {};
  for (const b of blocks) {
    const r = blockReward(b.completed as boolean, b.focus_rating as number, b.focus_duration_sec as number);
    // Time bucket segment
    if (b.time_bucket) {
      const key = `bucket:${b.time_bucket}`;
      if (!segmentMap[key]) segmentMap[key] = { sum: 0, count: 0 };
      segmentMap[key]!.sum += r;
      segmentMap[key]!.count++;
    }
    // Session type segment
    if (b.session_type) {
      const key = `type:${b.session_type}`;
      if (!segmentMap[key]) segmentMap[key] = { sum: 0, count: 0 };
      segmentMap[key]!.sum += r;
      segmentMap[key]!.count++;
    }
  }
  const rewardBySegment: Record<string, number> = {};
  for (const [key, { sum, count }] of Object.entries(segmentMap)) {
    rewardBySegment[key] = Math.round((sum / count) * 1000) / 1000;
  }

  return okResponse({
    avg_reward_over_time: avgRewardOverTime,
    action_distribution: actionDistMap,
    override_rate: overrideRate,
    exploration_rate: explorationRate,
    reward_by_action: rewardByAction,
    reward_by_segment: rewardBySegment,
    estimated_policy_value: policyResult.data?.estimated_policy_value ?? null,
    calibration_data: null,
    // meta
    window_days: 30,
    total_sessions_with_reward: sessions.length,
    total_recommendation_events: totalEvents,
  });
}
