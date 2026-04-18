"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Recommendation, FocusBlock, ConfidenceLevel, FatigueState, PlanBlock } from "@/lib/domain/types";
import { SESSION_TYPE_LABELS } from "@/lib/domain/types";
import DurationChart from "@/components/DurationChart";
import TimeOfDayChart from "@/components/TimeOfDayChart";
import TrendSparkline from "@/components/TrendSparkline";
import WeeklySummary from "@/components/WeeklySummary";
import Toast from "@/components/Toast";
import OnboardingPanel from "@/components/OnboardingPanel";

type TimeBucket = "morning" | "afternoon" | "evening" | "night";

type WeekData = {
  count: number;
  completion_rate: number;
  avg_rating: number;
  best_duration_sec: number | null;
};

type Stats = {
  total_sessions: number;
  completion_rate: number;
  avg_focus_rating: number;
  sessions_last_7_days: number;
  current_streak: number;
  longest_streak: number;
  best_time_bucket: TimeBucket | null;
  time_bucket_scores: Record<TimeBucket, number | null>;
  recent_trend: number[];
  daily_goal: number;
  sessions_today: number;
  goal_hit_days: number;
  goal_suggestion: number | null;
  week_this: WeekData;
  week_last: WeekData;
  /** Rolling average reward over last 7 blocks, scaled 0–100. Null if < 2 blocks. */
  rhythm_score: number | null;
  /** Delta vs prior 7 blocks. Positive = improving. Null if < 9 total blocks. */
  rhythm_score_delta: number | null;
};

// ── Local time bucket (uses browser clock, not UTC) ───────────────────────────
function getLocalTimeBucket(): TimeBucket {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

// ── Confidence badge config ───────────────────────────────────────────────────
const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; dotColor: string }> = {
  learning:    { label: "Learning",    dotColor: "bg-muted/30" },
  calibrating: { label: "Calibrating", dotColor: "bg-primary/50" },
  confident:   { label: "Confident",   dotColor: "bg-primary/90" },
};

// ── Fatigue state config ──────────────────────────────────────────────────────
const FATIGUE_CONFIG: Record<FatigueState, { label: string; color: string }> = {
  fatigued:  { label: "Fatigued",  color: "text-amber-400/70" },
  stable:    { label: "Stable",    color: "text-muted/40" },
  recovered: { label: "Recovered", color: "text-emerald-400/70" },
  reset:     { label: "Fresh start", color: "text-sky-400/70" },
};

export default function DashboardClient() {
  const searchParams = useSearchParams();
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [blocks, setBlocks] = useState<FocusBlock[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(
    searchParams.get("toast") === "saved"
      ? "Recommendation updated based on your latest session."
      : null
  );
  const dismissToast = useCallback(() => setToast(null), []);

  // Goal editing state
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(2);
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    async function fetchData() {
      // Pass local time bucket so the engine can weight by current time-of-day
      const bucket = getLocalTimeBucket();

      try {
        const [recRes, histRes, statsRes] = await Promise.all([
          fetch(`/api/recommendation?bucket=${bucket}`),
          fetch("/api/history?limit=10"),
          fetch("/api/stats"),
        ]);

        if (recRes.ok) {
          const recData = await recRes.json();
          setRecommendation(recData.data);
        }
        if (histRes.ok) {
          const histData = await histRes.json();
          setBlocks((histData.data.focus_blocks ?? []).slice(0, 10));
        }
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData.data);
          setGoalInput(statsData.data.daily_goal ?? 2);
        }
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  async function handleSaveGoal() {
    if (goalInput < 1 || goalInput > 10) return;
    setSavingGoal(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_session_goal: goalInput }),
      });
      if (res.ok) {
        setStats((prev) => prev ? { ...prev, daily_goal: goalInput } : prev);
        setEditingGoal(false);
      }
    } finally {
      setSavingGoal(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="h-64 animate-pulse rounded-2xl bg-surface" />
          <div className="h-40 animate-pulse rounded-2xl bg-surface" />
          <div className="h-56 animate-pulse rounded-2xl bg-surface" />
          <div className="h-44 animate-pulse rounded-2xl bg-surface" />
        </div>
        <div className="space-y-3">
          <div className="h-[72px] animate-pulse rounded-2xl bg-surface" />
          <div className="h-[72px] animate-pulse rounded-2xl bg-surface" />
          <div className="h-[72px] animate-pulse rounded-2xl bg-surface" />
          <div className="h-[72px] animate-pulse rounded-2xl bg-surface" />
          <div className="h-20 animate-pulse rounded-2xl bg-surface" />
          <div className="mt-3 h-64 animate-pulse rounded-2xl bg-surface" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-900/30 bg-red-950/20 px-5 py-4 text-[13px] text-red-400">
        {error}
      </div>
    );
  }

  const hasData = stats && stats.total_sessions > 0;

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[1fr_380px]">

        {/* ────────────────────────────────────────────────────────
            LEFT — Hero: "Best next session"
        ──────────────────────────────────────────────────────── */}
        <div className="order-1 space-y-3 lg:col-start-1 lg:row-start-1">
          {/* Onboarding panel — shown to new / low-data users until dismissed */}
          {stats && stats.total_sessions < 5 && (
            <OnboardingPanel totalSessions={stats.total_sessions} />
          )}
          <RecommendationHero recommendation={recommendation} />
          {/* Change explanation — persisted from last recap; always visible when present */}
          {recommendation?.recommendation_change && (
            <RecommendationChangeBanner change={recommendation.recommendation_change} />
          )}
          {/* Multi-block plan — shown when engine has enough data */}
          {recommendation?.next_plan && recommendation.next_plan.length > 1 && (
            <NextPlanCard plan={recommendation.next_plan} />
          )}
        </div>

        {/* ────────────────────────────────────────────────────────
            RIGHT — Metrics, goal, trend, sessions
        ──────────────────────────────────────────────────────── */}
        {hasData && (
          <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-4">
            {/* Rhythm Score */}
            {stats.rhythm_score !== null && (
              <div className="mb-3">
                <RhythmScoreCard
                  score={stats.rhythm_score}
                  delta={stats.rhythm_score_delta}
                />
              </div>
            )}

            {/* Peak window — shows when we have a clear best bucket */}
            {stats.best_time_bucket && (
              <div className="mb-3">
                <PeakWindowCard
                  bestBucket={stats.best_time_bucket}
                  currentBucket={getLocalTimeBucket()}
                />
              </div>
            )}

            {/* Metric cards */}
            <div className="grid grid-cols-3 gap-3 lg:grid-cols-1 lg:gap-3">
              <MetricCard
                label="Completion"
                value={`${Math.round(stats.completion_rate * 100)}%`}
                sublabel={
                  stats.completion_rate >= 0.8 ? "Strong" :
                  stats.completion_rate >= 0.6 ? "Steady" :
                  "Try shorter sessions"
                }
              />
              <MetricCard
                label="Avg rating"
                value={stats.avg_focus_rating.toFixed(1)}
                suffix="/5"
                sublabel={
                  stats.avg_focus_rating >= 4 ? "Excellent" :
                  stats.avg_focus_rating >= 3 ? "On track" :
                  "Rate more honestly"
                }
              />
              <MetricCard
                label="Last 7 days"
                value={String(stats.sessions_last_7_days)}
                suffix={stats.sessions_last_7_days === 1 ? " session" : " sessions"}
                sublabel={
                  stats.goal_hit_days === 7 ? "Hitting daily goal" :
                  stats.goal_hit_days >= 5 ? "Most days on track" :
                  `Aim: ${stats.daily_goal}/day`
                }
              />
              <StreakCard current={stats.current_streak} longest={stats.longest_streak} />
            </div>

            {/* Daily goal */}
            <div className="mt-3 rounded-2xl border border-edge/30 bg-surface px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/50">
                  Today&apos;s goal
                </p>
                {!editingGoal && (
                  <button
                    onClick={() => setEditingGoal(true)}
                    className="text-[10px] text-muted/30 transition-colors hover:text-muted/60"
                  >
                    Edit
                  </button>
                )}
              </div>

              {editingGoal ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={goalInput}
                    onChange={(e) => setGoalInput(parseInt(e.target.value, 10) || 1)}
                    className="w-14 rounded-md border border-edge/40 bg-bg px-2 py-1 text-[13px] text-fg focus:border-primary/60 focus:outline-none"
                  />
                  <span className="text-[12px] text-muted/50">sessions/day</span>
                  <button
                    onClick={handleSaveGoal}
                    disabled={savingGoal}
                    className="ml-auto text-[11px] font-medium text-primary/70 transition-colors hover:text-primary disabled:opacity-50"
                  >
                    {savingGoal ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingGoal(false)}
                    className="text-[11px] text-muted/30 hover:text-muted/60"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-2">
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-[20px] font-semibold tabular-nums leading-none text-fg">
                      {stats.sessions_today}
                      <span className="text-[11px] font-normal text-muted/40">
                        /{stats.daily_goal}
                      </span>
                    </p>
                    {stats.sessions_today >= stats.daily_goal && (
                      <span className="text-[10px] font-medium text-emerald-500/70">Done</span>
                    )}
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-edge/20">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (stats.sessions_today / stats.daily_goal) * 100)}%`,
                      }}
                    />
                  </div>
                  {stats.goal_suggestion !== null && (
                    <p className="mt-1.5 text-[10px] text-muted/40">
                      {stats.goal_suggestion > stats.daily_goal
                        ? `You've hit your goal every day this week — try ${stats.goal_suggestion}?`
                        : `Adjust your goal to ${stats.goal_suggestion} sessions/day?`}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-muted/30">
                    {stats.goal_hit_days}/7 days goal met this week
                  </p>
                </div>
              )}
            </div>

            {/* Performance trend sparkline */}
            {stats.recent_trend.length >= 2 && (
              <div className="mt-3 rounded-2xl border border-edge/30 bg-surface px-5 py-4">
                <TrendSparkline scores={stats.recent_trend} />
                {/* Actionable prompt — only when the trend is clearly declining */}
                {(() => {
                  const n = stats.recent_trend.length;
                  if (n < 4) return null;
                  const half = Math.floor(n / 2);
                  const recent = stats.recent_trend.slice(n - half);
                  const older  = stats.recent_trend.slice(0, half);
                  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
                  const slope = avg(recent) - avg(older);
                  if (slope < -0.08) {
                    return (
                      <p className="mt-2.5 text-[10px] text-amber-400/60">
                        Trend declining — consider a shorter session or a longer break next time.
                      </p>
                    );
                  }
                  if (slope > 0.08) {
                    return (
                      <p className="mt-2.5 text-[10px] text-emerald-500/50">
                        Good momentum — keep the current pattern going.
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {/* Recent sessions */}
            <div className="mt-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/50">
                Recent sessions
              </h2>
              {blocks.length === 0 ? (
                <p className="mt-4 text-[13px] text-muted/50">No sessions yet.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {blocks.map((block) => (
                    <li
                      key={block.id}
                      className="flex items-center justify-between rounded-xl border border-edge/30 bg-surface px-4 py-2.5 transition-colors duration-150 hover:border-edge/60"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-[13px] font-medium tabular-nums text-fg">
                          {block.focus_duration_sec / 60}m
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-px text-[10px] font-medium ${
                            block.completed
                              ? "bg-emerald-950/30 text-emerald-500/70"
                              : "bg-surface-elevated text-muted/40"
                          }`}
                        >
                          {block.completed ? "Done" : "Partial"}
                        </span>
                        {block.session_type && (
                          <span className="rounded-full border border-edge/30 px-1.5 py-px text-[10px] text-muted/40">
                            {SESSION_TYPE_LABELS[block.session_type]}
                          </span>
                        )}
                        <span className="text-[10px] capitalize text-muted/30">
                          {block.time_bucket}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((dot) => (
                          <div
                            key={dot}
                            className={`h-1 w-1 rounded-full ${
                              dot <= block.focus_rating ? "bg-primary/70" : "bg-edge/40"
                            }`}
                          />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* LEFT — Duration chart */}
        {blocks.length > 0 && (
          <div className="order-3 lg:col-start-1 lg:row-start-2">
            <DurationChart
              blocks={blocks}
              recommendedDuration={recommendation?.recommended_focus_duration_sec ?? null}
            />
          </div>
        )}

        {/* LEFT — Weekly summary */}
        {hasData && (
          <div className="order-4 lg:col-start-1 lg:row-start-3">
            <WeeklySummary thisWeek={stats.week_this} lastWeek={stats.week_last} />
          </div>
        )}

        {/* LEFT — Time-of-day chart */}
        {hasData && stats.best_time_bucket && (
          <div className="order-5 lg:col-start-1 lg:row-start-4">
            <TimeOfDayChart scores={stats.time_bucket_scores} best={stats.best_time_bucket} />
          </div>
        )}

        {/* No-data placeholder — preview what unlocks with real sessions */}
        {!hasData && (
          <div className="order-2 lg:col-start-2 lg:row-start-1">
            <div className="rounded-2xl border border-edge/30 bg-surface px-5 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/50">
                Unlocks with data
              </p>
              <ul className="mt-3.5 space-y-3">
                {([
                  {
                    label: "Rhythm Score",
                    desc: "Rolling performance trend, 0–100.",
                    after: "2 sessions",
                  },
                  {
                    label: "Peak window",
                    desc: "The time of day you focus best.",
                    after: "4 sessions",
                  },
                  {
                    label: "Session plan",
                    desc: "2–3 block projection for your work window.",
                    after: "4 sessions",
                  },
                  {
                    label: "Recommendation changes",
                    desc: "Why Fluova adjusted its suggestion.",
                    after: "2+ sessions",
                  },
                ] as const).map((item) => (
                  <li key={item.label} className="flex items-start gap-3">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-edge/50" />
                    <div>
                      <p className="text-[12px] font-medium text-fg/60">{item.label}</p>
                      <p className="text-[10px] leading-snug text-muted/40">{item.desc}</p>
                      <p className="mt-0.5 text-[9px] text-muted/25">after {item.after}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {toast && <Toast message={toast} onDone={dismissToast} />}
    </div>
  );
}

// ── Recommendation Hero Card ──────────────────────────────────────────────────

/**
 * Builds a short imperative sentence summarising the recommendation.
 * This is the "coach voice" — direct, contextual, actionable.
 */
function buildActionPhrase(rec: Recommendation): string {
  const min = rec.recommended_focus_duration_sec / 60;
  const breakMin = rec.recommended_break_duration_sec / 60;
  const currentBucket = getLocalTimeBucket();

  if (rec.confidence_level === "learning") {
    return `Try a ${min}-min session to help Fluova learn your rhythm.`;
  }
  if (rec.fatigue_state === "fatigued") {
    return `Recent scores dipped — go shorter today. ${min} min focus, ${breakMin} min break.`;
  }
  if (rec.fatigue_state === "recovered") {
    if (rec.best_time_bucket && currentBucket === rec.best_time_bucket) {
      return `You're in good form and this is your peak window. Run ${min} min.`;
    }
    return `Performance trending up. ${min} min focus recommended.`;
  }
  // stable
  if (rec.best_time_bucket && currentBucket === rec.best_time_bucket) {
    return `This is usually your strongest window. Run ${min} min.`;
  }
  return `Run a ${min}-min focus session.`;
}

function RecommendationHero({ recommendation }: { recommendation: Recommendation | null }) {
  if (!recommendation) {
    return (
      <div className="rounded-2xl border border-edge/60 bg-surface px-7 py-8">
        <div className="py-8 text-center lg:text-left">
          <p className="text-[17px] font-medium text-fg">Welcome to Fluova</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted/60">
            Complete your first focus session to get a personalized recommendation.
          </p>
          <Link
            href="/session/new"
            className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-[13px] font-medium text-white transition-all duration-150 hover:bg-primary-hover"
          >
            Start first session
          </Link>
        </div>
      </div>
    );
  }

  const confidence = CONFIDENCE_CONFIG[recommendation.confidence_level];
  const blockCount = recommendation.block_count ?? 0;
  const recencyLabel =
    blockCount === 0
      ? null
      : blockCount === 1
      ? "Based on 1 session"
      : `Based on ${blockCount} sessions`;

  const actionPhrase = buildActionPhrase(recommendation);

  return (
    <div className="rounded-2xl border border-edge/60 bg-surface px-7 py-8">
      {/* Header row: label · confidence · recency */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/60">
          Best next session
        </p>
        <div className="flex items-center gap-2.5">
          {recencyLabel && (
            <span className="text-[10px] text-muted/30">{recencyLabel}</span>
          )}
          {/* Fatigue state — shown for non-stable states only; "stable" adds no signal */}
          {recommendation.fatigue_state && recommendation.fatigue_state !== "stable" && (
            <span
              className={`text-[9px] font-semibold uppercase tracking-[0.08em] ${FATIGUE_CONFIG[recommendation.fatigue_state].color}`}
            >
              {FATIGUE_CONFIG[recommendation.fatigue_state].label}
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-full border border-edge/30 px-2 py-0.5">
            <span className={`h-1.5 w-1.5 rounded-full ${confidence.dotColor}`} />
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted/50">
              {confidence.label}
            </span>
          </span>
        </div>
      </div>

      {/* Duration — dominant numbers */}
      <p className="mt-4 text-[34px] font-semibold leading-tight tabular-nums text-fg">
        {recommendation.recommended_focus_duration_sec / 60}
        <span className="text-[18px] font-normal text-muted/60"> min focus</span>
        <span className="mx-2.5 text-edge/60">/</span>
        {recommendation.recommended_break_duration_sec / 60}
        <span className="text-[18px] font-normal text-muted/60"> min break</span>
      </p>

      {/* Primary imperative — coach voice */}
      <p className="mt-2.5 text-[14px] font-medium leading-snug text-fg/80">
        {actionPhrase}
      </p>

      {/* Supporting rationale — no heading, reads as context */}
      <p className="mt-2 text-[13px] leading-relaxed text-muted/55">
        {recommendation.rationale}
      </p>

      {/* Est. session score */}
      <div className="mt-4 flex items-center gap-2 border-t border-edge/20 pt-4">
        <span className="text-[11px] text-muted/40">Est. session score</span>
        <span className="text-[11px] font-semibold tabular-nums text-muted/60">
          {Math.round(recommendation.estimated_session_score * 100)}%
        </span>
      </div>

      {/* CTAs */}
      <div className="mt-5 flex items-center gap-3">
        <Link
          href={`/session/new?focus=${recommendation.recommended_focus_duration_sec}&break=${recommendation.recommended_break_duration_sec}`}
          className="rounded-lg bg-primary px-5 py-2.5 text-[13px] font-medium text-white transition-all duration-150 hover:bg-primary-hover hover:shadow-[0_0_20px_rgba(24,24,173,0.2)]"
        >
          Start this session
        </Link>
        <Link
          href="/session/new"
          className="rounded-lg px-4 py-2.5 text-[13px] font-medium text-muted/50 transition-colors duration-150 hover:text-secondary"
        >
          Choose duration
        </Link>
      </div>
    </div>
  );
}

// ── Next-best plan card ───────────────────────────────────────────────────────

function NextPlanCard({ plan }: { plan: PlanBlock[] }) {
  return (
    <div className="rounded-2xl border border-edge/40 bg-surface px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/50">
        Session plan
      </p>
      <div className="mt-3 space-y-2.5">
        {plan.map((block) => (
          <div key={block.block_number} className="flex items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-2.5">
              <span className="w-14 text-[11px] text-muted/30 tabular-nums">
                Block {block.block_number}
              </span>
              <span className="text-[13px] font-medium tabular-nums text-fg">
                {block.focus_duration_sec / 60}
                <span className="text-[11px] font-normal text-muted/50"> min</span>
              </span>
              <span className="text-[11px] text-muted/30">/</span>
              <span className="text-[12px] tabular-nums text-muted/50">
                {block.break_duration_sec / 60}
                <span className="text-[10px]"> min break</span>
              </span>
            </div>
            {block.note && (
              <span className="shrink-0 text-[10px] italic text-muted/35">
                {block.note}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recommendation change banner ──────────────────────────────────────────────

function RecommendationChangeBanner({ change }: { change: string }) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary/50">
        What changed
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg/70">{change}</p>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  suffix,
  sublabel,
}: {
  label: string;
  value: string;
  suffix?: string;
  /** Short decision-support context — what this number means for the user. */
  sublabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-edge/30 bg-surface px-5 py-4 transition-all duration-150 hover:border-edge/50">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/50">
        {label}
      </p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums leading-none text-fg">
        {value}
        {suffix && (
          <span className="text-[11px] font-normal text-muted/40">{suffix}</span>
        )}
      </p>
      {sublabel && (
        <p className="mt-1 text-[10px] text-muted/40">{sublabel}</p>
      )}
    </div>
  );
}

function RhythmScoreCard({
  score,
  delta,
}: {
  score: number;
  delta: number | null;
}) {
  const label =
    score >= 85 ? "Excellent" :
    score >= 70 ? "Strong" :
    score >= 55 ? "Steady" :
    score >= 35 ? "Building" :
    "Starting out";

  const deltaPositive = delta !== null && delta > 0;
  const deltaNegative = delta !== null && delta < 0;

  return (
    <div className="rounded-2xl border border-edge/30 bg-surface px-5 py-4 transition-all duration-150 hover:border-edge/50">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/50">
          Rhythm Score
        </p>
        {delta !== null && (
          <span
            className={`text-[10px] font-medium tabular-nums ${
              deltaPositive
                ? "text-emerald-500/70"
                : deltaNegative
                ? "text-red-400/70"
                : "text-muted/40"
            }`}
          >
            {deltaPositive ? "+" : ""}{delta} vs prior 7
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-[28px] font-semibold tabular-nums leading-none text-fg">
          {score}
          <span className="text-[11px] font-normal text-muted/40">/100</span>
        </p>
        <span className="text-[11px] text-muted/40">{label}</span>
      </div>
      {/* Score bar */}
      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-edge/20">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            score >= 70 ? "bg-emerald-500/50" :
            score >= 50 ? "bg-primary/50" :
            "bg-amber-500/40"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function StreakCard({ current, longest }: { current: number; longest: number }) {
  return (
    <div className="rounded-2xl border border-edge/30 bg-surface px-5 py-4 transition-all duration-150 hover:border-edge/50">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/50">
        Streak
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-[20px] font-semibold tabular-nums leading-none text-fg">
          {current}
          <span className="text-[11px] font-normal text-muted/40">
            {current === 1 ? " day" : " days"}
          </span>
        </p>
        {longest > current && longest > 1 && (
          <p className="text-[10px] text-muted/30">best {longest}</p>
        )}
      </div>
    </div>
  );
}

// ── Peak window card ──────────────────────────────────────────────────────────

const BUCKET_DISPLAY: Record<TimeBucket, string> = {
  morning:   "Morning",
  afternoon: "Afternoon",
  evening:   "Evening",
  night:     "Night",
};

/**
 * Shows the user's historically strongest time-of-day bucket and flags
 * whether they are currently in that window — directly actionable.
 */
function PeakWindowCard({
  bestBucket,
  currentBucket,
}: {
  bestBucket: TimeBucket;
  currentBucket: TimeBucket;
}) {
  const isNow = bestBucket === currentBucket;

  return (
    <div className="rounded-2xl border border-edge/30 bg-surface px-5 py-4 transition-all duration-150 hover:border-edge/50">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/50">
        Peak window
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="text-[20px] font-semibold leading-none text-fg">
          {BUCKET_DISPLAY[bestBucket]}
        </p>
        {isNow ? (
          <span className="text-[10px] font-medium text-emerald-500/70">Active now</span>
        ) : (
          <span className="text-[10px] text-muted/30 capitalize">{currentBucket} now</span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted/40">
        {isNow
          ? "You're in your strongest focus window — good conditions."
          : "Schedule your most important work during this window."}
      </p>
    </div>
  );
}
