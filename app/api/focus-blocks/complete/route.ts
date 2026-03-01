import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDayOfWeek, getTimeBucket } from "@/lib/domain/time";
import { computeRecommendation } from "@/lib/recommendation/engine";
import type { FocusBlock } from "@/lib/domain/types";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  let body: { session_id: string; completed: boolean; focus_rating: 1 | 2 | 3 | 4 | 5 };
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

  const supabase = createAdminClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, user_id, status, started_at, ended_at, focus_duration_sec")
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
  const timeBucket = getTimeBucket(endedAt);

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
    })
    .select()
    .single();

  if (insertError) {
    return errorResponse("db_error", insertError.message, 500);
  }

  // Upsert user_pomodoro_prefs with recommendation
  const { data: existingBlocks } = await supabase
    .from("focus_blocks")
    .select("*")
    .eq("user_id", user.id)
    .order("ended_at", { ascending: false })
    .limit(12);

  const blocksForRec = (existingBlocks ?? []).map((b) => ({
    ...b,
    focus_rating: b.focus_rating as number,
    completed: b.completed as boolean,
  })) as FocusBlock[];

  const rec = computeRecommendation(blocksForRec);

  await supabase.from("user_pomodoro_prefs").upsert(
    {
      user_id: user.id,
      best_focus_duration_sec: rec.recommended_focus_duration_sec,
      best_break_duration_sec: rec.recommended_break_duration_sec,
      model_version: rec.model_version,
      updated_at: new Date().toISOString(),
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
  };

  return okResponse({ focus_block: result });
}
