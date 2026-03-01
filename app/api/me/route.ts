import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserProfile } from "@/lib/domain/types";
import { okResponse, errorResponse } from "@/lib/api/response";

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
    return errorResponse("db_error", fetchError.message, 500);
  }

  if (!profile) {
    const { data: newProfile, error: insertError } = await supabase
      .from("profiles")
      .insert({ id: user.id, display_name: null })
      .select("id, display_name, created_at")
      .single();

    if (insertError) {
      return errorResponse("db_error", insertError.message, 500);
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
