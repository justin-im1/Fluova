-- Phase B: Session type as a first-class feature.
-- Stored on both sessions (intent) and focus_blocks (carried over for engine use).
-- Optional — existing rows and sessions without a type are unaffected.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS session_type text
    CHECK (session_type IN ('coding', 'reading', 'writing', 'studying', 'admin', 'deep_work', 'other'));

ALTER TABLE focus_blocks
  ADD COLUMN IF NOT EXISTS session_type text
    CHECK (session_type IN ('coding', 'reading', 'writing', 'studying', 'admin', 'deep_work', 'other'));
