"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Recommendation, FocusBlock, ConfidenceLevel, PlanBlock } from "@/lib/domain/types";
import { SESSION_TYPE_LABELS } from "@/lib/domain/types";
import { getLocalTimeBucket } from "@/lib/domain/time";
import Toast from "@/components/Toast";

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
  rhythm_score: number | null;
  rhythm_score_delta: number | null;
  fatigue_trend_data: number[];
  fatigue_trend_avg: number | null;
  recommendation_acceptance_rate: number | null;
  best_duration_by_context: Record<string, number>;
};

// ─── Palette constants (match Studio design) ──────────────────────────────────
const ACCENT = "#C49560";
const POS    = "#4EC99A";
const WARN   = "#E0855A";

const BORDER     = "rgba(210,185,150,0.08)";
const BORDER_S   = "rgba(210,185,150,0.17)";
const TEXT       = "#EDE8DF";
const TEXT_S     = "rgba(237,232,223,0.58)";
const TEXT_M     = "rgba(237,232,223,0.3)";
const SURF       = "#121018";

const BUCKET_DISPLAY: Record<TimeBucket, string> = {
  morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night",
};
const BUCKET_HOURS: Record<TimeBucket, string> = {
  morning: "6–12am", afternoon: "12–5pm", evening: "5–10pm", night: "10pm–6am",
};

// ─── Micro-components ─────────────────────────────────────────────────────────

function Ring({ val, size = 100, sw = 6, color, track = "rgba(255,255,255,0.06)" }: {
  val: number; size?: number; sw?: number; color: string; track?: string;
}) {
  const r = (size - sw * 2) / 2, c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (val / 100) * circ;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={track} strokeWidth={sw} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash.toFixed(2)} ${(circ - dash).toFixed(2)}`}
        strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`} />
    </svg>
  );
}

function AreaChart({ data, color, gid, h = 68 }: {
  data: number[]; color: string; gid: string; h?: number;
}) {
  if (data.length < 2) return <div style={{ height: h }} />;
  const n = data.length;
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const W = 300, H = h;
  const pts: [number, number][] = data.map((v, i) => [
    (i / (n - 1)) * W,
    (H - 8) - ((v - mn) / rng) * (H - 16) + 4,
  ]);
  let d = `M ${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1]!;
    const [cx, cy] = pts[i]!;
    const mx2 = (px + cx) / 2;
    d += ` C ${mx2.toFixed(1)} ${py.toFixed(1)} ${mx2.toFixed(1)} ${cy.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
  }
  const fillPath = `${d} L ${W} ${H} L 0 ${H} Z`;
  const [lx, ly] = pts[pts.length - 1]!;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="3.5" fill={color} />
    </svg>
  );
}

function BarChart({ bars, recommended, accent }: {
  bars: Array<{ d: string; v: number }>; recommended: number; accent: string;
}) {
  if (bars.length === 0) return null;
  const maxV = Math.max(...bars.map(b => b.v)) * 1.15;
  const W = 320, H = 96, barW = 26, gap = W / bars.length;
  const ch = H - 18, recY = ch - (recommended / maxV) * ch;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ display: "block" }}>
      <line x1={0} y1={recY} x2={W} y2={recY} stroke={accent} strokeWidth="1" strokeDasharray="4 5" opacity="0.5" />
      <text x={W - 2} y={recY - 4} textAnchor="end" fill={accent} fontSize="8"
        fontFamily="'DM Mono',monospace" opacity="0.8">{recommended}m rec.</text>
      {bars.map((bar, i) => {
        const bh = (bar.v / maxV) * ch;
        const x = i * gap + (gap - barW) / 2;
        const isRec = Math.abs(bar.v - recommended) <= 1;
        return (
          <g key={i}>
            <rect x={x.toFixed(1)} y={(ch - bh).toFixed(1)} width={barW} height={bh.toFixed(1)} rx={3}
              fill={isRec ? accent : "rgba(255,255,255,0.06)"}
              stroke={isRec ? accent : "rgba(255,255,255,0.1)"} strokeWidth="1" />
            <text x={(x + barW / 2).toFixed(1)} y={H - 3} textAnchor="middle"
              fill="rgba(237,232,223,0.28)" fontSize="8.5" fontFamily="'DM Mono',monospace">
              {bar.d}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ConfPill({ level }: { level: ConfidenceLevel }) {
  const map: Record<ConfidenceLevel, { label: string; bg: string; c: string }> = {
    calibrating: { label: "Calibrating", bg: "rgba(224,133,90,0.15)",  c: WARN },
    learning:    { label: "Learning",    bg: "rgba(196,149,96,0.15)",   c: ACCENT },
    confident:   { label: "Confident",   bg: "rgba(78,201,154,0.15)",   c: POS },
  };
  const s = map[level];
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 4,
      background: s.bg, color: s.c,
      fontSize: 10, fontFamily: "'DM Mono',monospace", fontWeight: 500,
      letterSpacing: "0.08em", textTransform: "uppercase",
    }}>
      {s.label}
    </span>
  );
}

function Lbl({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{
      fontFamily: "'DM Mono',monospace", fontSize: 10, color: TEXT_M,
      letterSpacing: "0.1em", textTransform: "uppercase", ...style,
    }}>
      {children}
    </span>
  );
}

function rhythmLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Steady";
  if (score >= 35) return "Building";
  return "Starting out";
}

// ─── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection({ recommendation, stats }: {
  recommendation: Recommendation | null;
  stats: Stats | null;
}) {
  const currentBucket = getLocalTimeBucket();
  const focusMin  = recommendation ? recommendation.recommended_focus_duration_sec / 60 : null;
  const breakMin  = recommendation ? recommendation.recommended_break_duration_sec / 60 : null;
  const successPct = recommendation ? Math.round(recommendation.estimated_session_score * 100) : null;
  const isPeak    = recommendation?.best_time_bucket === currentBucket;

  return (
    <section style={{
      position: "relative", overflow: "hidden",
      padding: "40px 32px 40px",
    }}>
      {/* Ambient glows */}
      <div style={{ position: "absolute", top: -80, left: -60, width: 500, height: 400, background: "radial-gradient(ellipse, rgba(196,149,96,0.07) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -60, right: 80, width: 360, height: 300, background: "radial-gradient(ellipse, rgba(78,201,154,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Date */}
      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: TEXT_M, marginBottom: 24, letterSpacing: "0.01em" }}>
        {new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}
      </p>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 48, justifyContent: "space-between" }}>
        {/* Left */}
        <div style={{ flex: "1 1 0", minWidth: 0 }}>

          {/* Status badges */}
          {recommendation && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              <ConfPill level={recommendation.confidence_level} />
              {recommendation.fatigue_state && recommendation.fatigue_state !== "stable" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: recommendation.fatigue_state === "fatigued" ? WARN : POS }} />
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: TEXT_S }}>
                    {recommendation.fatigue_state === "fatigued" ? "Fatigue detected" : "Recovered"}
                  </span>
                </div>
              )}
              {isPeak && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="pulse-dot" />
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: TEXT_S }}>
                    Peak window · {BUCKET_HOURS[currentBucket]}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Big number */}
          {focusMin !== null ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 0, marginBottom: 24, lineHeight: 1 }}>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", inset: "-20px -30px", background: "radial-gradient(ellipse, rgba(196,149,96,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 100, fontWeight: 800, color: TEXT, letterSpacing: "-0.04em", lineHeight: 1, position: "relative" }}>
                  {focusMin}
                </span>
              </div>
              <div style={{ paddingBottom: 14, marginLeft: 14 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 20, fontWeight: 300, color: TEXT_S, lineHeight: 1.2 }}>min focus</div>
              </div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 44, fontWeight: 300, color: TEXT_M, paddingBottom: 10, margin: "0 12px" }}>+</div>
              <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 52, fontWeight: 600, color: TEXT_S, lineHeight: 1, paddingBottom: 8 }}>{breakMin}</span>
              <div style={{ paddingBottom: 12, marginLeft: 12 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 300, color: TEXT_M, lineHeight: 1.2 }}>min break</div>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 700, color: TEXT, marginBottom: 10 }}>Welcome to Fluova</p>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: TEXT_M, lineHeight: 1.7, maxWidth: 400 }}>
                Complete your first focus session to get a personalized recommendation.
              </p>
            </div>
          )}

          {/* Rationale blockquote */}
          {recommendation?.rationale && (
            <div style={{
              borderLeft: `2px solid ${ACCENT}`, borderRadius: "0 8px 8px 0",
              padding: "12px 18px", marginBottom: 14,
              background: "linear-gradient(90deg, rgba(196,149,96,0.07), transparent)",
              maxWidth: 560,
            }}>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: TEXT_S, lineHeight: 1.7 }}>
                {recommendation.rationale}
              </p>
            </div>
          )}

          {/* Changed banner */}
          {recommendation?.recommendation_change && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 14px", borderRadius: 8, marginBottom: 20,
              background: "rgba(196,149,96,0.12)",
              border: `1px solid rgba(196,149,96,0.18)`,
              maxWidth: 560,
            }}>
              <Lbl>Updated</Lbl>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: TEXT_S, lineHeight: 1.5, flex: 1 }}>
                {recommendation.recommendation_change}
              </span>
            </div>
          )}

          {/* CTAs */}
          <div style={{ display: "flex", gap: 12 }}>
            {recommendation ? (
              <>
                <Link
                  href={`/session/new?focus=${recommendation.recommended_focus_duration_sec}&break=${recommendation.recommended_break_duration_sec}`}
                  className="btn-primary"
                  style={{ padding: "14px 32px", display: "inline-block", textDecoration: "none", fontSize: 14 }}
                >
                  Start {focusMin} min session →
                </Link>
                <Link
                  href="/session/new"
                  className="btn-ghost"
                  style={{ padding: "14px 24px", display: "inline-block", textDecoration: "none", fontSize: 14 }}
                >
                  Custom setup
                </Link>
              </>
            ) : (
              <Link
                href="/session/new"
                className="btn-primary"
                style={{ padding: "14px 32px", display: "inline-block", textDecoration: "none", fontSize: 14 }}
              >
                Start first session →
              </Link>
            )}
          </div>
        </div>

        {/* Right: rings + plan */}
        {recommendation && (
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-end", paddingTop: 8 }}>

            {/* Success ring */}
            {successPct !== null && (
              <div style={{ position: "relative", display: "inline-block" }}>
                <Ring val={successPct} size={110} sw={7} color={ACCENT} track="rgba(196,149,96,0.1)" />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 700, color: TEXT, lineHeight: 1 }}>{successPct}%</span>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: TEXT_M, marginTop: 3 }}>est. success</span>
                </div>
              </div>
            )}

            {/* Rhythm score */}
            {stats?.rhythm_score != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ position: "relative" }}>
                  <Ring val={stats.rhythm_score} size={52} sw={4} color={ACCENT} track="rgba(196,149,96,0.1)" />
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, color: TEXT }}>
                    {stats.rhythm_score}
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500, color: TEXT, marginBottom: 3 }}>
                    {rhythmLabel(stats.rhythm_score)} rhythm
                  </div>
                  {stats.rhythm_score_delta != null && (
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: stats.rhythm_score_delta >= 0 ? POS : WARN }}>
                      {stats.rhythm_score_delta >= 0 ? "▲" : "▼"} {Math.abs(stats.rhythm_score_delta)} pts vs last
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Today's plan */}
            {recommendation.next_plan && recommendation.next_plan.length > 0 && (
              <div style={{ minWidth: 200 }}>
                <Lbl style={{ display: "block", marginBottom: 10 }}>Today&apos;s plan</Lbl>
                {recommendation.next_plan.map((s: PlanBlock, i: number) => (
                  <div key={s.block_number} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 0",
                    borderTop: i > 0 ? `1px solid ${BORDER}` : "none",
                  }}>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: i === 0 ? ACCENT : TEXT_M, letterSpacing: "0.08em", width: 14 }}>B{s.block_number}</span>
                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: i === 0 ? TEXT : TEXT_S, flex: 1 }}>
                      {s.focus_duration_sec / 60}m <span style={{ color: TEXT_M }}>+ {s.break_duration_sec / 60}m</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: Stats }) {
  const items = [
    ...(stats.rhythm_score != null ? [{
      label: "Rhythm Score",
      value: String(stats.rhythm_score),
      sub: `${rhythmLabel(stats.rhythm_score)}${stats.rhythm_score_delta != null ? ` · ${stats.rhythm_score_delta >= 0 ? "▲" : "▼"} ${Math.abs(stats.rhythm_score_delta)}` : ""}`,
      pos: (stats.rhythm_score_delta ?? 0) >= 0,
    }] : []),
    {
      label: "Completion Rate",
      value: `${Math.round(stats.completion_rate * 100)}%`,
      sub: stats.completion_rate >= 0.8 ? "Strong" : stats.completion_rate >= 0.6 ? "Steady" : "Building",
      pos: stats.completion_rate >= 0.7,
    },
    {
      label: "Avg Focus Rating",
      value: stats.avg_focus_rating.toFixed(1),
      sub: stats.avg_focus_rating >= 4 ? "Excellent" : stats.avg_focus_rating >= 3 ? "On track" : "Rate honestly",
      pos: stats.avg_focus_rating >= 3.5,
    },
    {
      label: "Sessions (7 days)",
      value: String(stats.sessions_last_7_days),
      sub: `Goal: ${stats.daily_goal}/day`,
      pos: stats.sessions_last_7_days >= stats.daily_goal * 5,
    },
    {
      label: "Current Streak",
      value: `${stats.current_streak}d`,
      sub: stats.longest_streak > stats.current_streak ? `Best: ${stats.longest_streak}d` : "Personal best",
      pos: stats.current_streak > 1,
    },
  ];

  return (
    <div style={{
      padding: "0 32px",
      borderTop: `1px solid rgba(210,185,150,0.18)`,
      borderBottom: `1px solid ${BORDER}`,
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      }}>
        {items.map((s, i) => (
          <div key={s.label} style={{
            padding: "22px 24px",
            borderRight: i < items.length - 1 ? `1px solid ${BORDER}` : "none",
          }}>
            <Lbl style={{ display: "block", marginBottom: 10 }}>{s.label}</Lbl>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 700, color: TEXT, lineHeight: 1, letterSpacing: "-0.02em" }}>{s.value}</div>
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: s.pos ? POS : TEXT_M, marginTop: 8 }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────

const CELL = { padding: "22px 24px" } as const;
const CELL_SM = { padding: "22px 20px" } as const;
const COL_DIV = { borderRight: `1px solid ${BORDER}` } as const;
const ROW_TOP = { borderTop: `1px solid ${BORDER}` } as const;
const ROW_BOT = { borderBottom: `1px solid ${BORDER}` } as const;

function Analytics({ stats, blocks, recommendation, editingGoal, goalInput, savingGoal, onEdit, onCancel, onSave, onGoalChange }: {
  stats: Stats;
  blocks: FocusBlock[];
  recommendation: Recommendation | null;
  editingGoal: boolean;
  goalInput: number;
  savingGoal: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onGoalChange: (n: number) => void;
}) {
  const recMin = recommendation ? recommendation.recommended_focus_duration_sec / 60 : 30;

  const durBars = blocks.slice(0, 7).reverse().map(b => ({
    d: new Date(b.started_at ?? "").toLocaleDateString("en", { weekday: "short" }),
    v: Math.round(b.focus_duration_sec / 60),
  }));

  const todBuckets: TimeBucket[] = ["morning", "afternoon", "evening", "night"];
  const todData = todBuckets
    .map(b => ({ p: BUCKET_DISPLAY[b], bucket: b, r: stats.time_bucket_scores[b] ?? 0 }))
    .filter(x => x.r > 0);

  const bestDurEntries = Object.entries(stats.best_duration_by_context).sort(([a], [b]) => a.localeCompare(b));
  const pct = Math.min(100, (stats.sessions_today / stats.daily_goal) * 100);
  const goalDone = stats.sessions_today >= stats.daily_goal;

  const hasRow2 = durBars.length > 0 || todData.length > 0;
  // Match the stats strip column count exactly so vertical dividers align
  const colCount = stats.rhythm_score != null ? 5 : 4;
  const trendSpan = colCount - 2; // 3 of 5 or 2 of 4
  const gridCols = `repeat(${colCount}, 1fr)`;

  return (
    <div style={{ padding: "0 32px" }}>

      {/* Row 1: Trends · Best Duration · Daily Goal */}
      <div style={{ display: "grid", gridTemplateColumns: gridCols, ...ROW_TOP, ...ROW_BOT }}>

        {/* Trends */}
        <div style={{ ...CELL, ...COL_DIV, gridColumn: `span ${trendSpan}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 }}>
            <div>
              <Lbl style={{ display: "block", marginBottom: 14 }}>Focus Rating Trend</Lbl>
              <AreaChart data={stats.recent_trend} color={ACCENT} gid="g-perf" h={64} />
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: TEXT_M, marginTop: 10 }}>
                {stats.recent_trend.length} sessions · avg {stats.avg_focus_rating.toFixed(1)}
              </p>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <Lbl>Fatigue Trend</Lbl>
                <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: TEXT_M }}>lower = better</span>
              </div>
              <AreaChart data={stats.fatigue_trend_data} color={WARN} gid="g-fat" h={64} />
              {stats.fatigue_trend_avg != null && (
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: TEXT_M, marginTop: 10 }}>
                  avg {stats.fatigue_trend_avg.toFixed(1)}/5 · {stats.fatigue_trend_data.length} sessions
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Best Duration by Type */}
        <div style={{ ...CELL_SM, ...COL_DIV }}>
          <Lbl style={{ display: "block", marginBottom: 16 }}>Best Duration by Type</Lbl>
          {bestDurEntries.length > 0 ? bestDurEntries.map(([type, minutes], i) => (
            <div key={type} style={{
              paddingBottom: i < bestDurEntries.length - 1 ? 12 : 0,
              marginBottom: i < bestDurEntries.length - 1 ? 12 : 0,
              borderBottom: i < bestDurEntries.length - 1 ? `1px solid ${BORDER}` : "none",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: TEXT_S }}>
                  {SESSION_TYPE_LABELS[type as keyof typeof SESSION_TYPE_LABELS] ?? type}
                </span>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: TEXT }}>{minutes}m</span>
              </div>
              <div style={{ height: 3, background: BORDER, borderRadius: 1.5 }}>
                <div style={{ width: `${(minutes / 60) * 100}%`, height: "100%", background: ACCENT, borderRadius: 1.5, opacity: 0.7 }} />
              </div>
            </div>
          )) : (
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: TEXT_M, lineHeight: 1.6 }}>
              Rate a few sessions by type to unlock this.
            </p>
          )}
        </div>

        {/* Daily Goal */}
        <div style={{ ...CELL_SM }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Lbl>Daily Goal</Lbl>
            {!editingGoal && (
              <button onClick={onEdit} style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: ACCENT, background: "none", border: "none", cursor: "pointer", letterSpacing: "0.06em" }}>Edit</button>
            )}
          </div>

          {editingGoal ? (
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number" min={1} max={10} value={goalInput}
                onChange={(e) => onGoalChange(parseInt(e.target.value, 10) || 1)}
                style={{ width: 52, padding: "6px 10px", borderRadius: 7, border: `1px solid rgba(196,149,96,0.2)`, background: "#09080C", color: TEXT, fontFamily: "'DM Mono',monospace", fontSize: 13, outline: "none" }}
              />
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: TEXT_M }}>/day</span>
              <button onClick={onSave} disabled={savingGoal} style={{ marginLeft: "auto", fontFamily: "'DM Mono',monospace", fontSize: 10, color: ACCENT, background: "none", border: "none", cursor: "pointer" }}>
                {savingGoal ? "Saving…" : "Save"}
              </button>
              <button onClick={onCancel} style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: TEXT_M, background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 38, fontWeight: 700, color: TEXT, lineHeight: 1 }}>
                  {stats.sessions_today}
                </span>
                <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: TEXT_M }}>/ {stats.daily_goal} sessions</span>
                {goalDone && (
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 4, background: "rgba(78,201,154,0.15)", color: POS }}>DONE</span>
                )}
              </div>
              <div style={{ height: 3, background: BORDER, borderRadius: 2, marginBottom: 8 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: goalDone ? POS : ACCENT, borderRadius: 2, transition: "width 0.7s ease" }} />
              </div>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: goalDone ? POS : TEXT_M }}>
                {goalDone
                  ? "Goal complete for today"
                  : `${stats.daily_goal - stats.sessions_today} more session${stats.daily_goal - stats.sessions_today === 1 ? "" : "s"} today`}
              </p>
            </div>
          )}

          {/* Weekly mini */}
          <div style={{ paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
            <Lbl style={{ display: "block", marginBottom: 10 }}>This week vs last</Lbl>
            {([
              ["Sessions", stats.week_this.count, stats.week_last.count],
              ["Completion", `${Math.round(stats.week_this.completion_rate * 100)}%`, `${Math.round(stats.week_last.completion_rate * 100)}%`],
              ["Avg Rating", stats.week_this.avg_rating.toFixed(1), stats.week_last.avg_rating.toFixed(1)],
            ] as const).map(([k, n, p]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: TEXT_M, flex: 1 }}>{k}</span>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: TEXT, marginRight: 10 }}>{n}</span>
                <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: TEXT_M }}>vs {p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Session Durations · Time of Day — same colCount grid, mirrored spans */}
      {hasRow2 && (
        <div style={{ display: "grid", gridTemplateColumns: gridCols, ...ROW_BOT }}>
          {durBars.length > 0 && (
            <div style={{ ...CELL, ...(todData.length > 0 ? COL_DIV : {}), gridColumn: `span ${trendSpan}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                <Lbl>Session Durations — Past 7 Days</Lbl>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 16, height: 2, background: ACCENT }} />
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: TEXT_M }}>{recMin}m rec.</span>
                </div>
              </div>
              <BarChart bars={durBars} recommended={recMin} accent={ACCENT} />
            </div>
          )}
          {todData.length > 0 && (
            <div style={{ ...CELL, gridColumn: `span ${colCount - trendSpan}` }}>
              <Lbl style={{ display: "block", marginBottom: 18 }}>Performance by Time of Day</Lbl>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${todData.length}, 1fr)`, gap: 14 }}>
                {todData.map((row, i) => {
                  const isBest = row.bucket === stats.best_time_bucket;
                  return (
                    <div key={row.p}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 700, color: isBest ? ACCENT : TEXT_S, lineHeight: 1, marginBottom: 4, letterSpacing: "-0.02em" }}>
                        {row.r.toFixed(1)}
                      </div>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: TEXT_M, marginBottom: 8 }}>{row.p}</div>
                      <div style={{ height: 3, background: BORDER, borderRadius: 2 }}>
                        <div style={{ width: `${(row.r / 5) * 100}%`, height: "100%", background: isBest ? ACCENT : `rgba(196,149,96,${0.35 - i * 0.07})`, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Recent Sessions ──────────────────────────────────────────────────────────

function RecentSessionsTable({ blocks }: { blocks: FocusBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <div style={{ padding: "0 32px 52px" }}>
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <Lbl>Recent Sessions</Lbl>
          <Link href="/session/new" style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: ACCENT, textDecoration: "none" }}>
            New session →
          </Link>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Time", "Duration", "Type", "Rating", "Status"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "0 12px 10px 0", fontFamily: "'DM Mono',monospace", fontSize: 10, color: TEXT_M, letterSpacing: "0.09em", textTransform: "uppercase", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blocks.map(b => (
              <tr key={b.id} className="session-row" style={{ borderTop: `1px solid ${BORDER}` }}>
                <td style={{ padding: "11px 12px 11px 0", fontFamily: "'Inter',sans-serif", fontSize: 13, color: TEXT_M }}>
                  {b.started_at ? new Date(b.started_at).toLocaleString("en", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                </td>
                <td style={{ padding: "11px 12px 11px 0", fontFamily: "'DM Mono',monospace", fontSize: 13, color: TEXT, fontWeight: 500 }}>
                  {b.focus_duration_sec / 60}m
                </td>
                <td style={{ padding: "11px 12px 11px 0", fontFamily: "'Inter',sans-serif", fontSize: 13, color: TEXT_S }}>
                  {b.session_type ? (SESSION_TYPE_LABELS[b.session_type] ?? b.session_type) : "—"}
                </td>
                <td style={{ padding: "11px 12px 11px 0" }}>
                  <span style={{ display: "inline-flex", gap: 3 }}>
                    {[1, 2, 3, 4, 5].map(dot => (
                      <span key={dot} style={{ width: 8, height: 8, borderRadius: "50%", background: dot <= b.focus_rating ? ACCENT : "rgba(255,255,255,0.1)", flexShrink: 0 }} />
                    ))}
                  </span>
                </td>
                <td style={{ padding: "11px 0" }}>
                  <span style={{
                    display: "inline-block", padding: "4px 10px", borderRadius: 6,
                    fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: "0.05em",
                    background: b.completed ? "rgba(78,201,154,0.1)" : "rgba(248,113,113,0.1)",
                    color: b.completed ? POS : "#F87171",
                  }}>
                    {b.completed ? "Done" : "Incomplete"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Unlocks (no-data state) ──────────────────────────────────────────────────

function UnlocksSection() {
  const items = [
    { label: "Rhythm Score",  desc: "Rolling performance trend, 0–100.",                       after: "2 sessions" },
    { label: "Peak window",   desc: "The time of day you focus best.",                          after: "4 sessions" },
    { label: "Session plan",  desc: "2–3 block projection for your day.",                       after: "4 sessions" },
    { label: "Why it changed", desc: "Explanation when Fluova adjusts its recommendation.",    after: "2+ sessions" },
  ];
  return (
    <div style={{ padding: "0 32px 48px" }}>
      <div style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: "22px 0" }}>
        <Lbl style={{ display: "block", marginBottom: 18 }}>Unlocks with data</Lbl>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          {items.map(item => (
            <div key={item.label} style={{ display: "flex", gap: 12 }}>
              <div style={{ marginTop: 4, width: 6, height: 6, borderRadius: "50%", background: `${ACCENT}55`, flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500, color: TEXT_S, marginBottom: 4 }}>{item.label}</p>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: TEXT_M, lineHeight: 1.5 }}>{item.desc}</p>
                <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "rgba(237,232,223,0.2)", marginTop: 4 }}>after {item.after}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const searchParams = useSearchParams();
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [blocks, setBlocks] = useState<FocusBlock[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(
    searchParams.get("toast") === "saved" ? "Recommendation updated based on your latest session." : null
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(2);
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const bucket = getLocalTimeBucket();
      try {
        const [recRes, histRes, statsRes] = await Promise.all([
          fetch(`/api/recommendation?bucket=${bucket}`),
          fetch("/api/history?limit=10"),
          fetch("/api/stats"),
        ]);
        if (recRes.ok) setRecommendation((await recRes.json()).data);
        if (histRes.ok) setBlocks(((await histRes.json()).data.focus_blocks ?? []).slice(0, 10));
        if (statsRes.ok) {
          const s = (await statsRes.json()).data;
          setStats(s);
          setGoalInput(s.daily_goal ?? 2);
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
        setStats(prev => prev ? { ...prev, daily_goal: goalInput } : prev);
        setEditingGoal(false);
      }
    } finally {
      setSavingGoal(false);
    }
  }

  if (loading) {
    return (
      <div className="-mt-10 -mx-4 sm:-mx-8">
        <div style={{ padding: "40px 32px 40px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ height: 16, width: 200, borderRadius: 4, background: SURF, marginBottom: 28 }} />
          <div style={{ height: 220, borderRadius: 14, background: SURF, opacity: 0.6 }} />
        </div>
        <div style={{ padding: "24px 32px" }}>
          <div style={{ height: 84, borderRadius: 14, background: SURF, opacity: 0.6 }} />
        </div>
        <div style={{ padding: "4px 32px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ height: 180, borderRadius: 14, background: SURF, opacity: 0.6 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ height: 120, borderRadius: 14, background: SURF, opacity: 0.6 }} />
            <div style={{ height: 120, borderRadius: 14, background: SURF, opacity: 0.6 }} />
          </div>
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
    <div className="-mt-10 -mx-4 sm:-mx-8 animate-fade-in">
      <HeroSection recommendation={recommendation} stats={stats} />
      {hasData && <StatsStrip stats={stats} />}
      {hasData ? (
        <Analytics
          stats={stats}
          blocks={blocks}
          recommendation={recommendation}
          editingGoal={editingGoal}
          goalInput={goalInput}
          savingGoal={savingGoal}
          onEdit={() => setEditingGoal(true)}
          onCancel={() => setEditingGoal(false)}
          onSave={handleSaveGoal}
          onGoalChange={setGoalInput}
        />
      ) : (
        <UnlocksSection />
      )}
      <RecentSessionsTable blocks={blocks} />
      {toast && <Toast message={toast} onDone={dismissToast} />}
    </div>
  );
}
