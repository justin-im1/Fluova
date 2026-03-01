-- Fluova initial schema
-- Run this in Supabase SQL Editor

-- Profiles (keyed to auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

-- Sessions
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('active', 'ended')),
  focus_duration_sec int not null,
  break_duration_sec int not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_sessions_user_started
  on sessions (user_id, started_at desc);

-- Focus blocks (one per session for MVP)
create table if not exists focus_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  focus_duration_sec int not null,
  completed boolean not null,
  focus_rating int not null check (focus_rating between 1 and 5),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  time_bucket text not null check (time_bucket in ('morning', 'afternoon', 'evening', 'night')),
  created_at timestamptz default now(),
  unique(session_id)
);

create index if not exists idx_focus_blocks_user_ended
  on focus_blocks (user_id, ended_at desc);

create index if not exists idx_focus_blocks_user_duration
  on focus_blocks (user_id, focus_duration_sec);

-- User pomodoro preferences
create table if not exists user_pomodoro_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  best_focus_duration_sec int,
  best_break_duration_sec int,
  model_version text not null default 'heuristic_v1',
  updated_at timestamptz default now()
);
