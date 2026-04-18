-- Add daily_session_goal to user_pomodoro_prefs.
-- Defaults to 2 (a sensible starting goal for most users).

ALTER TABLE user_pomodoro_prefs
  ADD COLUMN IF NOT EXISTS daily_session_goal int NOT NULL DEFAULT 2;
