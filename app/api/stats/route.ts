import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { okResponse, errorResponse } from "@/lib/api/response";

type TimeBucket = "morning" | "afternoon" | "evening" | "night";
const TIME_BUCKETS: TimeBucket[] = ["morning", "afternoon", "evening", "night"];

function computeStreak(
  blocks: Array<{ ended_at: string; completed: boolean }>
): { current: number; longest: number } {
  const datesWithCompleted = new Set(
    blocks.filter((b) => b.completed).map((b) => b.ended_at.slice(0, 10))
  );
  const sorted = Array.from(datesWithCompleted).sort().reverse();
  if (sorted.length === 0) return { current: 0, longest: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  let current = 0;
  if (sorted[0] === today || sorted[0] === yesterday) {
    current = 1;
    let prev = new Date(sorted[0]!);
    for (let i = 1; i < sorted.length; i++) {
      const curr = new Date(sorted[i]!);
      const diff = Math.round((prev.getTime() - curr.getTime()) / 86_400_000);
      if (diff === 1) { current++; prev = curr; } else break;
    }
  }

  const asc = [...sorted].reverse();
  let longest = sorted.length > 0 ? 1 : 0;
  let run = 1;
  for (let i = 1; i < asc.length; i++) {
    const prev = new Date(asc[i - 1]!);
    const curr = new Date(asc[i]!);
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) { run++; if (run > longest) longest = run; } else run = 1;
  }
  return { current, longest };
}

type BlockRow = {
  focus_rating: number;
  completed: boolean;
  ended_at: string;
  time_bucket: string | null;
  focus_duration_sec: number;
};

/**
 * Full reward formula (matches lib/recommendation/reward.ts).
 * Used here to keep the stats route self-contained without a type-cast to FocusBlock.
 */
function blockReward(b: BlockRow): number {
  const fatiguePenalty = ((b.focus_duration_sec - 1500) / 1800) * 0.1;
  const r = 0.6 * (b.completed ? 1 : 0) + 0.4 * (b.focus_rating / 5) - fatiguePenalty;
  return Math.max(0, Math.min(1, r));
}

/**
 * Rhythm Score: rolling average reward of the last RHYTHM_WINDOW blocks, scaled to 0–100.
 * Returns { score: number | null, delta: number | null }.
 *   score — present when ≥ 2 blocks exist.
 *   delta — present when ≥ RHYTHM_WINDOW current blocks AND ≥ 2 prior blocks exist.
 *           Positive = improving, negative = declining.
 */
const RHYTHM_WINDOW = 7;

function computeRhythmScore(
  blocks: BlockRow[]
): { score: number | null; delta: number | null } {
  const recent = blocks.slice(0, RHYTHM_WINDOW);
  const older  = blocks.slice(RHYTHM_WINDOW, RHYTHM_WINDOW * 2);

  if (recent.length < 2) return { score: null, delta: null };

  const recentAvg = recent.reduce((s, b) => s + blockReward(b), 0) / recent.length;
  const score = Math.round(recentAvg * 100);

  if (recent.length < RHYTHM_WINDOW || older.length < 2) {
    return { score, delta: null };
  }

  const olderAvg = older.reduce((s, b) => s + blockReward(b), 0) / older.length;
  const delta = Math.round((recentAvg - olderAvg) * 100);
  return { score, delta };
}

function weekSummary(blocks: BlockRow[]) {
  const count = blocks.length;
  if (count === 0) return { count: 0, completion_rate: 0, avg_rating: 0, best_duration_sec: null };

  const completedCount = blocks.filter((b) => b.completed).length;
  const completionRate = completedCount / count;
  const avgRating = blocks.reduce((s, b) => s + b.focus_rating, 0) / count;

  // Best duration by avg score
  const durationMap: Record<number, { sum: number; count: number }> = {};
  for (const b of blocks) {
    const d = b.focus_duration_sec;
    if (!durationMap[d]) durationMap[d] = { sum: 0, count: 0 };
    durationMap[d]!.sum += 0.6 * (b.completed ? 1 : 0) + 0.4 * (b.focus_rating / 5);
    durationMap[d]!.count++;
  }
  let bestDur: number | null = null;
  let bestDurScore = -1;
  for (const [dur, { sum, count: c }] of Object.entries(durationMap)) {
    const score = sum / c;
    if (score > bestDurScore) { bestDurScore = score; bestDur = Number(dur); }
  }

  return {
    count,
    completion_rate: Math.round(completionRate * 100) / 100,
    avg_rating: Math.round(avgRating * 100) / 100,
    best_duration_sec: bestDur,
  };
}

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  const supabase = createAdminClient();

  // Fetch all focus blocks + user's current daily goal in parallel
  const [blocksResult, prefsResult] = await Promise.all([
    supabase
      .from("focus_blocks")
      .select("focus_rating, completed, ended_at, time_bucket, focus_duration_sec")
      .eq("user_id", user.id)
      .order("ended_at", { ascending: false }),
    supabase
      .from("user_pomodoro_prefs")
      .select("daily_session_goal")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (blocksResult.error) {
    return errorResponse("db_error", blocksResult.error.message, 500);
  }

  const list: BlockRow[] = blocksResult.data ?? [];
  const dailyGoal: number = prefsResult.data?.daily_session_goal ?? 2;

  // ── Core stats ────────────────────────────────────────────────────────────
  const totalSessions = list.length;
  const completedCount = list.filter((b) => b.completed).length;
  const completionRate = totalSessions > 0 ? completedCount / totalSessions : 0;
  const avgFocusRating =
    totalSessions > 0
      ? list.reduce((sum, b) => sum + b.focus_rating, 0) / totalSessions
      : 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sessionsLast7Days = list.filter(
    (b) => b.ended_at && b.ended_at >= sevenDaysAgo
  ).length;

  // ── Streak (Feature 8) ────────────────────────────────────────────────────
  const { current: currentStreak, longest: longestStreak } = computeStreak(list);

  // ── Time-of-day (Feature 7) ────────────────────────────────────────────────
  const bucketAccum: Record<TimeBucket, { sum: number; count: number }> = {
    morning: { sum: 0, count: 0 },
    afternoon: { sum: 0, count: 0 },
    evening: { sum: 0, count: 0 },
    night: { sum: 0, count: 0 },
  };
  for (const block of list) {
    const bucket = block.time_bucket as TimeBucket;
    if (!bucket || !TIME_BUCKETS.includes(bucket)) continue;
    const score = 0.6 * (block.completed ? 1 : 0) + 0.4 * (block.focus_rating / 5);
    bucketAccum[bucket].sum += score;
    bucketAccum[bucket].count++;
  }
  const timeBucketScores: Record<TimeBucket, number | null> = {
    morning: bucketAccum.morning.count > 0 ? bucketAccum.morning.sum / bucketAccum.morning.count : null,
    afternoon: bucketAccum.afternoon.count > 0 ? bucketAccum.afternoon.sum / bucketAccum.afternoon.count : null,
    evening: bucketAccum.evening.count > 0 ? bucketAccum.evening.sum / bucketAccum.evening.count : null,
    night: bucketAccum.night.count > 0 ? bucketAccum.night.sum / bucketAccum.night.count : null,
  };
  let bestTimeBucket: TimeBucket | null = null;
  let bestBucketScore = -1;
  for (const bucket of TIME_BUCKETS) {
    const s = timeBucketScores[bucket];
    if (s !== null && s > bestBucketScore) { bestBucketScore = s; bestTimeBucket = bucket; }
  }

  // ── Performance trend (Feature 9) ─────────────────────────────────────────
  const recentTrend = list
    .slice(0, 14)
    .map((b) => 0.6 * (b.completed ? 1 : 0) + 0.4 * (b.focus_rating / 5))
    .reverse();

  // ── Goal Intelligence (Feature 12) ────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const sessionsToday = list.filter((b) => b.ended_at.slice(0, 10) === todayStr).length;

  // How many of the last 7 days did the user hit their goal?
  let goalHitDays = 0;
  for (let i = 0; i < 7; i++) {
    const dayStr = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const count = list.filter((b) => b.ended_at.slice(0, 10) === dayStr).length;
    if (count >= dailyGoal) goalHitDays++;
  }

  // Suggest goal adjustment: if they've hit goal every day for 7 days, suggest +1
  const goalSuggestion: number | null =
    goalHitDays === 7 ? dailyGoal + 1 :
    goalHitDays === 0 && totalSessions >= 7 ? Math.max(1, dailyGoal - 1) :
    null;

  // ── Rhythm Score ─────────────────────────────────────────────────────────
  const { score: rhythmScore, delta: rhythmScoreDelta } = computeRhythmScore(list);

  // ── Weekly Summary (Feature 13) ───────────────────────────────────────────
  const now = Date.now();
  const weekStart = new Date(now - 7 * 86_400_000).toISOString();
  const twoWeeksStart = new Date(now - 14 * 86_400_000).toISOString();

  const thisWeekBlocks = list.filter((b) => b.ended_at >= weekStart);
  const lastWeekBlocks = list.filter(
    (b) => b.ended_at >= twoWeeksStart && b.ended_at < weekStart
  );

  return okResponse({
    // Core
    total_sessions: totalSessions,
    completion_rate: Math.round(completionRate * 100) / 100,
    avg_focus_rating: Math.round(avgFocusRating * 100) / 100,
    sessions_last_7_days: sessionsLast7Days,
    // Streak
    current_streak: currentStreak,
    longest_streak: longestStreak,
    // Time-of-day
    best_time_bucket: bestTimeBucket,
    time_bucket_scores: timeBucketScores,
    // Trend
    recent_trend: recentTrend,
    // Goal intelligence
    daily_goal: dailyGoal,
    sessions_today: sessionsToday,
    goal_hit_days: goalHitDays,
    goal_suggestion: goalSuggestion,
    // Weekly summary
    week_this: weekSummary(thisWeekBlocks),
    week_last: weekSummary(lastWeekBlocks),
    // Rhythm Score
    rhythm_score: rhythmScore,
    rhythm_score_delta: rhythmScoreDelta,
  });
}
