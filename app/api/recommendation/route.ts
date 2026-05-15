import { getServerUser } from "@/lib/auth/getServerUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeRecommendation } from "@/lib/recommendation/engine";
import { buildContextSnapshot } from "@/lib/recommendation/context";
import { buildExplanationPayload } from "@/lib/recommendation/explanation";
import { FOCUS_ARMS_SEC } from "@/lib/recommendation/features";
import type { FocusBlock, SessionType, AlternateOption, ConfidenceLevel } from "@/lib/domain/types";
import { VALID_SESSION_TYPES } from "@/lib/domain/types";
import type { TimeBucket } from "@/lib/domain/time";
import { okResponse, errorResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "";
const ML_SERVICE_SECRET = process.env.ML_SERVICE_SECRET ?? "";

const PRD_ARM_MAP: Record<string, { focusSec: number; breakSec: number; mode: string }> = {
  recovery: { focusSec: 1500, breakSec: 300,  mode: "recovery" },
  standard: { focusSec: 2100, breakSec: 300,  mode: "standard" },
  deep_45:  { focusSec: 2700, breakSec: 600,  mode: "deep" },
  deep_55:  { focusSec: 3300, breakSec: 600,  mode: "deep" },
};

type LinUCBResult = {
  arm_id: string;
  focus_minutes: number;
  break_minutes: number;
  mode: string;
  propensity: number;
  exploration_flag: boolean;
  confidence_level: ConfidenceLevel;
};

async function tryLinUCB(
  userId: string,
  contextSnapshot: ReturnType<typeof buildContextSnapshot>,
  sessionCount: number
): Promise<LinUCBResult | null> {
  if (!ML_SERVICE_URL) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 250);

  try {
    const res = await fetch(`${ML_SERVICE_URL}/recommend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ML_SERVICE_SECRET ? { "x-admin-api-key": ML_SERVICE_SECRET } : {}),
      },
      body: JSON.stringify({
        user_id: userId,
        context_snapshot: contextSnapshot,
        session_count: sessionCount,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[recommendation] LinUCB returned ${res.status}`);
      return null;
    }
    const data = await res.json();

    if (!data.arm_id || !PRD_ARM_MAP[data.arm_id]) return null;
    return data as LinUCBResult;
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (!isAbort) {
      console.warn("[recommendation] LinUCB request failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const VALID_BUCKETS = new Set<TimeBucket>(["morning", "afternoon", "evening", "night"]);

const ARM_MODE: Record<number, string> = {
  1500: "recovery",
  1800: "standard",
  2100: "standard",
  2400: "standard",
  2700: "deep",
  3000: "deep",
  3300: "deep",
};

function getBreakForArm(focusSec: number): number {
  if (focusSec <= 1800) return 300;
  if (focusSec <= 2700) return 480;
  return 600;
}

function buildAlternateOptions(recommendedFocusSec: number): AlternateOption[] {
  const arms = [...FOCUS_ARMS_SEC] as number[];
  const idx = arms.indexOf(recommendedFocusSec);
  if (idx === -1) return [];

  const shorter = idx > 0 ? arms[idx - 1] : null;
  const longer = idx < arms.length - 1 ? arms[idx + 1] : null;

  const options: AlternateOption[] = [];

  if (shorter !== null) {
    options.push({
      focus_minutes: shorter / 60,
      break_minutes: getBreakForArm(shorter) / 60,
      mode: ARM_MODE[shorter] ?? "standard",
      label: "Shorter option",
    });
  }
  if (longer !== null) {
    options.push({
      focus_minutes: longer / 60,
      break_minutes: getBreakForArm(longer) / 60,
      mode: ARM_MODE[longer] ?? "standard",
      label: "Longer option",
    });
  }

  // At the min edge: add a second longer option; at max edge: add a second shorter option
  if (shorter === null && idx + 2 < arms.length) {
    options.push({
      focus_minutes: arms[idx + 2] / 60,
      break_minutes: getBreakForArm(arms[idx + 2]) / 60,
      mode: ARM_MODE[arms[idx + 2]] ?? "standard",
      label: "Extended option",
    });
  }
  if (longer === null && idx - 2 >= 0) {
    options.unshift({
      focus_minutes: arms[idx - 2] / 60,
      break_minutes: getBreakForArm(arms[idx - 2]) / 60,
      mode: ARM_MODE[arms[idx - 2]] ?? "standard",
      label: "Light option",
    });
  }

  return options.slice(0, 2);
}

export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }

  const params = request.nextUrl.searchParams;

  const rawBucket = params.get("bucket");
  const currentBucket: TimeBucket | undefined =
    rawBucket && VALID_BUCKETS.has(rawBucket as TimeBucket)
      ? (rawBucket as TimeBucket)
      : undefined;

  const rawType = params.get("session_type");
  const sessionType: SessionType | undefined =
    rawType && VALID_SESSION_TYPES.has(rawType)
      ? (rawType as SessionType)
      : undefined;

  const rawHour = params.get("hour_of_day");
  const clientHourOfDay: number | null =
    rawHour !== null && Number.isInteger(Number(rawHour)) && Number(rawHour) >= 0 && Number(rawHour) <= 23
      ? Number(rawHour)
      : null;

  const rawDate = params.get("date");
  const clientDateStr: string | null =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

  const supabase = createAdminClient();

  const [blocksResult, prefsResult, sessionsResult, countResult] = await Promise.all([
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
    supabase
      .from("sessions")
      .select("fatigue_rating_post")
      .eq("user_id", user.id)
      .not("fatigue_rating_post", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("focus_blocks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  if (blocksResult.error) {
    console.error("[recommendation] Failed to fetch blocks:", blocksResult.error.message);
    return errorResponse("db_error", "Failed to compute recommendation", 500);
  }

  const blocksForRec = (blocksResult.data ?? []).map((b) => ({
    ...b,
    focus_rating: b.focus_rating as number,
    completed: b.completed as boolean,
  })) as FocusBlock[];

  const recentFatigue = (sessionsResult.data ?? []).map(
    (s) => s.fatigue_rating_post as number | null
  );

  const totalSessionCount = countResult.count ?? blocksForRec.length;

  const heuristicRec = computeRecommendation(blocksForRec, currentBucket, sessionType);

  // Energy/distraction are not yet available at recommendation time — passed null.
  const contextSnapshot = buildContextSnapshot(
    blocksForRec,
    null,
    null,
    sessionType ?? null,
    recentFatigue,
    undefined,
    clientHourOfDay,
    clientDateStr
  );

  // Try LinUCB first; fall back to heuristic on failure or timeout.
  const linucbResult = await tryLinUCB(user.id, contextSnapshot, totalSessionCount);

  let recommendation = heuristicRec;
  let policyType: "linucb" | "heuristic" = "heuristic";
  let propensity = 1.0;
  let explorationFlag = false;

  if (linucbResult) {
    const arm = PRD_ARM_MAP[linucbResult.arm_id];
    recommendation = {
      ...heuristicRec,
      recommended_focus_duration_sec: arm.focusSec,
      recommended_break_duration_sec: arm.breakSec,
      confidence_level: linucbResult.confidence_level,
    };
    policyType = "linucb";
    propensity = linucbResult.propensity;
    explorationFlag = linucbResult.exploration_flag;
  }

  const explanationPayload = buildExplanationPayload(recommendation, contextSnapshot);
  const alternateOptions = buildAlternateOptions(recommendation.recommended_focus_duration_sec);

  // Log recommendation event. Awaited to get the ID, but failure is non-fatal.
  let recommendationEventId: string | null = null;
  try {
    const { data: recEvent } = await supabase
      .from("recommendation_events")
      .insert({
        user_id: user.id,
        recommended_focus_minutes: Math.round(
          recommendation.recommended_focus_duration_sec / 60
        ),
        recommended_break_minutes: Math.round(
          recommendation.recommended_break_duration_sec / 60
        ),
        session_mode: linucbResult?.mode ?? null,
        policy_version: recommendation.model_version,
        policy_type: policyType,
        model_version: linucbResult ? "linucb_v1" : null,
        propensity,
        exploration_flag: explorationFlag,
        explanation_payload: explanationPayload,
        context_snapshot: contextSnapshot,
      })
      .select("id")
      .single();

    if (recEvent?.id) {
      recommendationEventId = recEvent.id;
    }
  } catch (err) {
    console.warn("[recommendation] Failed to log recommendation_event:", err);
    // Non-fatal — recommendation is still served even if event logging fails.
  }

  return okResponse({
    ...recommendation,
    recommendation_change:
      prefsResult.data?.recommendation_change_explanation ?? null,
    recommendation_event_id: recommendationEventId,
    explanation_payload: explanationPayload,
    alternate_options: alternateOptions,
  });
}
