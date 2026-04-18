import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDayOfWeek, getTimeBucket } from "@/lib/domain/time";
import type { TimeBucket } from "@/lib/domain/time";
import { computeRecommendation } from "@/lib/recommendation/engine";
import { buildRecommendationChangeDiff } from "@/lib/recommendation/diff";
import type { FocusBlock, BreakOutcome, SessionType } from "@/lib/domain/types";
import { VALID_SESSION_TYPES } from "@/lib/domain/types";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

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
    /** Client-supplied local time bucket — avoids UTC timezone mismatch. */
    time_bucket?: string;
    /** Break outcome from the guided break screen. */
    break_outcome?: string;
    /** Actual break duration taken in seconds (0 if skipped). */
    break_duration_sec_actual?: number;
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
    .select("id, user_id, status, started_at, ended_at, focus_duration_sec, session_type")
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
    return errorResponse("db_error", insertError.message, 500);
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
