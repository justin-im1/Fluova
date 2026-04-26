import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Session, SessionType } from "@/lib/domain/types";
import { VALID_SESSION_TYPES } from "@/lib/domain/types";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  let body: {
    focus_duration_sec: number;
    break_duration_sec: number;
    session_type?: string;
    energy_level_pre?: number;
    distraction_level_pre?: number;
    recommendation_event_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_body", "Invalid JSON body", 400);
  }

  const { focus_duration_sec, break_duration_sec } = body;
  if (
    typeof focus_duration_sec !== "number" ||
    typeof break_duration_sec !== "number"
  ) {
    return errorResponse("invalid_body", "focus_duration_sec and break_duration_sec required", 400);
  }

  const sessionType: SessionType | null =
    body.session_type && VALID_SESSION_TYPES.has(body.session_type)
      ? (body.session_type as SessionType)
      : null;

  const energyLevelPre: number | null =
    Number.isInteger(body.energy_level_pre) &&
    (body.energy_level_pre as number) >= 1 &&
    (body.energy_level_pre as number) <= 5
      ? (body.energy_level_pre as number)
      : null;

  const distractionLevelPre: number | null =
    Number.isInteger(body.distraction_level_pre) &&
    (body.distraction_level_pre as number) >= 1 &&
    (body.distraction_level_pre as number) <= 5
      ? (body.distraction_level_pre as number)
      : null;

  const recommendationEventId: string | null =
    typeof body.recommendation_event_id === "string" &&
    body.recommendation_event_id.length > 0
      ? body.recommendation_event_id
      : null;

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Ensure profile exists (sessions references profiles)
  await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: null }, { onConflict: "id" });

  type SessionRow = {
    id: string;
    user_id: string;
    status: string;
    focus_duration_sec: number;
    break_duration_sec: number;
    session_type: string | null;
    started_at: string;
    ended_at: string | null;
  };

  // End any existing active session, then insert the new one.
  // The partial unique index (user_id WHERE status='active') enforces at most
  // one active session at the DB level, so we retry up to 3 times on conflict.
  let sessionRow: SessionRow | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    await supabase
      .from("sessions")
      .update({ status: "ended", ended_at: now })
      .eq("user_id", user.id)
      .eq("status", "active");

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        user_id: user.id,
        status: "active",
        focus_duration_sec,
        break_duration_sec,
        session_type: sessionType,
        started_at: now,
        energy_level_pre: energyLevelPre,
        distraction_level_pre: distractionLevelPre,
        recommendation_event_id: recommendationEventId,
      })
      .select()
      .single();

    if (!error && data) {
      sessionRow = data as SessionRow;
      // Mark recommendation as accepted (fire-and-forget, non-fatal).
      if (recommendationEventId) {
        void supabase
          .from("recommendation_events")
          .update({ accepted: true })
          .eq("id", recommendationEventId)
          .eq("user_id", user.id)
          .then(() => {});
      }
      break;
    }

    // Unique constraint violation — another request raced us. Backoff and retry.
    if (error?.code === "23505" && attempt < 2) {
      await new Promise((r) => setTimeout(r, Math.random() * 80 * (attempt + 1)));
      continue;
    }

    console.error("[sessions/start] Insert failed after retries:", error?.message);
    return errorResponse("db_error", "Failed to create session", 500);
  }

  if (!sessionRow) {
    return errorResponse("db_error", "Failed to create session", 500);
  }

  const session: Session = {
    id: sessionRow.id,
    user_id: sessionRow.user_id,
    status: sessionRow.status as Session["status"],
    focus_duration_sec: sessionRow.focus_duration_sec,
    break_duration_sec: sessionRow.break_duration_sec,
    session_type: (sessionRow.session_type as Session["session_type"]) ?? null,
    started_at: sessionRow.started_at,
    ended_at: sessionRow.ended_at,
  };

  return okResponse({ session });
}
