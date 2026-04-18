import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeRecommendation } from "@/lib/recommendation/engine";
import type { FocusBlock, SessionType } from "@/lib/domain/types";
import { VALID_SESSION_TYPES } from "@/lib/domain/types";
import type { TimeBucket } from "@/lib/domain/time";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

const VALID_BUCKETS = new Set<TimeBucket>(["morning", "afternoon", "evening", "night"]);

export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  const params = request.nextUrl.searchParams;

  // Client passes their local time bucket so the engine can weight by time-of-day.
  const rawBucket = params.get("bucket");
  const currentBucket: TimeBucket | undefined =
    rawBucket && VALID_BUCKETS.has(rawBucket as TimeBucket)
      ? (rawBucket as TimeBucket)
      : undefined;

  // Optional session type for type-specific recommendation.
  const rawType = params.get("session_type");
  const sessionType: SessionType | undefined =
    rawType && VALID_SESSION_TYPES.has(rawType)
      ? (rawType as SessionType)
      : undefined;

  const supabase = createAdminClient();

  // Fetch focus blocks and stored prefs (for change explanation) in parallel.
  const [blocksResult, prefsResult] = await Promise.all([
    supabase
      .from("focus_blocks")
      .select("*")
      .eq("user_id", user.id)
      .order("ended_at", { ascending: false })
      .limit(12),
    supabase
      .from("user_pomodoro_prefs")
      .select("recommendation_change_explanation")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (blocksResult.error) {
    return errorResponse("db_error", blocksResult.error.message, 500);
  }

  const blocksForRec = (blocksResult.data ?? []).map((b) => ({
    ...b,
    focus_rating: b.focus_rating as number,
    completed: b.completed as boolean,
  })) as FocusBlock[];

  const recommendation = computeRecommendation(blocksForRec, currentBucket, sessionType);

  return okResponse({
    ...recommendation,
    recommendation_change:
      prefsResult.data?.recommendation_change_explanation ?? null,
  });
}
