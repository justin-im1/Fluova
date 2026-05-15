import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "";
const ML_SERVICE_SECRET = process.env.ML_SERVICE_SECRET ?? "";

const FOCUS_MIN_TO_ARM_ID: Record<number, string> = {
  25: "recovery",
  35: "standard",
  45: "deep_45",
  55: "deep_55",
};

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

  // Guard: reject if the session was already started or the recommendation is older than 1 hour.
  const { data: existing } = await supabase
    .from("recommendation_events")
    .select("accepted, overridden, shown_at")
    .eq("id", recommendation_event_id)
    .eq("user_id", user.id)
    .single();

  if (!existing) {
    return errorResponse("not_found", "Recommendation event not found", 404);
  }
  if (existing.accepted) {
    return errorResponse("invalid_state", "Session already started — cannot override", 409);
  }
  if (existing.overridden) {
    return errorResponse("invalid_state", "Recommendation already overridden", 409);
  }
  const ageMs = Date.now() - new Date(existing.shown_at as string).getTime();
  if (ageMs > 60 * 60 * 1000) {
    return errorResponse("stale_event", "Recommendation can no longer be overridden", 409);
  }

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

  // Fire-and-forget: send a low reward to LinUCB so the rejected arm learns from this signal.
  if (ML_SERVICE_URL) {
    void (async () => {
      try {
        const { data: rec } = await supabase
          .from("recommendation_events")
          .select("context_snapshot, policy_type, recommended_focus_minutes")
          .eq("id", recommendation_event_id)
          .eq("user_id", user.id)
          .single();

        if (rec?.context_snapshot && rec.policy_type === "linucb") {
          const armId = FOCUS_MIN_TO_ARM_ID[rec.recommended_focus_minutes] ?? "standard";
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2000);
          await fetch(`${ML_SERVICE_URL}/update`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(ML_SERVICE_SECRET ? { "x-admin-api-key": ML_SERVICE_SECRET } : {}),
            },
            body: JSON.stringify({
              arm_id: armId,
              context_snapshot: rec.context_snapshot,
              reward: 0.1,
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);
        }
      } catch {
        // Non-fatal.
      }
    })();
  }

  return okResponse({});
}
