import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Session } from "@/lib/domain/types";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  let body: { focus_duration_sec: number; break_duration_sec: number };
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

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Ensure profile exists (sessions references profiles)
  await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: null }, { onConflict: "id" });

  // End any existing active session
  await supabase
    .from("sessions")
    .update({ status: "ended", ended_at: now })
    .eq("user_id", user.id)
    .eq("status", "active");

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      status: "active",
      focus_duration_sec,
      break_duration_sec,
      started_at: now,
    })
    .select()
    .single();

  if (error) {
    return errorResponse("db_error", error.message, 500);
  }

  const result: Session = {
    id: session.id,
    user_id: session.user_id,
    status: session.status,
    focus_duration_sec: session.focus_duration_sec,
    break_duration_sec: session.break_duration_sec,
    started_at: session.started_at,
    ended_at: session.ended_at,
  };

  return okResponse({ session: result });
}
