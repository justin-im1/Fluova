import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeRecommendation } from "@/lib/recommendation/engine";
import type { FocusBlock } from "@/lib/domain/types";
import { okResponse, errorResponse } from "@/lib/api/response";

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  const supabase = createAdminClient();

  const { data: blocks, error } = await supabase
    .from("focus_blocks")
    .select("*")
    .eq("user_id", user.id)
    .order("ended_at", { ascending: false })
    .limit(12);

  if (error) {
    return errorResponse("db_error", error.message, 500);
  }

  const blocksForRec = (blocks ?? []).map((b) => ({
    ...b,
    focus_rating: b.focus_rating as number,
    completed: b.completed as boolean,
  })) as FocusBlock[];

  const recommendation = computeRecommendation(blocksForRec);

  return okResponse(recommendation);
}
