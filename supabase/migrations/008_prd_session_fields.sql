-- Phase 1: PRD data contract foundation.
--
-- Adds all PRD-required columns and tables needed for:
--   - contextual bandit recommendation logging (recommendation_events)
--   - per-session reward computation (sessions fields)
--   - ML model versioning (model_versions)
--   - offline policy evaluation (policy_evaluations)
--
-- All changes are purely additive. No existing columns or tables are modified.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New columns on sessions
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS energy_level_pre       INT CHECK (energy_level_pre BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS distraction_level_pre  INT CHECK (distraction_level_pre BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS fatigue_rating_post    INT CHECK (fatigue_rating_post BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS actual_focus_minutes   INT,
  ADD COLUMN IF NOT EXISTS paused_count           INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abandoned              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completion_fraction    FLOAT,
  ADD COLUMN IF NOT EXISTS reward_value           FLOAT,
  ADD COLUMN IF NOT EXISTS reward_version         TEXT DEFAULT 'reward_v1',
  ADD COLUMN IF NOT EXISTS note                   TEXT,
  ADD COLUMN IF NOT EXISTS distraction_count_post INT,
  ADD COLUMN IF NOT EXISTS recommendation_fit     BOOLEAN,
  ADD COLUMN IF NOT EXISTS recommendation_event_id UUID;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. recommendation_events — one row per recommendation shown to the user.
--    Logs the full context snapshot, policy metadata, and propensity so that
--    offline policy evaluation (IPS/SNIPS/DR) is possible later.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recommendation_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shown_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recommended_focus_minutes INT NOT NULL,
  recommended_break_minutes INT NOT NULL,
  session_mode            TEXT,
  accepted                BOOLEAN,
  overridden              BOOLEAN NOT NULL DEFAULT FALSE,
  override_focus_minutes  INT,
  policy_version          TEXT NOT NULL,
  policy_type             TEXT NOT NULL DEFAULT 'heuristic',
  model_version           TEXT,
  propensity              FLOAT,
  exploration_flag        BOOLEAN NOT NULL DEFAULT FALSE,
  explanation_payload     JSONB,
  context_snapshot        JSONB NOT NULL
);

ALTER TABLE recommendation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own recommendation_events"
  ON recommendation_events FOR SELECT
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. model_versions — tracks ML model artifacts and training metadata.
--    artifact_uri format: "supabase://model-artifacts/{type}/{id}.json"
--    For small bandit state (A/b matrices), metrics_payload stores the
--    serialized model directly. artifact_uri is used for larger XGBoost models.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_versions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                    TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  feature_schema_version  TEXT,
  training_window         JSONB,
  reward_version          TEXT,
  metrics_payload         JSONB,
  artifact_uri            TEXT
);

ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read model_versions"
  ON model_versions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. policy_evaluations — stores offline evaluation results (IPS, SNIPS, DR).
--    confidence_interval JSONB shape: {"low": float, "high": float}
--    method values: 'ips' | 'snips' | 'dr'
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS policy_evaluations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  candidate_policy_version  TEXT NOT NULL,
  logged_policy_version     TEXT NOT NULL,
  evaluation_window         JSONB,
  method                    TEXT NOT NULL,
  estimated_policy_value    FLOAT,
  confidence_interval       JSONB,
  notes                     TEXT
);

ALTER TABLE policy_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read policy_evaluations"
  ON policy_evaluations FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. FK and indexes
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD CONSTRAINT fk_sessions_recommendation_event
  FOREIGN KEY (recommendation_event_id)
  REFERENCES recommendation_events(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recommendation_events_user_shown
  ON recommendation_events (user_id, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_recommendation_event
  ON sessions (recommendation_event_id)
  WHERE recommendation_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_reward_version
  ON sessions (reward_version)
  WHERE reward_value IS NOT NULL;
