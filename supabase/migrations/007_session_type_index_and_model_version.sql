-- Phase I: Schema support for contextual engine (heuristic_v3).
--
-- Two targeted changes — no new tables required.
--
-- 1. Composite index for type-specific arm-scoring queries.
--    The Phase H engine filters focus_blocks by (user_id, session_type) when
--    ≥ 4 type-specific blocks exist, then orders by ended_at DESC.
--    The existing idx_focus_blocks_user_ended covers the unfiltered path;
--    this index covers the type-filtered path efficiently.
--
-- 2. Update the model_version default in user_pomodoro_prefs to match the
--    current engine version.  Existing rows written by older engine versions
--    are left unchanged — the column records which version produced each row.

CREATE INDEX IF NOT EXISTS idx_focus_blocks_user_type_ended
  ON focus_blocks (user_id, session_type, ended_at DESC);

ALTER TABLE user_pomodoro_prefs
  ALTER COLUMN model_version SET DEFAULT 'heuristic_v3';
