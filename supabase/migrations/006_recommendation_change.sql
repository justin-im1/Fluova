-- Phase D: Surface recommendation change explanations.
-- updated_at was already written by the app but not in the schema.
-- recommendation_change_explanation stores a diff string produced server-side
-- after each recap save, persisted here for the dashboard to surface.

ALTER TABLE user_pomodoro_prefs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS recommendation_change_explanation text;
