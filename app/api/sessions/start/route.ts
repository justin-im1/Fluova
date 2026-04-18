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

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Ensure profile exists (sessions references profiles)
  await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: null }, { onConflict: "id" });

  // End any existing active session, then insert the new one.
  // The partial unique index (user_id WHERE status='active') enforces at most
  // one active session at the DB level, so we retry once on conflict.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sessionRow: any;

  for (let attempt = 0; attempt < 2; attempt++) {
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
      })
      .select()
      .single();

    if (!error && data) {
      sessionRow = data;
      break;
    }

    // Unique constraint violation — another request raced us. Retry once.
    if (error?.code === "23505" && attempt === 0) continue;

    return errorResponse("db_error", error?.message ?? "Unknown error", 500);
  }

  const session: Session = {
    id: sessionRow.id,
    user_id: sessionRow.user_id,
    status: sessionRow.status as Session["status"],
    focus_duration_sec: sessionRow.focus_duration_sec,
    break_duration_sec: sessionRow.break_duration_sec,
    session_type: sessionRow.session_type ?? null,
    started_at: sessionRow.started_at,
    ended_at: sessionRow.ended_at,
  };

  return okResponse({ session });
}
