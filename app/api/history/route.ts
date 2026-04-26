import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? "50", 10) || 50,
    100
  );

  const supabase = createAdminClient();

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (sessionsError) {
    console.error("[history] Failed to fetch sessions:", sessionsError.message);
    return errorResponse("db_error", "Failed to fetch history", 500);
  }

  const { data: blocks, error: blocksError } = await supabase
    .from("focus_blocks")
    .select("*")
    .eq("user_id", user.id)
    .order("ended_at", { ascending: false })
    .limit(limit);

  if (blocksError) {
    console.error("[history] Failed to fetch blocks:", blocksError.message);
    return errorResponse("db_error", "Failed to fetch history", 500);
  }

  return okResponse({
    sessions: sessions ?? [],
    focus_blocks: blocks ?? [],
  });
}
