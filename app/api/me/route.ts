import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserProfile } from "@/lib/domain/types";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  const supabase = createAdminClient();

  const { data: profile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, display_name, created_at")
    .eq("id", user.id)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("[me] Failed to fetch profile:", fetchError.message);
    return errorResponse("db_error", "Failed to fetch profile", 500);
  }

  if (!profile) {
    const { data: newProfile, error: insertError } = await supabase
      .from("profiles")
      .insert({ id: user.id, display_name: null })
      .select("id, display_name, created_at")
      .single();

    if (insertError) {
      console.error("[me] Failed to create profile:", insertError.message);
      return errorResponse("db_error", "Failed to fetch profile", 500);
    }

    const result: UserProfile = {
      id: newProfile!.id,
      display_name: newProfile!.display_name,
      created_at: newProfile!.created_at,
    };
    return okResponse({ profile: result });
  }

  const result: UserProfile = {
    id: profile.id,
    display_name: profile.display_name,
    created_at: profile.created_at,
  };
  return okResponse({ profile: result });
}

/**
 * PATCH /api/me
 * Body: { daily_session_goal: number }
 * Updates the user's daily session goal in user_pomodoro_prefs.
 */
export async function PATCH(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  let body: { daily_session_goal?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_body", "Invalid JSON body", 400);
  }

  const { daily_session_goal } = body;
  if (
    daily_session_goal === undefined ||
    !Number.isInteger(daily_session_goal) ||
    daily_session_goal < 1 ||
    daily_session_goal > 10
  ) {
    return errorResponse(
      "invalid_body",
      "daily_session_goal must be an integer between 1 and 10",
      400
    );
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("user_pomodoro_prefs")
    .upsert(
      { user_id: user.id, daily_session_goal, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[me] Failed to update prefs:", error.message);
    return errorResponse("db_error", "Failed to update settings", 500);
  }

  return okResponse({ daily_session_goal });
}
