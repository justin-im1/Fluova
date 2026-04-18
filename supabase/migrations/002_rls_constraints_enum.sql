-- Enable Row-Level Security on all tables.
-- The app uses server-only writes via the service-role admin client,
-- so the safest posture is RLS enabled with no permissive client policies.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pomodoro_prefs ENABLE ROW LEVEL SECURITY;

-- Deny-by-default: authenticated users can read their own rows.
-- Writes remain server-only through the service-role key.

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can read own sessions"
  ON sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own focus_blocks"
  ON focus_blocks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own pomodoro_prefs"
  ON user_pomodoro_prefs FOR SELECT
  USING (auth.uid() = user_id);

-- Partial unique index: at most one active session per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_active_per_user
  ON sessions (user_id)
  WHERE status = 'active';

-- Drop the text CHECK constraint BEFORE converting the column type,
-- otherwise Postgres tries to evaluate the old check against the new enum.
DO $$
DECLARE
  _con text;
BEGIN
  SELECT conname INTO _con
  FROM pg_constraint
  WHERE conrelid = 'focus_blocks'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%time_bucket%';
  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE focus_blocks DROP CONSTRAINT %I', _con);
  END IF;
END
$$;

-- Convert time_bucket from text to a proper enum.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'time_bucket_enum') THEN
    CREATE TYPE time_bucket_enum AS ENUM ('morning', 'afternoon', 'evening', 'night');
  END IF;
END
$$;

ALTER TABLE focus_blocks
  ALTER COLUMN time_bucket DROP DEFAULT,
  ALTER COLUMN time_bucket TYPE time_bucket_enum USING time_bucket::time_bucket_enum;
