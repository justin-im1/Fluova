import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDayOfWeek, getTimeBucket } from "@/lib/domain/time";
import type { TimeBucket } from "@/lib/domain/time";
import { computeRecommendation } from "@/lib/recommendation/engine";
import { computeRewardV1 } from "@/lib/recommendation/reward";
import { buildRecommendationChangeDiff } from "@/lib/recommendation/diff";
import type { FocusBlock, BreakOutcome, SessionType } from "@/lib/domain/types";
import { VALID_SESSION_TYPES } from "@/lib/domain/types";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "";
const ML_SERVICE_SECRET = process.env.ML_SERVICE_SECRET ?? "";

const FOCUS_MIN_TO_ARM_ID: Record<number, string> = {
  25: "recovery",
  35: "standard",
  45: "deep_45",
  55: "deep_55",
};

const VALID_BUCKETS = new Set<string>(["morning", "afternoon", "evening", "night"]);
const VALID_BREAK_OUTCOMES = new Set<string>(["completed", "skipped", "shortened"]);

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  let body: {
    session_id: string;
    completed: boolean;
    focus_rating: 1 | 2 | 3 | 4 | 5;
    time_bucket?: string;
    break_outcome?: string;
    break_duration_sec_actual?: number;
    fatigue_rating?: number;
    note?: string;
    distraction_count?: number;
    recommendation_fit?: boolean;
    actual_focus_minutes?: number;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_body", "Invalid JSON body", 400);
  }

  const { session_id, completed, focus_rating } = body;
  if (
    !session_id ||
    typeof completed !== "boolean" ||
    !Number.isInteger(focus_rating) ||
    focus_rating < 1 ||
    focus_rating > 5
  ) {
    return errorResponse(
      "invalid_body",
      "session_id, completed, and focus_rating (1-5) required",
      400
    );
  }

  const fatigueRating: number | null =
    Number.isInteger(body.fatigue_rating) &&
    (body.fatigue_rating as number) >= 1 &&
    (body.fatigue_rating as number) <= 5
      ? (body.fatigue_rating as number)
      : null;

  const note: string | null =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim().slice(0, 280)
      : null;

  const distractionCount: number | null =
    Number.isInteger(body.distraction_count) && (body.distraction_count as number) >= 0
      ? (body.distraction_count as number)
      : null;

  const recommendationFit: boolean | null =
    typeof body.recommendation_fit === "boolean" ? body.recommendation_fit : null;

  const actualFocusMinutes: number | null =
    typeof body.actual_focus_minutes === "number" &&
    Number.isFinite(body.actual_focus_minutes) &&
    body.actual_focus_minutes > 0
      ? body.actual_focus_minutes
      : null;

  const breakOutcome: BreakOutcome | null =
    body.break_outcome && VALID_BREAK_OUTCOMES.has(body.break_outcome)
      ? (body.break_outcome as BreakOutcome)
      : null;

  const breakDurationSecActual: number | null =
    typeof body.break_duration_sec_actual === "number" &&
    body.break_duration_sec_actual >= 0
      ? body.break_duration_sec_actual
      : null;

  const supabase = createAdminClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, user_id, status, started_at, ended_at, focus_duration_sec, session_type, recommendation_event_id")
    .eq("id", session_id)
    .single();

  if (sessionError || !session) {
    return errorResponse("not_found", "Session not found", 404);
  }

  if (session.user_id !== user.id) {
    return errorResponse("forbidden", "Session does not belong to user", 403);
  }

  if (session.status !== "ended") {
    return errorResponse("invalid_state", "Session must be ended first", 400);
  }

  const endedAt = session.ended_at as string;
  const dayOfWeek = getDayOfWeek(endedAt);
  // Prefer the client-supplied bucket (local time) over the UTC-derived fallback.
  const timeBucket: TimeBucket =
    body.time_bucket && VALID_BUCKETS.has(body.time_bucket)
      ? (body.time_bucket as TimeBucket)
      : getTimeBucket(endedAt);

  const { data: block, error: insertError } = await supabase
    .from("focus_blocks")
    .insert({
      user_id: user.id,
      session_id: session_id,
      focus_duration_sec: session.focus_duration_sec,
      completed,
      focus_rating,
      started_at: session.started_at,
      ended_at: endedAt,
      day_of_week: dayOfWeek,
      time_bucket: timeBucket,
      session_type: session.session_type ?? null,
      break_outcome: breakOutcome,
      break_duration_sec_actual: breakDurationSecActual,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[focus-blocks/complete] Failed to insert block:", insertError.message);
    return errorResponse("db_error", "Failed to complete session", 500);
  }

  // Compute reward_v1.
  // actual_focus_minutes: use provided value or derive from session timestamps.
  const effectiveActualMinutes =
    actualFocusMinutes ??
    Math.round(
      (new Date(endedAt).getTime() - new Date(session.started_at as string).getTime()) /
        60_000
    );
  const plannedFocusMinutes = session.focus_duration_sec / 60;
  const completionFraction = Math.min(
    effectiveActualMinutes / Math.max(plannedFocusMinutes, 1),
    1.0
  );
  const effectiveFatigue = fatigueRating ?? focus_rating;
  const rewardVersion = fatigueRating !== null ? "reward_v1" : "reward_v1_no_fatigue";
  const { value: rewardValue } = computeRewardV1({
    completed,
    actual_focus_minutes: effectiveActualMinutes,
    planned_focus_minutes: plannedFocusMinutes,
    focus_rating,
    fatigue_rating: effectiveFatigue,
  });

  // Fire-and-forget LinUCB online update (2 s timeout).
  // Idempotency: the focus_block INSERT above has a unique constraint on session_id,
  // so this code path can only be reached once per session. No deduplication needed.
  if (ML_SERVICE_URL && session.recommendation_event_id) {
    void (async () => {
      try {
        const recResult = await supabase
          .from("recommendation_events")
          .select("context_snapshot, recommended_focus_minutes, policy_type")
          .eq("id", session.recommendation_event_id)
          .single();

        const rec = recResult.data;
        if (rec?.context_snapshot && rec.policy_type === "linucb") {
          const focusMin = Math.round(session.focus_duration_sec / 60);
          const armId = FOCUS_MIN_TO_ARM_ID[focusMin] ?? "standard";
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2000);
          await fetch(`${ML_SERVICE_URL}/update`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(ML_SERVICE_SECRET ? { "x-admin-api-key": ML_SERVICE_SECRET } : {}),
            },
            body: JSON.stringify({
              arm_id: armId,
              context_snapshot: rec.context_snapshot,
              reward: rewardValue,
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);
        }
      } catch {
        // Non-fatal — reward is in DB and can be replayed.
      }
    })();
  }

  // Write feedback + reward fields to sessions in one update.
  const { error: sessionUpdateError } = await supabase
    .from("sessions")
    .update({
      reward_value: rewardValue,
      reward_version: rewardVersion,
      completion_fraction: completionFraction,
      actual_focus_minutes: effectiveActualMinutes,
      ...(fatigueRating !== null && { fatigue_rating_post: fatigueRating }),
      ...(note !== null && { note }),
      ...(distractionCount !== null && { distraction_count_post: distractionCount }),
      ...(recommendationFit !== null && { recommendation_fit: recommendationFit }),
    })
    .eq("id", session_id)
    .eq("user_id", user.id);

  if (sessionUpdateError) {
    console.error("[focus-blocks/complete] Failed to save session feedback:", sessionUpdateError.message);
    return errorResponse("db_error", "Failed to save session feedback", 500);
  }

  // Fetch current prefs BEFORE computing the new recommendation so we can
  // diff old vs new and generate a change explanation.
  const [{ data: currentPrefs }, { data: existingBlocks }] = await Promise.all([
    supabase
      .from("user_pomodoro_prefs")
      .select("best_focus_duration_sec, best_break_duration_sec")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("focus_blocks")
      .select("*")
      .eq("user_id", user.id)
      .order("ended_at", { ascending: false })
      .limit(12),
  ]);

  const blocksForRec = (existingBlocks ?? []).map((b) => ({
    ...b,
    focus_rating: b.focus_rating as number,
    completed: b.completed as boolean,
  })) as FocusBlock[];

  // Pass the session's own time bucket and session type so the engine uses
  // type-specific data when computing the post-recap recommendation.
  const sessionTypeForRec: SessionType | undefined =
    session.session_type && VALID_SESSION_TYPES.has(session.session_type)
      ? (session.session_type as SessionType)
      : undefined;

  const rec = computeRecommendation(blocksForRec, timeBucket, sessionTypeForRec);

  // Generate diff explanation comparing old persisted values vs the new rec.
  const changeExplanation = buildRecommendationChangeDiff(
    currentPrefs?.best_focus_duration_sec ?? null,
    currentPrefs?.best_break_duration_sec ?? null,
    rec
  );

  await supabase.from("user_pomodoro_prefs").upsert(
    {
      user_id: user.id,
      best_focus_duration_sec: rec.recommended_focus_duration_sec,
      best_break_duration_sec: rec.recommended_break_duration_sec,
      model_version: rec.model_version,
      updated_at: new Date().toISOString(),
      recommendation_change_explanation: changeExplanation,
    },
    { onConflict: "user_id" }
  );

  const result: FocusBlock = {
    id: block!.id,
    user_id: block!.user_id,
    session_id: block!.session_id,
    focus_duration_sec: block!.focus_duration_sec,
    completed: block!.completed,
    focus_rating: block!.focus_rating,
    started_at: block!.started_at,
    ended_at: block!.ended_at,
    day_of_week: block!.day_of_week,
    time_bucket: block!.time_bucket,
    session_type: block!.session_type ?? null,
    break_outcome: block!.break_outcome ?? null,
    break_duration_sec_actual: block!.break_duration_sec_actual ?? null,
  };

  return okResponse({ focus_block: result });
}
