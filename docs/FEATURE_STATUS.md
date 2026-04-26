# Fluova Feature Status

Canonical record of every implemented feature. All phases (A–J legacy + PRD Phases 1–7) are complete.

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
| Session type selection (optional) | ✅ | `components/SessionTypePicker.tsx` — 7 types |
| Energy level capture (1–5) | ✅ | `components/ContextSlider.tsx` on session/new page |
| Distraction level capture (1–5) | ✅ | `components/ContextSlider.tsx` on session/new page |
| Choose duration (presets + recommended) | ✅ | `components/DurationPicker.tsx` — 25/30/35/40/45/50/55 min presets |
| Countdown timer | ✅ | `components/SessionTimer.tsx` |
| Pause / Resume timer | ✅ | Session page — `handlePause`/`handleResume`; paused time offset tracked |
| End early option | ✅ | Session page → `POST /api/sessions/end` |
| Abandon session | ✅ | Session page (visible when paused or ≥5 min elapsed) → `sessions.abandoned=true` |
| Auto-end when timer completes | ✅ | `SessionTimer.onComplete` → transition to break phase |

### 3. Guided Break Flow

| Feature | Status | Location |
|---|---|---|
| Break countdown after focus ends | ✅ | `components/BreakTimer.tsx` |
| Skip break button | ✅ | Break screen → recap with `break_outcome=skipped` |
| Start next block after break | ✅ | Break screen → recap with `break_outcome=completed` |
| Break outcome tracking | ✅ | `completed` / `skipped` / `shortened` stored on `focus_blocks.break_outcome` |
| Actual break duration stored | ✅ | `focus_blocks.break_duration_sec_actual` |

### 4. Focus Block Feedback

| Feature | Status | Location |
|---|---|---|
| Mark completed (yes/no) | ✅ | Recap page toggle → `/api/focus-blocks/complete` |
| Rate focus 1–5 | ✅ | `components/Rating.tsx` on recap |
| Fatigue rating 1–5 (soft-required) | ✅ | `components/ContextSlider.tsx` on recap; amber warning if skipped |
| Recommendation fit toggle | ✅ | Recap page pill toggle — "Good fit" / "Not quite" |
| Distraction count | ✅ | Recap page number input |
| Session note (max 280 chars) | ✅ | Recap page textarea with counter |
| Save block + compute reward_v1 | ✅ | `app/api/focus-blocks/complete/route.ts` |
| Break outcome + actual duration saved | ✅ | Written to `focus_blocks` at recap completion |

---

## RECOMMENDATION ENGINE

### 5. Core Heuristic Engine (heuristic_v3)

| Feature | Status | Location |
|---|---|---|
| Bounded duration arms | ✅ | 25/30/35/40/45/50 min; `FOCUS_ARMS_SEC` in `lib/recommendation/features.ts` |
| PRD 4-arm space for LinUCB | ✅ | `FOCUS_ARMS_SEC_PRD = [1500, 2100, 2700, 3300]` in `lib/recommendation/features.ts` |
| Reward formula (heuristic) | ✅ | `computeReward` in `lib/recommendation/reward.ts` |
| reward_v1 formula (PRD) | ✅ | `computeRewardV1` — `0.35×full + 0.20×fraction + 0.30×focus_norm − 0.15×fatigue_norm` |
| Time-of-day weighted scoring | ✅ | Current bucket sessions weighted 1.8× when ≥2 bucket data points |
| Cold-start (0 blocks) | ✅ | Returns 30 min / 5 min, confidence `learning` |
| Full engine (4+ blocks) | ✅ | All signals active |

### 6. Session Type Conditioning

| Feature | Status | Location |
|---|---|---|
| Type-specific scoring | ✅ | ≥4 type-specific blocks → use those; else fall back to all blocks |
| Sparse type flag | ✅ | Caps confidence at `calibrating` when type data < 4 blocks |

### 7. Recovery-Aware Fatigue Engine

| Feature | Status | Location |
|---|---|---|
| Multi-day / overnight reset | ✅ | Gap ≥20h or different UTC day → `"reset"` state |
| Intra-day recovery gap | ✅ | Gap ≥3h raises fatigue threshold 1.8× |
| Fatigue states: fatigued / stable / recovered / reset | ✅ | `computeFatigueState` in `lib/recommendation/features.ts` |
| Arm adjustment for fatigue | ✅ | Fatigued → step arm down one notch |
| Break adjustment for fatigue | ✅ | Fatigued → +2 min; recovered → −1 min |

### 8. Sessions-Today Pressure

| Feature | Status | Location |
|---|---|---|
| Sessions-today count | ✅ | ≥4 today and not already fatigued → extra arm step-down |

### 9. Arm Stability & Confidence

| Feature | Status | Location |
|---|---|---|
| Arm stability detection | ✅ | `computeArmStability` — best vs second-best ≥7% margin |
| Confidence level: learning / calibrating / confident | ✅ | Volume threshold + stability + type-sparsity rules |

### 10. Recommendation Diff / "What Changed"

| Feature | Status | Location |
|---|---|---|
| Diff generated after each recap | ✅ | `lib/recommendation/diff.ts` |
| Explanation persisted + returned | ✅ | `user_pomodoro_prefs.recommendation_change_explanation` |

### 11. Context Snapshot & Explanation Layer

| Feature | Status | Location |
|---|---|---|
| ContextSnapshot builder | ✅ | `lib/recommendation/context.ts` — 15 fields including EWM reward, streak, sessions_last_24h/7d |
| ExplanationPayload generator | ✅ | `lib/recommendation/explanation.ts` — 5 signal strings + rationale + confidence_reason |
| Recommendation event logging | ✅ | `recommendation_events` row on every `/api/recommendation` call with context_snapshot JSONB |
| Override endpoint | ✅ | `POST /api/recommendation/override` — sets `overridden=true`, `accepted=false` |
| Alternate session options | ✅ | 2 neighbor arms returned as `alternate_options` |
| Explanation + confidence badge in UI | ✅ | `app/(app)/session/new/page.tsx` — rationale, signal bullets, confidence badge |

---

## CONTEXTUAL BANDIT (LinUCB)

### 12. Python ML Service

| Feature | Status | Location |
|---|---|---|
| DisjointLinUCB (d=14) | ✅ | `ml-service/bandit/linucb.py` — per-arm A/b matrices, serialize/deserialize |
| 4 PRD arms | ✅ | `ml-service/bandit/arms.py` — recovery/standard/deep_45/deep_55 |
| 14-dim feature vector | ✅ | `ml-service/bandit/context.py` — cyclical hour/day, energy, completion, EWM, streak, etc. |
| Safe ε-greedy exploration | ✅ | `ml-service/bandit/exploration.py` — epsilon decays with session count past 20 |
| Cold-start init (A=2×I, alpha=2.0) | ✅ | `ml-service/bandit/linucb.py` `make_cold_start_bandit` |
| FastAPI endpoints | ✅ | `ml-service/main.py` — `/health`, `/recommend`, `/update`, `/evaluate`, `/train`, `/diagnostics` |
| Bandit persistence (every 10th update) | ✅ | `ml-service/storage/model_store.py` → `model_versions` table |
| XGBoost reward predictor | ✅ | `ml-service/models/reward_predictor.py` + `trainer.py` |
| IPS / SNIPS / Doubly-Robust evaluators | ✅ | `ml-service/evaluation/ips.py` |
| Policy evaluation pipeline | ✅ | `ml-service/evaluation/pipeline.py` → writes `policy_evaluations` table |
| Weekly eval cron (Railway) | ✅ | `ml-service/railway.toml` — Sundays 03:00 UTC |

### 13. Next.js LinUCB Integration

| Feature | Status | Location |
|---|---|---|
| LinUCB with 250ms timeout + heuristic fallback | ✅ | `app/api/recommendation/route.ts` `tryLinUCB()` |
| policy_type / propensity / exploration_flag logged | ✅ | Written to `recommendation_events` on every call |
| Online update after reward (2 s timeout) | ✅ | `app/api/focus-blocks/complete/route.ts` fire-and-forget POST `/update` |

---

## ANALYTICS & STATS

### 14. User Stats API

| Feature | Status | Location |
|---|---|---|
| Streak (current + longest) | ✅ | `computeStreak` in `/api/stats` |
| Rhythm Score (0–100 + delta) | ✅ | `computeRhythmScore` in `/api/stats` |
| Best time bucket | ✅ | Per-bucket weighted scoring |
| Performance trend (last 14 blocks) | ✅ | `recent_trend` array |
| Goal intelligence + suggestion | ✅ | `goal_hit_days`, `goal_suggestion` |
| Weekly summary (this vs last week) | ✅ | `weekSummary()` |
| Fatigue trend (last 14 sessions) | ✅ | `fatigue_trend_data` + `fatigue_trend_avg` |
| Recommendation acceptance rate | ✅ | `recommendation_acceptance_rate` (null when < 3 events) |
| Best duration by session type | ✅ | `best_duration_by_context` (requires ≥3 sessions per type with reward) |

### 15. Admin Diagnostics API

| Feature | Status | Location |
|---|---|---|
| Daily avg reward (30 days) | ✅ | `avg_reward_over_time` |
| Action distribution | ✅ | `action_distribution` — focus_minutes → session count |
| Override rate + exploration rate | ✅ | From `recommendation_events` |
| Reward by action / by segment | ✅ | `reward_by_action`, `reward_by_segment` (prefixed `bucket:` / `type:`) |
| Estimated policy value | ✅ | From latest `policy_evaluations` row |
| Protected by ADMIN_API_KEY | ✅ | `GET /api/analytics/diagnostics` |

---

## DASHBOARD

### 16. Dashboard UI

| Feature | Status | Location |
|---|---|---|
| Recommendation hero + start CTA | ✅ | `RecommendationHero` |
| Rhythm Score card | ✅ | `RhythmScoreCard` |
| Peak window card | ✅ | `PeakWindowCard` |
| Completion %, avg rating, last 7 days | ✅ | `MetricCard` rows |
| Recommendation acceptance rate metric | ✅ | `MetricCard` (shown when non-null) |
| Fatigue trend sparkline | ✅ | `FatigueTrendCard` (shown when ≥5 fatigue ratings; inverted so up = fresher) |
| Best durations by session type | ✅ | `BestDurationsByContext` table |
| Streak card | ✅ | `StreakCard` |
| Daily goal + progress | ✅ | Inline editable with smart suggestion |
| Trend sparkline | ✅ | `TrendSparkline` |
| Time-of-day chart | ✅ | `components/TimeOfDayChart.tsx` |
| Duration chart | ✅ | `components/DurationChart.tsx` |
| Weekly summary | ✅ | `components/WeeklySummary.tsx` |
| Recent sessions list | ✅ | Last 10 blocks |
| Onboarding panel (first-time users) | ✅ | `components/OnboardingPanel.tsx` |

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
| `007_session_type_index_and_model_version.sql` | Composite index on `focus_blocks`; `model_version` default |
| `008_prd_session_fields.sql` | PRD columns on `sessions`; `recommendation_events`, `model_versions`, `policy_evaluations` tables |

---

## API Routes

| Route | Purpose |
|---|---|
| `POST /api/sessions/start` | Create session; accepts energy_level_pre, distraction_level_pre, recommendation_event_id |
| `POST /api/sessions/end` | Mark session ended; accepts paused_count, abandoned |
| `POST /api/focus-blocks/complete` | Insert focus block; compute reward_v1; fire LinUCB update |
| `GET /api/recommendation` | Run engine (LinUCB → heuristic fallback); log recommendation_event |
| `POST /api/recommendation/override` | Mark recommendation as overridden |
| `GET /api/stats` | All stats including fatigue trend, acceptance rate, best-by-context |
| `GET /api/analytics/diagnostics` | Admin-only diagnostics (ADMIN_API_KEY required) |
| `GET /api/history` | Recent sessions + focus blocks |
| `GET/PATCH /api/me` | Get or update user profile / daily goal |
| `GET /api/time` | Server time |

---

## Engine Modules

| Module | Purpose |
|---|---|
| `lib/recommendation/reward.ts` | `computeReward` (heuristic) + `computeRewardV1` (PRD formula) |
| `lib/recommendation/features.ts` | Arm scoring, fatigue, stability, confidence, flow likelihood |
| `lib/recommendation/engine.ts` | `computeRecommendation` — main heuristic entry point |
| `lib/recommendation/context.ts` | `buildContextSnapshot` — 15-field serializable snapshot |
| `lib/recommendation/explanation.ts` | `buildExplanationPayload` — 5 signal strings + rationale |
| `lib/recommendation/planner.ts` | `buildNextPlan` — 2–3 block projection |
| `lib/recommendation/diff.ts` | `buildRecommendationChangeDiff` — human-readable change explanation |

---

## Deployment

| File | Purpose |
|---|---|
| `vercel.json` | Next.js deployment config for Vercel |
| `.env.example` | All required environment variables |
| `ml-service/Dockerfile` | Container image for Python ML service |
| `ml-service/railway.toml` | Railway deployment + weekly evaluation cron |
| `ml-service/.env.example` | ML service environment variables |

---

*All PRD phases 1–7 complete.*
