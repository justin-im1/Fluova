# Fluova Feature Status

Canonical record of every implemented feature. All phases A–J are complete.

---

## CORE

### 1. Authentication

| Feature | Status | Location |
|---|---|---|
| Email magic link login | ✅ | `app/(auth)/login/page.tsx` → `signInWithOtp`, redirect to `/callback` |
| Persistent session | ✅ | `lib/supabase/middleware.ts` + `lib/auth/getServerUser.ts` |
| Profile creation on first login | ✅ | `app/api/me/route.ts`, `app/api/sessions/start/route.ts` upsert profile |

### 2. Focus Sessions

| Feature | Status | Location |
|---|---|---|
| Start focus session | ✅ | `app/(app)/session/new/page.tsx` → `POST /api/sessions/start` |
| Session type selection (optional) | ✅ | `components/SessionTypePicker.tsx` — 7 types; stored on `sessions` + carried to `focus_blocks` |
| Choose duration (presets + recommended) | ✅ | `components/DurationPicker.tsx` + `/api/recommendation` |
| Countdown timer | ✅ | `components/SessionTimer.tsx` |
| End early option | ✅ | Session page → `POST /api/sessions/end` |
| Auto-end when timer completes | ✅ | `SessionTimer.onComplete` → end + transition to break phase |

### 3. Guided Break Flow

| Feature | Status | Location |
|---|---|---|
| Break countdown after focus ends | ✅ | `components/BreakTimer.tsx` — shows recommended duration, countdown |
| Skip break button | ✅ | Break screen — navigates to recap with `break_outcome=skipped` |
| Start next block after break | ✅ | Break screen — navigates to recap with `break_outcome=completed` |
| Break outcome tracking | ✅ | `completed` / `skipped` / `shortened`; stored on `focus_blocks.break_outcome` |
| Actual break duration stored | ✅ | `focus_blocks.break_duration_sec_actual` |

### 4. Focus Block Feedback

| Feature | Status | Location |
|---|---|---|
| Mark completed (yes/no) | ✅ | Recap page toggle → `/api/focus-blocks/complete` |
| Rate focus 1–5 | ✅ | `components/Rating.tsx` on recap |
| Save block to DB | ✅ | `app/api/focus-blocks/complete/route.ts` inserts `focus_blocks`, upserts prefs |
| Session type carried to block | ✅ | Copied from parent `sessions.session_type` at block insert |
| Break outcome + actual duration saved | ✅ | Written to `focus_blocks` at recap completion |

---

## RECOMMENDATION ENGINE (heuristic_v3)

### 5. Core Engine

| Feature | Status | Location |
|---|---|---|
| Bounded duration arms | ✅ | 25 / 30 / 35 / 40 / 45 / 50 min; `FOCUS_ARMS_SEC` in `lib/recommendation/features.ts` |
| Reward formula | ✅ | `lib/recommendation/reward.ts` — `0.6×completion + 0.4×(rating/5) − fatigue_penalty` |
| Time-of-day weighted scoring | ✅ | Current bucket sessions weighted 1.8× when ≥2 bucket data points |
| Cold-start (0 blocks) | ✅ | Returns 30 min / 5 min, confidence `learning` |
| Early-stage (1–3 blocks) | ✅ | Best tried arm, no fatigue yet |
| Full engine (4+ blocks) | ✅ | All signals active |
| Deterministic | ✅ | Same inputs → same output every time; no randomness |

### 6. Session Type Conditioning

| Feature | Status | Location |
|---|---|---|
| Type-specific scoring | ✅ | ≥4 type-specific blocks → use those; else fall back to all blocks |
| Sparse type flag | ✅ | `typeDataSparse = true` when type requested but < 4 blocks; caps confidence at `calibrating` |
| `session_type_used` in output | ✅ | Non-null only when type-specific data was used |

### 7. Recovery-Aware Fatigue Engine

| Feature | Status | Location |
|---|---|---|
| Multi-day / overnight reset | ✅ | Gap ≥20h or different UTC day → `"reset"` state; prior fatigue not penalised |
| Intra-day recovery gap | ✅ | Gap ≥3h raises fatigue threshold 1.8× |
| Fatigue states: fatigued / stable / recovered / reset | ✅ | `computeFatigueState` in `lib/recommendation/features.ts` |
| Arm adjustment for fatigue | ✅ | Fatigued → step arm down one notch |
| Break adjustment for fatigue | ✅ | Fatigued → +2 min; recovered → −1 min; stable / reset → base |

### 8. Sessions-Today Pressure

| Feature | Status | Location |
|---|---|---|
| Sessions-today count | ✅ | Computed from blocks in engine; ≥4 today and not already fatigued → extra arm step-down |
| Noted in rationale | ✅ | "X sessions logged today — stepping down to protect your energy." |

### 9. Arm Stability & Enhanced Confidence

| Feature | Status | Location |
|---|---|---|
| Arm stability detection | ✅ | `computeArmStability` — best arm vs second-best ≥7% margin = stable |
| Confidence level: learning / calibrating / confident | ✅ | Volume threshold + stability + type-sparsity downgrade rules |
| Unstable cap | ✅ | Near-tied arms → capped at `calibrating` even at 18+ blocks |

### 10. Recommendation Diff / "What Changed"

| Feature | Status | Location |
|---|---|---|
| Diff generated after each recap | ✅ | `lib/recommendation/diff.ts` → `buildRecommendationChangeDiff` |
| Explanation persisted | ✅ | `user_pomodoro_prefs.recommendation_change_explanation` |
| Returned by recommendation API | ✅ | `GET /api/recommendation` attaches stored explanation |
| Shown on dashboard | ✅ | `RecommendationChangeBanner` — always visible when present (not gated by toast) |

### 11. Next-Best Plan

| Feature | Status | Location |
|---|---|---|
| 2–3 block projection | ✅ | `lib/recommendation/planner.ts` — Block 1 = recommendation; Block 2 = one arm shorter; Block 3 = two shorter (optional) |
| Fatigue-decay aware | ✅ | Fatigued → Block 3 note says "short block recommended — fatigue detected" |
| Sessions-today cutoff | ✅ | Block 3 omitted when ≥4 sessions already logged today |
| Shown on dashboard | ✅ | `NextPlanCard` — visible when `next_plan.length > 1` |

### 12. Rhythm Score

| Feature | Status | Location |
|---|---|---|
| Rolling reward average (last 7 blocks, 0–100) | ✅ | `computeRhythmScore` in `/api/stats` |
| Delta vs prior 7 blocks | ✅ | Positive = improving; null when < 9 total blocks |
| Shown on dashboard | ✅ | `RhythmScoreCard` with score bar and delta label |

---

## DASHBOARD

### 13. Recommendation Hero

| Feature | Status | Location |
|---|---|---|
| Focus + break durations (dominant) | ✅ | `RecommendationHero` |
| Coach voice action phrase | ✅ | `buildActionPhrase` — contextual by fatigue state, time bucket, confidence |
| Rationale text | ✅ | Returned by engine; rendered below action phrase |
| Fatigue state chip | ✅ | Non-stable states shown in header (amber/green/sky) |
| Confidence badge | ✅ | `learning` / `calibrating` / `confident` |
| Estimated session score | ✅ | `estimated_session_score` (0–100%) — bucket-aware flow likelihood |
| "Start this session" CTA | ✅ | Pre-fills duration into `/session/new` |

### 14. Right Column Insights

| Feature | Status | Location |
|---|---|---|
| Rhythm Score card | ✅ | `RhythmScoreCard` |
| Peak window card | ✅ | `PeakWindowCard` — best bucket + "Active now" indicator |
| Completion % with context | ✅ | `MetricCard` — sublabel: Strong / Steady / Try shorter sessions |
| Avg rating with context | ✅ | `MetricCard` — sublabel: Excellent / On track / Rate more honestly |
| Last 7 days with context | ✅ | `MetricCard` — sublabel vs daily goal |
| Streak | ✅ | `StreakCard` |
| Daily goal with progress bar | ✅ | Inline editable, smart goal suggestion |
| Trend sparkline | ✅ | `TrendSparkline` + action prompt when trend is strongly directional |
| Recent sessions list | ✅ | Last 10 blocks — duration, Done/Partial, session type chip, time bucket, rating dots |

### 15. Time-of-Day Chart

| Feature | Status | Location |
|---|---|---|
| Bar chart by bucket | ✅ | `components/TimeOfDayChart.tsx` — 4 buckets, peak highlighted |

### 16. Duration Chart

| Feature | Status | Location |
|---|---|---|
| Bar chart by arm | ✅ | `components/DurationChart.tsx` — 6 arms, avg score, recommended dot |

### 17. Weekly Summary

| Feature | Status | Location |
|---|---|---|
| This week vs last week | ✅ | `components/WeeklySummary.tsx` — sessions, completion, avg rating, best duration with delta arrows |

---

## ONBOARDING

### 18. New User Onboarding

| Feature | Status | Location |
|---|---|---|
| Detect first-time / low-data users | ✅ | `total_sessions < 5` |
| Dismissible intro panel | ✅ | `components/OnboardingPanel.tsx` — localStorage-backed dismissal |
| Explains the adaptive loop | ✅ | 4 pillars: adaptive timing, rate honestly, sharpens over time, work type matters |
| "Start first session" CTA | ✅ | Shown for 0-session users; absent for 1–4 session users |
| No-data right column preview | ✅ | Shows "Unlocks with data" card listing 4 features and when they unlock |

---

## SCHEMA

| Migration | What it covers |
|---|---|
| `001_initial_schema.sql` | `profiles`, `sessions`, `focus_blocks`, `user_pomodoro_prefs` |
| `002_rls_constraints_enum.sql` | RLS policies, one-active-session index, `time_bucket_enum` |
| `003_goal_column.sql` | `daily_session_goal` on `user_pomodoro_prefs` |
| `004_break_outcome.sql` | `break_outcome`, `break_duration_sec_actual` on `focus_blocks` |
| `005_session_type.sql` | `session_type` on `sessions` and `focus_blocks` |
| `006_recommendation_change.sql` | `recommendation_change_explanation`, `updated_at` on `user_pomodoro_prefs` |
| `007_session_type_index_and_model_version.sql` | Composite index `(user_id, session_type, ended_at DESC)` on `focus_blocks`; `model_version` default → `heuristic_v3` |

---

## API Routes

| Route | Purpose |
|---|---|
| `POST /api/sessions/start` | Create session, upsert profile |
| `POST /api/sessions/end` | Mark session ended |
| `POST /api/focus-blocks/complete` | Insert focus block, compute + persist new recommendation |
| `GET /api/recommendation` | Run engine, return recommendation + stored change explanation |
| `GET /api/stats` | All stats: streak, rhythm score, time-of-day, trend, goal, weekly summary |
| `GET /api/history` | Recent sessions + focus blocks |
| `GET/PATCH /api/me` | Get or update user profile / daily goal |
| `GET /api/time` | Server time |

---

## Engine Modules

| Module | Purpose |
|---|---|
| `lib/recommendation/reward.ts` | `computeReward` — per-block reward formula |
| `lib/recommendation/features.ts` | Arm scoring, fatigue, stability, sessions-today pressure, confidence, flow likelihood, break calculation |
| `lib/recommendation/engine.ts` | `computeRecommendation` — main entry point (heuristic_v3) |
| `lib/recommendation/planner.ts` | `buildNextPlan` — 2–3 block projection |
| `lib/recommendation/diff.ts` | `buildRecommendationChangeDiff` — human-readable change explanation |

---

*All phases A–J complete. No unimplemented features remaining.*
