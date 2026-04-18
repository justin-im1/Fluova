-- Phase A: Track break outcome per focus block
-- Stored here (on focus_block) rather than on session because a session can
-- theoretically spawn multiple blocks in future phases.

ALTER TABLE focus_blocks
  ADD COLUMN IF NOT EXISTS break_outcome text
    CHECK (break_outcome IN ('completed', 'skipped', 'shortened')),
  ADD COLUMN IF NOT EXISTS break_duration_sec_actual int;
