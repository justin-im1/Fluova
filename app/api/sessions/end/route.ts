import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  let body: { session_id: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_body", "Invalid JSON body", 400);
  }

  const { session_id } = body;
  if (!session_id || typeof session_id !== "string") {
    return errorResponse("invalid_body", "session_id required", 400);
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: session, error: fetchError } = await supabase
    .from("sessions")
    .select("id, user_id, status")
    .eq("id", session_id)
    .single();

  if (fetchError || !session) {
    return errorResponse("not_found", "Session not found", 404);
  }

  if (session.user_id !== user.id) {
    return errorResponse("forbidden", "Session does not belong to user", 403);
  }

  if (session.status !== "active") {
    return errorResponse("invalid_state", "Session is not active", 400);
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({ status: "ended", ended_at: now })
    .eq("id", session_id);

  if (updateError) {
    return errorResponse("db_error", updateError.message, 500);
  }

  return okResponse({});
}
