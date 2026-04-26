export type UserProfile = {
  id: string;
  display_name: string | null;
  created_at: string;
};

export type SessionType =
  | "coding"
  | "reading"
  | "writing"
  | "studying"
  | "admin"
  | "deep_work"
  | "other";

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  coding:    "Coding",
  reading:   "Reading",
  writing:   "Writing",
  studying:  "Studying",
  admin:     "Admin",
  deep_work: "Deep Work",
  other:     "Other",
};

export const VALID_SESSION_TYPES = new Set<string>([
  "coding", "reading", "writing", "studying", "admin", "deep_work", "other",
]);

export type Session = {
  id: string;
  user_id: string;
  status: "active" | "ended";
  focus_duration_sec: number;
  break_duration_sec: number;
  started_at: string;
  ended_at: string | null;
  session_type?: SessionType | null;
  created_at?: string;
  // PRD Phase 1 fields — all optional so existing code compiles unchanged
  energy_level_pre?: number | null;
  distraction_level_pre?: number | null;
  fatigue_rating_post?: number | null;
  actual_focus_minutes?: number | null;
  paused_count?: number;
  abandoned?: boolean;
  completion_fraction?: number | null;
  reward_value?: number | null;
  reward_version?: string | null;
  note?: string | null;
  distraction_count_post?: number | null;
  recommendation_fit?: boolean | null;
  recommendation_event_id?: string | null;
};

export type BreakOutcome = "completed" | "skipped" | "shortened";

export type FocusBlock = {
  id: string;
  user_id: string;
  session_id: string;
  focus_duration_sec: number;
  completed: boolean;
  focus_rating: number;
  started_at: string;
  ended_at: string;
  day_of_week: number;
  time_bucket: "morning" | "afternoon" | "evening" | "night";
  session_type?: SessionType | null;
  break_outcome?: BreakOutcome | null;
  break_duration_sec_actual?: number | null;
  created_at?: string;
};

export type ConfidenceLevel = "learning" | "calibrating" | "confident";

/**
 * One projected block in the next-best plan.
 * Block 1 is the actual recommendation; Blocks 2–3 project natural fatigue decay.
 */
export type PlanBlock = {
  block_number: 1 | 2 | 3;
  focus_duration_sec: number;
  break_duration_sec: number;
  /** Optional contextual note — why this block differs or is conditional. */
  note?: string;
};

/**
 * "fatigued"  — recent performance declining; step arm down, extend break.
 * "stable"    — no strong trend; stay near best arm.
 * "recovered" — recent performance improving; normal recommendation.
 * "reset"     — multi-day gap or first session today; prior fatigue is stale,
 *               treat as a fresh start without penalising based on old patterns.
 */
export type FatigueState = "recovered" | "stable" | "fatigued" | "reset";

// ─────────────────────────────────────────────────────────────────────────────
// Explanation payload — logged in recommendation_events and returned to the UI
// ─────────────────────────────────────────────────────────────────────────────

export type ExplanationSignals = {
  time_of_day: string | null;
  fatigue: string | null;
  completion_trend: string | null;
  arm_stability: string | null;
  sessions_today: string | null;
};

export type ExplanationPayload = {
  version: "v1";
  rationale: string;
  signals: ExplanationSignals;
  confidence_level: ConfidenceLevel;
  confidence_reason: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Alternate session option — shown alongside the primary recommendation
// ─────────────────────────────────────────────────────────────────────────────

export type AlternateOption = {
  focus_minutes: number;
  break_minutes: number;
  mode: string;
  label: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation event — one row per recommendation shown to the user
// ─────────────────────────────────────────────────────────────────────────────

export type RecommendationEvent = {
  id: string;
  user_id: string;
  shown_at: string;
  recommended_focus_minutes: number;
  recommended_break_minutes: number;
  session_mode: string | null;
  accepted: boolean | null;
  overridden: boolean;
  override_focus_minutes: number | null;
  policy_version: string;
  policy_type: string;
  model_version: string | null;
  propensity: number | null;
  exploration_flag: boolean;
  explanation_payload: ExplanationPayload | null;
  context_snapshot: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Model version — tracks ML artifacts and training metadata
// ─────────────────────────────────────────────────────────────────────────────

export type ModelVersion = {
  id: string;
  type: string;
  created_at: string;
  feature_schema_version: string | null;
  training_window: Record<string, unknown> | null;
  reward_version: string | null;
  metrics_payload: Record<string, unknown> | null;
  artifact_uri: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Policy evaluation — stores offline IPS/SNIPS/DR evaluation results
// ─────────────────────────────────────────────────────────────────────────────

export type PolicyEvaluation = {
  id: string;
  created_at: string;
  candidate_policy_version: string;
  logged_policy_version: string;
  evaluation_window: Record<string, unknown> | null;
  method: "ips" | "snips" | "dr";
  estimated_policy_value: number | null;
  confidence_interval: { low: number; high: number } | null;
  notes: string | null;
};

export type Recommendation = {
  recommended_focus_duration_sec: number;
  recommended_break_duration_sec: number;
  /**
   * Historical performance average for the recommended arm, scaled to [0, 1].
   * Displayed in the UI as "Est. session score".
   */
  estimated_session_score: number;
  confidence_level: ConfidenceLevel;
  rationale: string;
  model_version: string;
  /** Best historical time-of-day bucket (needs ≥2 data points to appear). */
  best_time_bucket: "morning" | "afternoon" | "evening" | "night" | null;
  /** Fatigue trend derived from last 3 vs previous 3 sessions (null if < 4 blocks). */
  fatigue_state: FatigueState | null;
  /** Number of focus blocks used to compute this recommendation. */
  block_count: number;
  /**
   * The session type whose data was used for the recommendation.
   * Non-null only when enough type-specific blocks existed to use type-specific scoring.
   */
  session_type_used?: SessionType | null;
  /**
   * Human-readable explanation of what changed from the prior persisted recommendation.
   * Null on the first session or when nothing changed.
   * Populated server-side by the recommendation API from user_pomodoro_prefs.
   */
  recommendation_change?: string | null;
  /**
   * Projected 2–3 block plan for the upcoming work window.
   * Block 1 = this recommendation; Blocks 2–3 account for natural fatigue decay.
   * Only present when block_count ≥ 4.
   */
  next_plan?: PlanBlock[];
  /** ID of the logged recommendation_event row — passed back to sessions/start. */
  recommendation_event_id?: string | null;
  /** Full explanation payload generated server-side for UI rendering. */
  explanation_payload?: ExplanationPayload | null;
  /** Two alternate session configurations (next shorter + next longer arm). */
  alternate_options?: AlternateOption[];
};
