import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  let body: {
    recommendation_event_id: string;
    chosen_focus_minutes: number;
    chosen_break_minutes: number;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_body", "Invalid JSON body", 400);
  }

  const { recommendation_event_id, chosen_focus_minutes, chosen_break_minutes } = body;

  if (
    !recommendation_event_id ||
    typeof recommendation_event_id !== "string" ||
    typeof chosen_focus_minutes !== "number" ||
    typeof chosen_break_minutes !== "number"
  ) {
    return errorResponse(
      "invalid_body",
      "recommendation_event_id, chosen_focus_minutes, and chosen_break_minutes required",
      400
    );
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("recommendation_events")
    .update({
      accepted: false,
      overridden: true,
      override_focus_minutes: Math.round(chosen_focus_minutes),
    })
    .eq("id", recommendation_event_id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[recommendation/override] Failed to record override:", error.message);
    return errorResponse("db_error", "Failed to record override", 500);
  }

  return okResponse({});
}
